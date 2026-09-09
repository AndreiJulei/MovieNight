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

    /**
     * Get all suggestion category rows for the authenticated user.
     */
    @GetMapping
    public ResponseEntity<SuggestionsResponse> getSuggestions(Authentication authentication) {
        return ResponseEntity.ok(suggestionService.getSuggestions(authentication.getName()));
    }

    /**
     * On-demand trigger to recompute personalized recommendations immediately (e.g. during onboarding).
     */
    @PostMapping("/personalized/refresh")
    public ResponseEntity<Map<String, String>> refreshPersonalizedRecommendations(Authentication authentication) {
        User user = userRepository.findByUsername(authentication.getName().trim().toLowerCase())
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + authentication.getName()));

        personalizedRecommendationService.recomputeRecommendationsForUser(user);
        return ResponseEntity.ok(Map.of("message", "Personalized recommendations recalculated successfully"));
    }
}
