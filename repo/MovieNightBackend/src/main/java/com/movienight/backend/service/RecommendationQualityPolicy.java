package com.movienight.backend.service;

/**
 * Quality rules for personalized recommendations (PD-08, #24).
 * <p>
 * A candidate must clear a TMDB audience-rating floor. Eligible candidates are ranked by
 * relevance × quality factor, where the quality factor is the vote-confidence-adjusted TMDB rating
 * (out of ten) multiplied by bounded adjustments for the IMDb audience rating and the Rotten Tomatoes
 * critic approval.
 * Missing IMDb / Rotten Tomatoes data is neutral: it usually means the title has not been enriched yet.
 */
public final class RecommendationQualityPolicy {

    static final double MIN_TMDB_AUDIENCE_RATING = 6.5;
    static final int MIN_TMDB_VOTES = 300;

    /** Confidence prior: few votes pull the TMDB rating toward this value, as in Top Rated. */
    private static final double PRIOR_RATING = 6.0;

    static final double BOOST = 1.15;
    static final double PENALTY = 0.90;
    private static final double IMDB_BOOST_AT = 7.0;
    private static final double IMDB_PENALTY_BELOW = 6.5;
    private static final int RT_BOOST_AT = 70;
    private static final int RT_PENALTY_BELOW = 60;

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
        if (imdbRating == null || !Double.isFinite(imdbRating)) return 1.0;
        if (imdbRating >= IMDB_BOOST_AT) return BOOST;
        if (imdbRating < IMDB_PENALTY_BELOW) return PENALTY;
        return 1.0;
    }

    static double rottenTomatoesAdjustment(Integer rottenTomatoes) {
        if (rottenTomatoes == null) return 1.0;
        if (rottenTomatoes >= RT_BOOST_AT) return BOOST;
        if (rottenTomatoes < RT_PENALTY_BELOW) return PENALTY;
        return 1.0;
    }
}
