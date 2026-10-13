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

    // Movies use "title", TV shows use "name"
    private String title;
    private String name;

    @JsonProperty("release_date")
    private String releaseDate;

    @JsonProperty("first_air_date")
    private String firstAirDate;

    private String overview;

    @JsonProperty("poster_path")
    private String posterPath;

    @JsonProperty("backdrop_path")
    private String backdropPath;

    // Movie runtime
    private Integer runtime;

    // TV Series episode runtime
    @JsonProperty("episode_run_time")
    private List<Integer> episodeRunTime = Collections.emptyList();

    @JsonProperty("number_of_seasons")
    private Integer numberOfSeasons;

    @JsonProperty("number_of_episodes")
    private Integer numberOfEpisodes;

    @JsonProperty("created_by")
    private List<CreatedBy> createdBy = Collections.emptyList();

    @JsonProperty("original_language")
    private String originalLanguage;

    @JsonProperty("origin_country")
    private List<String> originCountry = Collections.emptyList();

    @JsonProperty("vote_average")
    private Double voteAverage;

    @JsonProperty("vote_count")
    private Integer voteCount;

    private List<Genre> genres = Collections.emptyList();

    private Credits credits;

    private Videos videos;

    public String getEffectiveTitle() {
        if (title != null && !title.isBlank()) {
            return title;
        }
        if (name != null && !name.isBlank()) {
            return name;
        }
        return "Untitled";
    }

    public String getEffectiveReleaseDate() {
        if (releaseDate != null && !releaseDate.isBlank()) {
            return releaseDate;
        }
        if (firstAirDate != null && !firstAirDate.isBlank()) {
            return firstAirDate;
        }
        return null;
    }

    public Integer getEffectiveRuntimeMinutes() {
        if (runtime != null && runtime > 0) {
            return runtime;
        }
        if (episodeRunTime != null && !episodeRunTime.isEmpty()) {
            return episodeRunTime.get(0);
        }
        return null;
    }

    public String getEffectiveDirectorOrCreator() {
        // Check for Director in movie crew
        if (credits != null && credits.getCrew() != null) {
            String dir = credits.getCrew().stream()
                    .filter(c -> "Director".equalsIgnoreCase(c.getJob()))
                    .map(CrewMember::getName)
                    .findFirst()
                    .orElse(null);
            if (dir != null && !dir.isBlank()) {
                return dir;
            }
        }
        // Fallback to Creator in TV show
        if (createdBy != null && !createdBy.isEmpty()) {
            return createdBy.get(0).getName();
        }
        return null;
    }

    public String getResolvedMediaType() {
        boolean isAnimation = genres != null && genres.stream().anyMatch(g -> "Animation".equalsIgnoreCase(g.getName()) || (g.getId() != null && g.getId() == 16));
        boolean isJapanese = "ja".equalsIgnoreCase(originalLanguage) ||
                (originCountry != null && originCountry.contains("JP"));

        if (isAnimation && isJapanese) {
            return "ANIME";
        }

        if (numberOfSeasons != null || numberOfEpisodes != null || (title == null && name != null)) {
            return "TV";
        }

        return "MOVIE";
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CreatedBy {
        private Long id;
        private String name;
    }

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
