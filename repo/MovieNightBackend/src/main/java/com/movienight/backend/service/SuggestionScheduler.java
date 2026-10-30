package com.movienight.backend.service;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.external.TmdbSearchResponse;
import com.movienight.backend.model.*;
import com.movienight.backend.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Scheduled job refreshing cached TMDB discover lists and recalculating dirty user recommendations.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SuggestionScheduler {

    private final TmdbClient tmdbClient;
    private final CachedMovieListRepository cachedMovieListRepository;
    private final DiscoverySnapshotRepository discoverySnapshotRepository;
    private final UserRepository userRepository;
    private final PersonalizedRecommendationService personalizedRecommendationService;
    private final org.springframework.transaction.PlatformTransactionManager transactionManager;
    private final Map<String, CompletableFuture<Void>> activeCategoryRefreshes = new ConcurrentHashMap<>();

    /**
     * Populate cache on application startup if currently empty.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        if (discoverySnapshotRepository.count() == 0 && tmdbClient.isConfigured()) {
            log.info("Initializing TMDB Discover caches on application startup...");
            refreshDiscoverySafely();
        }
    }

    /**
     * Scheduled job running once every day at 3 AM to refresh TMDB discovery lists.
     */
    @Scheduled(cron = "0 0 3 * * ?", zone = "UTC")
    public void scheduledDailyRefresh() {
        log.info("Starting scheduled daily refresh of TMDB Discover lists and dirty user recommendations...");
        refreshDiscoverySafely();
        recalculateDirtyUserRecommendations();
    }

    private void refreshDiscoverySafely() {
        try {
            refreshAllCachedLists();
        } catch (RuntimeException error) {
            // Startup/background discovery must not prevent access to saved libraries.
            log.warn("Discovery refresh unavailable; cached data is unchanged and on-demand reads can retry.");
        }
    }

    /**
     * Ingest discover categories from TMDB across Movies, TV Series, and Anime.
     */
    public void refreshAllCachedLists() {
        if (!tmdbClient.isConfigured()) {
            log.debug("TMDB API key not configured. Skipping TMDB list cache refresh.");
            return;
        }

        for (String type : List.of("MOVIE", "TV", "ANIME")) {
            for (MovieListType shelf : shelves(type)) refreshCategory(type, shelf);
        }

        log.info("TMDB Discover list cache refreshed successfully across Movies, TV Series, and Anime.");
    }

    /**
     * On-demand refresh for a specific media type (Movies, TV, or Anime).
     */
    public void refreshMediaType(String mediaType) {
        if (!tmdbClient.isConfigured() || mediaType == null) {
            return;
        }

        String type = mediaType.trim().toUpperCase();
        for (MovieListType shelf : shelves(type)) refreshCategory(type, shelf);
    }

    private List<MovieListType> shelves(String type) {
        return switch (type) {
            case "MOVIE" -> List.of(MovieListType.RECENT, MovieListType.POPULAR,
                    MovieListType.TOP_RATED, MovieListType.UPCOMING);
            case "TV", "ANIME" -> List.of(MovieListType.CURRENTLY_AIRING, MovieListType.POPULAR,
                    MovieListType.TOP_RATED, MovieListType.UPCOMING);
            default -> throw new IllegalArgumentException("Invalid discovery media type");
        };
    }

    /** Rebuild one shelf; the transaction leaves its previous publication intact on failure. */
    public void refreshCategory(String mediaType, MovieListType listType) {
        if (!tmdbClient.isConfigured()) throw new IllegalStateException("Discovery provider is unavailable. Retry.");
        String type = mediaType == null ? "" : mediaType.trim().toUpperCase();
        String key = type + ":" + listType;
        CompletableFuture<Void> owned = new CompletableFuture<>();
        CompletableFuture<Void> active = activeCategoryRefreshes.putIfAbsent(key, owned);
        if (active != null) {
            try { active.join(); return; }
            catch (CompletionException failure) { throw new IllegalStateException("Discovery refresh failed. Retry.", failure.getCause()); }
        }
        try {
            new org.springframework.transaction.support.TransactionTemplate(transactionManager)
                    .executeWithoutResult(status -> rebuildCategory(type, listType));
            owned.complete(null);
        } catch (RuntimeException failure) {
            owned.completeExceptionally(failure);
            throw failure;
        } finally {
            activeCategoryRefreshes.remove(key, owned);
        }
    }

    private void rebuildCategory(String type, MovieListType listType) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        String now = today.toString();
        String nextYear = today.plusYears(1).toString();
        SeasonRange season = getCurrentSeasonRange(today);
        if ("MOVIE".equals(type)) {
            switch (listType) {
                case RECENT -> refreshMovieCategory(type, listType, "popularity.desc", 10, today.minusDays(90).toString(), now, 10);
                case POPULAR -> refreshMovieCategory(type, listType, "popularity.desc", 200, null, now, 10);
                case TOP_RATED -> refreshMovieCategory(type, listType, "vote_average.desc", 1000, null, now, 10);
                case UPCOMING -> refreshMovieCategory(type, listType, "popularity.desc", 0, today.plusDays(1).toString(), nextYear, 10);
                default -> throw new IllegalArgumentException("Invalid movie shelf");
            }
        } else if ("TV".equals(type) || "ANIME".equals(type)) {
            int votes = listType == MovieListType.TOP_RATED ? ("TV".equals(type) ? 500 : 200)
                    : listType == MovieListType.POPULAR ? ("TV".equals(type) ? 100 : 50) : 0;
            if (listType == MovieListType.CURRENTLY_AIRING && "TV".equals(type)) {
                refreshTvOnTheAirCategory(type, listType, 10);
            } else if (listType == MovieListType.CURRENTLY_AIRING) {
                refreshTvCategory(type, listType, "popularity.desc", 5, null, now,
                        season.start, season.end, "16", null, 10);
            } else if (listType == MovieListType.POPULAR || listType == MovieListType.TOP_RATED) {
                refreshTvCategory(type, listType, listType == MovieListType.POPULAR ? "popularity.desc" : "vote_average.desc",
                        votes, null, now, null, null, "ANIME".equals(type) ? "16" : null, null, 10);
            } else if (listType == MovieListType.UPCOMING) {
                refreshTvCategory(type, listType, "popularity.desc", 0, today.plusDays(1).toString(),
                        nextYear, null, null, "ANIME".equals(type) ? "16" : null, null, 10);
            } else throw new IllegalArgumentException("Invalid series shelf");
        } else throw new IllegalArgumentException("Invalid media type");
    }

    public static class CategoryPublicationMeta {
        private final String mediaType;
        private final MovieListType listType;
        private final boolean selectionLimitReached;
        private final boolean providerExhausted;
        private final LocalDateTime publishedAt;

        public CategoryPublicationMeta(String mediaType, MovieListType listType,
                                       boolean selectionLimitReached, boolean providerExhausted,
                                       LocalDateTime publishedAt) {
            this.mediaType = mediaType;
            this.listType = listType;
            this.selectionLimitReached = selectionLimitReached;
            this.providerExhausted = providerExhausted;
            this.publishedAt = publishedAt;
        }

        public String getMediaType() { return mediaType; }
        public MovieListType getListType() { return listType; }
        public boolean isSelectionLimitReached() { return selectionLimitReached; }
        public boolean isProviderExhausted() { return providerExhausted; }
        public LocalDateTime getPublishedAt() { return publishedAt; }
    }

    private final Map<String, CategoryPublicationMeta> categoryPublicationMetaMap = new ConcurrentHashMap<>();

    public CategoryPublicationMeta getPublicationMeta(String mediaType, MovieListType listType) {
        String key = (mediaType != null ? mediaType.toUpperCase() : "") + ":" + listType;
        return categoryPublicationMetaMap.get(key);
    }

    public void clearPublicationMetaForTesting() {
        categoryPublicationMetaMap.clear();
    }

    private void refreshMovieCategory(
            String mediaType,
            MovieListType listType,
            String sortBy,
            Integer minVotes,
            String releaseDateGte,
            String releaseDateLte,
            int maxPages
    ) {
        List<TmdbSearchResponse.TmdbMovieSummary> candidates = new ArrayList<>();
        boolean hitBoundOnAnyStream = false;
        for (String source : sources(listType, sortBy)) {
            boolean streamEnded = false;
            for (int page = 1; page <= maxPages; page++) {
                List<TmdbSearchResponse.TmdbMovieSummary> results = tmdbClient.discoverMovies(
                        source, minVotes, releaseDateGte, releaseDateLte, page);
                if (results == null) throw new IllegalStateException("Invalid discovery response");
                if (results.isEmpty()) {
                    streamEnded = true;
                    break;
                }
                candidates.addAll(results);
            }
            if (!streamEnded) {
                hitBoundOnAnyStream = true;
            }
        }
        publish(mediaType, listType, minVotes, candidates, hitBoundOnAnyStream, !hitBoundOnAnyStream);
    }

    private void refreshTvCategory(
            String mediaType,
            MovieListType listType,
            String sortBy,
            Integer minVotes,
            String firstAirDateGte,
            String firstAirDateLte,
            String airDateGte,
            String airDateLte,
            String withGenres,
            String withOriginalLanguage,
            int maxPages
    ) {
        List<TmdbSearchResponse.TmdbMovieSummary> candidates = new ArrayList<>();
        boolean hitBoundOnAnyStream = false;
        for (String source : sources(listType, sortBy)) {
            boolean streamEnded = false;
            for (int page = 1; page <= maxPages; page++) {
                List<TmdbSearchResponse.TmdbMovieSummary> results = tmdbClient.discoverTv(
                        source, minVotes, firstAirDateGte, firstAirDateLte, airDateGte, airDateLte,
                        withGenres, withOriginalLanguage, page);
                if (results == null) throw new IllegalStateException("Invalid discovery response");
                if (results.isEmpty()) {
                    streamEnded = true;
                    break;
                }
                results.forEach(item -> item.setMediaType("tv"));
                candidates.addAll(results);
            }
            if (!streamEnded) {
                hitBoundOnAnyStream = true;
            }
        }
        publish(mediaType, listType, minVotes, candidates, hitBoundOnAnyStream, !hitBoundOnAnyStream);
    }

    private List<String> sources(MovieListType listType, String defaultSort) {
        return listType == MovieListType.TOP_RATED
                ? List.of("vote_average.desc", "vote_count.desc") : List.of(defaultSort);
    }

    private void publish(String mediaType, MovieListType listType, int minimumVotes,
                         List<TmdbSearchResponse.TmdbMovieSummary> candidates,
                         boolean selectionLimitReached, boolean providerExhausted) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        Map<Long, TmdbSearchResponse.TmdbMovieSummary> unique = new LinkedHashMap<>();
        for (TmdbSearchResponse.TmdbMovieSummary item : candidates) {
            if (item == null || item.getId() == null || item.getId() <= 0
                    || item.getEffectiveTitle() == null || !mediaType.equals(item.getResolvedMediaType())) continue;
            String primaryDate = "MOVIE".equals(mediaType) ? item.getReleaseDate() : item.getFirstAirDate();
            LocalDate release = date(primaryDate);
            if (release == null) continue;
            if ((listType == MovieListType.POPULAR || listType == MovieListType.TOP_RATED)
                    && (release.isAfter(today) || !validAudience(item.getVoteAverage())
                    || item.getVoteCount() == null || item.getVoteCount() < minimumVotes)) continue;
            if (listType == MovieListType.POPULAR && (item.getVoteAverage() < 7
                    || item.getPopularity() == null || !Double.isFinite(item.getPopularity())
                    || item.getPopularity() < 0)) continue;
            if (listType == MovieListType.UPCOMING && (!release.isAfter(today) || release.isAfter(today.plusYears(1)))) continue;
            if ((listType == MovieListType.RECENT || listType == MovieListType.CURRENTLY_AIRING)
                    && release.isAfter(today)) continue;
            if (listType == MovieListType.RECENT && release.isBefore(today.minusDays(90))) continue;
            unique.putIfAbsent(item.getId(), item);
        }
        List<TmdbSearchResponse.TmdbMovieSummary> ordered = new ArrayList<>(unique.values());
        if (listType == MovieListType.POPULAR) ordered.sort(Comparator
                .comparing(TmdbSearchResponse.TmdbMovieSummary::getPopularity).reversed()
                .thenComparing(TmdbSearchResponse.TmdbMovieSummary::getVoteCount, Comparator.reverseOrder())
                .thenComparing(TmdbSearchResponse.TmdbMovieSummary::getId));
        if (listType == MovieListType.TOP_RATED) ordered.sort(Comparator
                .comparingDouble((TmdbSearchResponse.TmdbMovieSummary item) ->
                        (item.getVoteCount() * item.getVoteAverage() + minimumVotes * 6.0)
                                / (item.getVoteCount() + minimumVotes)).reversed()
                .thenComparing(TmdbSearchResponse.TmdbMovieSummary::getVoteCount, Comparator.reverseOrder())
                .thenComparing(TmdbSearchResponse.TmdbMovieSummary::getId));
        List<CachedMovieList> entries = new ArrayList<>();
        for (TmdbSearchResponse.TmdbMovieSummary item : ordered) entries.add(CachedMovieList.builder()
                .mediaType(mediaType).listType(listType).tmdbId(item.getId()).title(item.getEffectiveTitle())
                .posterPath(item.getPosterPath()).voteAverage(item.getVoteAverage())
                .voteCount(item.getVoteCount()).popularity(item.getPopularity())
                .releaseDate("MOVIE".equals(mediaType) ? item.getReleaseDate() : item.getFirstAirDate())
                .rankOrder(entries.size() + 1).build());
        cachedMovieListRepository.deleteByMediaTypeAndListType(mediaType, listType);
        cachedMovieListRepository.saveAll(entries);
        DiscoverySnapshot snapshot = discoverySnapshotRepository.findByMediaTypeAndListType(mediaType, listType)
                .orElseGet(() -> DiscoverySnapshot.builder().mediaType(mediaType).listType(listType).build());
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        snapshot.setUpdatedAt(now);
        discoverySnapshotRepository.save(snapshot);
        categoryPublicationMetaMap.put(mediaType + ":" + listType,
                new CategoryPublicationMeta(mediaType, listType, selectionLimitReached, providerExhausted, now));
        log.info("Cached {} items for [{} - {}]", entries.size(), mediaType, listType);
    }

    private boolean validAudience(Double average) {
        return average != null && Double.isFinite(average) && average >= 0 && average <= 10;
    }

    private LocalDate date(String value) {
        try { return value == null ? null : LocalDate.parse(value); }
        catch (DateTimeParseException invalid) { return null; }
    }

    private void refreshTvOnTheAirCategory(String mediaType, MovieListType listType, int maxPages) {
        List<TmdbSearchResponse.TmdbMovieSummary> candidates = new ArrayList<>();
        boolean streamEnded = false;
        for (int page = 1; page <= maxPages; page++) {
            List<TmdbSearchResponse.TmdbMovieSummary> pageResults = tmdbClient.getTvOnTheAir(page);
            if (pageResults == null) throw new IllegalStateException("Invalid discovery response");
            if (pageResults.isEmpty()) {
                streamEnded = true;
                break;
            }
            pageResults.forEach(item -> item.setMediaType("tv"));
            candidates.addAll(pageResults);
        }
        boolean hitBound = !streamEnded;
        publish(mediaType, listType, 0, candidates, hitBound, !hitBound);
    }

    private static class SeasonRange {
        final String start;
        final String end;
        SeasonRange(String start, String end) {
            this.start = start;
            this.end = end;
        }
    }

    private SeasonRange getCurrentSeasonRange(LocalDate today) {
        int year = today.getYear();
        int month = today.getMonthValue();
        if (month <= 3) {
            return new SeasonRange(year + "-01-01", year + "-03-31");
        } else if (month <= 6) {
            return new SeasonRange(year + "-04-01", year + "-06-30");
        } else if (month <= 9) {
            return new SeasonRange(year + "-07-01", year + "-09-30");
        } else {
            return new SeasonRange(year + "-10-01", year + "-12-31");
        }
    }

    /**
     * Recalculate recommendations only for users whose rating/movie library changed.
     */
    public void recalculateDirtyUserRecommendations() {
        List<User> dirtyUsers = userRepository.findByNeedsRecommendationRefreshTrue();
        if (dirtyUsers.isEmpty()) {
            return;
        }

        log.info("Recalculating personalized recommendations for {} users...", dirtyUsers.size());
        for (User user : dirtyUsers) {
            try {
                personalizedRecommendationService.recomputeRecommendationsForUser(user);
            } catch (Exception e) {
                log.error("Failed to recompute recommendations for user {}: {}", user.getUsername(), e.getMessage());
            }
        }
    }
}
