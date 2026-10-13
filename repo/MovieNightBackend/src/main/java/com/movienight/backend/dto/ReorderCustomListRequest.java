package com.movienight.backend.dto;

import jakarta.validation.constraints.NotEmpty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReorderCustomListRequest {

    @NotEmpty(message = "Ordered movie IDs list cannot be empty")
    private List<Long> orderedMovieIds;
}
