package com.movienight.backend.dto.external;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.Collections;
import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class TmdbSearchResponse {

    @JsonProperty("results")
    private List<TmdbMovieSummary> results = Collections.emptyList();

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TmdbMovieSummary {
        private Long id;
        private String title;

        @JsonProperty("release_date")
        private String releaseDate;

        private String overview;

        @JsonProperty("poster_path")
        private String posterPath;

        @JsonProperty("backdrop_path")
        private String backdropPath;

        @JsonProperty("vote_average")
        private Double voteAverage;

        @JsonProperty("vote_count")
        private Integer voteCount;
    }
}
