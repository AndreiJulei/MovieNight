package com.movienight.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

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
    private Integer voteCount;
    private Double imdbRating;
    private Double rottenTomatoesRating;
    private Double score;
    private String reason;
    private String mediaType;
    /** Spotlight hero artwork and metadata (PD-10); omitted elsewhere. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String backdropUrl;
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String logoUrl;
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private List<String> genres;
}
