package com.movienight.backend.controller;

import com.movienight.backend.dto.AddMovieRequest;
import com.movienight.backend.dto.FriendRatingResponse;
import com.movienight.backend.dto.UpdateMovieEntryRequest;
import com.movienight.backend.dto.UserMovieEntryResponse;
import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.service.UserMovieService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * REST Controller exposing movie management endpoints for authenticated users.
 */
@RestController
@RequestMapping("/api/movies")
@RequiredArgsConstructor
public class MovieController {

    private final UserMovieService userMovieService;

    /**
     * Get the authenticated user's library.
     * Optionally filter by status: e.g. /api/movies/library?status=WATCHLIST
     */
    @GetMapping("/library")
    public ResponseEntity<List<UserMovieEntryResponse>> getLibrary(
            @RequestParam(required = false) MovieStatus status,
            Authentication authentication
    ) {
        return ResponseEntity.ok(userMovieService.getUserLibrary(authentication.getName(), status));
    }

    /**
     * Add a movie to the authenticated user's library.
     */
    @PostMapping("/library")
    public ResponseEntity<UserMovieEntryResponse> addMovie(
            @Valid @RequestBody AddMovieRequest request,
            Authentication authentication
    ) {
        UserMovieEntryResponse response = userMovieService.addMovieToLibrary(authentication.getName(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Update a movie's status, personal rating (1-10), notes, or watched date.
     */
    @PutMapping("/library/{movieId}")
    public ResponseEntity<UserMovieEntryResponse> updateMovieEntry(
            @PathVariable Long movieId,
            @Valid @RequestBody UpdateMovieEntryRequest request,
            Authentication authentication
    ) {
        return ResponseEntity.ok(userMovieService.updateMovieEntry(authentication.getName(), movieId, request));
    }

    /**
     * Remove a movie from the authenticated user's library.
     */
    @DeleteMapping("/library/{movieId}")
    public ResponseEntity<Map<String, String>> removeMovie(
            @PathVariable Long movieId,
            Authentication authentication
    ) {
        userMovieService.removeMovieFromLibrary(authentication.getName(), movieId);
        return ResponseEntity.ok(Map.of("message", "Movie removed from your library successfully"));
    }

    /**
     * Get friend ratings and reviews for a specific movie.
     */
    @GetMapping("/{movieId}/friends-ratings")
    public ResponseEntity<List<FriendRatingResponse>> getFriendsRatings(
            @PathVariable Long movieId,
            @RequestParam(required = false) List<Long> friendIds
    ) {
        if (friendIds == null || friendIds.isEmpty()) {
            return ResponseEntity.ok(Collections.emptyList());
        }
        return ResponseEntity.ok(userMovieService.getFriendsRatings(movieId, friendIds));
    }
}
