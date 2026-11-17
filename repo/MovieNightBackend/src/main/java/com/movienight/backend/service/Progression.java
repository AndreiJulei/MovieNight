package com.movienight.backend.service;

/**
 * A user's level and rank, derived from their watched-history count (#32).
 * Each rank milestone is a level: level 1 is the first rank, and reaching the next
 * milestone's watched count gains the next level. XP is progress from the current
 * milestone toward the next one; at the top rank there is no further level.
 */
public record Progression(long watchedCount, int level, int xpIntoLevel, int xpPerLevel,
                          Rank rank, Rank nextRank, long toNextRank) {

    /** The rank ladder by watched count; the rank is also the profile badge. */
    public enum Rank {
        POPCORN_ROOKIE(0, "Popcorn Rookie", "popcorn"),
        THE_HOBBIT(10, "The Hobbit", "ticket"),
        THE_MAVERICK(25, "The Maverick", "owl"),
        THE_PROFESSIONAL(50, "The Professional", "film-reel"),
        THE_CHOSEN_ONE(100, "The Chosen One", "medal"),
        THE_TERMINATOR(200, "The Terminator", "directors-chair"),
        THE_GODFATHER(500, "The Godfather", "star");

        private final long threshold;
        private final String label;
        private final String emblem;

        Rank(long threshold, String label, String emblem) {
            this.threshold = threshold;
            this.label = label;
            this.emblem = emblem;
        }

        public long threshold() { return threshold; }
        public String label() { return label; }
        public String emblem() { return emblem; }

        /** The level this milestone grants, starting at 1. */
        public int level() { return ordinal() + 1; }

        public static Rank forWatched(long watched) {
            Rank result = POPCORN_ROOKIE;
            for (Rank rank : values()) if (watched >= rank.threshold) result = rank;
            return result;
        }

        public Rank next() {
            int i = ordinal() + 1;
            return i < values().length ? values()[i] : null;
        }
    }

    public static int levelFor(long watched) {
        return Rank.forWatched(Math.max(0, watched)).level();
    }

    public static Progression of(long watched) {
        long count = Math.max(0, watched);
        Rank rank = Rank.forWatched(count);
        Rank next = rank.next();
        if (next == null) return new Progression(count, rank.level(), 0, 0, rank, null, 0);
        return new Progression(count, rank.level(), (int) (count - rank.threshold()),
                (int) (next.threshold() - rank.threshold()), rank, next, next.threshold() - count);
    }
}
