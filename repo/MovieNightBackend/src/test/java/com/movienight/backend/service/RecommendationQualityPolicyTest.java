package com.movienight.backend.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** PD-08 (#24): the eligibility floor and the bounded IMDb / Rotten Tomatoes quality adjustment. */
class RecommendationQualityPolicyTest {

    @Test
    void pr01_floorRequiresTmdbAudienceRatingOf6Point5WithAtLeast300Votes() {
        assertThat(RecommendationQualityPolicy.eligible(6.5, 300)).isTrue();
        assertThat(RecommendationQualityPolicy.eligible(8.4, 25_000)).isTrue();
        assertThat(RecommendationQualityPolicy.eligible(6.4, 25_000)).isFalse();
        assertThat(RecommendationQualityPolicy.eligible(8.4, 299)).isFalse();
    }

    @Test
    void pr01_candidatesWithoutTmdbAudienceDataAreIneligible() {
        assertThat(RecommendationQualityPolicy.eligible(null, 5_000)).isFalse();
        assertThat(RecommendationQualityPolicy.eligible(7.5, null)).isFalse();
        assertThat(RecommendationQualityPolicy.eligible(Double.NaN, 5_000)).isFalse();
    }

    @Test
    void pr02_highOnImdbAndRottenTomatoesRanksAboveNeither() {
        double neither = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, null, null);
        double imdbOnly = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, 7.0, null);
        double rtOnly = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, null, 70);
        double both = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, 7.8, 92);

        assertThat(imdbOnly / neither).isCloseTo(1.15, within(1e-9));
        assertThat(rtOnly / neither).isCloseTo(1.15, within(1e-9));
        // Both boosts give the largest lift, and it stays bounded.
        assertThat(both).isGreaterThan(imdbOnly).isGreaterThan(neither);
        assertThat(both / neither).isCloseTo(1.3225, within(1e-9));
    }

    @Test
    void pr03_missingImdbOrRottenTomatoesDataNeverLowersTheScore() {
        double missing = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, null, null);
        double neutralBand = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, 6.8, 65);
        assertThat(missing).isEqualTo(neutralBand);
    }

    @Test
    void pr03_lowImdbOrRottenTomatoesLowersByABoundedAmount() {
        double neutral = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, null, null);
        double lowImdb = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, 5.1, null);
        double lowRt = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, null, 12);
        double bothLow = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, 6.4, 59);

        assertThat(lowImdb / neutral).isCloseTo(0.90, within(1e-9));
        assertThat(lowRt / neutral).isCloseTo(0.90, within(1e-9));
        assertThat(bothLow / neutral).isCloseTo(0.81, within(1e-9));
    }

    @Test
    void moreVotesGiveMoreConfidenceInTheSameAudienceRating() {
        assertThat(RecommendationQualityPolicy.qualityFactor(8.0, 30_000, null, null))
                .isGreaterThan(RecommendationQualityPolicy.qualityFactor(8.0, 300, null, null));
    }
}
