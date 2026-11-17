package com.movienight.backend.service;

import com.movienight.backend.model.Movie;
import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.model.UserMovieEntry;

/**
 * What counts as a liked film for personal recommendations (PD-20, #38; reused by #39).
 * <p>
 * A film is liked when it is in the user's watched history and its personal rating is at least
 * {@value #LIKED_RATING}. A watched film without a personal rating counts as {@value #UNRATED_RATING},
 * so it is liked too.
 */
public final class LikedFilmPolicy {

    static final double LIKED_RATING = 7.0;
    /** The rating assumed for a watched film the user has not rated. */
    static final double UNRATED_RATING = 7.0;

    private LikedFilmPolicy() {}

    /** True for a watched movie (not TV or anime) with a TMDB id whose effective rating is at least 7.0. */
    public static boolean liked(UserMovieEntry entry) {
        return watchedMovie(entry) && effectiveRating(entry) >= LIKED_RATING;
    }

    /** True for a watched movie (not TV or anime) with a usable TMDB id: the history recommendations learn from. */
    static boolean watchedMovie(UserMovieEntry entry) {
        return entry != null && entry.getStatus() == MovieStatus.WATCHED && isMovie(entry.getMovie())
                && entry.getMovie().getTmdbId() != null && entry.getMovie().getTmdbId() > 0;
    }

    /** The personal rating, or {@value #UNRATED_RATING} when the user has not rated the title. */
    public static double effectiveRating(UserMovieEntry entry) {
        return entry.getPersonalRating() == null ? UNRATED_RATING : entry.getPersonalRating();
    }

    /** Movies only; a title without a media type predates the column and is a movie. */
    static boolean isMovie(Movie movie) {
        return movie != null && (movie.getMediaType() == null || "MOVIE".equalsIgnoreCase(movie.getMediaType()));
    }
}
