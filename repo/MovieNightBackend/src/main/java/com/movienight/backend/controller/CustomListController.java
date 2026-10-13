package com.movienight.backend.controller;

import com.movienight.backend.dto.*;
import com.movienight.backend.service.CustomListService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST Controller exposing CRUD operations for curated Custom Lists.
 */
@RestController
@RequestMapping("/api/lists")
@RequiredArgsConstructor
public class CustomListController {

    private final CustomListService customListService;

    /**
     * Create a new custom list.
     */
    @PostMapping
    public ResponseEntity<CustomListResponse> createList(
            @Valid @RequestBody CreateCustomListRequest request,
            Authentication authentication
    ) {
        CustomListResponse response = customListService.createList(authentication.getName(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Get all custom lists owned by the authenticated user.
     */
    @GetMapping
    public ResponseEntity<List<CustomListSummaryResponse>> getUserLists(Authentication authentication) {
        return ResponseEntity.ok(customListService.getUserLists(authentication.getName()));
    }

    /**
     * Get all public custom lists (can be browsed by any authenticated user or visitor).
     */
    @GetMapping("/public")
    public ResponseEntity<List<CustomListSummaryResponse>> getPublicLists() {
        return ResponseEntity.ok(customListService.getPublicLists());
    }

    /**
     * Get detailed custom list by ID (including movies and display ordering).
     */
    @GetMapping("/{id}")
    public ResponseEntity<CustomListResponse> getListById(
            @PathVariable Long id,
            Authentication authentication
    ) {
        String username = (authentication != null) ? authentication.getName() : null;
        return ResponseEntity.ok(customListService.getListById(id, username));
    }

    /**
     * Update list metadata (title, description, isPublic).
     */
    @PutMapping("/{id}")
    public ResponseEntity<CustomListResponse> updateList(
            @PathVariable Long id,
            @Valid @RequestBody UpdateCustomListRequest request,
            Authentication authentication
    ) {
        return ResponseEntity.ok(customListService.updateList(authentication.getName(), id, request));
    }

    /**
     * Delete a custom list.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> deleteList(
            @PathVariable Long id,
            Authentication authentication
    ) {
        customListService.deleteList(authentication.getName(), id);
        return ResponseEntity.ok(Map.of("message", "Custom list deleted successfully"));
    }

    /**
     * Add a movie to an existing custom list.
     */
    @PostMapping("/{id}/movies")
    public ResponseEntity<CustomListResponse> addMovieToList(
            @PathVariable Long id,
            @Valid @RequestBody AddMovieToListRequest request,
            Authentication authentication
    ) {
        return ResponseEntity.ok(customListService.addMovieToList(authentication.getName(), id, request));
    }

    /**
     * Remove a movie from a custom list.
     */
    @DeleteMapping("/{id}/movies/{movieId}")
    public ResponseEntity<CustomListResponse> removeMovieFromList(
            @PathVariable Long id,
            @PathVariable Long movieId,
            Authentication authentication
    ) {
        return ResponseEntity.ok(customListService.removeMovieFromList(authentication.getName(), id, movieId));
    }

    /**
     * Reorder movies in a custom list.
     */
    @PutMapping("/{id}/reorder")
    public ResponseEntity<CustomListResponse> reorderMovies(
            @PathVariable Long id,
            @Valid @RequestBody ReorderCustomListRequest request,
            Authentication authentication
    ) {
        return ResponseEntity.ok(customListService.reorderMovies(authentication.getName(), id, request));
    }
}
