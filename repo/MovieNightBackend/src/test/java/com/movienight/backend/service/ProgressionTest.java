package com.movienight.backend.service;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** LV01: level and rank at each milestone; every rank milestone is a level. */
class ProgressionTest {

    @ParameterizedTest
    @CsvSource({
            // watched, level, xpIntoLevel, xpPerLevel, rank,           nextRank,         toNextRank
            "0,   1,   0,  10, Popcorn Rookie,   The Hobbit,        10",
            "9,   1,   9,  10, Popcorn Rookie,   The Hobbit,         1",
            "10,  2,   0,  15, The Hobbit,       The Maverick,      15",
            "24,  2,  14,  15, The Hobbit,       The Maverick,       1",
            "25,  3,   0,  25, The Maverick,     The Professional,  25",
            "49,  3,  24,  25, The Maverick,     The Professional,   1",
            "50,  4,   0,  50, The Professional, The Chosen One,    50",
            "99,  4,  49,  50, The Professional, The Chosen One,     1",
            "100, 5,   0, 100, The Chosen One,   The Terminator,   100",
            "199, 5,  99, 100, The Chosen One,   The Terminator,     1",
            "200, 6,   0, 300, The Terminator,   The Godfather,    300",
            "499, 6, 299, 300, The Terminator,   The Godfather,      1",
    })
    void levelAndRankAtMilestones(long watched, int level, int xp, int xpPerLevel, String rank, String next, long toNext) {
        Progression p = Progression.of(watched);
        assertEquals(level, p.level());
        assertEquals(xp, p.xpIntoLevel());
        assertEquals(xpPerLevel, p.xpPerLevel());
        assertEquals(rank, p.rank().label());
        assertEquals(next, p.nextRank().label());
        assertEquals(toNext, p.toNextRank());
    }

    @ParameterizedTest
    @CsvSource({"500", "1234"})
    void topRankIsTheLastLevel(long watched) {
        Progression p = Progression.of(watched);
        assertEquals(7, p.level());
        assertEquals("The Godfather", p.rank().label());
        assertNull(p.nextRank());
        assertEquals(0, p.toNextRank());
        assertEquals(0, p.xpIntoLevel());
        assertEquals(0, p.xpPerLevel());
    }
}
