package com.movienight.backend.service;

/**
 * A user's level and rank, derived from their watched-history count (#32).
 * One level per {@value #XP_PER_LEVEL} watched titles, starting at level 1.
 */
public record Progression(long watchedCount, int level, int xpIntoLevel, Rank rank, Rank nextRank, long toNextRank) {

    public static final int XP_PER_LEVEL = 10;

    /** The rank ladder by watched count; the rank is also the profile badge. */
    public enum Rank {
        POPCORN_ROOKIE(0, "Popcorn Rookie", "popcorn"),
        MATINEE_REGULAR(10, "Matinee Regular", "ticket"),
        NIGHT_OWL(25, "Night Owl", "owl"),
        CINEPHILE(50, "Cinephile", "film-reel"),
        VETERAN(100, "Veteran", "medal"),
        CRITIC(200, "Critic", "notepad"),
        AUTEUR(350, "Auteur", "directors-chair"),
        SILVER_SCREEN_LEGEND(500, "Silver Screen Legend", "star");

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

    public int xpPerLevel() { return XP_PER_LEVEL; }

    public static int levelFor(long watched) {
        return (int) (Math.max(0, watched) / XP_PER_LEVEL) + 1;
    }

    public static Progression of(long watched) {
        long count = Math.max(0, watched);
        Rank rank = Rank.forWatched(count);
        Rank next = rank.next();
        return new Progression(count, levelFor(count), (int) (count % XP_PER_LEVEL), rank, next,
                next == null ? 0 : next.threshold() - count);
    }
}
