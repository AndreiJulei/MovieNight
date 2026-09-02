package com.movienight.backend.dto;

import com.movienight.backend.model.MovieStatus;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Request body for updating a user's personal review/status on a movie.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateMovieEntryRequest {

    /**
     * Updated status (e.g. moving from WATCHLIST to WATCHED).
     */
    private MovieStatus status;

    /**
     * Updated personal score (1 to 10).
     */
    @Min(value = 1, message = "Personal rating must be between 1 and 10")
    @Max(value = 10, message = "Personal rating must be between 1 and 10")
    private Integer personalRating;

    /**
     * User's private notes or thoughts.
     */
    private String notes;

    /**
     * When the user watched the movie.
     */
    private LocalDateTime watchedAt;
}
