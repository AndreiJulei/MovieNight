package com.movienight.backend.service;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** LV01: level and rank at each threshold, from the #32 ladder. */
class ProgressionTest {

    @ParameterizedTest
    @CsvSource({
            // watched, level, xpIntoLevel, rank,                 nextRank,              toNextRank
            "0,   1,  0, Popcorn Rookie,       Matinee Regular,      10",
            "9,   1,  9, Popcorn Rookie,       Matinee Regular,       1",
            "10,  2,  0, Matinee Regular,      Night Owl,            15",
            "24,  3,  4, Matinee Regular,      Night Owl,             1",
            "25,  3,  5, Night Owl,            Cinephile,            25",
            "49,  5,  9, Night Owl,            Cinephile,             1",
            "50,  6,  0, Cinephile,            Veteran,              50",
            "99, 10,  9, Cinephile,            Veteran,               1",
            "100, 11, 0, Veteran,              Critic,              100",
            "199, 20, 9, Veteran,              Critic,                1",
            "200, 21, 0, Critic,               Auteur,              150",
            "349, 35, 9, Critic,               Auteur,                1",
            "350, 36, 0, Auteur,               Silver Screen Legend, 150",
            "499, 50, 9, Auteur,               Silver Screen Legend,  1",
    })
    void levelAndRankAtThresholds(long watched, int level, int xp, String rank, String next, long toNext) {
        Progression p = Progression.of(watched);
        assertEquals(level, p.level());
        assertEquals(xp, p.xpIntoLevel());
        assertEquals(10, p.xpPerLevel());
        assertEquals(rank, p.rank().label());
        assertEquals(next, p.nextRank().label());
        assertEquals(toNext, p.toNextRank());
    }

    @ParameterizedTest
    @CsvSource({"500, 51", "1234, 124"})
    void topRankHasNoNextRank(long watched, int level) {
        Progression p = Progression.of(watched);
        assertEquals(level, p.level());
        assertEquals("Silver Screen Legend", p.rank().label());
        assertNull(p.nextRank());
        assertEquals(0, p.toNextRank());
    }
}
