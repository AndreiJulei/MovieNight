package com.movienight.backend.dto;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class SimilarityReloadResult {
    private final long pairsCount;
    private final String modelIdentity;
    private final int invalidatedUsersCount;
}

