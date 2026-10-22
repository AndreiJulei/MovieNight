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
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * Scheduled job refreshing cached TMDB discover lists and recalculating dirty user recommendations.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SuggestionScheduler {

    private final TmdbClient tmdbClient;
    private final CachedMovieListRepository cachedMovieListRepository;
    private final UserRepository userRepository;
    private final PersonalizedRecommendationService personalizedRecommendationService;
    private final org.springframework.transaction.PlatformTransactionManager transactionManager;

    /**
     * Populate cache on application startup if currently empty.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        if (cachedMovieListRepository.count() == 0 && tmdbClient.isConfigured()) {
            log.info("Initializing TMDB Discover caches on application startup...");
            refreshDiscoverySafely();
        }
    }

    /**
     * Scheduled job running once every day at 3 AM to refresh TMDB discovery lists.
     */
    @Scheduled(cron = "0 0 3 * * ?")
    public void scheduledDailyRefresh() {
        log.info("Starting scheduled daily refresh of TMDB Discover lists and dirty user recommendations...");
        refreshDiscoverySafely();
        recalculateDirtyUserRecommendations();
    }

    private void refreshDiscoverySafely() {
        try {
            new org.springframework.transaction.support.TransactionTemplate(transactionManager)
                    .executeWithoutResult(status -> refreshAllCachedLists());
        } catch (RuntimeException error) {
            // Startup/background discovery must not prevent access to saved libraries.
            log.warn("Discovery refresh unavailable; cached data is unchanged and on-demand reads can retry.");
        }
    }

    /**
     * Ingest discover categories from TMDB across Movies, TV Series, and Anime.
     */
    @Transactional
    public void refreshAllCachedLists() {
        if (!tmdbClient.isConfigured()) {
            log.debug("TMDB API key not configured. Skipping TMDB list cache refresh.");
            return;
        }

        LocalDate today = LocalDate.now();
        DateTimeFormatter fmt = DateTimeFormatter.ISO_LOCAL_DATE;
        String todayStr = today.format(fmt);
        String ninetyDaysAgo = today.minusDays(90).format(fmt);
        String oneYearFuture = today.plusYears(1).format(fmt);

        // ── 1. MOVIES ──
        // Newest Releases (last 90 days, min votes 10)
        refreshMovieCategory("MOVIE", MovieListType.RECENT, "popularity.desc", 10, ninetyDaysAgo, todayStr, 3);
        // Most Popular
        refreshMovieCategory("MOVIE", MovieListType.POPULAR, "popularity.desc", 200, null, null, 3);
        // Top Rated (masterpieces with >= 1000 votes)
        refreshMovieCategory("MOVIE", MovieListType.TOP_RATED, "vote_average.desc", 1000, null, null, 3);
        // Upcoming & Most Anticipated (12-month horizon)
        refreshMovieCategory("MOVIE", MovieListType.UPCOMING, "popularity.desc", 0, todayStr, oneYearFuture, 3);

        // ── 2. TV SERIES ──
        // Currently Airing
        refreshTvOnTheAirCategory("TV", MovieListType.CURRENTLY_AIRING, 3);
        // Most Popular TV
        refreshTvCategory("TV", MovieListType.POPULAR, "popularity.desc", 100, null, null, null, null, null, null, 3);
        // Top Rated TV (>= 500 votes)
        refreshTvCategory("TV", MovieListType.TOP_RATED, "vote_average.desc", 500, null, null, null, null, null, null, 3);
        // Upcoming Seasons (future premiere dates)
        refreshTvCategory("TV", MovieListType.UPCOMING, "popularity.desc", 0, todayStr, oneYearFuture, null, null, null, null, 3);

        // ── 3. ANIME ──
        SeasonRange currentSeason = getCurrentSeasonRange(today);
        SeasonRange nextSeason = getNextSeasonRange(today);

        // Current Season Hits (Japanese animation airing within current quarter)
        refreshTvCategory("ANIME", MovieListType.CURRENTLY_AIRING, "popularity.desc", 5, null, null, currentSeason.start, currentSeason.end, "16", null, 3);
        // Most Popular Anime
        refreshTvCategory("ANIME", MovieListType.POPULAR, "popularity.desc", 50, null, null, null, null, "16", null, 3);
        // All-Time Acclaimed (>= 200 votes)
        refreshTvCategory("ANIME", MovieListType.TOP_RATED, "vote_average.desc", 200, null, null, null, null, "16", null, 3);
        // Upcoming Next Season
        refreshTvCategory("ANIME", MovieListType.UPCOMING, "popularity.desc", 0, nextSeason.start, nextSeason.end, null, null, "16", null, 3);

        log.info("TMDB Discover list cache refreshed successfully across Movies, TV Series, and Anime.");
    }

    /**
     * On-demand refresh for a specific media type (Movies, TV, or Anime).
     */
    @Transactional
    public void refreshMediaType(String mediaType) {
        if (!tmdbClient.isConfigured() || mediaType == null) {
            return;
        }

        LocalDate today = LocalDate.now();
        DateTimeFormatter fmt = DateTimeFormatter.ISO_LOCAL_DATE;
        String todayStr = today.format(fmt);
        String ninetyDaysAgo = today.minusDays(90).format(fmt);
        String oneYearFuture = today.plusYears(1).format(fmt);

        String normalized = mediaType.trim().toUpperCase();
        if ("MOVIE".equals(normalized)) {
            refreshMovieCategory("MOVIE", MovieListType.RECENT, "popularity.desc", 10, ninetyDaysAgo, todayStr, 1);
            refreshMovieCategory("MOVIE", MovieListType.POPULAR, "popularity.desc", 200, null, null, 1);
            refreshMovieCategory("MOVIE", MovieListType.TOP_RATED, "vote_average.desc", 1000, null, null, 1);
            refreshMovieCategory("MOVIE", MovieListType.UPCOMING, "popularity.desc", 0, todayStr, oneYearFuture, 1);
        } else if ("TV".equals(normalized)) {
            refreshTvOnTheAirCategory("TV", MovieListType.CURRENTLY_AIRING, 1);
            refreshTvCategory("TV", MovieListType.POPULAR, "popularity.desc", 100, null, null, null, null, null, null, 1);
            refreshTvCategory("TV", MovieListType.TOP_RATED, "vote_average.desc", 500, null, null, null, null, null, null, 1);
            refreshTvCategory("TV", MovieListType.UPCOMING, "popularity.desc", 0, todayStr, oneYearFuture, null, null, null, null, 1);
        } else if ("ANIME".equals(normalized)) {
            SeasonRange currentSeason = getCurrentSeasonRange(today);
            SeasonRange nextSeason = getNextSeasonRange(today);
            refreshTvCategory("ANIME", MovieListType.CURRENTLY_AIRING, "popularity.desc", 5, null, null, currentSeason.start, currentSeason.end, "16", null, 1);
            refreshTvCategory("ANIME", MovieListType.POPULAR, "popularity.desc", 50, null, null, null, null, "16", null, 1);
            refreshTvCategory("ANIME", MovieListType.TOP_RATED, "vote_average.desc", 200, null, null, null, null, "16", null, 1);
            refreshTvCategory("ANIME", MovieListType.UPCOMING, "popularity.desc", 0, nextSeason.start, nextSeason.end, null, null, "16", null, 1);
        }
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
        List<CachedMovieList> entries = new ArrayList<>();
        int rank = 1;

        for (int page = 1; page <= maxPages; page++) {
            List<TmdbSearchResponse.TmdbMovieSummary> pageResults = tmdbClient.discoverMovies(
                    sortBy, minVotes, releaseDateGte, releaseDateLte, page
            );

            if (pageResults == null || pageResults.isEmpty()) {
                break;
            }

            for (TmdbSearchResponse.TmdbMovieSummary movie : pageResults) {
                if (movie.getId() != null && movie.getEffectiveTitle() != null && entries.stream().noneMatch(e -> e.getTmdbId().equals(movie.getId()))) {
                    entries.add(CachedMovieList.builder()
                            .mediaType(mediaType)
                            .listType(listType)
                            .tmdbId(movie.getId())
                            .title(movie.getEffectiveTitle())
                            .posterPath(movie.getPosterPath())
                            .voteAverage(movie.getVoteAverage())
                            .releaseDate(movie.getEffectiveReleaseDate())
                            .rankOrder(rank++)
                            .build());
                }
            }
        }

        {
            cachedMovieListRepository.deleteByMediaTypeAndListType(mediaType, listType);
            cachedMovieListRepository.saveAll(entries);
            log.info("Cached {} items for [{} - {}]", entries.size(), mediaType, listType);
        }
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
        List<CachedMovieList> entries = new ArrayList<>();
        int rank = 1;

        for (int page = 1; page <= maxPages; page++) {
            List<TmdbSearchResponse.TmdbMovieSummary> pageResults = tmdbClient.discoverTv(
                    sortBy, minVotes, firstAirDateGte, firstAirDateLte, airDateGte, airDateLte, withGenres, withOriginalLanguage, page
            );

            if (pageResults == null || pageResults.isEmpty()) {
                break;
            }

            for (TmdbSearchResponse.TmdbMovieSummary show : pageResults) {
                show.setMediaType("tv"); // The queried endpoint establishes provider identity.
                if (!mediaType.equals(show.getResolvedMediaType())) continue;
                if (show.getId() != null && show.getEffectiveTitle() != null && entries.stream().noneMatch(e -> e.getTmdbId().equals(show.getId()))) {
                    entries.add(CachedMovieList.builder()
                            .mediaType(mediaType)
                            .listType(listType)
                            .tmdbId(show.getId())
                            .title(show.getEffectiveTitle())
                            .posterPath(show.getPosterPath())
                            .voteAverage(show.getVoteAverage())
                            .releaseDate(show.getEffectiveReleaseDate())
                            .rankOrder(rank++)
                            .build());
                }
            }
        }

        {
            cachedMovieListRepository.deleteByMediaTypeAndListType(mediaType, listType);
            cachedMovieListRepository.saveAll(entries);
            log.info("Cached {} items for [{} - {}]", entries.size(), mediaType, listType);
        }
    }

    private void refreshTvOnTheAirCategory(String mediaType, MovieListType listType, int maxPages) {
        List<CachedMovieList> entries = new ArrayList<>();
        int rank = 1;

        for (int page = 1; page <= maxPages; page++) {
            List<TmdbSearchResponse.TmdbMovieSummary> pageResults = tmdbClient.getTvOnTheAir(page);
            if (pageResults == null || pageResults.isEmpty()) {
                break;
            }

            for (TmdbSearchResponse.TmdbMovieSummary show : pageResults) {
                show.setMediaType("tv"); // The queried endpoint establishes provider identity.
                if (!mediaType.equals(show.getResolvedMediaType())) continue;
                if (show.getId() != null && show.getEffectiveTitle() != null && entries.stream().noneMatch(e -> e.getTmdbId().equals(show.getId()))) {
                    entries.add(CachedMovieList.builder()
                            .mediaType(mediaType)
                            .listType(listType)
                            .tmdbId(show.getId())
                            .title(show.getEffectiveTitle())
                            .posterPath(show.getPosterPath())
                            .voteAverage(show.getVoteAverage())
                            .releaseDate(show.getEffectiveReleaseDate())
                            .rankOrder(rank++)
                            .build());
                }
            }
        }

        {
            cachedMovieListRepository.deleteByMediaTypeAndListType(mediaType, listType);
            cachedMovieListRepository.saveAll(entries);
            log.info("Cached {} items for [{} - {}]", entries.size(), mediaType, listType);
        }
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

    private SeasonRange getNextSeasonRange(LocalDate today) {
        int year = today.getYear();
        int month = today.getMonthValue();
        if (month <= 3) {
            return new SeasonRange(year + "-04-01", year + "-06-30");
        } else if (month <= 6) {
            return new SeasonRange(year + "-07-01", year + "-09-30");
        } else if (month <= 9) {
            return new SeasonRange(year + "-10-01", year + "-12-31");
        } else {
            return new SeasonRange((year + 1) + "-01-01", (year + 1) + "-03-31");
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
