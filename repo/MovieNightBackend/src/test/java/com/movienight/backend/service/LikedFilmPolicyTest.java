package com.movienight.backend.service;

import com.movienight.backend.model.Movie;
import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.model.UserMovieEntry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LikedFilmPolicyTest {

    private static UserMovieEntry entry(MovieStatus status, String mediaType, Double rating) {
        return UserMovieEntry.builder().status(status).personalRating(rating)
                .movie(Movie.builder().tmdbId(42L).title("Film").mediaType(mediaType).build()).build();
    }

    @Test
    @DisplayName("A watched film rated 7.0 or more is liked; 6.9 is not")
    void ratingThreshold() {
        assertThat(LikedFilmPolicy.liked(entry(MovieStatus.WATCHED, "MOVIE", 7.0))).isTrue();
        assertThat(LikedFilmPolicy.liked(entry(MovieStatus.WATCHED, "MOVIE", 10.0))).isTrue();
        assertThat(LikedFilmPolicy.liked(entry(MovieStatus.WATCHED, "MOVIE", 6.9))).isFalse();
        assertThat(LikedFilmPolicy.liked(entry(MovieStatus.WATCHED, "MOVIE", 0.0))).isFalse();
    }

    @Test
    @DisplayName("A watched, unrated film counts as 7.0 and is liked")
    void unratedWatchedFilmIsLiked() {
        assertThat(LikedFilmPolicy.effectiveRating(entry(MovieStatus.WATCHED, "MOVIE", null))).isEqualTo(7.0);
        assertThat(LikedFilmPolicy.liked(entry(MovieStatus.WATCHED, "MOVIE", null))).isTrue();
    }

    @Test
    @DisplayName("Watchlist titles and TV or anime are never liked films")
    void onlyWatchedMovies() {
        assertThat(LikedFilmPolicy.liked(entry(MovieStatus.WATCHLIST, "MOVIE", 9.0))).isFalse();
        assertThat(LikedFilmPolicy.liked(entry(MovieStatus.WATCHED, "TV", 9.0))).isFalse();
        assertThat(LikedFilmPolicy.liked(entry(MovieStatus.WATCHED, "ANIME", 9.0))).isFalse();
    }
}
