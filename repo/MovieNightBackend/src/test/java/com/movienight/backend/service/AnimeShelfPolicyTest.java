package com.movienight.backend.service;

import com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary;
import com.movienight.backend.model.AniListMapping;
import org.junit.jupiter.api.Test;

import static com.movienight.backend.service.AnimeShelfPolicy.*;
import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

class AnimeShelfPolicyTest {
    private AniListMapping matched(boolean adult, String tags, Integer score, Integer popularity) {
        return AniListMapping.builder().matched(true).adult(adult).tags(tags).meanScore(score).popularity(popularity).build();
    }

    @Test void adultAndKidsDemographicAreExcludedAtAnyRank() {
        assertTrue(excludedFromCuratedShelves(matched(true, null, 80, 9000)));
        assertTrue(excludedFromCuratedShelves(matched(false, "Kids|1;Magic|90", 80, 9000)));
    }

    @Test void childrenTagIsExcludedOnlyAtOrAboveThreshold() {
        assertFalse(excludedFromCuratedShelves(matched(false, CHILDREN_TAG + "|" + (CHILDREN_TAG_RANK_THRESHOLD - 1), 80, 9000)));
        assertTrue(excludedFromCuratedShelves(matched(false, CHILDREN_TAG + "|" + CHILDREN_TAG_RANK_THRESHOLD, 80, 9000)));
    }

    @Test void unmatchedAndNullAreNeverExcludedAndPassTheFloor() {
        AniListMapping none = AniListMapping.builder().matched(false).build();
        assertFalse(excludedFromCuratedShelves(none));
        assertFalse(excludedFromCuratedShelves(null));
        assertTrue(meetsSignalFloor(none));
    }

    @Test void signalFloorNeedsBothMeanScoreAndPopularity() {
        assertTrue(meetsSignalFloor(matched(false, null, MIN_MEAN_SCORE, MIN_POPULARITY)));
        assertFalse(meetsSignalFloor(matched(false, null, MIN_MEAN_SCORE - 1, MIN_POPULARITY)));
        assertFalse(meetsSignalFloor(matched(false, null, MIN_MEAN_SCORE, MIN_POPULARITY - 1)));
        assertFalse(meetsSignalFloor(matched(false, null, null, MIN_POPULARITY)));
    }

    @Test void topRatedBlendsMeanScoreOnlyForMatches() {
        assertEquals(8.0, topRatedScore(8.0, AniListMapping.builder().matched(false).build()));
        assertEquals(8.0, topRatedScore(8.0, null));
        assertEquals(0.5 * 7.0 + 0.5 * 9.0, topRatedScore(7.0, matched(false, null, 90, 9000)), 1e-9);
    }

    private static TmdbMovieSummary tv(List<Integer> genres, String language, List<String> countries) {
        TmdbMovieSummary summary = new TmdbMovieSummary();
        summary.setId(1L);
        summary.setName("Series");
        summary.setMediaType("tv");
        summary.setGenreIds(genres);
        summary.setOriginalLanguage(language);
        summary.setOriginCountry(countries);
        return summary;
    }

    @Test void animeSuggestionsUseTheAnimeShelfClassification() {
        assertTrue(qualifiesAsAnimeSuggestion(tv(List.of(16), "ja", List.of("JP")), null));
        assertFalse(qualifiesAsAnimeSuggestion(tv(List.of(18), "ja", List.of("JP")), null), "not animation");
        assertFalse(qualifiesAsAnimeSuggestion(tv(List.of(16), "en", List.of("JP")), null), "shelves require original language ja");
    }

    @Test void animeSuggestionsExcludeKidsFamilyGenresAndExcludedAniListMatches() {
        assertFalse(qualifiesAsAnimeSuggestion(tv(List.of(16, 10762), "ja", List.of("JP")), null), "Kids");
        assertFalse(qualifiesAsAnimeSuggestion(tv(List.of(16, 10751), "ja", List.of("JP")), null), "Family");
        assertFalse(qualifiesAsAnimeSuggestion(tv(List.of(16), "ja", List.of("JP")), matched(true, null, 80, 9000)), "adult");
        assertTrue(qualifiesAsAnimeSuggestion(tv(List.of(16), "ja", List.of("JP")), AniListMapping.builder().matched(false).build()));
    }
}
