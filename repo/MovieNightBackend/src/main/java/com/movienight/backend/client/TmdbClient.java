package com.movienight.backend.client;

import com.movienight.backend.dto.external.TmdbMovieDetailsResponse;
import com.movienight.backend.dto.external.TmdbSearchResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

/**
 * HTTP client for The Movie Database (TMDB) API.
 * Uses Spring Boot RestClient to fetch search results, posters, backdrops, cast, and trailers.
 */
@Component
@Slf4j
public class TmdbClient {

    private final RestClient restClient;
    private final String apiKey;
    private final String baseUrl;
    private final String imageBaseUrl;

    public TmdbClient(
            @Value("${app.tmdb.api-key:PASTE_YOUR_TMDB_API_KEY_HERE}") String apiKey,
            @Value("${app.tmdb.base-url:https://api.themoviedb.org/3}") String baseUrl,
            @Value("${app.tmdb.image-base-url:https://image.tmdb.org/t/p}") String imageBaseUrl
    ) {
        this.apiKey = apiKey != null ? apiKey.trim() : "";
        this.baseUrl = baseUrl;
        this.imageBaseUrl = imageBaseUrl;
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    /**
     * Check if a valid TMDB API key has been provided.
     */
    public boolean isConfigured() {
        return !apiKey.isBlank() && !apiKey.contains("PASTE_YOUR_TMDB_API_KEY_HERE");
    }

    /**
     * Search movies by title query on TMDB.
     */
    public List<TmdbSearchResponse.TmdbMovieSummary> searchMovies(String query) {
        if (!isConfigured()) {
            log.debug("TMDB API key not configured. Skipping TMDB live search for: {}", query);
            return Collections.emptyList();
        }

        try {
            TmdbSearchResponse response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/search/movie")
                            .queryParam("api_key", apiKey)
                            .queryParam("query", query)
                            .queryParam("include_adult", false)
                            .build())
                    .retrieve()
                    .body(TmdbSearchResponse.class);

            if (response != null && response.getResults() != null) {
                return response.getResults();
            }
        } catch (Exception e) {
            log.error("Failed to search TMDB for query '{}': {}", query, e.getMessage());
        }

        return Collections.emptyList();
    }

    /**
     * Fetch complete movie details including cast, director, and YouTube trailer key.
     */
    public Optional<TmdbMovieDetailsResponse> getMovieDetails(Long tmdbId) {
        if (!isConfigured() || tmdbId == null) {
            return Optional.empty();
        }

        try {
            TmdbMovieDetailsResponse response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/movie/{id}")
                            .queryParam("api_key", apiKey)
                            .queryParam("append_to_response", "credits,videos")
                            .build(tmdbId))
                    .retrieve()
                    .body(TmdbMovieDetailsResponse.class);

            return Optional.ofNullable(response);
        } catch (Exception e) {
            log.error("Failed to fetch TMDB movie details for ID {}: {}", tmdbId, e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Helper to construct full vertical poster URL from relative poster path.
     */
    public String buildPosterUrl(String posterPath) {
        if (posterPath == null || posterPath.isBlank()) {
            return null;
        }
        return imageBaseUrl + "/w500" + posterPath;
    }

    /**
     * Helper to construct full horizontal backdrop URL from relative backdrop path.
     */
    public String buildBackdropUrl(String backdropPath) {
        if (backdropPath == null || backdropPath.isBlank()) {
            return null;
        }
        return imageBaseUrl + "/original" + backdropPath;
    }
}
