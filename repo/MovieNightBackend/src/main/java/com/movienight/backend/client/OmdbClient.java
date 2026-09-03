package com.movienight.backend.client;

import com.movienight.backend.dto.external.OmdbResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Optional;

/**
 * HTTP client for Open Movie Database (OMDb) API.
 * Enriches movies with Rotten Tomatoes scores and IMDb ratings using the movie's IMDb ID.
 */
@Component
@Slf4j
public class OmdbClient {

    private final RestClient restClient;
    private final String apiKey;
    private final String baseUrl;

    public OmdbClient(
            @Value("${app.omdb.api-key:PASTE_YOUR_OMDB_API_KEY_HERE}") String apiKey,
            @Value("${app.omdb.base-url:https://www.omdbapi.com}") String baseUrl
    ) {
        this.apiKey = apiKey != null ? apiKey.trim() : "";
        this.baseUrl = baseUrl;
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    /**
     * Check if a valid OMDb API key has been provided.
     */
    public boolean isConfigured() {
        return !apiKey.isBlank() && !apiKey.contains("PASTE_YOUR_OMDB_API_KEY_HERE");
    }

    /**
     * Fetch ratings from OMDb using the movie's IMDb ID (e.g. "tt3896198").
     */
    public Optional<OmdbResponse> getMovieRatings(String imdbId) {
        if (!isConfigured() || imdbId == null || imdbId.isBlank()) {
            return Optional.empty();
        }

        try {
            OmdbResponse response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .queryParam("i", imdbId.trim())
                            .queryParam("apikey", apiKey)
                            .build())
                    .retrieve()
                    .body(OmdbResponse.class);

            if (response != null && "True".equalsIgnoreCase(response.getResponse())) {
                return Optional.of(response);
            }
        } catch (Exception e) {
            log.error("Failed to fetch OMDb ratings for IMDb ID '{}': {}", imdbId, e.getMessage());
        }

        return Optional.empty();
    }

    /**
     * Extract Rotten Tomatoes score as integer percentage (e.g. "85%" -> 85).
     */
    public Integer extractRottenTomatoesScore(OmdbResponse response) {
        if (response == null || response.getRatings() == null) {
            return null;
        }

        return response.getRatings().stream()
                .filter(r -> "Rotten Tomatoes".equalsIgnoreCase(r.getSource()) && r.getValue() != null)
                .findFirst()
                .map(r -> {
                    try {
                        String clean = r.getValue().replace("%", "").trim();
                        return Integer.parseInt(clean);
                    } catch (NumberFormatException e) {
                        return null;
                    }
                })
                .orElse(null);
    }

    /**
     * Extract IMDb rating as Double (e.g. "7.6" -> 7.6).
     */
    public Double extractImdbRating(OmdbResponse response) {
        if (response == null || response.getImdbRating() == null || "N/A".equalsIgnoreCase(response.getImdbRating())) {
            return null;
        }

        try {
            return Double.parseDouble(response.getImdbRating().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
