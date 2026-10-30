package com.movienight.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SuggestionCategoryResponse {
    private String id;
    private String title;
    private List<SuggestionMovieItem> movies;
    private String state;
    private List<String> limitations;
    private String updatedAt;
    private Boolean hasMore;
    private Integer totalEligibleInPool;
    private String terminalReason;
    private String underlyingLimit;
}
