package com.movienight.backend.service;

/**
 * Quality rules for personalized recommendations (PD-08, #24; continuous weighting PD-19, #37).
 * <p>
 * A candidate must clear a TMDB audience-rating floor. Eligible candidates are ranked by
 * relevance × quality factor, where the quality factor is the vote-confidence-adjusted TMDB rating
 * (out of ten) multiplied by continuous, bounded adjustments for the IMDb audience rating and the
 * Rotten Tomatoes critic approval: an 8.5 / 95% title clearly outranks a 7.0 / 72% one.
 * Missing IMDb / Rotten Tomatoes data is neutral: it usually means the title has not been enriched yet.
 */
public final class RecommendationQualityPolicy {

    static final double MIN_TMDB_AUDIENCE_RATING = 6.5;
    static final int MIN_TMDB_VOTES = 300;

    /** Confidence prior: few votes pull the TMDB rating toward this value, as in Top Rated. */
    private static final double PRIOR_RATING = 6.0;

    /**
     * Continuous critic/audience weighting: each point of IMDb above or below the neutral value moves
     * the factor by {@value #IMDB_SLOPE}, each Rotten Tomatoes percentage point by {@value #RT_SLOPE}.
     * Missing data takes the neutral value, so it never raises or lowers the score.
     */
    private static final double IMDB_NEUTRAL = 6.8;
    private static final double IMDB_SLOPE = 0.20;
    private static final int RT_NEUTRAL = 65;
    private static final double RT_SLOPE = 0.012;
    private static final double MIN_ADJUSTMENT = 0.70;
    private static final double MAX_ADJUSTMENT = 1.40;

    private RecommendationQualityPolicy() {}

    /** TMDB audience rating ≥ 6.5 with ≥ 300 votes; candidates without TMDB audience data are excluded. */
    public static boolean eligible(Double tmdbAudienceRating, Integer tmdbVotes) {
        return tmdbAudienceRating != null && Double.isFinite(tmdbAudienceRating)
                && tmdbAudienceRating >= MIN_TMDB_AUDIENCE_RATING && tmdbAudienceRating <= 10
                && tmdbVotes != null && tmdbVotes >= MIN_TMDB_VOTES;
    }

    /** Multiplier applied to relevance; only meaningful for {@link #eligible} candidates. */
    public static double qualityFactor(double tmdbAudienceRating, int tmdbVotes, Double imdbRating, Integer rottenTomatoes) {
        double confident = (tmdbVotes * tmdbAudienceRating + MIN_TMDB_VOTES * PRIOR_RATING) / (tmdbVotes + MIN_TMDB_VOTES);
        return confident / 10.0 * imdbAdjustment(imdbRating) * rottenTomatoesAdjustment(rottenTomatoes);
    }

    static double imdbAdjustment(Double imdbRating) {
        if (imdbRating == null || !Double.isFinite(imdbRating) || imdbRating <= 0 || imdbRating > 10) return 1.0;
        return linearAdjustment(imdbRating, IMDB_NEUTRAL, IMDB_SLOPE);
    }

    static double rottenTomatoesAdjustment(Integer rottenTomatoes) {
        if (rottenTomatoes == null || rottenTomatoes < 0 || rottenTomatoes > 100) return 1.0;
        return linearAdjustment(rottenTomatoes, RT_NEUTRAL, RT_SLOPE);
    }

    /** {@code 1 + slope × (value − neutral)}, clamped to [{@value #MIN_ADJUSTMENT}, {@value #MAX_ADJUSTMENT}]. */
    private static double linearAdjustment(double value, double neutral, double slope) {
        double adjustment = 1 + slope * (value - neutral);
        return Math.max(MIN_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, adjustment));
    }
}
