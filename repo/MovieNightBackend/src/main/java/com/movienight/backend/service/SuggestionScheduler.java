package com.movienight.backend.service;

import com.movienight.backend.client.AniListUnavailableException;
import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.external.TmdbMovieDetailsResponse;
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
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Scheduled job refreshing cached TMDB discover lists and recalculating dirty user recommendations.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SuggestionScheduler {

    /** TMDB TV genre ids: Animation, and Kids/Family (excluded from curated anime shelves; pipe = either). */
    static final String ANIMATION_GENRE = "16";
    static final String KIDS_AND_FAMILY_GENRES = "10762|10751";
    static final int ANIME_POPULAR_MIN_VOTES = 150;
    static final int ANIME_TOP_RATED_MIN_VOTES = 300;
    /** The Explore categories every discovery shelf and highlight chart is built for. */
    static final List<String> EXPLORE_MEDIA_TYPES = List.of("MOVIE", "TV", "ANIME");
    /**
     * How deep one shelf reads TMDB discover: the sort orders it merges, the pages read per sort, whether
     * requests are throttled, and how many titles are published. Top Rated reads deep (PD-07): 50 pages of
     * the best-rated sort plus 10 of the most-voted sort (which only catches widely seen titles), throttled,
     * publishing at most 1,000 titles. Every other shelf reads one sort, unthrottled and uncapped.
     */
    record ShelfPaging(List<SortPages> sorts, boolean throttled, int maxTitles) {
        record SortPages(String sortBy, int maxPages) {}

        static final int TOP_RATED_BEST_RATED_PAGES = 50;
        static final int TOP_RATED_MOST_VOTED_PAGES = 10;
        static final int TOP_RATED_MAX_TITLES = 1000;

        static ShelfPaging topRated() {
            return new ShelfPaging(List.of(
                    new SortPages("vote_average.desc", TOP_RATED_BEST_RATED_PAGES),
                    new SortPages("vote_count.desc", TOP_RATED_MOST_VOTED_PAGES)), true, TOP_RATED_MAX_TITLES);
        }

        static ShelfPaging single(String sortBy, int maxPages) {
            return new ShelfPaging(List.of(new SortPages(sortBy, maxPages)), false, Integer.MAX_VALUE);
        }
    }

    private final TmdbClient tmdbClient;
    private final DiscoveryRequestPacer topRatedPacer;
    private final AnimeEnrichmentService animeEnrichment;
    private final CachedMovieListRepository cachedMovieListRepository;
    private final DiscoverySnapshotRepository discoverySnapshotRepository;
    private final UserRepository userRepository;
    private final PersonalizedRecommendationService personalizedRecommendationService;
    private final RecommendationMaintenanceService recommendationMaintenanceService;
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
        refreshHighlightChartSafely(MovieListType.TRENDING_WEEK);
        recalculateDirtyUserRecommendations();
    }

    /** The Explore "Top 10 today" chart follows TMDB's daily trending list, so it refreshes every 4 hours (PD-10). */
    @Scheduled(cron = "0 30 */4 * * ?", zone = "UTC")
    public void scheduledTopTenRefresh() {
        refreshHighlightChartSafely(MovieListType.TRENDING_DAY);
    }

    /** Refresh one highlight chart for every Explore category; a failure keeps that category's last chart. */
    private void refreshHighlightChartSafely(MovieListType chart) {
        if (!tmdbClient.isConfigured()) return;
        for (String type : EXPLORE_MEDIA_TYPES) {
            try {
                refreshCategory(type, chart);
            } catch (RuntimeException error) {
                log.warn("{} {} refresh unavailable; the previous chart stays served.", type, chart);
            }
        }
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

        for (String type : EXPLORE_MEDIA_TYPES) {
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

    /** Rebuild one shelf; the previous publication stays intact unless the whole new shelf is built. */
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
            // Provider calls (TMDB, AniList) run outside any DB transaction; only publication is transactional,
            // so a failure leaves the previous publication intact and no connection is held during HTTP.
            rebuildCategory(type, listType);
            owned.complete(null);
        } catch (RuntimeException failure) {
            owned.completeExceptionally(failure);
            throw failure;
        } finally {
            activeCategoryRefreshes.remove(key, owned);
        }
    }

    private void rebuildCategory(String type, MovieListType listType) {
        if (listType.isHighlightChart()) {
            refreshTrendingChart(type, listType);
            return;
        }
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        String now = today.toString();
        String nextYear = today.plusYears(1).toString();
        SeasonRange season = getCurrentSeasonRange(today);
        if ("MOVIE".equals(type)) {
            switch (listType) {
                case RECENT -> refreshMovieCategory(type, listType, ShelfPaging.single("popularity.desc", 10), 10, today.minusDays(90).toString(), now);
                case POPULAR -> refreshMovieCategory(type, listType, ShelfPaging.single("popularity.desc", 10), 200, null, now);
                case TOP_RATED -> refreshMovieCategory(type, listType, ShelfPaging.topRated(), 1000, null, now);
                case UPCOMING -> refreshMovieCategory(type, listType, ShelfPaging.single("popularity.desc", 10), 0, today.plusDays(1).toString(), nextYear);
                default -> throw new IllegalArgumentException("Invalid movie shelf");
            }
        } else if ("TV".equals(type) || "ANIME".equals(type)) {
            boolean anime = "ANIME".equals(type);
            int votes = listType == MovieListType.TOP_RATED ? (anime ? ANIME_TOP_RATED_MIN_VOTES : 500)
                    : listType == MovieListType.POPULAR ? (anime ? ANIME_POPULAR_MIN_VOTES : 100) : 0;
            String withGenres = anime ? ANIMATION_GENRE : null;
            String withoutGenres = anime ? KIDS_AND_FAMILY_GENRES : null;
            String language = anime ? "ja" : null;
            if (listType == MovieListType.CURRENTLY_AIRING && "TV".equals(type)) {
                refreshTvOnTheAirCategory(type, listType, 10);
            } else if (listType == MovieListType.CURRENTLY_AIRING) {
                refreshTvCategory(type, listType, ShelfPaging.single("popularity.desc", 10), 5, null, now,
                        season.start, season.end, withGenres, withoutGenres, language);
            } else if (listType == MovieListType.POPULAR) {
                refreshTvCategory(type, listType, ShelfPaging.single("popularity.desc", 10),
                        votes, null, now, null, null, withGenres, withoutGenres, language);
            } else if (listType == MovieListType.TOP_RATED) {
                refreshTvCategory(type, listType, ShelfPaging.topRated(),
                        votes, null, now, null, null, withGenres, withoutGenres, language);
            } else if (listType == MovieListType.UPCOMING) {
                refreshTvCategory(type, listType, ShelfPaging.single("popularity.desc", 10), 0, today.plusDays(1).toString(),
                        nextYear, null, null, withGenres, withoutGenres, language);
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
            ShelfPaging paging,
            Integer minVotes,
            String releaseDateGte,
            String releaseDateLte
    ) {
        readPages(mediaType, listType, paging, minVotes, (sortBy, page) ->
                tmdbClient.discoverMovies(sortBy, minVotes, releaseDateGte, releaseDateLte, page));
    }

    private void refreshTvCategory(
            String mediaType,
            MovieListType listType,
            ShelfPaging paging,
            Integer minVotes,
            String firstAirDateGte,
            String firstAirDateLte,
            String airDateGte,
            String airDateLte,
            String withGenres,
            String withoutGenres,
            String withOriginalLanguage
    ) {
        readPages(mediaType, listType, paging, minVotes, (sortBy, page) -> {
            List<TmdbSearchResponse.TmdbMovieSummary> results = tmdbClient.discoverTv(
                    sortBy, minVotes, firstAirDateGte, firstAirDateLte, airDateGte, airDateLte,
                    withGenres, withoutGenres, withOriginalLanguage, page);
            if (results != null) results.forEach(item -> item.setMediaType("tv"));
            return results;
        });
    }

    /** One TMDB discover page for a sort order. */
    @FunctionalInterface
    private interface DiscoverPage {
        List<TmdbSearchResponse.TmdbMovieSummary> fetch(String sortBy, int page);
    }

    /**
     * Read every sort order of the shelf's paging plan until a sort runs out (an empty page) or reaches its
     * page limit, then publish. Any failed page throws, so the previous publication stays served.
     */
    private void readPages(String mediaType, MovieListType listType, ShelfPaging paging, int minVotes,
                           DiscoverPage discover) {
        List<TmdbSearchResponse.TmdbMovieSummary> candidates = new ArrayList<>();
        boolean hitBoundOnAnySort = false;
        for (ShelfPaging.SortPages sort : paging.sorts()) {
            boolean sortEnded = false;
            for (int page = 1; page <= sort.maxPages(); page++) {
                if (paging.throttled()) topRatedPacer.awaitTurn();
                List<TmdbSearchResponse.TmdbMovieSummary> results = discover.fetch(sort.sortBy(), page);
                if (results == null) throw new IllegalStateException("Invalid discovery response");
                if (results.isEmpty()) {
                    sortEnded = true;
                    break;
                }
                candidates.addAll(results);
            }
            if (!sortEnded) hitBoundOnAnySort = true;
        }
        publish(mediaType, listType, paging.maxTitles(), minVotes, candidates, hitBoundOnAnySort, !hitBoundOnAnySort);
    }

    private void publish(String mediaType, MovieListType listType, int maxTitles, int minimumVotes,
                         List<TmdbSearchResponse.TmdbMovieSummary> candidates,
                         boolean selectionLimitReached, boolean providerExhausted) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        Map<Long, TmdbSearchResponse.TmdbMovieSummary> unique = new LinkedHashMap<>();
        for (TmdbSearchResponse.TmdbMovieSummary item : candidates) {
            if (item == null || item.getId() == null || item.getId() <= 0
                    || item.getEffectiveTitle() == null || !mediaType.equals(item.getResolvedMediaType())) continue;
            String primaryDate = "MOVIE".equals(mediaType) ? item.getReleaseDate() : item.getFirstAirDate();
            LocalDate release = date(primaryDate);
            if (listType.isHighlightChart()) {
                // A trending chart is TMDB's rank order: no date or rating rules, only the anime policy.
                if ("ANIME".equals(mediaType) && !AnimeShelfPolicy.qualifiesAsAnimeTv(item)) continue;
                // The spotlight hero needs artwork, so its titles are the first ones that have a backdrop.
                if (listType == MovieListType.TRENDING_WEEK
                        && (item.getBackdropPath() == null || item.getBackdropPath().isBlank())) continue;
                unique.putIfAbsent(item.getId(), item);
                continue;
            }
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
        Map<Long, AniListMapping> anime = curateAnime(mediaType, listType, unique);
        List<TmdbSearchResponse.TmdbMovieSummary> ordered = new ArrayList<>(unique.values());
        if (listType == MovieListType.POPULAR) ordered.sort(Comparator
                .comparing(TmdbSearchResponse.TmdbMovieSummary::getPopularity).reversed()
                .thenComparing(TmdbSearchResponse.TmdbMovieSummary::getVoteCount, Comparator.reverseOrder())
                .thenComparing(TmdbSearchResponse.TmdbMovieSummary::getId));
        if (listType == MovieListType.TOP_RATED) ordered.sort(Comparator
                .comparingDouble((TmdbSearchResponse.TmdbMovieSummary item) -> AnimeShelfPolicy.topRatedScore(
                        (item.getVoteCount() * item.getVoteAverage() + minimumVotes * 6.0)
                                / (item.getVoteCount() + minimumVotes), anime.get(item.getId()))).reversed()
                .thenComparing(TmdbSearchResponse.TmdbMovieSummary::getVoteCount, Comparator.reverseOrder())
                .thenComparing(TmdbSearchResponse.TmdbMovieSummary::getId));
        if (ordered.size() > maxTitles) ordered = new ArrayList<>(ordered.subList(0, maxTitles));
        Map<Long, SpotlightDetails> spotlight = listType == MovieListType.TRENDING_WEEK
                ? spotlightDetails(mediaType, ordered) : Map.of();
        List<CachedMovieList> entries = new ArrayList<>();
        for (TmdbSearchResponse.TmdbMovieSummary item : ordered) entries.add(CachedMovieList.builder()
                .mediaType(mediaType).listType(listType).tmdbId(item.getId()).title(item.getEffectiveTitle())
                .posterPath(item.getPosterPath())
                .backdropPath(listType.isHighlightChart() ? item.getBackdropPath() : null)
                .logoUrl(spotlight.containsKey(item.getId()) ? spotlight.get(item.getId()).logoUrl() : null)
                .genres(spotlight.containsKey(item.getId()) ? spotlight.get(item.getId()).genres() : null)
                .voteAverage(item.getVoteAverage())
                .voteCount(item.getVoteCount()).popularity(item.getPopularity())
                .releaseDate("MOVIE".equals(mediaType) ? item.getReleaseDate() : item.getFirstAirDate())
                .rankOrder(entries.size() + 1).build());
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            cachedMovieListRepository.deleteByMediaTypeAndListType(mediaType, listType);
            cachedMovieListRepository.saveAll(entries);
            DiscoverySnapshot snapshot = discoverySnapshotRepository.findByMediaTypeAndListType(mediaType, listType)
                    .orElseGet(() -> DiscoverySnapshot.builder().mediaType(mediaType).listType(listType).build());
            snapshot.setUpdatedAt(now);
            discoverySnapshotRepository.save(snapshot);
        });
        categoryPublicationMetaMap.put(mediaType + ":" + listType,
                new CategoryPublicationMeta(mediaType, listType, selectionLimitReached, providerExhausted, now));
        log.info("Cached {} items for [{} - {}]", entries.size(), mediaType, listType);
    }

    /**
     * Apply AniList curation to candidates that already passed the TMDB rules (removing them from
     * {@code unique}) and return their mappings. A provider failure propagates so the previous
     * publication stays in place; no metadata is invented.
     */
    private Map<Long, AniListMapping> curateAnime(String mediaType, MovieListType listType,
                                                  Map<Long, TmdbSearchResponse.TmdbMovieSummary> unique) {
        Map<Long, AniListMapping> mappings = new LinkedHashMap<>();
        if (!"ANIME".equals(mediaType) || !animeEnrichment.isEnabled()) return mappings;
        boolean floor = listType == MovieListType.POPULAR || listType == MovieListType.TOP_RATED;
        // With a published shelf, a provider failure aborts so that shelf stays unchanged. With none yet,
        // an empty page is worse: fall back to the TMDB-only rules for titles AniList has not resolved.
        boolean firstPublication = discoverySnapshotRepository.findByMediaTypeAndListType(mediaType, listType).isEmpty();
        boolean providerDown = false;
        for (var entry : List.copyOf(unique.entrySet())) {
            TmdbSearchResponse.TmdbMovieSummary item = entry.getValue();
            LocalDate first = date(item.getFirstAirDate());
            AniListMapping mapping = null;
            if (providerDown) {
                mapping = animeEnrichment.findStored(item.getId());
            } else {
                try {
                    mapping = animeEnrichment.resolve(item.getId(), item.getEffectiveTitle(),
                            first == null ? null : first.getYear());
                } catch (AniListUnavailableException failure) {
                    if (!firstPublication) throw failure;
                    providerDown = true;
                    log.warn("AniList unavailable (retry after {}s); publishing first {} shelf with TMDB-only rules for unresolved titles.",
                            failure.getRetryAfterSeconds(), listType);
                    mapping = animeEnrichment.findStored(item.getId());
                }
            }
            if (AnimeShelfPolicy.excludedFromCuratedShelves(mapping)
                    || floor && !AnimeShelfPolicy.meetsSignalFloor(mapping)) unique.remove(entry.getKey());
            else mappings.put(entry.getKey(), mapping);
        }
        return mappings;
    }

    /**
     * Trending pages read at most per chart. Movies fill a chart from the first page; TV loses its anime
     * titles to the anime category, and anime is a small share of TMDB's TV chart, so both read deeper.
     */
    static final Map<String, Integer> TRENDING_MAX_PAGES = Map.of("MOVIE", 2, "TV", 3, "ANIME", 10);

    /**
     * Rebuild a trending chart from TMDB's trending list (week for the spotlight, day for the Top 10).
     * Pages are read until the chart has enough eligible titles, plus headroom for AniList curation, or
     * the list ends. Any failed page throws, so the previous chart stays served.
     */
    private void refreshTrendingChart(String mediaType, MovieListType listType) {
        HighlightChart chart = HighlightChart.of(listType);
        int titles = chart.titles;
        String providerType = "MOVIE".equals(mediaType) ? "movie" : "tv";
        int maxPages = TRENDING_MAX_PAGES.getOrDefault(mediaType, 1);
        List<TmdbSearchResponse.TmdbMovieSummary> candidates = new ArrayList<>();
        Set<Long> eligible = new HashSet<>();
        boolean listEnded = false;
        for (int page = 1; page <= maxPages && eligible.size() < titles * 2; page++) {
            List<TmdbSearchResponse.TmdbMovieSummary> results = tmdbClient.getTrending(providerType, chart.timeWindow, page);
            if (results == null) throw new IllegalStateException("Invalid trending response");
            if (results.isEmpty()) {
                listEnded = true;
                break;
            }
            candidates.addAll(results);
            for (TmdbSearchResponse.TmdbMovieSummary item : results) {
                if (item != null && item.getId() != null && mediaType.equals(item.getResolvedMediaType())
                        && (!"ANIME".equals(mediaType) || AnimeShelfPolicy.qualifiesAsAnimeTv(item))) eligible.add(item.getId());
            }
        }
        publish(mediaType, listType, titles, 0, candidates, !listEnded, listEnded);
    }

    record SpotlightDetails(String logoUrl, String genres) {}

    /**
     * Title logo and genres for the spotlight's few titles, from TMDB details (no OMDb). A title whose details
     * fail keeps its backdrop and shows its text title instead of a logo.
     */
    private Map<Long, SpotlightDetails> spotlightDetails(String mediaType,
                                                         List<TmdbSearchResponse.TmdbMovieSummary> titles) {
        Map<Long, SpotlightDetails> details = new HashMap<>();
        for (TmdbSearchResponse.TmdbMovieSummary item : titles) {
            try {
                tmdbClient.getMediaDetails(item.getId(), mediaType).ifPresent(response -> {
                    String genres = response.getGenres() == null ? null : response.getGenres().stream()
                            .map(TmdbMovieDetailsResponse.Genre::getName)
                            .filter(name -> name != null && !name.isBlank()).limit(3)
                            .collect(Collectors.joining(","));
                    details.put(item.getId(), new SpotlightDetails(tmdbClient.extractLogoUrl(response),
                            genres == null || genres.isEmpty() ? null : genres));
                });
            } catch (RuntimeException unavailable) {
                log.debug("Spotlight details unavailable for {} {}", mediaType, item.getId());
            }
        }
        return details;
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
        publish(mediaType, listType, Integer.MAX_VALUE, 0, candidates, hitBound, !hitBound);
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
        if (recommendationMaintenanceService != null && recommendationMaintenanceService.isMaintenanceActive()) {
            log.info("Skipping scheduled dirty user recommendation recalculation: maintenance mode is active.");
            return;
        }

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
