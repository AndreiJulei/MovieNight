package com.movienight.backend.dto;

import com.movienight.backend.model.MovieStatus;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import lombok.AccessLevel;
import lombok.Setter;
import com.movienight.backend.validation.PersonalRating;
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
@AllArgsConstructor(onConstructor_ = @JsonCreator(mode = JsonCreator.Mode.DISABLED))
public class UpdateMovieEntryRequest {

    /**
     * Updated status (e.g. moving from WATCHLIST to WATCHED).
     */
    private MovieStatus status;

    /**
     * Updated personal score (0 to 10 in half-point increments).
     */
    @PersonalRating
    private Double personalRating;

    @JsonIgnore
    @Setter(AccessLevel.NONE)
    private boolean personalRatingPresent;

    @JsonSetter("personalRating")
    public void setPersonalRating(Double personalRating) {
        this.personalRating = personalRating;
        this.personalRatingPresent = true;
    }

    /**
     * User's private notes or thoughts.
     */
    private String notes;

    /**
     * When the user watched the movie.
     */
    private LocalDateTime watchedAt;
}
