package com.movienight.backend.client;

import com.movienight.backend.dto.external.TmdbMovieDetailsResponse;
import com.movienight.backend.dto.external.TmdbSearchResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriBuilder;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

/**
 * HTTP client for The Movie Database (TMDB) API.
 * Uses Spring Boot RestClient to fetch search results, posters, backdrops, cast, and trailers
 * across Movies, TV Series, and Anime. Supports both v3 API keys and v4 Bearer access tokens.
 */
@Component
@Slf4j
public class TmdbClient {

    private final RestClient restClient;
    private final String apiKey;
    private final String baseUrl;
    private final String imageBaseUrl;
    private final boolean isBearerToken;

    public TmdbClient(
            @Value("${app.tmdb.api-key:PASTE_YOUR_TMDB_API_KEY_HERE}") String apiKey,
            @Value("${app.tmdb.base-url:https://api.themoviedb.org/3}") String baseUrl,
            @Value("${app.tmdb.image-base-url:https://image.tmdb.org/t/p}") String imageBaseUrl
    ) {
        String cleaned = apiKey != null ? apiKey.trim() : "";
        if (cleaned.startsWith("\"") && cleaned.endsWith("\"") && cleaned.length() >= 2) {
            cleaned = cleaned.substring(1, cleaned.length() - 1).trim();
        }
        if (cleaned.startsWith("'") && cleaned.endsWith("'") && cleaned.length() >= 2) {
            cleaned = cleaned.substring(1, cleaned.length() - 1).trim();
        }
        if (cleaned.regionMatches(true, 0, "Bearer ", 0, 7)) {
            cleaned = cleaned.substring(7).trim();
        }
        this.apiKey = cleaned;
        this.baseUrl = baseUrl;
        this.imageBaseUrl = imageBaseUrl;
        this.isBearerToken = this.apiKey.startsWith("ey") || this.apiKey.length() > 40;

        RestClient.Builder builder = RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader("Accept", "application/json");

        if (this.isBearerToken && !this.apiKey.isBlank()) {
            builder.defaultHeader("Authorization", "Bearer " + this.apiKey);
        }
        this.restClient = builder.build();

        log.info("TMDB Client initialized: configured={}, isBearerToken={}, keyLength={}",
                isConfigured(), this.isBearerToken, this.apiKey.length());
    }

    /**
     * Check if a valid TMDB API key has been provided.
     */
    public boolean isConfigured() {
        return !apiKey.isBlank() && !apiKey.contains("PASTE_YOUR_TMDB_API_KEY_HERE");
    }

    private UriBuilder applyAuth(UriBuilder uriBuilder) {
        if (!isBearerToken && !apiKey.isBlank()) {
            return uriBuilder.queryParam("api_key", apiKey);
        }
        return uriBuilder;
    }

    /**
     * Unified multi-search across Movies, TV Series, and Anime on TMDB.
     */
    public List<TmdbSearchResponse.TmdbMovieSummary> searchMulti(String query) {
        if (!isConfigured()) {
            log.debug("TMDB API key not configured. Skipping TMDB multi-search for: {}", query);
            return Collections.emptyList();
        }

        try {
            TmdbSearchResponse response = restClient.get()
                    .uri(uriBuilder -> applyAuth(uriBuilder)
                            .path("/search/multi")
                            .queryParam("query", query)
                            .queryParam("include_adult", false)
                            .queryParam("language", "en-US")
                            .build())
                    .retrieve()
                    .body(TmdbSearchResponse.class);

            if (response != null && response.getResults() != null) {
                return response.getResults().stream()
                        .filter(item -> !"person".equalsIgnoreCase(item.getMediaType()))
                        .toList();
            }
        } catch (Exception e) {
            log.error("Failed to search TMDB (multi) for query '{}': {}", query, e.getMessage());
        }

        return Collections.emptyList();
    }

