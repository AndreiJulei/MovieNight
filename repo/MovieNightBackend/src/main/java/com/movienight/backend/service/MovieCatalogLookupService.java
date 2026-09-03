package com.movienight.backend.service;

import com.movienight.backend.client.OmdbClient;
import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.MovieResponse;
import com.movienight.backend.dto.external.OmdbResponse;
import com.movienight.backend.dto.external.TmdbMovieDetailsResponse;
import com.movienight.backend.dto.external.TmdbSearchResponse;
import com.movienight.backend.model.Movie;
import com.movienight.backend.repository.MovieRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Service that orchestrates the 3-Tier Movie Lookup:
 * Tier 1: Local Database Cache (MovieRepository)
 * Tier 2: The Movie Database (TMDB API - Posters, Cast, Trailers)
 * Tier 3: Open Movie Database (OMDb API - Rotten Tomatoes & IMDb critic scores)
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MovieCatalogLookupService {

    private final MovieRepository movieRepository;
    private final TmdbClient tmdbClient;
    private final OmdbClient omdbClient;

    /**
     * Search movies across local catalog and TMDB.
     */
    @Transactional(readOnly = true)
    public List<MovieResponse> searchMovies(String query) {
        if (query == null || query.trim().isBlank()) {
            return Collections.emptyList();
        }

        String cleanQuery = query.trim();
        List<MovieResponse> results = new ArrayList<>();
        Set<Long> seenTmdbIds = new HashSet<>();

        // Tier 1: Check Local DB first
        List<Movie> localMatches = movieRepository.findByTitleContainingIgnoreCase(cleanQuery);
        for (Movie movie : localMatches) {
            results.add(mapToResponse(movie));
            if (movie.getTmdbId() != null) {
                seenTmdbIds.add(movie.getTmdbId());
            }
        }

        // Tier 2: Search TMDB for fresh discoveries
        if (tmdbClient.isConfigured()) {
            List<TmdbSearchResponse.TmdbMovieSummary> tmdbResults = tmdbClient.searchMovies(cleanQuery);
            for (TmdbSearchResponse.TmdbMovieSummary item : tmdbResults) {
                if (item.getId() != null && !seenTmdbIds.contains(item.getId())) {
                    results.add(MovieResponse.builder()
                            .tmdbId(item.getId())
                            .title(item.getTitle())
                            .releaseYear(parseYear(item.getReleaseDate()))
                            .overview(item.getOverview())
                            .posterUrl(tmdbClient.buildPosterUrl(item.getPosterPath()))
                            .backdropUrl(tmdbClient.buildBackdropUrl(item.getBackdropPath()))
                            .tmdbVoteAverage(item.getVoteAverage())
                            .tmdbVoteCount(item.getVoteCount())
                            .build());
                    seenTmdbIds.add(item.getId());
                }
            }
        }

        return results;
    }

    /**
     * Get or fetch full movie details by TMDB ID, enriching with OMDb and caching into local DB.
     */
    @Transactional
    public Movie getOrFetchMovie(Long tmdbId) {
        if (tmdbId == null) {
            throw new IllegalArgumentException("TMDB ID cannot be null");
        }

        // Tier 1: Return from local database if already cached
        Optional<Movie> existingMovie = movieRepository.findByTmdbId(tmdbId);
        if (existingMovie.isPresent()) {
            return existingMovie.get();
        }

        // Tier 2: Fetch full details from TMDB
        TmdbMovieDetailsResponse tmdbDetails = tmdbClient.getMovieDetails(tmdbId)
                .orElseThrow(() -> new IllegalArgumentException("Movie not found on TMDB for ID: " + tmdbId));

        // Extract Cast (top 5) & Director
        String director = tmdbDetails.getCredits() != null && tmdbDetails.getCredits().getCrew() != null
                ? tmdbDetails.getCredits().getCrew().stream()
                .filter(c -> "Director".equalsIgnoreCase(c.getJob()))
                .map(TmdbMovieDetailsResponse.CrewMember::getName)
                .findFirst()
                .orElse(null)
                : null;

        String castMembers = tmdbDetails.getCredits() != null && tmdbDetails.getCredits().getCast() != null
                ? tmdbDetails.getCredits().getCast().stream()
                .filter(c -> c.getOrder() != null && c.getOrder() <= 4)
                .map(TmdbMovieDetailsResponse.CastMember::getName)
                .collect(Collectors.joining(", "))
                : null;

        // Extract Official YouTube Trailer Key
        String trailerKey = tmdbDetails.getVideos() != null && tmdbDetails.getVideos().getResults() != null
                ? tmdbDetails.getVideos().getResults().stream()
                .filter(v -> "YouTube".equalsIgnoreCase(v.getSite()) && "Trailer".equalsIgnoreCase(v.getType()))
                .map(TmdbMovieDetailsResponse.VideoResult::getKey)
                .findFirst()
                .orElse(null)
                : null;

        // Genres
        String genres = tmdbDetails.getGenres() != null
                ? tmdbDetails.getGenres().stream()
                .map(TmdbMovieDetailsResponse.Genre::getName)
                .collect(Collectors.joining(", "))
                : null;

        // Tier 3: Enrich with OMDb (Rotten Tomatoes & IMDb score)
        Double imdbRating = null;
        Integer rottenTomatoes = null;
        if (tmdbDetails.getImdbId() != null && omdbClient.isConfigured()) {
            Optional<OmdbResponse> omdb = omdbClient.getMovieRatings(tmdbDetails.getImdbId());
            if (omdb.isPresent()) {
                imdbRating = omdbClient.extractImdbRating(omdb.get());
                rottenTomatoes = omdbClient.extractRottenTomatoesScore(omdb.get());
            }
        }

        // Save into our permanent shared catalog
        Movie movie = Movie.builder()
                .tmdbId(tmdbDetails.getId())
                .imdbId(tmdbDetails.getImdbId())
                .title(tmdbDetails.getTitle())
                .releaseYear(parseYear(tmdbDetails.getReleaseDate()))
                .overview(tmdbDetails.getOverview())
                .posterUrl(tmdbClient.buildPosterUrl(tmdbDetails.getPosterPath()))
                .backdropUrl(tmdbClient.buildBackdropUrl(tmdbDetails.getBackdropPath()))
                .genres(genres)
                .runtimeMinutes(tmdbDetails.getRuntime())
                .trailerKey(trailerKey)
                .director(director)
                .castMembers(castMembers)
                .imdbRating(imdbRating)
                .rottenTomatoesRating(rottenTomatoes)
                .tmdbVoteAverage(tmdbDetails.getVoteAverage())
                .tmdbVoteCount(tmdbDetails.getVoteCount())
                .build();

        log.info("Cached new movie into shared catalog: {} (TMDB: {})", movie.getTitle(), tmdbId);
        return movieRepository.save(movie);
    }

    /**
     * Helper to map Movie entity to response DTO.
     */
    public MovieResponse mapToResponse(Movie movie) {
        return MovieResponse.builder()
                .id(movie.getId())
                .tmdbId(movie.getTmdbId())
                .imdbId(movie.getImdbId())
                .title(movie.getTitle())
                .releaseYear(movie.getReleaseYear())
                .overview(movie.getOverview())
                .posterUrl(movie.getPosterUrl())
                .backdropUrl(movie.getBackdropUrl())
                .genres(movie.getGenres())
                .runtimeMinutes(movie.getRuntimeMinutes())
                .trailerKey(movie.getTrailerKey())
                .director(movie.getDirector())
                .castMembers(movie.getCastMembers())
                .imdbRating(movie.getImdbRating())
                .rottenTomatoesRating(movie.getRottenTomatoesRating())
                .tmdbVoteAverage(movie.getTmdbVoteAverage())
                .tmdbVoteCount(movie.getTmdbVoteCount())
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
