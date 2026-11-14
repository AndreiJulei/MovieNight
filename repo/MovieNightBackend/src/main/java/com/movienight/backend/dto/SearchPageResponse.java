package com.movienight.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * One page of the full search results page (#30). {@code page} is the last provider page consumed,
 * so the next request asks for {@code page + 1} while {@code hasMore} is true.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SearchPageResponse {
    private String query;
    private String type;
    private int page;
    private int totalPages;
    private boolean hasMore;
    private List<MovieResponse> results;
}