    /**
     * Search catalog items (searches movies, TV series, and anime via multi-search).
     */
    public List<TmdbSearchResponse.TmdbMovieSummary> searchMovies(String query) {
        return searchMulti(query);
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
                    .uri(uriBuilder -> applyAuth(uriBuilder)
                            .path("/movie/{id}")
                            .queryParam("append_to_response", "credits,videos")
                            .build(tmdbId))
                    .retrieve()
                    .body(TmdbMovieDetailsResponse.class);

            return Optional.ofNullable(response);
        } catch (Exception e) {
            log.warn("TMDB movie lookup failed for ID {}: {}", tmdbId, e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Fetch complete TV series or Anime details including seasons, episodes, cast, and trailer.
     */
    public Optional<TmdbMovieDetailsResponse> getTvDetails(Long tmdbId) {
        if (!isConfigured() || tmdbId == null) {
            return Optional.empty();
        }

        try {
            TmdbMovieDetailsResponse response = restClient.get()
                    .uri(uriBuilder -> applyAuth(uriBuilder)
                            .path("/tv/{id}")
                            .queryParam("append_to_response", "credits,videos")
                            .build(tmdbId))
                    .retrieve()
                    .body(TmdbMovieDetailsResponse.class);

            return Optional.ofNullable(response);
        } catch (Exception e) {
            log.warn("TMDB TV lookup failed for ID {}: {}", tmdbId, e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Fetch media details intelligently across movie or TV endpoints with fallback.
     */
    public Optional<TmdbMovieDetailsResponse> getMediaDetails(Long tmdbId, String mediaTypeHint) {
        if (mediaTypeHint != null) {
            String normalized = mediaTypeHint.trim().toUpperCase();
            if (normalized.contains("TV") || normalized.contains("ANIME")) {
                Optional<TmdbMovieDetailsResponse> tv = getTvDetails(tmdbId);
                if (tv.isPresent()) return tv;
                return getMovieDetails(tmdbId);
            }
        }

        Optional<TmdbMovieDetailsResponse> movie = getMovieDetails(tmdbId);
        if (movie.isPresent()) {
            return movie;
        }
        return getTvDetails(tmdbId);
    }

    /**
     * Discover movies with customized sorting, vote counts, and release windows for list caching.
     */
    public List<TmdbSearchResponse.TmdbMovieSummary> discoverMovies(
            String sortBy,
            Integer minVoteCount,
            String primaryReleaseDateGte,
            String primaryReleaseDateLte,
            int page
    ) {
        if (!isConfigured()) {
            return Collections.emptyList();
        }

        try {
            TmdbSearchResponse response = restClient.get()
                    .uri(uriBuilder -> {
                        var builder = applyAuth(uriBuilder)
                                .path("/discover/movie")
                                .queryParam("include_adult", false)
                                .queryParam("include_video", false)
                                .queryParam("language", "en-US")
                                .queryParam("page", Math.max(1, page));

                        if (sortBy != null && !sortBy.isBlank()) {
                            builder.queryParam("sort_by", sortBy);
                        }
                        if (minVoteCount != null && minVoteCount > 0) {
                            builder.queryParam("vote_count.gte", minVoteCount);
                        }
                        if (primaryReleaseDateGte != null && !primaryReleaseDateGte.isBlank()) {
                            builder.queryParam("primary_release_date.gte", primaryReleaseDateGte);
                        }
                        if (primaryReleaseDateLte != null && !primaryReleaseDateLte.isBlank()) {
                            builder.queryParam("primary_release_date.lte", primaryReleaseDateLte);
                        }

                        return builder.build();
                    })
                    .retrieve()
                    .body(TmdbSearchResponse.class);

            if (response != null && response.getResults() != null) {
                return response.getResults();
            }
        } catch (Exception e) {
            log.error("Failed to discover movies on TMDB (sortBy: {}, page: {}): {}", sortBy, page, e.getMessage());
        }

        return Collections.emptyList();
    }

    /**
     * Discover TV series with customized filters for list caching.
     */
    public List<TmdbSearchResponse.TmdbMovieSummary> discoverTv(
            String sortBy,
            Integer minVoteCount,
            String firstAirDateGte,
            String firstAirDateLte,
            String airDateGte,
            String airDateLte,
            String withGenres,
            String withOriginalLanguage,
            int page
    ) {
        if (!isConfigured()) {
            return Collections.emptyList();
        }

        try {
            TmdbSearchResponse response = restClient.get()
                    .uri(uriBuilder -> {
                        var builder = applyAuth(uriBuilder)
                                .path("/discover/tv")
                                .queryParam("include_adult", false)
                                .queryParam("language", "en-US")
                                .queryParam("page", Math.max(1, page));

                        if (sortBy != null && !sortBy.isBlank()) {
                            builder.queryParam("sort_by", sortBy);
                        }
                        if (minVoteCount != null && minVoteCount > 0) {
                            builder.queryParam("vote_count.gte", minVoteCount);
                        }
                        if (firstAirDateGte != null && !firstAirDateGte.isBlank()) {
                            builder.queryParam("first_air_date.gte", firstAirDateGte);
                        }
                        if (firstAirDateLte != null && !firstAirDateLte.isBlank()) {
                            builder.queryParam("first_air_date.lte", firstAirDateLte);
                        }
                        if (airDateGte != null && !airDateGte.isBlank()) {
                            builder.queryParam("air_date.gte", airDateGte);
                        }
                        if (airDateLte != null && !airDateLte.isBlank()) {
                            builder.queryParam("air_date.lte", airDateLte);
                        }
                        if (withGenres != null && !withGenres.isBlank()) {
                            builder.queryParam("with_genres", withGenres);
                        }
                        if (withOriginalLanguage != null && !withOriginalLanguage.isBlank()) {
                            builder.queryParam("with_original_language", withOriginalLanguage);
                        }

                        return builder.build();
                    })
                    .retrieve()
                    .body(TmdbSearchResponse.class);

            if (response != null && response.getResults() != null) {
                return response.getResults();
            }
        } catch (Exception e) {
            log.error("Failed to discover TV on TMDB: {}", e.getMessage());
        }

        return Collections.emptyList();
    }

    /**
     * TV series currently on the air.
     */
    public List<TmdbSearchResponse.TmdbMovieSummary> getTvOnTheAir(int page) {
        if (!isConfigured()) {
            return Collections.emptyList();
        }

        try {
            TmdbSearchResponse response = restClient.get()
                    .uri(uriBuilder -> applyAuth(uriBuilder)
                            .path("/tv/on_the_air")
                            .queryParam("language", "en-US")
                            .queryParam("page", Math.max(1, page))
                            .build())
                    .retrieve()
                    .body(TmdbSearchResponse.class);

            if (response != null && response.getResults() != null) {
                return response.getResults();
            }
        } catch (Exception e) {
            log.error("Failed to fetch on-the-air TV series on TMDB: {}", e.getMessage());
        }

        return Collections.emptyList();
    }

    /**
     * Fetch recommendations for a specific movie.
     */
    public List<TmdbSearchResponse.TmdbMovieSummary> getMovieRecommendations(Long movieId, int page) {
        if (!isConfigured() || movieId == null) {
            return Collections.emptyList();
        }

        try {
            TmdbSearchResponse response = restClient.get()
                    .uri(uriBuilder -> applyAuth(uriBuilder)
                            .path("/movie/{id}/recommendations")
                            .queryParam("language", "en-US")
                            .queryParam("page", Math.max(1, page))
                            .build(movieId))
                    .retrieve()
                    .body(TmdbSearchResponse.class);

            if (response != null && response.getResults() != null) {
                return response.getResults();
            }
        } catch (Exception e) {
            log.debug("Failed to fetch movie recommendations for TMDB ID {}: {}", movieId, e.getMessage());
        }

        return Collections.emptyList();
    }

    /**
     * Fetch recommendations for a specific TV show or anime.
     */
    public List<TmdbSearchResponse.TmdbMovieSummary> getTvRecommendations(Long tvId, int page) {
        if (!isConfigured() || tvId == null) {
            return Collections.emptyList();
        }

        try {
            TmdbSearchResponse response = restClient.get()
                    .uri(uriBuilder -> applyAuth(uriBuilder)
                            .path("/tv/{id}/recommendations")
                            .queryParam("language", "en-US")
                            .queryParam("page", Math.max(1, page))
                            .build(tvId))
                    .retrieve()
                    .body(TmdbSearchResponse.class);

            if (response != null && response.getResults() != null) {
                return response.getResults();
            }
        } catch (Exception e) {
            log.debug("Failed to fetch TV recommendations for TMDB ID {}: {}", tvId, e.getMessage());
        }

        return Collections.emptyList();
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
