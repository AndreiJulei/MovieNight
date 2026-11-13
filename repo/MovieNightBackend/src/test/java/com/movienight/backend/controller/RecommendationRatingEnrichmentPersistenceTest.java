package com.movienight.backend.controller;

import com.movienight.backend.client.OmdbClient;
import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.external.OmdbResponse;
import com.movienight.backend.dto.external.TmdbMovieDetailsResponse;
import com.movienight.backend.model.Movie;
import com.movienight.backend.model.ResourceType;
import com.movienight.backend.repository.*;
import com.movienight.backend.service.RecommendationRatingEnricher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.LongStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** PD-08 (#24): bounded OMDb enrichment of recommendation candidates (30 per run, 300 per UTC day). */
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:rating-enrichment-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=", "app.omdb.api-key=",
    "app.jwt.secret=rating-enrichment-test-signing-key-at-least-32-bytes"
})
class RecommendationRatingEnrichmentPersistenceTest {

    @Autowired RecommendationRatingEnricher enricher;
    @Autowired MovieRepository catalog;
    @Autowired OmdbRequestBudgetRepository budget;
    @Autowired UserMovieEntryRepository entries;
    @MockitoBean OmdbClient omdb;
    @MockitoBean TmdbClient tmdb;

    @BeforeEach
    void setup() {
        reset(omdb, tmdb);
        entries.deleteAll();
        catalog.deleteAll();
        budget.deleteAll();
        when(omdb.isConfigured()).thenReturn(true);
        when(tmdb.isConfigured()).thenReturn(true);
        OmdbResponse response = new OmdbResponse();
        response.setResponse("True");
        when(omdb.lookupRatings(anyString())).thenReturn(OmdbClient.RatingsLookup.found(response));
        when(omdb.extractImdbRating(response)).thenReturn(7.9);
        when(omdb.extractRottenTomatoesScore(response)).thenReturn(88);
    }

    private Movie stored(long tmdbId, Double average, Integer votes) {
        return catalog.save(Movie.builder().tmdbId(tmdbId).imdbId("tt" + tmdbId).title("Title " + tmdbId)
                .mediaType("MOVIE").tmdbVoteAverage(average).tmdbVoteCount(votes).build());
    }

    private List<Long> eligibleUncached(long firstId, int count) {
        List<Long> ids = new ArrayList<>();
        LongStream.range(firstId, firstId + count).forEach(id -> ids.add(stored(id, 7.5, 2_000).getTmdbId()));
        return ids;
    }

    private Movie reload(long tmdbId) {
        return catalog.findByResourceTypeAndTmdbId(ResourceType.MOVIE, tmdbId).orElseThrow();
    }

    @Test
    void pr04_oneRunEnrichesAtMostThirtyCandidatesInRankOrder() {
        List<Long> ranked = eligibleUncached(1_000, 40);

        int requests = enricher.enrich(ranked);

        assertThat(requests).isEqualTo(30);
        verify(omdb, times(30)).lookupRatings(anyString());
        for (Long id : ranked.subList(0, 30)) {
            assertThat(reload(id).getImdbRating()).isEqualTo(7.9);
            assertThat(reload(id).getRottenTomatoesRating()).isEqualTo(88);
        }
        for (Long id : ranked.subList(30, 40)) assertThat(reload(id).getImdbRating()).isNull();
    }

    @Test
    void pr04_dailyRecommendationBudgetStopsAt300Requests() {
        List<Long> ranked = eligibleUncached(10_000, 330);

        int total = 0;
        for (int run = 0; run < 10; run++) total += enricher.enrich(ranked);
        int eleventh = enricher.enrich(ranked);

        assertThat(total).isEqualTo(300);
        assertThat(eleventh).isZero();
        verify(omdb, times(300)).lookupRatings(anyString());
    }

    @Test
    void cachedIneligibleAndAlreadyCheckedCandidatesSpendNoBudget() {
        Movie enriched = stored(20_001, 7.5, 2_000);
        enriched.setImdbRating(8.1);
        catalog.save(enriched);
        stored(20_002, 6.4, 50_000);   // below the audience floor
        stored(20_003, 8.0, 120);      // too few votes
        stored(20_004, null, null);    // no audience data
        when(omdb.lookupRatings("tt20005")).thenReturn(OmdbClient.RatingsLookup.NOT_FOUND);
        stored(20_005, 7.5, 2_000);    // OMDb has nothing for it

        assertThat(enricher.enrich(List.of(20_001L, 20_002L, 20_003L, 20_004L, 20_005L))).isEqualTo(1);
        // The empty answer is remembered, so the next run does not ask again.
        assertThat(enricher.enrich(List.of(20_001L, 20_002L, 20_003L, 20_004L, 20_005L))).isZero();
        verify(omdb, times(1)).lookupRatings(anyString());
    }

    @Test
    void candidateMissingFromTheCatalogIsFetchedFromTmdbThenEnriched() {
        TmdbMovieDetailsResponse details = new TmdbMovieDetailsResponse();
        details.setId(30_001L);
        details.setTitle("Fetched");
        details.setImdbId("tt30001");
        details.setReleaseDate("2010-07-16");
        details.setVoteAverage(8.3);
        details.setVoteCount(30_000);
        when(tmdb.getMovieDetails(30_001L)).thenReturn(Optional.of(details));

        assertThat(enricher.enrich(List.of(30_001L))).isEqualTo(1);

        Movie fetched = reload(30_001L);
        assertThat(fetched.getTmdbVoteAverage()).isEqualTo(8.3);
        assertThat(fetched.getImdbRating()).isEqualTo(7.9);
        verify(omdb, times(1)).lookupRatings("tt30001");
    }

    @Test
    void omdbGivingNoAnswerStopsTheRunAndLeavesTheTitleForTheNextRun() {
        List<Long> ranked = eligibleUncached(40_000, 10);
        when(omdb.lookupRatings(anyString())).thenReturn(OmdbClient.RatingsLookup.NO_ANSWER);

        int failedRun = enricher.enrich(ranked);

        // The first wave's requests went out; no further wave started once OMDb gave no answer.
        assertThat(failedRun).isBetween(1, 4);
        for (Long id : ranked) {
            assertThat(reload(id).getOmdbCheckedAt()).isNull();
            assertThat(reload(id).getImdbRating()).isNull();
        }

        OmdbResponse response = new OmdbResponse();
        response.setResponse("True");
        when(omdb.lookupRatings(anyString())).thenReturn(OmdbClient.RatingsLookup.found(response));
        when(omdb.extractImdbRating(response)).thenReturn(7.2);

        assertThat(enricher.enrich(ranked)).isEqualTo(10);
        assertThat(reload(ranked.get(0)).getImdbRating()).isEqualTo(7.2);
        assertThat(reload(ranked.get(0)).getOmdbCheckedAt()).isNotNull();
    }
}
