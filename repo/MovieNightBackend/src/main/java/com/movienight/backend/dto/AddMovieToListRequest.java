package com.movienight.backend.dto;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AddMovieToListRequest {

    @NotNull(message = "Movie ID is required")
    private Long movieId;

    private Integer position;
}
