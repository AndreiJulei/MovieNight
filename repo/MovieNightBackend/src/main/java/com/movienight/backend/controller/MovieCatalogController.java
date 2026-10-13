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

    /**
     * Get explore catalog shelves for a specific media type (movies, tv, anime).
     * Example: GET /api/movies/explore/movies
     */
    @GetMapping("/explore/{mediaType}")
    public ResponseEntity<com.movienight.backend.dto.SuggestionsResponse> getExploreMedia(@PathVariable String mediaType) {
        return ResponseEntity.ok(suggestionService.getExploreMedia(mediaType));
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
     * Get movie details by database primary key ID.
     * Example: GET /api/movies/12
     */
    @GetMapping("/{id:[0-9]+}")
    public ResponseEntity<MovieResponse> getMovieById(@PathVariable Long id) {
        Movie movie = movieCatalogLookupService.getMovieById(id);
        return ResponseEntity.ok(movieCatalogLookupService.mapToResponse(movie));
    }
}
