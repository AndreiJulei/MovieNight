package com.movienight.backend.dto.external;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;

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

    private Images images;

    public String getEffectiveTitle() {
        if (title != null && !title.isBlank()) {
            return title;
        }
        if (name != null && !name.isBlank()) {
            return name;
        }
        return null;
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
        return getResolvedMediaType(numberOfSeasons != null || numberOfEpisodes != null || (title == null && name != null)
                ? com.movienight.backend.model.ResourceType.TV : com.movienight.backend.model.ResourceType.MOVIE);
    }

    public String getResolvedMediaType(com.movienight.backend.model.ResourceType resourceType) {
        boolean isAnimation = genres != null && genres.stream().anyMatch(g -> "Animation".equalsIgnoreCase(g.getName()) || (g.getId() != null && g.getId() == 16));
        return resourceType.classify(isAnimation, originalLanguage, originCountry);
    }

    /**
     * Selects the highest-rated transparent PNG logo from TMDB images,
     * preferring English (iso_639_1 == "en"), with graceful fallbacks.
     */
    public String getEffectiveLogoPath() {
        if (images == null || images.getLogos() == null || images.getLogos().isEmpty()) {
            return null;
        }

        List<Logo> validLogos = images.getLogos().stream()
                .filter(l -> l.getFilePath() != null && !l.getFilePath().isBlank())
                .toList();

        if (validLogos.isEmpty()) {
            return null;
        }

        Predicate<Logo> isPng = l -> l.getFilePath().toLowerCase().endsWith(".png");
        Predicate<Logo> isEnglish = l -> "en".equalsIgnoreCase(l.getIso6391());

        Comparator<Logo> ratingComparator = Comparator
                .comparing((Logo l) -> l.getVoteAverage() != null ? l.getVoteAverage() : 0.0, Comparator.reverseOrder())
                .thenComparing(l -> l.getVoteCount() != null ? l.getVoteCount() : 0, Comparator.reverseOrder());

        // 1. English transparent PNG logos (highest-rated)
        Optional<Logo> bestEnglishPng = findBestLogo(validLogos, isEnglish.and(isPng), ratingComparator);
        if (bestEnglishPng.isPresent()) {
            return bestEnglishPng.get().getFilePath();
        }

        // 2. Language-neutral (null/blank ISO) PNG logos
        Optional<Logo> bestNeutralPng = findBestLogo(validLogos,
                l -> (l.getIso6391() == null || l.getIso6391().isBlank()) && isPng.test(l), ratingComparator);
        if (bestNeutralPng.isPresent()) {
            return bestNeutralPng.get().getFilePath();
        }

        // 3. English logo asset in any valid format (e.g. SVG branding)
        Optional<Logo> bestEnglish = findBestLogo(validLogos, isEnglish, ratingComparator);
        if (bestEnglish.isPresent()) {
            return bestEnglish.get().getFilePath();
        }

        // 4. Any language transparent PNG logos
        Optional<Logo> bestAnyPng = findBestLogo(validLogos, isPng, ratingComparator);
        if (bestAnyPng.isPresent()) {
            return bestAnyPng.get().getFilePath();
        }

        // 5. First valid logo asset fallback
        return validLogos.get(0).getFilePath();
    }

    private static Optional<Logo> findBestLogo(List<Logo> logos, Predicate<Logo> filter, Comparator<Logo> comparator) {
        return logos.stream().filter(filter).sorted(comparator).findFirst();
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
        @JsonProperty("profile_path")
        private String profilePath;
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

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Images {
        private List<Logo> logos = Collections.emptyList();
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Logo {
        @JsonProperty("aspect_ratio")
        private Double aspectRatio;

        @JsonProperty("file_path")
        private String filePath;

        private Integer height;

        private Integer width;

        @JsonProperty("iso_639_1")
        private String iso6391;

        @JsonProperty("vote_average")
        private Double voteAverage;

        @JsonProperty("vote_count")
        private Integer voteCount;
    }
}
