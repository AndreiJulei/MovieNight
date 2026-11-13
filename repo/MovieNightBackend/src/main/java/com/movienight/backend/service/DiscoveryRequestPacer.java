package com.movienight.backend.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Spaces deep discovery page requests (Top Rated) so a refresh never exceeds the configured rate.
 * Shared across refreshes, so concurrent category rebuilds are paced together.
 */
@Component
public class DiscoveryRequestPacer {

    /** Monotonic time source; replaceable in tests so pacing is observable without real waits. */
    public interface Time {
        long nanoTime();
        void sleepNanos(long duration) throws InterruptedException;
    }

    private static final Time SYSTEM = new Time() {
        @Override public long nanoTime() { return System.nanoTime(); }
        @Override public void sleepNanos(long duration) throws InterruptedException {
            Thread.sleep(duration / 1_000_000L, (int) (duration % 1_000_000L));
        }
    };

    private final long intervalNanos;
    private final Time time;
    private long nextTurn = Long.MIN_VALUE;

    @Autowired
    public DiscoveryRequestPacer(@Value("${app.discovery.top-rated-max-requests-per-second:4}") double maxRequestsPerSecond) {
        this(maxRequestsPerSecond, SYSTEM);
    }

    DiscoveryRequestPacer(double maxRequestsPerSecond, Time time) {
        if (!(maxRequestsPerSecond > 0)) throw new IllegalArgumentException("Request rate must be positive");
        this.intervalNanos = (long) Math.ceil(1_000_000_000L / maxRequestsPerSecond);
        this.time = time;
    }

    /** Block until the next request may start. */
    public synchronized void awaitTurn() {
        long now = time.nanoTime();
        if (nextTurn != Long.MIN_VALUE && now < nextTurn) {
            try {
                time.sleepNanos(nextTurn - now);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Discovery refresh interrupted. Retry.", interrupted);
            }
            now = time.nanoTime();
        }
        nextTurn = now + intervalNanos;
    }
}
