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

    /**
     * Populate cache on application startup if currently empty.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        if (cachedMovieListRepository.count() == 0 && tmdbClient.isConfigured()) {
            log.info("Initializing TMDB Discover caches on application startup...");
            refreshAllCachedLists();
        }
    }

    /**
     * Scheduled job running once every day at 3 AM to refresh TMDB discovery lists.
     */
    @Scheduled(cron = "0 0 3 * * ?")
    public void scheduledDailyRefresh() {
        log.info("Starting scheduled daily refresh of TMDB Discover lists and dirty user recommendations...");
        refreshAllCachedLists();
        recalculateDirtyUserRecommendations();
    }

    /**
     * Ingest 300-400 movies per discover category from TMDB.
     */
    @Transactional
    public void refreshAllCachedLists() {
        if (!tmdbClient.isConfigured()) {
            log.debug("TMDB API key not configured. Skipping TMDB list cache refresh.");
            return;
        }

        LocalDate today = LocalDate.now();
        DateTimeFormatter fmt = DateTimeFormatter.ISO_LOCAL_DATE;

        // 1. Popular
        refreshCategory(MovieListType.POPULAR, "popularity.desc", 100, null, null, 15);

        // 2. Top Rated
        refreshCategory(MovieListType.TOP_RATED, "vote_average.desc", 300, null, null, 15);

        // 3. Recent
        String sixMonthsAgo = today.minusMonths(6).format(fmt);
        String todayStr = today.format(fmt);
        refreshCategory(MovieListType.RECENT, "popularity.desc", 30, sixMonthsAgo, todayStr, 15);

        // 4. Upcoming
        String oneYearFuture = today.plusYears(1).format(fmt);
        refreshCategory(MovieListType.UPCOMING, "popularity.desc", 0, todayStr, oneYearFuture, 15);

        log.info("TMDB Discover list cache refreshed successfully.");
    }

    private void refreshCategory(
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
                if (movie.getId() != null && movie.getTitle() != null) {
                    entries.add(CachedMovieList.builder()
                            .listType(listType)
                            .tmdbId(movie.getId())
                            .title(movie.getTitle())
                            .posterPath(movie.getPosterPath())
                            .voteAverage(movie.getVoteAverage())
                            .releaseDate(movie.getReleaseDate())
                            .rankOrder(rank++)
                            .build());
                }
            }
        }

        if (!entries.isEmpty()) {
            cachedMovieListRepository.deleteByListType(listType);
            cachedMovieListRepository.saveAll(entries);
            log.info("Cached {} movies for list type {}", entries.size(), listType);
        }
    }

    /**
     * Recalculate recommendations only for users whose rating/movie library changed.
     */
    @Transactional
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
