package com.movienight.backend.dto;

import com.movienight.backend.model.MovieStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Data transfer object combining the objective movie facts with
 * the requesting user's private journal entry (status, rating, notes).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserMovieEntryResponse {
    private Long id;
    private MovieResponse movie;
    private MovieStatus status;
    private Integer personalRating;
    private String notes;
    private LocalDateTime watchedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
