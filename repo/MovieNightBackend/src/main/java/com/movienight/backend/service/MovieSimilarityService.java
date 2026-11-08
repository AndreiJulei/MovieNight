package com.movienight.backend.service;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.MovieResponse;
import com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary;
import com.movienight.backend.model.CachedMovieList;
import com.movienight.backend.model.Movie;
import com.movienight.backend.model.MovieSimilarity;
import com.movienight.backend.model.ResourceType;
import com.movienight.backend.repository.CachedMovieListRepository;
import com.movienight.backend.repository.MovieRepository;
import com.movienight.backend.repository.MovieSimilarityRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for querying precomputed item-item cosine similarities and
 * enriching them into catalog MovieResponse objects, with graceful TMDB recommendation fallback.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MovieSimilarityService {

    private static final int DEFAULT_LIMIT = 10;
    private static final int MAX_LIMIT = 30;

    private final MovieSimilarityRepository movieSimilarityRepository;
    private final MovieRepository movieRepository;
    private final CachedMovieListRepository cachedMovieListRepository;
    private final MovieCatalogLookupService movieCatalogLookupService;
    private final TmdbClient tmdbClient;

    /**
     * Retrieve top similar titles for a given TMDB ID.
     */
    @Transactional(readOnly = true)
    public List<MovieResponse> getSimilarMovies(Long tmdbId, Integer limit, String mediaType) {
        if (tmdbId == null || tmdbId <= 0) {
            return Collections.emptyList();
        }

        int effectiveLimit = (limit == null || limit < 1) ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);
        boolean isTv = "tv".equalsIgnoreCase(mediaType);

        // Domain isolation: MovieLens dataset strictly computes movie-to-movie similarities.
        // TMDB TV IDs collide with TMDB Movie IDs in integer space; route TV requests directly
        // to TMDB TV recommendations to prevent cross-domain contamination.
        if (isTv) {
            return fetchTmdbFallback(tmdbId, effectiveLimit, true);
        }

        List<MovieSimilarity> similarities = movieSimilarityRepository.findByTmdbIdOrderByScoreDesc(
                tmdbId, PageRequest.of(0, effectiveLimit));

        if (!similarities.isEmpty()) {
            List<Long> neighborIds = similarities.stream()
                    .map(MovieSimilarity::getNeighborTmdbId)
                    .filter(id -> id != null && id > 0)
                    .distinct()
                    .toList();

            if (!neighborIds.isEmpty()) {
                // Tier 1: Single batch query against local catalog table
                Map<Long, Movie> movieMap = movieRepository
                        .findByResourceTypeAndTmdbIdIn(ResourceType.MOVIE, neighborIds)
                        .stream()
                        .collect(Collectors.toMap(Movie::getTmdbId, m -> m, (m1, m2) -> m1));

                // Identify neighbors missing from local movie table
                List<Long> missingIds = neighborIds.stream()
                        .filter(id -> !movieMap.containsKey(id))
                        .toList();

                // Tier 2: Single batch query against cached discover feed
                Map<Long, CachedMovieList> cachedMap = missingIds.isEmpty() ? Collections.emptyMap() :
                        cachedMovieListRepository.findByTmdbIdIn(missingIds).stream()
                                .filter(c -> c.getTitle() != null && !c.getTitle().isBlank())
                                .collect(Collectors.toMap(CachedMovieList::getTmdbId, c -> c, (c1, c2) -> c1));

                List<MovieResponse> responses = new ArrayList<>();
                for (Long neighborId : neighborIds) {
                    Movie movie = movieMap.get(neighborId);
                    if (movie != null) {
                        responses.add(movieCatalogLookupService.mapToResponse(movie));
                        continue;
                    }

                    CachedMovieList cached = cachedMap.get(neighborId);
                    if (cached != null) {
                        responses.add(mapCachedToResponse(cached));
                    }
                }

                if (!responses.isEmpty()) {
                    return responses;
                }
            }
        }

        // Fall back to TMDB recommendation endpoint
        return fetchTmdbFallback(tmdbId, effectiveLimit, false);
    }

    private List<MovieResponse> fetchTmdbFallback(Long tmdbId, int limit, boolean isTv) {
        try {
            List<TmdbMovieSummary> recs = isTv
                    ? tmdbClient.getTvRecommendations(tmdbId, 1)
                    : tmdbClient.getMovieRecommendations(tmdbId, 1);

            if (recs != null && !recs.isEmpty()) {
                return recs.stream()
                        .filter(r -> r.getId() != null && hasTitle(r))
                        .limit(limit)
                        .map(this::mapSummaryToResponse)
                        .toList();
            }
        } catch (Exception ex) {
            log.warn("TMDB recommendation fallback unavailable for tmdbId {}: {}", tmdbId, ex.getMessage());
        }

        return Collections.emptyList();
    }

    private boolean hasTitle(TmdbMovieSummary summary) {
        return summary.getEffectiveTitle() != null && !summary.getEffectiveTitle().isBlank();
    }

    private MovieResponse mapCachedToResponse(CachedMovieList cached) {
        return MovieResponse.builder()
                .tmdbId(cached.getTmdbId())
                .title(cached.getTitle())
                .releaseYear(parseYear(cached.getReleaseDate()))
                .posterUrl(tmdbClient.buildPosterUrl(cached.getPosterPath()))
                .tmdbVoteAverage(cached.getVoteAverage())
                .tmdbVoteCount(cached.getVoteCount())
                .mediaType(cached.getMediaType() != null ? cached.getMediaType().toUpperCase() : "MOVIE")
                .build();
    }

    private MovieResponse mapSummaryToResponse(TmdbMovieSummary summary) {
        ResourceType resourceType = ResourceType.fromCategory(summary.getResolvedMediaType());

        Optional<Movie> existing = movieRepository.findByResourceTypeAndTmdbId(resourceType, summary.getId());
        if (existing.isPresent()) {
            return movieCatalogLookupService.mapToResponse(existing.get());
        }

        return MovieResponse.builder()
                .tmdbId(summary.getId())
                .title(summary.getEffectiveTitle())
                .releaseYear(parseYear(summary.getEffectiveReleaseDate()))
                .overview(summary.getOverview())
                .posterUrl(tmdbClient.buildPosterUrl(summary.getPosterPath()))
                .backdropUrl(tmdbClient.buildBackdropUrl(summary.getBackdropPath()))
                .tmdbVoteAverage(summary.getVoteAverage())
                .tmdbVoteCount(summary.getVoteCount())
                .mediaType(summary.getResolvedMediaType() != null ? summary.getResolvedMediaType().toUpperCase() : "MOVIE")
                .build();
    }

    private Integer parseYear(String releaseDate) {
        if (releaseDate == null || releaseDate.length() < 4) {
            return null;
        }
        try {
            return Integer.parseInt(releaseDate.substring(0, 4));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
