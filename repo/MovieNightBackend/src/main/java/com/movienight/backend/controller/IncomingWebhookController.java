package com.movienight.backend.controller;

import com.movienight.backend.dto.SimilarityReloadResult;
import com.movienight.backend.event.MovieNightDomainEvent;
import com.movienight.backend.service.MovieSimilarityDataLoader;
import com.movienight.backend.service.RecommendationMaintenanceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Protected incoming webhook endpoints for ML synchronization and recommendation maintenance.
 */
@RestController
@RequestMapping("/api/webhooks/incoming")
@RequiredArgsConstructor
@Slf4j
public class IncomingWebhookController {

    private final MovieSimilarityDataLoader movieSimilarityDataLoader;
    private final RecommendationMaintenanceService recommendationMaintenanceService;
    private final ApplicationEventPublisher eventPublisher;

    @Value("${movienight.webhook.incoming.ml-secret:movienight_internal_ml_secret}")
    private String mlSyncSecret;

    /**
     * Incoming webhook triggered after Python ML model retraining (train_similarity.py).
     * Reloads item-item similarity vectors and invalidates recommendation caches for lazy recomputation.
     */
    @PostMapping("/ml-sync")
    public ResponseEntity<Map<String, Object>> syncMlModel(
            @RequestHeader(value = "X-MovieNight-Secret", required = false) String secretHeader,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        if (secretHeader == null || !secretHeader.trim().equals(mlSyncSecret.trim())) {
            log.warn("Unauthorized incoming ML sync webhook attempt: invalid or missing secret header");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                    "status", "UNAUTHORIZED",
                    "message", "Invalid or missing X-MovieNight-Secret header"
            ));
        }

        log.info("Processing incoming ML sync webhook from external trainer...");
        recommendationMaintenanceService.drainInFlightRecomputations(5000);

        SimilarityReloadResult result = movieSimilarityDataLoader.reloadSimilarityData();

        eventPublisher.publishEvent(MovieNightDomainEvent.of(
                "recommendation.updated",
                null,
                "system",
                Map.of(
                        "pairsCount", result.getPairsCount(),
                        "modelIdentity", result.getModelIdentity() != null ? result.getModelIdentity() : "unknown",
                        "cacheInvalidated", true,
                        "timestamp", LocalDateTime.now().toString()
                )
        ));

        return ResponseEntity.ok(Map.of(
                "status", "SUCCESS",
                "message", "Similarity matrix reloaded (" + result.getPairsCount() + " pairs). Personal recommendation caches invalidated for lazy recomputation.",
                "pairsCount", result.getPairsCount(),
                "modelIdentity", result.getModelIdentity() != null ? result.getModelIdentity() : "unknown",
                "cacheInvalidated", true,
                "timestamp", LocalDateTime.now()
        ));
    }

    /**
     * Maintenance window management endpoint: pause/resume recommendation traffic and scheduled jobs.
     */
    @PostMapping("/maintenance")
    public ResponseEntity<Map<String, Object>> setMaintenanceMode(
            @RequestHeader(value = "X-MovieNight-Secret", required = false) String secretHeader,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        if (secretHeader == null || !secretHeader.trim().equals(mlSyncSecret.trim())) {
            log.warn("Unauthorized incoming maintenance webhook attempt: invalid or missing secret header");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                    "status", "UNAUTHORIZED",
                    "message", "Invalid or missing X-MovieNight-Secret header"
            ));
        }

        boolean enable = body != null && Boolean.TRUE.equals(body.get("enabled"));
        recommendationMaintenanceService.setMaintenanceMode(enable);
        boolean drained = true;
        if (enable) {
            drained = recommendationMaintenanceService.drainInFlightRecomputations(5000);
        }

        return ResponseEntity.ok(Map.of(
                "status", "SUCCESS",
                "maintenanceMode", enable,
                "drained", drained,
                "inFlightRecomputations", recommendationMaintenanceService.getInFlightCount()
        ));
    }
}
