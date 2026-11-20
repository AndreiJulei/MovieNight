package com.movienight.backend.service;

import com.movienight.backend.model.Movie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/** One rule decides when a title may be sent to OMDb, on every path (recs-refill-and-acclaimed SC05, SC06). */
class OmdbRecheckPolicyTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 11, 18, 12, 0);

    private static Movie title(Double imdb, Integer rottenTomatoes, LocalDateTime checkedAt) {
        return Movie.builder().imdbId("tt0111161").imdbRating(imdb).rottenTomatoesRating(rottenTomatoes)
                .omdbCheckedAt(checkedAt).build();
    }

    @Test
    @DisplayName("A title never checked and without scores is eligible")
    void neverCheckedWithoutScores() {
        assertThat(OmdbRecheckPolicy.eligible(title(null, null, null), NOW)).isTrue();
    }

    @Test
    @DisplayName("SC05: a title with IMDb but no RT is still eligible, so RT can be asked for")
    void sc05_imdbWithoutRottenTomatoes() {
        assertThat(OmdbRecheckPolicy.eligible(title(8.1, null, null), NOW)).isTrue();
        assertThat(OmdbRecheckPolicy.eligible(title(null, 91, null), NOW)).isTrue();
    }

    @Test
    @DisplayName("A title with both scores, or without an IMDb id, is never sent")
    void bothScoresOrNoImdbId() {
        assertThat(OmdbRecheckPolicy.eligible(title(8.1, 91, null), NOW)).isFalse();
        assertThat(OmdbRecheckPolicy.eligible(Movie.builder().build(), NOW)).isFalse();
        assertThat(OmdbRecheckPolicy.eligible(Movie.builder().imdbId(" ").build(), NOW)).isFalse();
        assertThat(OmdbRecheckPolicy.eligible(null, NOW)).isFalse();
    }

    @Test
    @DisplayName("SC06: a title OMDb answered without scores waits 7 days before it is asked again")
    void sc06_coolDownAfterAnEmptyAnswer() {
        assertThat(OmdbRecheckPolicy.eligible(title(null, null, NOW.minusDays(6)), NOW)).isFalse();
        assertThat(OmdbRecheckPolicy.eligible(title(8.1, null, NOW.minusDays(6).minusHours(23)), NOW)).isFalse();
        assertThat(OmdbRecheckPolicy.eligible(title(null, null, NOW.minusDays(7).minusMinutes(1)), NOW)).isTrue();
        assertThat(OmdbRecheckPolicy.eligible(title(8.1, null, NOW.minusDays(30)), NOW)).isTrue();
    }
}
