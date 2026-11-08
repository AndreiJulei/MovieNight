package com.movienight.backend.service;

import com.movienight.backend.model.AniListMapping;

/**
 * AniList-based curation of ANIME shelves. Pure and threshold-driven. Unmatched titles are never
 * excluded here: they follow the TMDB-only rules already applied upstream.
 */
public final class AnimeShelfPolicy {
    /** AniList demographic tag; excluded at any rank. */
    public static final String KIDS_DEMOGRAPHIC_TAG = "Kids";
    /** Children-targeted tag; excluded when its rank reaches the threshold. */
    public static final String CHILDREN_TAG = "Primarily Child Cast";
    public static final int CHILDREN_TAG_RANK_THRESHOLD = 60;
    /** AniList meanScore is 0-100. Popular and Top Rated need both floors. */
    public static final int MIN_MEAN_SCORE = 65;
    public static final int MIN_POPULARITY = 5000;
    /** Share of AniList meanScore (scaled to 0-10) in the Top Rated discovery ranking score. */
    public static final double TOP_RATED_ANILIST_WEIGHT = 0.5;

    private AnimeShelfPolicy() {}

    /** Adult or kids-targeted matches never appear on curated shelves. */
    public static boolean excludedFromCuratedShelves(AniListMapping mapping) {
        if (mapping == null || !mapping.isMatched()) return false;
        return mapping.isAdult()
                || mapping.tagRank(KIDS_DEMOGRAPHIC_TAG) > 0
                || mapping.tagRank(CHILDREN_TAG) >= CHILDREN_TAG_RANK_THRESHOLD;
    }

    /** Signal floor for Popular and Top Rated; unmatched titles pass. */
    public static boolean meetsSignalFloor(AniListMapping mapping) {
        if (mapping == null || !mapping.isMatched()) return true;
        return mapping.getMeanScore() != null && mapping.getMeanScore() >= MIN_MEAN_SCORE
                && mapping.getPopularity() != null && mapping.getPopularity() >= MIN_POPULARITY;
    }

    /** Discovery ranking score (not an audience rating): TMDB weighted rating blended with AniList meanScore/10. */
    public static double topRatedScore(double tmdbWeightedRating, AniListMapping mapping) {
        if (mapping == null || !mapping.isMatched() || mapping.getMeanScore() == null) return tmdbWeightedRating;
        return (1 - TOP_RATED_ANILIST_WEIGHT) * tmdbWeightedRating
                + TOP_RATED_ANILIST_WEIGHT * (mapping.getMeanScore() / 10.0);
    }
}
