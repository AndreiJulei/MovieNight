package com.movienight.backend.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * PD-08 (#24): the eligibility floor. PD-19 (#37): the continuous, bounded IMDb / Rotten Tomatoes
 * quality adjustment.
 */
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
    void qw01_acclaimedTitleScoresMoreThanOneAndAHalfTimesAMerelyGoodOne() {
        double good = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, 7.0, 72);
        double acclaimed = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, 8.5, 95);

        assertThat(acclaimed / good).isGreaterThan(1.5);
    }

    @Test
    void qw01_adjustmentsFollowTheContinuousFormulas() {
        assertThat(RecommendationQualityPolicy.imdbAdjustment(8.5)).isCloseTo(1.34, within(1e-9));
        assertThat(RecommendationQualityPolicy.imdbAdjustment(7.0)).isCloseTo(1.04, within(1e-9));
        assertThat(RecommendationQualityPolicy.imdbAdjustment(5.8)).isCloseTo(0.80, within(1e-9));
        assertThat(RecommendationQualityPolicy.rottenTomatoesAdjustment(95)).isCloseTo(1.36, within(1e-9));
        assertThat(RecommendationQualityPolicy.rottenTomatoesAdjustment(72)).isCloseTo(1.084, within(1e-9));
        assertThat(RecommendationQualityPolicy.rottenTomatoesAdjustment(40)).isCloseTo(0.70, within(1e-9));
    }

    @Test
    void pr02_higherImdbAndRottenTomatoesScoresRankProgressivelyHigher() {
        double previous = 0;
        for (int step = 0; step <= 40; step++) {
            double imdb = 6.0 + step * 0.1;
            int rt = 50 + step;
            double factor = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, imdb, rt);
            assertThat(factor).isGreaterThanOrEqualTo(previous);
            previous = factor;
        }
    }

    @Test
    void qw02_adjustmentsNeverLeaveTheirBounds() {
        for (int tenths = 1; tenths <= 100; tenths++) {
            assertThat(RecommendationQualityPolicy.imdbAdjustment(tenths / 10.0)).isBetween(0.70, 1.40);
        }
        for (int rt = 0; rt <= 100; rt++) {
            assertThat(RecommendationQualityPolicy.rottenTomatoesAdjustment(rt)).isBetween(0.70, 1.40);
        }
        assertThat(RecommendationQualityPolicy.imdbAdjustment(10.0)).isEqualTo(1.40);
        assertThat(RecommendationQualityPolicy.rottenTomatoesAdjustment(100)).isEqualTo(1.40);
        assertThat(RecommendationQualityPolicy.imdbAdjustment(1.0)).isEqualTo(0.70);
        assertThat(RecommendationQualityPolicy.rottenTomatoesAdjustment(0)).isEqualTo(0.70);
    }

    @Test
    void pr03_qw02_missingDataEqualsTheNeutralValueExactly() {
        assertThat(RecommendationQualityPolicy.imdbAdjustment(null)).isEqualTo(1.0);
        assertThat(RecommendationQualityPolicy.rottenTomatoesAdjustment(null)).isEqualTo(1.0);
        assertThat(RecommendationQualityPolicy.imdbAdjustment(6.8)).isEqualTo(1.0);
        assertThat(RecommendationQualityPolicy.rottenTomatoesAdjustment(65)).isEqualTo(1.0);

        double missing = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, null, null);
        double neutral = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, 6.8, 65);
        assertThat(missing).isEqualTo(neutral);
    }

    @Test
    void outOfRangeOrNonFiniteImdbOrRottenTomatoesDataIsTreatedAsMissing() {
        assertThat(RecommendationQualityPolicy.imdbAdjustment(Double.NaN)).isEqualTo(1.0);
        assertThat(RecommendationQualityPolicy.imdbAdjustment(0.0)).isEqualTo(1.0);
        assertThat(RecommendationQualityPolicy.imdbAdjustment(11.0)).isEqualTo(1.0);
        assertThat(RecommendationQualityPolicy.rottenTomatoesAdjustment(-1)).isEqualTo(1.0);
        assertThat(RecommendationQualityPolicy.rottenTomatoesAdjustment(101)).isEqualTo(1.0);
    }

    @Test
    void pr03_lowImdbOrRottenTomatoesLowersByABoundedAmount() {
        double neutral = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, null, null);
        double lowImdb = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, 5.8, null);
        double lowRt = RecommendationQualityPolicy.qualityFactor(7.4, 4_000, null, 40);

        assertThat(lowImdb / neutral).isCloseTo(0.80, within(1e-9));
        assertThat(lowRt / neutral).isCloseTo(0.70, within(1e-9));
    }

    @Test
    void moreVotesGiveMoreConfidenceInTheSameAudienceRating() {
        assertThat(RecommendationQualityPolicy.qualityFactor(8.0, 30_000, null, null))
                .isGreaterThan(RecommendationQualityPolicy.qualityFactor(8.0, 300, null, null));
    }
}
