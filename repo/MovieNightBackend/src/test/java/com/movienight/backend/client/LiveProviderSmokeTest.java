package com.movienight.backend.client;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import static org.junit.jupiter.api.Assertions.assertTrue;

/** Opt-in live network checks. No database, fixtures, responses or credential URLs are printed. */
@SpringJUnitConfig(classes = {TmdbClient.class, OmdbClient.class})
@TestPropertySource(locations = "classpath:application-postgres.properties")
@EnabledIfEnvironmentVariable(named = "MN_LIVE_PROVIDER_SMOKE", matches = "true")
class LiveProviderSmokeTest {
    @Autowired TmdbClient tmdb;
    @Autowired OmdbClient omdb;

    @Test
    void tmdbMovieLookupUsesConfiguredBackendClient() {
        boolean success;
        try {
            success = tmdb.isConfigured() && tmdb.getMovieDetails(550L)
                    .map(movie -> "tt0137523".equals(movie.getImdbId())).orElse(false);
        } catch (Exception failure) {
            success = false;
        }
        assertTrue(success, "TMDB controlled movie lookup failed (details suppressed)");
    }

    @Test
    void omdbMovieLookupUsesConfiguredBackendClient() {
        boolean success;
        try {
            success = omdb.isConfigured() && omdb.getMovieRatings("tt0137523").isPresent();
        } catch (Exception failure) {
            success = false;
        }
        assertTrue(success, "OMDb controlled IMDb lookup failed (details suppressed)");
    }
}
