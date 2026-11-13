package com.movienight.backend.service;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class DiscoveryRequestPacerTest {

    /** Fake monotonic clock: sleeping advances time, so spacing is observable without real waits. */
    static class FakeTime implements DiscoveryRequestPacer.Time {
        long nanos = 1_000_000_000L;
        final List<Long> sleeps = new ArrayList<>();
        @Override public long nanoTime() { return nanos; }
        @Override public void sleepNanos(long duration) { sleeps.add(duration); nanos += duration; }
    }

    @Test
    void fourRequestsPerSecondSpacesConsecutiveTurnsAtLeast250ms() {
        FakeTime time = new FakeTime();
        DiscoveryRequestPacer pacer = new DiscoveryRequestPacer(4, time);
        List<Long> turns = new ArrayList<>();
        for (int i = 0; i < 9; i++) {
            pacer.awaitTurn();
            turns.add(time.nanos);
        }
        for (int i = 1; i < turns.size(); i++) {
            assertThat(turns.get(i) - turns.get(i - 1)).isGreaterThanOrEqualTo(250_000_000L);
        }
        // 9 requests at 4 req/s take at least 2 seconds.
        assertThat(turns.get(8) - turns.get(0)).isGreaterThanOrEqualTo(2_000_000_000L);
    }

    @Test
    void doesNotSleepWhenCallerIsAlreadySlowerThanTheLimit() {
        FakeTime time = new FakeTime();
        DiscoveryRequestPacer pacer = new DiscoveryRequestPacer(4, time);
        pacer.awaitTurn();
        time.nanos += 400_000_000L;
        pacer.awaitTurn();
        assertThat(time.sleeps).isEmpty();
    }
}
