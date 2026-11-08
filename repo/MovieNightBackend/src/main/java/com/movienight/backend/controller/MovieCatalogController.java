package com.movienight.backend.controller;

import com.movienight.backend.dto.MovieResponse;
import com.movienight.backend.model.Movie;
import com.movienight.backend.service.MovieCatalogLookupService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Controller for searching movies and fetching catalog details.
 */
@RestController
@RequestMapping("/api/movies")
@RequiredArgsConstructor
public class MovieCatalogController {

    private final MovieCatalogLookupService movieCatalogLookupService;
    private final com.movienight.backend.service.SuggestionService suggestionService;
    private final com.movienight.backend.service.ExploreSessionManager exploreSessionManager;
    private final com.movienight.backend.service.MovieSimilarityService movieSimilarityService;

    /**
     * Get explore catalog shelves for a specific media type (movies, tv, anime).
     * Example: GET /api/movies/explore/movies
     */
    @GetMapping("/explore/{mediaType}")
    public ResponseEntity<com.movienight.backend.dto.SuggestionsResponse> getExploreMedia(
            @PathVariable String mediaType,
            org.springframework.security.core.Authentication authentication
    ) {
        String username = authentication != null ? authentication.getName() : null;
        return ResponseEntity.ok(suggestionService.getExploreMedia(mediaType, username));
    }

    /**
     * Get paginated Explore category items with pinned session and server sorting/filtering.
     * Example: GET /api/movies/explore/movies/popular
     */
    @GetMapping("/explore/{mediaType}/{category}")
    public ResponseEntity<com.movienight.backend.dto.ExploreCategoryPageResponse> getExploreCategory(
            @PathVariable String mediaType,
            @PathVariable String category,
            @RequestParam(required = false) String sessionId,
            @RequestParam(required = false, defaultValue = "0") Integer cursor,
            @RequestParam(required = false, defaultValue = "20") Integer limit,
            @RequestParam(required = false, defaultValue = "recommendation") String sortBy,
            @RequestParam(required = false, defaultValue = "0") Integer minRating,
            org.springframework.security.core.Authentication authentication
    ) {
        String username = authentication != null ? authentication.getName() : null;
        return ResponseEntity.ok(exploreSessionManager.getCategoryPage(
                username, mediaType, category, sessionId, cursor, limit, sortBy, minRating));
    }

    /**
     * Live movie search (searches local catalog + TMDB).
     * Example: GET /api/movies/search?query=Guardians
     */
    @GetMapping("/search")
    public ResponseEntity<List<MovieResponse>> searchMovies(@RequestParam String query) {
        return ResponseEntity.ok(movieCatalogLookupService.searchMovies(query));
    }

    /**
     * Get or fetch full media details by TMDB ID (enriched with OMDb ratings and cached locally).
     * Example: GET /api/movies/tmdb/283995?mediaType=TV
     */
    @GetMapping("/tmdb/{tmdbId}")
    public ResponseEntity<MovieResponse> getMovieDetails(
            @PathVariable Long tmdbId,
            @RequestParam(required = false) String mediaType
    ) {
        Movie movie = mediaType != null && !mediaType.isBlank()
                ? movieCatalogLookupService.getOrFetchMovie(tmdbId, mediaType)
                : movieCatalogLookupService.getOrFetchMovie(tmdbId);
        return ResponseEntity.ok(movieCatalogLookupService.mapToResponse(movie));
    }

    /**
     * Get similar titles for a specific TMDB movie ID.
     * Queries precomputed cosine similarity neighbors from MovieLens, with graceful fallback to TMDB recommendations.
     * Example: GET /api/movies/550/similar?limit=10
     */
    @GetMapping("/{tmdbId:[0-9]+}/similar")
    public ResponseEntity<List<MovieResponse>> getSimilarMovies(
            @PathVariable Long tmdbId,
            @RequestParam(required = false, defaultValue = "10") Integer limit,
            @RequestParam(required = false) String mediaType
    ) {
        return ResponseEntity.ok(movieSimilarityService.getSimilarMovies(tmdbId, limit, mediaType));
    }

    /**
     * Get movie details by database primary key ID.
     * Example: GET /api/movies/12
     */
    @GetMapping("/{id:[0-9]+}")
    public ResponseEntity<MovieResponse> getMovieById(@PathVariable Long id) {
        Movie movie = movieCatalogLookupService.getMovieById(id);
        return ResponseEntity.ok(movieCatalogLookupService.mapToResponse(movie));
    }
}
