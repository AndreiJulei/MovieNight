package com.movienight.backend.service;

import com.movienight.backend.model.Movie;

import java.time.Duration;
import java.time.LocalDateTime;

/**
 * When a title may be sent to OMDb, on every path: title pages and recommendation enrichment
 * (recs-refill-and-acclaimed SC05, SC06). Every path records {@code omdbCheckedAt} when OMDb answers.
 * <p>
 * Eligible: an IMDb id, the IMDb rating or the Rotten Tomatoes score still missing, and OMDb not asked in the
 * last {@link #COOL_DOWN}. A title OMDb answered without scores (a new release before RT has reviews) is asked
 * again after the cool-down. A request OMDb never answered records nothing, so it is retried on the next
 * opportunity; the daily {@link OmdbRequestBudget} bounds those retries.
 */
public final class OmdbRecheckPolicy {

    static final Duration COOL_DOWN = Duration.ofDays(7);

    private OmdbRecheckPolicy() {}

    public static boolean eligible(Movie movie, LocalDateTime now) {
        return movie != null && eligible(movie.getImdbId(), movie.getImdbRating(), movie.getRottenTomatoesRating(),
                movie.getOmdbCheckedAt(), now);
    }

    /** {@link #eligible(Movie, LocalDateTime)} for a title whose IMDb id comes from elsewhere. */
    static boolean eligible(String imdbId, Double imdbRating, Integer rottenTomatoes, LocalDateTime omdbCheckedAt,
                            LocalDateTime now) {
        return imdbId != null && !imdbId.isBlank()
                && (imdbRating == null || rottenTomatoes == null)
                && (omdbCheckedAt == null || omdbCheckedAt.isBefore(now.minus(COOL_DOWN)));
    }
}
