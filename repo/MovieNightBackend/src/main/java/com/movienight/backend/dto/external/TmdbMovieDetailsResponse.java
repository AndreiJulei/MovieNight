package com.movienight.backend.dto.external;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.Collections;
import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class TmdbMovieDetailsResponse {

    private Long id;

    @JsonProperty("imdb_id")
    private String imdbId;

    private String title;

    @JsonProperty("release_date")
    private String releaseDate;

    private String overview;

    @JsonProperty("poster_path")
    private String posterPath;

    @JsonProperty("backdrop_path")
    private String backdropPath;

    private Integer runtime;

    @JsonProperty("vote_average")
    private Double voteAverage;

    @JsonProperty("vote_count")
    private Integer voteCount;

    private List<Genre> genres = Collections.emptyList();

    private Credits credits;

    private Videos videos;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Genre {
        private Integer id;
        private String name;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Credits {
        private List<CastMember> cast = Collections.emptyList();
        private List<CrewMember> crew = Collections.emptyList();
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CastMember {
        private String name;
        private String character;
        private Integer order;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CrewMember {
        private String name;
        private String job;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Videos {
        private List<VideoResult> results = Collections.emptyList();
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class VideoResult {
        private String key;
        private String site;
        private String type;
    }
}
