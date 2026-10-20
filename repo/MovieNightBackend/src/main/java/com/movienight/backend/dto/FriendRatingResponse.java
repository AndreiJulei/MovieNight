package com.movienight.backend.dto;

import com.movienight.backend.model.MovieStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Data transfer object showing how a specific friend rated a movie.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FriendRatingResponse {
    private Long userId;
    private String username;
    private String displayName;
    private MovieStatus status;
    private Double personalRating;
    private LocalDateTime watchedAt;
}
