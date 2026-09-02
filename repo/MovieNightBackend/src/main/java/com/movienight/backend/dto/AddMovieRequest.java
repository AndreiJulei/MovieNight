package com.movienight.backend.dto;

import com.movienight.backend.model.MovieStatus;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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

    private Long tmdbId;

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

    private Double imdbRating;

    private Integer rottenTomatoesRating;

    private Double tmdbVoteAverage;

    private Integer tmdbVoteCount;

    // --- User's Personal Relationship ---

    @NotNull(message = "Movie status is required (WATCHLIST, WATCHED, or DROPPED)")
    private MovieStatus status;

    @Min(value = 1, message = "Personal rating must be between 1 and 10")
    @Max(value = 10, message = "Personal rating must be between 1 and 10")
    private Integer personalRating;

    private String notes;

    private LocalDateTime watchedAt;
}
