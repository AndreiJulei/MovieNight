package com.movienight.backend.dto.external;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.Collections;
import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class OmdbResponse {

    @JsonProperty("imdbID")
    private String imdbId;

    @JsonProperty("imdbRating")
    private String imdbRating;

    @JsonProperty("Ratings")
    private List<RatingItem> ratings = Collections.emptyList();

    @JsonProperty("Response")
    private String response;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class RatingItem {
        @JsonProperty("Source")
        private String source;

        @JsonProperty("Value")
        private String value;
    }
}
