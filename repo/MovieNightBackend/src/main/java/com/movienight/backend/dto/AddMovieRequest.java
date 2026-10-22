package com.movienight.backend.dto;

import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.validation.PersonalRating;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Request body for adding a movie to a user's library.
 * Contains both external movie metadata and the user's initial status/rating/notes.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AddMovieRequest {

    // --- Shared Movie Metadata ---

    @jakarta.validation.constraints.Positive(message = "Provider ID must be positive")
    private Long tmdbId;

    @jakarta.validation.constraints.Positive
    private Long catalogMovieId;

    private String imdbId;

    @NotBlank(message = "Movie title is required")
    private String title;

    private Integer releaseYear;

    private String overview;

    private String posterUrl;

    private String backdropUrl;

    private String genres;

    private Integer runtimeMinutes;

    private String trailerKey;

    private String director;

    private String castMembers;
    private String mediaType;
    private Integer seasonsCount;
    private Integer episodesCount;

    private Double imdbRating;

    private Integer rottenTomatoesRating;

    private Double tmdbVoteAverage;

    private Integer tmdbVoteCount;

    // --- User's Personal Relationship ---

    @NotNull(message = "Movie status is required (WATCHLIST, WATCHED, or DROPPED)")
    private MovieStatus status;

    @PersonalRating
    private Double personalRating;

    private String notes;

    private LocalDateTime watchedAt;
}
