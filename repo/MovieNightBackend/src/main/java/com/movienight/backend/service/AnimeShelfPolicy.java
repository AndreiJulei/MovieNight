package com.movienight.backend.service;

import com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary;
import com.movienight.backend.model.AniListMapping;

import java.util.List;
import java.util.Set;

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

    /** TMDB TV genre ids Kids and Family, as excluded by the anime shelves (SuggestionScheduler.KIDS_AND_FAMILY_GENRES). */
    public static final Set<Integer> KIDS_AND_FAMILY_TMDB_GENRES = Set.of(10762, 10751);

    private AnimeShelfPolicy() {}

    /** Original language the anime shelves request from TMDB discover (with_original_language). */
    public static final String ANIME_ORIGINAL_LANGUAGE = "ja";

    /**
     * Whether a TMDB TV recommendation may be suggested for an anime title, using the anime shelves'
     * rules: anime TV in original language ja, no Kids/Family genre, and not excluded by its stored
     * AniList match (if any).
     */
    public static boolean qualifiesAsAnimeSuggestion(TmdbMovieSummary summary, AniListMapping storedMapping) {
        return qualifiesAsAnimeTv(summary) && !excludedFromCuratedShelves(storedMapping);
    }

    /**
     * The anime shelves' TMDB rules for one title: anime TV in original language ja, with no Kids/Family
     * genre. AniList exclusion is applied separately.
     */
    public static boolean qualifiesAsAnimeTv(TmdbMovieSummary summary) {
        if (!"ANIME".equals(summary.getResolvedMediaType())) return false;
        if (!ANIME_ORIGINAL_LANGUAGE.equalsIgnoreCase(summary.getOriginalLanguage())) return false;
        List<Integer> genres = summary.getGenreIds();
        return genres == null || genres.stream().noneMatch(KIDS_AND_FAMILY_TMDB_GENRES::contains);
    }

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
