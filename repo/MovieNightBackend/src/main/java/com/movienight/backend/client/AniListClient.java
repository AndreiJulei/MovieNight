package com.movienight.backend.client;

import tools.jackson.databind.JsonNode;
import com.movienight.backend.dto.external.AniListMedia;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Server-side AniList GraphQL client (public reads, no key). It only enriches TMDB titles; it never
 * supplies identity. Any failure surfaces as {@link AniListUnavailableException}; nothing is invented.
 */
@Component
@Slf4j
public class AniListClient {
    /** A 429 whose Retry-After is within this bound is waited out once; a longer wait is reported instead. */
    static final long MAX_INLINE_RETRY_SECONDS = 10;
    static final int PAGE_SIZE = 25;
    /** Default spacing between requests: ~85/min, under AniList's ~90/min limit. */
    static final long DEFAULT_MIN_INTERVAL_MS = 700;

    private static final String QUERY = """
            query ($search: String, $perPage: Int) {
              Page(perPage: $perPage) {
                media(search: $search, type: ANIME, format_in: [TV, ONA]) {
                  id idMal format isAdult genres meanScore popularity episodes seasonYear
                  title { romaji english native }
                  synonyms
                  tags { name rank }
                }
              }
            }""";

    private final RestClient restClient;
    private final boolean enabled;
    private final Sleeper sleeper;
    private final long minIntervalMillis;
    private long lastRequestNanos;

    @FunctionalInterface
    interface Sleeper { void sleep(long millis) throws InterruptedException; }

    @Autowired
    public AniListClient(
            @Value("${app.anilist.base-url:https://graphql.anilist.co}") String baseUrl,
            @Value("${app.anilist.enabled:true}") boolean enabled,
            @Value("${app.anilist.min-interval-ms:" + DEFAULT_MIN_INTERVAL_MS + "}") long minIntervalMillis) {
        this(baseUrl, enabled, Thread::sleep, minIntervalMillis);
    }

    AniListClient(String baseUrl, boolean enabled, Sleeper sleeper, long minIntervalMillis) {
        this.minIntervalMillis = minIntervalMillis;
        org.springframework.http.client.SimpleClientHttpRequestFactory factory =
                new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(10000);
        this.restClient = RestClient.builder().requestFactory(factory).baseUrl(baseUrl)
                .defaultHeader("Accept", "application/json").build();
        this.enabled = enabled;
        this.sleeper = sleeper;
    }

    public boolean isEnabled() { return enabled; }

    /** Search TV/ONA anime by title. Empty list means AniList answered with no results. */
    public List<AniListMedia> searchAnime(String title) {
        Map<String, Object> body = Map.of("query", QUERY,
                "variables", Map.of("search", title, "perPage", PAGE_SIZE));
        JsonNode response;
        try {
            response = post(body);
        } catch (HttpClientErrorException.TooManyRequests limited) {
            long wait = retryAfter(limited);
            if (wait <= 0 || wait > MAX_INLINE_RETRY_SECONDS) throw rateLimited(limited, wait);
            pause(wait);
            try {
                response = post(body);
            } catch (HttpClientErrorException.TooManyRequests again) {
                throw rateLimited(again, retryAfter(again));
            } catch (RestClientException failure) {
                throw unavailable(failure);
            }
        } catch (RestClientException failure) {
            throw unavailable(failure);
        }
        return parse(response);
    }

    /** Space requests so a cold rebuild stays under the provider's rate limit. */
    private synchronized void pace() {
        long wait = minIntervalMillis - (System.nanoTime() - lastRequestNanos) / 1_000_000;
        if (lastRequestNanos != 0 && wait > 0) {
            try { sleeper.sleep(wait); }
            catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new AniListUnavailableException("AniList request interrupted", 0, interrupted);
            }
        }
        lastRequestNanos = System.nanoTime();
    }

    private JsonNode post(Map<String, Object> body) {
        pace();
        return restClient.post().contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(JsonNode.class);
    }

    private long retryAfter(HttpClientErrorException error) {
        String header = error.getResponseHeaders() == null ? null : error.getResponseHeaders().getFirst("Retry-After");
        try { return header == null ? 0 : Long.parseLong(header.trim()); }
        catch (NumberFormatException invalid) { return 0; }
    }

    private void pause(long seconds) {
        try { sleeper.sleep(seconds * 1000); }
        catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AniListUnavailableException("AniList retry interrupted", 0, interrupted);
        }
    }

    private AniListUnavailableException rateLimited(Exception cause, long retryAfter) {
        return new AniListUnavailableException("AniList rate limited; retry later", retryAfter, cause);
    }

    private AniListUnavailableException unavailable(Exception cause) {
        log.warn("AniList request failed: {}", cause.getClass().getSimpleName());
        return new AniListUnavailableException("AniList unavailable", 0, cause);
    }

    private List<AniListMedia> parse(JsonNode response) {
        if (response == null || response.hasNonNull("errors") && !response.get("errors").isEmpty()
                || !response.path("data").path("Page").path("media").isArray()) {
            throw new AniListUnavailableException("AniList returned an invalid response", 0, null);
        }
        List<AniListMedia> result = new ArrayList<>();
        for (JsonNode node : response.get("data").get("Page").get("media")) {
            List<String> titles = new ArrayList<>();
            for (String key : List.of("romaji", "english", "native"))
                if (node.path("title").hasNonNull(key)) titles.add(node.get("title").get(key).asText());
            node.path("synonyms").forEach(s -> titles.add(s.asText()));
            List<String> genres = new ArrayList<>();
            node.path("genres").forEach(g -> genres.add(g.asText()));
            List<AniListMedia.Tag> tags = new ArrayList<>();
            node.path("tags").forEach(t -> tags.add(new AniListMedia.Tag(t.path("name").asText(), t.path("rank").asInt(0))));
            result.add(new AniListMedia(node.path("id").asLong(), node.hasNonNull("idMal") ? node.get("idMal").asLong() : null,
                    node.path("format").asText(null), node.path("isAdult").asBoolean(false), genres, tags,
                    intOrNull(node, "meanScore"), intOrNull(node, "popularity"), intOrNull(node, "episodes"),
                    intOrNull(node, "seasonYear"), titles));
        }
        return result;
    }

    private Integer intOrNull(JsonNode node, String field) {
        return node.hasNonNull(field) ? node.get(field).asInt() : null;
    }
}
