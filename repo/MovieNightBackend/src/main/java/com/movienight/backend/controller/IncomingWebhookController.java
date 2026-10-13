package com.movienight.backend.controller;

import com.movienight.backend.event.MovieNightDomainEvent;
import com.movienight.backend.model.User;
import com.movienight.backend.repository.UserRepository;
import com.movienight.backend.service.MovieSimilarityDataLoader;
import com.movienight.backend.service.PersonalizedRecommendationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Endpoint for external services (e.g. Python ML training scripts, TMDB sync schedulers)
 * to deliver incoming webhooks into MovieNight.
 */
@RestController
@RequestMapping("/api/webhooks/incoming")
@RequiredArgsConstructor
@Slf4j
public class IncomingWebhookController {

    private final MovieSimilarityDataLoader movieSimilarityDataLoader;
    private final PersonalizedRecommendationService personalizedRecommendationService;
    private final UserRepository userRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Value("${movienight.webhook.incoming.ml-secret:movienight_internal_ml_secret}")
    private String mlSyncSecret;

    /**
     * Incoming webhook triggered after Python ML model retraining (train_similarity.py).
     * Reloads item-item similarity vectors and refreshes user recommendations.
     */
    @PostMapping("/ml-sync")
    public ResponseEntity<Map<String, Object>> syncMlModel(
            @RequestHeader(value = "X-MovieNight-Secret", required = false) String secretHeader,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        if (secretHeader == null || !secretHeader.trim().equals(mlSyncSecret.trim())) {
            log.warn("Unauthorized incoming ML sync webhook attempt with secret: {}", secretHeader);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                    "status", "UNAUTHORIZED",
                    "message", "Invalid or missing X-MovieNight-Secret header"
            ));
        }

        log.info("Processing incoming ML sync webhook from external trainer...");
        long pairsCount = movieSimilarityDataLoader.reloadSimilarityData();

        // Refresh recommendations for users who need updates
        List<User> usersToRefresh = userRepository.findAll().stream()
                .filter(User::isNeedsRecommendationRefresh)
                .toList();

        for (User user : usersToRefresh) {
            try {
                personalizedRecommendationService.recomputeRecommendationsForUser(user);
            } catch (Exception e) {
                log.error("Failed to recompute recommendations for user {}: {}", user.getUsername(), e.getMessage());
            }
        }

        eventPublisher.publishEvent(MovieNightDomainEvent.of(
                "recommendation.updated",
                null,
                "system",
                Map.of(
                        "pairsCount", pairsCount,
                        "refreshedUsersCount", usersToRefresh.size(),
                        "timestamp", LocalDateTime.now().toString()
                )
        ));

        return ResponseEntity.ok(Map.of(
                "status", "SUCCESS",
                "message", "Similarity matrix reloaded (" + pairsCount + " pairs) and recommendations updated for " + usersToRefresh.size() + " users.",
                "timestamp", LocalDateTime.now()
        ));
    }
}
