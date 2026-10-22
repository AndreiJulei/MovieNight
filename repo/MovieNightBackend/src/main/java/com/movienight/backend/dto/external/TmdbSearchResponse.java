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

        // Movies use "title", TV shows use "name"
        private String title;
        private String name;

        @JsonProperty("media_type")
        private String mediaType; // "movie", "tv", "person"

        @JsonProperty("release_date")
        private String releaseDate;

        @JsonProperty("first_air_date")
        private String firstAirDate;

        private String overview;

        @JsonProperty("poster_path")
        private String posterPath;

        @JsonProperty("backdrop_path")
        private String backdropPath;

        @JsonProperty("vote_average")
        private Double voteAverage;

        @JsonProperty("vote_count")
        private Integer voteCount;

        @JsonProperty("original_language")
        private String originalLanguage;

        @JsonProperty("origin_country")
        private List<String> originCountry = Collections.emptyList();

        @JsonProperty("genre_ids")
        private List<Integer> genreIds = Collections.emptyList();

        /**
         * Resolves title for both movies and TV shows.
         */
        public String getEffectiveTitle() {
            if (title != null && !title.isBlank()) {
                return title;
            }
            if (name != null && !name.isBlank()) {
                return name;
            }
            return null;
        }

        /**
         * Resolves release date (release_date for movies, first_air_date for TV series).
         */
        public String getEffectiveReleaseDate() {
            if (releaseDate != null && !releaseDate.isBlank()) {
                return releaseDate;
            }
            if (firstAirDate != null && !firstAirDate.isBlank()) {
                return firstAirDate;
            }
            return null;
        }

        /**
         * Classifies media into "MOVIE", "TV", or "ANIME".
         */
        public String getResolvedMediaType() {
            boolean tv = "tv".equalsIgnoreCase(mediaType) || (mediaType == null && title == null && name != null);
            return (tv ? com.movienight.backend.model.ResourceType.TV : com.movienight.backend.model.ResourceType.MOVIE)
                    .classify(genreIds != null && genreIds.contains(16), originalLanguage, originCountry);
        }
    }
}
