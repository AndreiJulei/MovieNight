package com.movienight.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Data transfer object representing the objective facts of a movie
 * from our shared catalog.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MovieResponse {
    private Long id;
    private Long tmdbId;
    private String imdbId;
    private String title;
    private Integer releaseYear;
    private String overview;
    private String posterUrl;
    private String backdropUrl;
    private String logoUrl;
    private String genres;
    private Integer runtimeMinutes;
    private String trailerKey;
    private String director;
    private String castMembers;
    private List<CastMemberDto> cast;
    private String mediaType;
    private Integer seasonsCount;
    private Integer episodesCount;
    private Double imdbRating;
    private Integer rottenTomatoesRating;
    private Double tmdbVoteAverage;
    private Integer tmdbVoteCount;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CastMemberDto {
        private String name;
        private String role;
        private String profileUrl;
    }
}
