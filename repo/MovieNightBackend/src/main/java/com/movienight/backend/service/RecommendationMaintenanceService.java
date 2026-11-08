package com.movienight.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * Service managing maintenance windows for recommendation services.
 * Allows pausing user traffic and scheduled recomputations during similarity matrix updates.
 */
@Service
@Slf4j
public class RecommendationMaintenanceService {

    private volatile boolean maintenanceMode;
    private final AtomicInteger inFlightRecomputations = new AtomicInteger(0);

    public RecommendationMaintenanceService(
            @Value("${movienight.recommendation.maintenance-mode:false}") boolean initialMaintenanceMode
    ) {
        this.maintenanceMode = initialMaintenanceMode;
        if (initialMaintenanceMode) {
            log.info("Recommendation maintenance mode is ACTIVE on startup.");
        }
    }

    public boolean isMaintenanceActive() {
        return maintenanceMode;
    }

    public synchronized void setMaintenanceMode(boolean enabled) {
        this.maintenanceMode = enabled;
        log.info("Recommendation maintenance mode set to: {}", enabled);
    }

    public void checkRecommendationAccess() {
        if (maintenanceMode) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Recommendation service is undergoing maintenance. Please retry shortly."
            );
        }
    }

    public void startRecomputation() {
        checkRecommendationAccess();
        inFlightRecomputations.incrementAndGet();
    }

    public void endRecomputation() {
        inFlightRecomputations.decrementAndGet();
    }

    public boolean drainInFlightRecomputations(long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (inFlightRecomputations.get() > 0) {
            if (System.currentTimeMillis() > deadline) {
                log.warn("Timed out waiting for {} in-flight recommendation recomputations to drain", inFlightRecomputations.get());
                return false;
            }
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return true;
    }

    public int getInFlightCount() {
        return inFlightRecomputations.get();
    }
}

