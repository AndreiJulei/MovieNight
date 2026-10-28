package com.movienight.backend.service;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.ExploreCategoryPageResponse;
import com.movienight.backend.dto.SuggestionMovieItem;
import com.movienight.backend.model.*;
import com.movienight.backend.repository.*;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Manages 30-minute pinned Explore candidate pool sessions, whole-pool sorting/filtering,
 * and dynamic owner-library exclusions.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ExploreSessionManager {

    private final CachedMovieListRepository cachedMovieListRepository;
    private final DiscoverySnapshotRepository discoverySnapshotRepository;
    private final MovieRepository movieRepository;
    private final UserLibraryExclusionService userLibraryExclusionService;
    private final SuggestionScheduler suggestionScheduler;
    private final TmdbClient tmdbClient;
    @lombok.Setter
    private java.time.Clock clock = java.time.Clock.systemUTC();

    @Getter
    public static class ExploreSession {
        private final String sessionId;
        private final String username;
        private final String mediaType;
        private final MovieListType listType;
        private final LocalDateTime createdAt;
        private final LocalDateTime expiresAt;
        private final LocalDateTime snapshotUpdatedAt;
        private final boolean selectionLimitReached;
        private final boolean providerExhausted;
        private final List<CachedMovieList> candidatePool;

        public ExploreSession(String sessionId, String username, String mediaType, MovieListType listType,
                              LocalDateTime createdAt, LocalDateTime expiresAt, LocalDateTime snapshotUpdatedAt,
                              boolean selectionLimitReached, boolean providerExhausted,
                              List<CachedMovieList> candidatePool) {
            this.sessionId = sessionId;
            this.username = username;
            this.mediaType = mediaType;
            this.listType = listType;
            this.createdAt = createdAt;
            this.expiresAt = expiresAt;
            this.snapshotUpdatedAt = snapshotUpdatedAt;
            this.selectionLimitReached = selectionLimitReached;
            this.providerExhausted = providerExhausted;
            this.candidatePool = Collections.unmodifiableList(candidatePool);
        }
    }

    private final Map<String, ExploreSession> sessions = new ConcurrentHashMap<>();

    public void onCategoryRebuilt(String mediaType, MovieListType listType) {
        // Scheduled refresh or rebuild must NOT alter active pinned sessions (DR03).
        // Only clean up sessions that have already expired.
        LocalDateTime now = LocalDateTime.now(clock);
        sessions.values().removeIf(s -> now.isAfter(s.getExpiresAt()));
    }

    public ExploreCategoryPageResponse getCategoryPage(
            String username,
            String mediaType,
            String categoryName,
            String sessionId,
            Integer cursor,
            Integer limit,
            String sortBy,
            Integer minRating
    ) {
        String type = userLibraryExclusionService.normalizeMediaType(mediaType);
        MovieListType listType = resolveCategory(categoryName);
        String categoryId = normalizeCategoryId(categoryName, listType);

        LocalDateTime now = LocalDateTime.now(clock);
        ExploreSession session;

        if (sessionId != null && !sessionId.isBlank()) {
            if (username == null || username.isBlank()) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required for explore pagination sessions.");
            }
            session = sessions.get(sessionId);
            if (session == null) {
                throw new ResponseStatusException(HttpStatus.GONE, "Session expired or lost. Refresh discovery to continue.");
            }
            if (!session.getUsername().equals(username.trim())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied to session.");
            }
            if (!session.getMediaType().equalsIgnoreCase(type) || session.getListType() != listType) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Session context does not match requested media type or category.");
            }
            if (now.isAfter(session.getExpiresAt())) {
                sessions.remove(sessionId);
                throw new ResponseStatusException(HttpStatus.GONE, "Session expired. Refresh discovery to continue.");
            }
            if (Duration.between(session.getSnapshotUpdatedAt(), now).compareTo(Duration.ofDays(7)) > 0) {
                return ExploreCategoryPageResponse.builder()
                        .sessionId(sessionId)
                        .mediaType(type)
                        .category(categoryId)
                        .title(categoryTitle(type, listType))
                        .state("UNAVAILABLE")
                        .updatedAt(session.getSnapshotUpdatedAt() + "Z")
                        .movies(List.of())
                        .hasMore(false)
                        .terminalReason("UNAVAILABLE")
                        .build();
            }
        } else {
            DiscoverySnapshot snapshot = discoverySnapshotRepository.findByMediaTypeAndListType(type, listType).orElse(null);
            if (snapshot == null && tmdbClient.isConfigured()) {
                try {
                    suggestionScheduler.refreshCategory(type, listType);
                    snapshot = discoverySnapshotRepository.findByMediaTypeAndListType(type, listType).orElse(null);
                } catch (Exception e) {
                    log.warn("Could not populate discovery snapshot for {} - {}: {}", type, listType, e.getMessage());
                }
            }
            if (snapshot == null) {
                return ExploreCategoryPageResponse.builder()
                        .mediaType(type)
                        .category(categoryId)
                        .title(categoryTitle(type, listType))
                        .state("UNAVAILABLE")
                        .movies(List.of())
                        .hasMore(false)
                        .terminalReason("UNAVAILABLE")
                        .build();
            }
            Duration age = Duration.between(snapshot.getUpdatedAt(), now);
            if (age.compareTo(Duration.ofDays(7)) > 0) {
                return ExploreCategoryPageResponse.builder()
                        .mediaType(type)
                        .category(categoryId)
                        .title(categoryTitle(type, listType))
                        .state("UNAVAILABLE")
                        .updatedAt(snapshot.getUpdatedAt() + "Z")
                        .movies(List.of())
                        .hasMore(false)
                        .terminalReason("UNAVAILABLE")
                        .build();
            }

            List<CachedMovieList> pool = cachedMovieListRepository.findByMediaTypeAndListTypeOrderByRankOrderAsc(type, listType);
            if ("TV".equals(type)) {
                Set<Long> animeIds = cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc("ANIME")
                        .stream().map(CachedMovieList::getTmdbId).collect(Collectors.toSet());
                movieRepository.findByMediaType("ANIME").stream().map(Movie::getTmdbId)
                        .filter(Objects::nonNull).forEach(animeIds::add);
                pool = pool.stream().filter(item -> !animeIds.contains(item.getTmdbId())).toList();
            }

            SuggestionScheduler.CategoryPublicationMeta meta = suggestionScheduler.getPublicationMeta(type, listType);
            boolean hitBound = meta != null ? meta.isSelectionLimitReached() : false;
            boolean providerEmpty = meta != null ? meta.isProviderExhausted() : true;

            boolean isAuthenticated = username != null && !username.isBlank();
            String newId = isAuthenticated ? UUID.randomUUID().toString() : null;
            session = new ExploreSession(newId, isAuthenticated ? username.trim() : null, type, listType,
                    now, now.plusMinutes(30), snapshot.getUpdatedAt(), hitBound, providerEmpty, pool);
            if (newId != null) {
                sessions.put(newId, session);
            }
        }

        // Current library exclusions
        Set<Long> excludedTmdbIds = userLibraryExclusionService.getExcludedTmdbIds(username, type);

        // Whole-pool filter and sort
        List<CachedMovieList> pool = new ArrayList<>(session.getCandidatePool());
        if (minRating != null && minRating > 0) {
            pool = pool.stream()
                    .filter(m -> m.getVoteAverage() != null && m.getVoteAverage() >= minRating)
                    .collect(Collectors.toList());
        }

        if ("title".equalsIgnoreCase(sortBy)) {
            pool.sort(Comparator.comparing(CachedMovieList::getTitle, String.CASE_INSENSITIVE_ORDER)
                    .thenComparing(CachedMovieList::getRankOrder));
        } else if ("year".equalsIgnoreCase(sortBy)) {
            pool.sort(Comparator.comparing((CachedMovieList m) -> parseYear(m.getReleaseDate()), Comparator.nullsLast(Comparator.reverseOrder()))
                    .thenComparing(CachedMovieList::getRankOrder));
        } else if ("rating".equalsIgnoreCase(sortBy)) {
            pool.sort(Comparator.comparing(CachedMovieList::getVoteAverage, Comparator.nullsLast(Comparator.reverseOrder()))
                    .thenComparing(CachedMovieList::getVoteCount, Comparator.nullsLast(Comparator.reverseOrder()))
                    .thenComparing(CachedMovieList::getRankOrder));
        } else {
            pool.sort(Comparator.comparing(CachedMovieList::getRankOrder));
        }

        int effCursor = (cursor != null && cursor >= 0) ? cursor : 0;
        int effLimit = (limit != null && limit > 0) ? Math.min(limit, 20) : 20;

        List<SuggestionMovieItem> batch = new ArrayList<>();
        int nextCursorIndex = effCursor;
        for (int i = effCursor; i < pool.size(); i++) {
            CachedMovieList candidate = pool.get(i);
            if (excludedTmdbIds.contains(candidate.getTmdbId())) {
                continue;
            }
            batch.add(mapToItem(candidate, type));
            if (batch.size() == effLimit) {
                nextCursorIndex = i + 1;
                break;
            }
            nextCursorIndex = i + 1;
        }

        boolean hasMore = false;
        for (int i = nextCursorIndex; i < pool.size(); i++) {
            if (!excludedTmdbIds.contains(pool.get(i).getTmdbId())) {
                hasMore = true;
                break;
            }
        }

        int totalEligible = 0;
        for (CachedMovieList item : pool) {
            if (!excludedTmdbIds.contains(item.getTmdbId())) {
                totalEligible++;
            }
        }

        final Set<Long> finalExcludedIds = excludedTmdbIds;
        String terminalReason = null;
        String underlyingLimit = null;
        if (!hasMore) {
            if (batch.isEmpty() && effCursor == 0 && session.getCandidatePool().isEmpty()) {
                terminalReason = session.isProviderExhausted() ? "PROVIDER_EXHAUSTED" : "SELECTION_LIMIT_REACHED";
            } else if (batch.isEmpty() && effCursor == 0) {
                terminalReason = "NO_MATCHING_UNSAVED_TITLES";
                underlyingLimit = session.isSelectionLimitReached() ? "SELECTION_LIMIT_REACHED" : "PROVIDER_EXHAUSTED";
            } else {
                boolean hasFilteredOrSaved = session.getCandidatePool().stream()
                        .anyMatch(item -> (minRating != null && minRating > 0 && (item.getVoteAverage() == null || item.getVoteAverage() < minRating))
                                || finalExcludedIds.contains(item.getTmdbId()));
                if (nextCursorIndex >= pool.size() && !hasFilteredOrSaved) {
                    terminalReason = session.isSelectionLimitReached() ? "SELECTION_LIMIT_REACHED" : "PROVIDER_EXHAUSTED";
                } else if (hasFilteredOrSaved && nextCursorIndex < pool.size()) {
                    terminalReason = "NO_MATCHING_UNSAVED_TITLES";
                    underlyingLimit = session.isSelectionLimitReached() ? "SELECTION_LIMIT_REACHED" : "PROVIDER_EXHAUSTED";
                } else if (hasFilteredOrSaved) {
                    terminalReason = session.isSelectionLimitReached() ? "SELECTION_LIMIT_REACHED" : "PROVIDER_EXHAUSTED";
                } else {
                    terminalReason = session.isSelectionLimitReached() ? "SELECTION_LIMIT_REACHED" : "PROVIDER_EXHAUSTED";
                }
            }
        }

        Duration age = Duration.between(session.getSnapshotUpdatedAt(), now);
        String state = age.compareTo(Duration.ofHours(24)) > 0 ? "STALE" : totalEligible == 0 ? "EMPTY" : "READY";

        return ExploreCategoryPageResponse.builder()
                .sessionId(session.getSessionId())
                .mediaType(type)
                .category(categoryId)
                .title(categoryTitle(type, listType))
                .subtitle(categorySubtitle(type, listType))
                .state(state)
                .updatedAt(session.getSnapshotUpdatedAt() + "Z")
                .movies(batch)
                .cursor(nextCursorIndex)
                .hasMore(session.getSessionId() != null && hasMore)
                .terminalReason(terminalReason)
                .underlyingLimit(underlyingLimit)
                .totalEligibleInPool(totalEligible)
                .build();
    }

    private SuggestionMovieItem mapToItem(CachedMovieList item, String mediaType) {
        return SuggestionMovieItem.builder()
                .tmdbId(item.getTmdbId())
                .title(item.getTitle())
                .posterUrl(item.getPosterPath() != null ? tmdbClient.buildPosterUrl(item.getPosterPath()) : null)
                .voteAverage(item.getVoteAverage())
                .voteCount(item.getVoteCount())
                .releaseYear(parseYear(item.getReleaseDate()))
                .mediaType(mediaType)
                .build();
    }





    private MovieListType resolveCategory(String category) {
        if (category == null) throw new IllegalArgumentException("Category cannot be null");
        return switch (category.trim().toLowerCase()) {
            case "newest" -> MovieListType.RECENT;
            case "airing", "current-season" -> MovieListType.CURRENTLY_AIRING;
            case "popular" -> MovieListType.POPULAR;
            case "top-rated" -> MovieListType.TOP_RATED;
            case "upcoming" -> MovieListType.UPCOMING;
            default -> throw new IllegalArgumentException("Unknown discovery category: " + category);
        };
    }

    private String normalizeCategoryId(String category, MovieListType listType) {
        return switch (listType) {
            case RECENT -> "newest";
            case CURRENTLY_AIRING -> category != null && category.contains("season") ? "current-season" : "airing";
            case POPULAR -> "popular";
            case TOP_RATED -> "top-rated";
            case UPCOMING -> "upcoming";
        };
    }

    private String categoryTitle(String mediaType, MovieListType listType) {
        return switch (listType) {
            case RECENT -> "Newest Releases";
            case CURRENTLY_AIRING -> "ANIME".equals(mediaType) ? "Current Season Hits" : "Currently Airing";
            case POPULAR -> "Popular & well rated";
            case TOP_RATED -> "Top Rated";
            case UPCOMING -> "MOVIE".equals(mediaType) ? "Upcoming Movies" : "ANIME".equals(mediaType) ? "Upcoming Anime Series" : "Upcoming Series";
        };
    }

    private String categorySubtitle(String mediaType, MovieListType listType) {
        return switch (listType) {
            case RECENT -> "Movies released in the last 90 days";
            case CURRENTLY_AIRING -> "ANIME".equals(mediaType) ? "Anime in the current quarter whose series have premiered" : "Series in TMDB's airing feed that have premiered";
            case POPULAR -> "Popular among TMDB viewers, with at least 7/10 audience rating and enough votes";
            case TOP_RATED -> "Ranked by TMDB audience rating adjusted for vote volume within a bounded candidate pool";
            case UPCOMING -> "MOVIE".equals(mediaType) ? "Movies with release dates in the next 12 months" : "Series premiering within the next 12 months";
        };
    }

    private Integer parseYear(String releaseDate) {
        if (releaseDate == null || releaseDate.length() < 4) return null;
        try {
            return Integer.parseInt(releaseDate.substring(0, 4));
        } catch (NumberFormatException e) {
            return null;
        }
    }


}
