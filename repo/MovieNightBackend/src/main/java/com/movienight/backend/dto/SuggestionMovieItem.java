package com.movienight.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SuggestionMovieItem {
    private Long tmdbId;
    private String title;
    private String posterUrl;
    private Integer releaseYear;
    private Double voteAverage;
    private Double imdbRating;
    private Double rottenTomatoesRating;
    private Double score;
    private String reason;
}
