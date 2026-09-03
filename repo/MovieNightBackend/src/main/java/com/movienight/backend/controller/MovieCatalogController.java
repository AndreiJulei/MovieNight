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

    /**
     * Live movie search (searches local catalog + TMDB).
     * Example: GET /api/movies/search?query=Guardians
     */
    @GetMapping("/search")
    public ResponseEntity<List<MovieResponse>> searchMovies(@RequestParam String query) {
        return ResponseEntity.ok(movieCatalogLookupService.searchMovies(query));
    }

    /**
     * Get or fetch full movie details by TMDB ID (enriched with OMDb ratings and cached locally).
     * Example: GET /api/movies/tmdb/283995
     */
    @GetMapping("/tmdb/{tmdbId}")
    public ResponseEntity<MovieResponse> getMovieDetails(@PathVariable Long tmdbId) {
        Movie movie = movieCatalogLookupService.getOrFetchMovie(tmdbId);
        return ResponseEntity.ok(movieCatalogLookupService.mapToResponse(movie));
    }
}
