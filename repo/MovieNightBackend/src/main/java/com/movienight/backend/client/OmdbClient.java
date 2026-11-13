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
        String cleaned = apiKey != null ? apiKey.trim() : "";
        if (cleaned.startsWith("\"") && cleaned.endsWith("\"") && cleaned.length() >= 2) {
            cleaned = cleaned.substring(1, cleaned.length() - 1).trim();
        }
        if (cleaned.startsWith("'") && cleaned.endsWith("'") && cleaned.length() >= 2) {
            cleaned = cleaned.substring(1, cleaned.length() - 1).trim();
        }
        this.apiKey = cleaned;
        this.baseUrl = baseUrl;
        org.springframework.http.client.SimpleClientHttpRequestFactory factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(3000);
        this.restClient = RestClient.builder().requestFactory(factory).baseUrl(baseUrl).build();
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
        return lookupRatings(imdbId).ratings();
    }

    /**
     * Fetch ratings and say why none came back: OMDb answered that it has no such title
     * ({@link Outcome#NOT_FOUND}), or there was no answer at all ({@link Outcome#NO_ANSWER}: not
     * configured, network or HTTP error, including OMDb's 401 for an exhausted daily limit).
     */
    public RatingsLookup lookupRatings(String imdbId) {
        if (!isConfigured() || imdbId == null || imdbId.isBlank()) {
            return RatingsLookup.NO_ANSWER;
        }

        try {
            OmdbResponse response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .queryParam("i", imdbId.trim())
                            .queryParam("apikey", apiKey)
                            .build())
                    .retrieve()
                    .body(OmdbResponse.class);

            if (response == null) return RatingsLookup.NO_ANSWER;
            return "True".equalsIgnoreCase(response.getResponse())
                    ? RatingsLookup.found(response) : RatingsLookup.NOT_FOUND;
        } catch (Exception e) {
            log.warn("OMDb enrichment failed for IMDb ID '{}'", imdbId);
            return RatingsLookup.NO_ANSWER;
        }
    }

    /** Result of one OMDb ratings lookup. */
    public record RatingsLookup(Outcome outcome, OmdbResponse response) {
        public enum Outcome { FOUND, NOT_FOUND, NO_ANSWER }

        public static final RatingsLookup NOT_FOUND = new RatingsLookup(Outcome.NOT_FOUND, null);
        public static final RatingsLookup NO_ANSWER = new RatingsLookup(Outcome.NO_ANSWER, null);

        public static RatingsLookup found(OmdbResponse response) {
            return new RatingsLookup(Outcome.FOUND, response);
        }

        public Optional<OmdbResponse> ratings() {
            return Optional.ofNullable(response);
        }
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
