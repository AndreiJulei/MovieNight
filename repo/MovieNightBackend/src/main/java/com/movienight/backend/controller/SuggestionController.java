package com.movienight.backend.controller;

import com.movienight.backend.dto.SuggestionsResponse;
import com.movienight.backend.model.User;
import com.movienight.backend.repository.UserRepository;
import com.movienight.backend.service.PersonalizedRecommendationService;
import com.movienight.backend.service.SuggestionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Controller exposing endpoints for movie suggestions and discovery.
 */
@RestController
@RequestMapping("/api/suggestions")
@RequiredArgsConstructor
public class SuggestionController {

    private final SuggestionService suggestionService;
    private final PersonalizedRecommendationService personalizedRecommendationService;
    private final UserRepository userRepository;
    private final com.movienight.backend.service.SuggestionScheduler suggestionScheduler;

    /**
     * Get all suggestion category rows for the authenticated user.
     */
    @GetMapping
    public ResponseEntity<SuggestionsResponse> getSuggestions(Authentication authentication) {
        return ResponseEntity.ok(suggestionService.getSuggestions(authentication.getName()));
    }

    /**
     * Get strictly category-aware personal recommendations (up to 3 rows: Movie, TV Series, Anime).
     * Omitted if user has 0 watched titles in that category.
     */
    @GetMapping("/personal")
    public ResponseEntity<SuggestionsResponse> getPersonalRecommendations(Authentication authentication) {
        return ResponseEntity.ok(suggestionService.getPersonalRecommendations(authentication.getName()));
    }

    /**
     * Get friends' recommendations.
     */
    @GetMapping("/friends")
    public ResponseEntity<SuggestionsResponse> getFriendsRecommendations(Authentication authentication) {
        return ResponseEntity.ok(suggestionService.getFriendsRecommendations(authentication.getName()));
    }

    /**
     * Get explore shelves for a media type (movies, tv, anime).
     */
    @GetMapping("/explore/{mediaType}")
    public ResponseEntity<SuggestionsResponse> getExploreMedia(@PathVariable String mediaType) {
        return ResponseEntity.ok(suggestionService.getExploreMedia(mediaType));
    }

    /**
     * On-demand trigger to refresh TMDB Discover explore caches across Movies, TV, and Anime.
     * Example: POST /api/suggestions/explore/refresh
     */
    @PostMapping("/explore/refresh")
    public ResponseEntity<Map<String, String>> refreshExploreLists() {
        suggestionScheduler.refreshAllCachedLists();
        return ResponseEntity.ok(Map.of("message", "TMDB Discover explore shelves refreshed successfully"));
    }

    /**
     * On-demand trigger to recompute personalized recommendations immediately (e.g. during onboarding).
     */
    @PostMapping("/personalized/refresh")
    public ResponseEntity<Map<String, String>> refreshPersonalizedRecommendations(Authentication authentication) {
        String authName = authentication.getName();
        User user = userRepository.findByUsername(authName)
                .or(() -> userRepository.findByUsernameIgnoreCase(authName))
                .or(() -> userRepository.findByEmailIgnoreCase(authName))
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + authName));

        personalizedRecommendationService.recomputeRecommendationsForUser(user);
        return ResponseEntity.ok(Map.of("message", "Personalized recommendations recalculated successfully"));
    }
}
