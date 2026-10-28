package com.movienight.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Paginated response for an Explore category with pinned session state.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExploreCategoryPageResponse {
    private String sessionId;
    private String mediaType;
    private String category;
    private String title;
    private String subtitle;
    private String state;
    private String updatedAt;
    private List<SuggestionMovieItem> movies;
    private Integer cursor;
    private boolean hasMore;
    private String terminalReason;
    private String underlyingLimit;
    private int totalEligibleInPool;
}
