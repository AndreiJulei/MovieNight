package com.movienight.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Data transfer object representing a friend's profile with calculated stats.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FriendProfileResponse {
    private Long id;
    private String username;
    private String displayName;
    private long watchedCount;
    private long watchlistCount;
    private Double avgRating;
    private LocalDateTime createdAt;
}
