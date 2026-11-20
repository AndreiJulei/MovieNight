package com.movienight.backend.controller;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.model.*;
import com.movienight.backend.repository.*;
import com.movienight.backend.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:personal-recommendations-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=", "app.omdb.api-key=",
    "app.jwt.secret=personal-test-only-signing-key-at-least-32-bytes"
})
class PersonalRecommendationsPersistenceTest {
    @Autowired WebApplicationContext context;
    @Autowired UserRepository users;
    @Autowired MovieSimilarityRepository similarities;
    @Autowired CachedMovieListRepository cache;
    @Autowired MovieRepository catalog;
    @Autowired JwtTokenProvider tokens;
    @Autowired PersonalizedRecommendationRepository recommendations;
    @Autowired RecommendationDismissalRepository dismissalRows;
    @Autowired com.movienight.backend.service.SuggestionScheduler scheduler;
    @MockitoBean TmdbClient tmdb;
    @MockitoBean com.movienight.backend.client.AniListClient aniList; // disabled by default: no live AniList calls
    MockMvc mvc;
    User owner;
    static long nextId = 99600000;
    long seed, candidate;

    @BeforeEach void setup() {
        reset(tmdb);
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        String name = "personal-" + UUID.randomUUID();
        owner = users.save(User.builder().username(name).password("test").build());
        seed = nextId += 1000; candidate = seed + 1;
    }

    @Test void watchedMovieWeightsAndMovieOnlyMetadataSurviveIndependentReads() throws Exception {
        save(seed, "Seed", "MOVIE", "WATCHED", "7.5");
        save(seed + 10, "Zero", "MOVIE", "WATCHED", "0");
        save(seed + 11, "Unrated", "MOVIE", "WATCHED", "null");
        save(seed + 12, "Unwatched", "MOVIE", "WATCHLIST", "10");
        save(seed + 13, "TV", "TV", "WATCHED", "10");
        save(seed + 14, "Anime", "ANIME", "WATCHED", "10");
        neighbor(seed, candidate, 1); neighbor(seed + 10, candidate, .1);
        neighbor(seed + 11, candidate, 1); neighbor(seed + 12, candidate, 100);
        neighbor(seed + 13, candidate, 100); neighbor(seed + 14, candidate, 100);
        metadata(candidate, "MOVIE", "Real movie");
        metadata(candidate, "TV", "Wrong TV");
        for (int i=0; i<2; i++) {
            read("/api/suggestions/personal").andExpect(status().isOk())
                .andExpect(jsonPath("$.categories", hasSize(1)))
                .andExpect(jsonPath("$.categories[0].movies", hasSize(1)))
                .andExpect(jsonPath("$.categories[0].movies[0].title").value("Real movie"))
                .andExpect(jsonPath("$.categories[0].movies[0].score").value(closeTo(2.95 * 0.7, 1e-9)))
                .andExpect(jsonPath("$.categories[0].limitations", hasItem("TMDB_UNCONFIGURED")));
        }
    }

    @Test void ranksUnroundedTotalsWithStableTiesAndAppliesLimitAfterMetadataAndLibraryFiltering() throws Exception {
        save(seed, "Seed", "MOVIE", "WATCHED", "7.5");
        // The first forty would hide usable candidates if limited before metadata filtering.
        for (int i=100; i<140; i++) neighbor(seed, seed+i, 10);
        save(seed+150, "Already planned", "MOVIE", "WATCHLIST", "null");
        neighbor(seed, seed+150, 20); neighbor(seed, seed, 100);
        for (int i=1; i<=35; i++) { neighbor(seed, seed+i, 1); metadata(seed+i, "MOVIE", "Movie " + i); }
        // These scores display the same at two decimals, but the higher ID ranks first.
        neighbor(seed, seed+50, 1.001); metadata(seed+50, "MOVIE", "Precise");
        for (int attempt=0; attempt<2; attempt++) {
            refresh().andExpect(status().isOk());
            read("/api/suggestions/personal").andExpect(status().isOk())
                .andExpect(jsonPath("$.categories[0].movies", hasSize(30)))
                .andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(seed+50))
                .andExpect(jsonPath("$.categories[0].movies[1].tmdbId").value(seed+1))
                .andExpect(jsonPath("$.categories[0].movies[29].tmdbId").value(seed+29))
                .andExpect(jsonPath("$.categories[0].limitations", hasItems("METADATA_OMITTED", "LIBRARY_EXCLUDED")));
        }
    }

    @Test void distinguishesHistoryCoverageMetadataAndExhaustionWithoutDiscoveryFiller() throws Exception {
        metadata(candidate, "MOVIE", "Popular filler");
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].state").value("NO_HISTORY"));
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].state").value("INSUFFICIENT_COVERAGE"));
        neighbor(seed, candidate+1, 1);
        metadata(candidate+1, "TV", "TV is not a movie title");
        refresh().andExpect(status().isOk());
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].state").value("MISSING_METADATA"))
            .andExpect(jsonPath("$.categories[0].limitations", hasItem("METADATA_OMITTED")));
        metadata(candidate+1, "MOVIE", "Resolved");
        refresh().andExpect(status().isOk());
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].state").value("READY"))
            .andExpect(jsonPath("$.categories[0].movies[0].releaseYear").isEmpty())
            .andExpect(jsonPath("$.categories[0].movies[0].voteAverage").value(8.0));
        save(candidate+1, "Resolved", "MOVIE", "WATCHLIST", "null");
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].state").value("LIBRARY_EXHAUSTED"));
    }

    @Test void usesMovieProviderSummariesAndSumsSourcesWithDeterministicTopFiveSeedSelection() throws Exception {
        when(tmdb.isConfigured()).thenReturn(true);
        // Equal weights select lower IDs first, irrespective of library creation order.
        for (int i=5; i>=0; i--) save(seed+i*10, "Seed " + i, "MOVIE", "WATCHED", "7.5");
        var first = new com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary();
        first.setId(candidate); first.setTitle("Provider movie"); first.setVoteAverage(8.0); first.setVoteCount(300);
        var second = new com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary();
        second.setId(candidate+1); second.setTitle("Second movie"); second.setVoteAverage(8.0); second.setVoteCount(300);
        when(tmdb.getMovieRecommendations(seed, 1)).thenReturn(List.of(first, second));
        when(tmdb.getMovieRecommendations(seed+10, 1)).thenReturn(List.of(first));
        when(tmdb.getMovieRecommendations(seed+20, 1)).thenReturn(List.of());
        neighbor(seed, candidate, .5);
        refresh().andExpect(status().isOk());
        // RF03: the top five seeds, pages 1 and 2; never the sixth.
        for (int i=0; i<5; i++) { verify(tmdb).getMovieRecommendations(seed+i*10, 1); verify(tmdb).getMovieRecommendations(seed+i*10, 2); }
        verify(tmdb, never()).getMovieRecommendations(eq(seed+50), anyInt());
        read("/api/suggestions/personal").andExpect(status().isOk())
            .andExpect(jsonPath("$.categories[0].movies", hasSize(2)))
            .andExpect(jsonPath("$.categories[0].movies[0].score").value(closeTo(3.0 * 0.7, 1e-9)))
            .andExpect(jsonPath("$.categories[0].movies[1].score").value(closeTo(.96 * 0.7, 1e-9)))
            .andExpect(jsonPath("$.categories[0].movies[0].title").value("Provider movie"))
            .andExpect(jsonPath("$.categories[0].limitations", hasItem("PARTIAL_COVERAGE")));
    }

    @Test void failedForcedRefreshCannotServeStaleSuccessAndCanBeRetried() throws Exception {
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        metadata(candidate, "MOVIE", "Candidate"); neighbor(seed, candidate, 1);
        refresh().andExpect(status().isOk());
        when(tmdb.isConfigured()).thenReturn(true);
        when(tmdb.getMovieRecommendations(seed, 1)).thenThrow(new IllegalStateException("Provider unavailable"));
        refresh().andExpect(status().is5xxServerError());
        scheduler.recalculateDirtyUserRecommendations();
        read("/api/suggestions/personal").andExpect(status().is5xxServerError());
        read("/api/movies/library").andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)));
        doReturn(List.of()).when(tmdb).getMovieRecommendations(seed, 1);
        refresh().andExpect(status().isOk());
        read("/api/suggestions/personal").andExpect(status().isOk())
            .andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(candidate));
    }

    @Test void currentMovieExclusionsIgnoreTvCollisionsAndCustomListsAndReadsNeverSave() throws Exception {
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        save(candidate, "TV with same ID", "TV", "WATCHED", "10");
        metadata(candidate, "MOVIE", "Distinct movie"); neighbor(seed, candidate, 1);
        read("/api/suggestions/personal").andExpect(status().isOk())
            .andExpect(jsonPath("$.categories[0].movies[0].title").value("Distinct movie"));
        read("/api/movies/library").andExpect(jsonPath("$", hasSize(2)));
        // A separate movie exists only in a private custom list, not in this owner's library.
        metadata(candidate+1, "MOVIE", "List movie"); neighbor(seed, candidate+1, 1);
        Movie listMovie = catalog.save(Movie.builder().tmdbId(candidate+1).title("List movie").mediaType("MOVIE").build());
        mvc.perform(post("/api/lists").header("Authorization", token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"Private\",\"initialMovieIds\":[" + listMovie.getId() + "]}"))
            .andExpect(status().isCreated());
        refresh().andExpect(status().isOk());
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(2)));
    }

    @Test void savingRecommendedMovieCoexistsWithEqualIdTvLibraryEntry() throws Exception {
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        save(candidate, "TV with same ID", "TV", "WATCHLIST", "null");
        metadata(candidate, "MOVIE", "Distinct movie"); neighbor(seed, candidate, 1);
        read("/api/suggestions/personal").andExpect(status().isOk())
            .andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(candidate));

        mvc.perform(post("/api/movies/library").header("Authorization", token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"tmdbId\":" + candidate + ",\"title\":\"Distinct movie\",\"mediaType\":\"MOVIE\",\"status\":\"WATCHLIST\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.movie.mediaType").value("MOVIE"));

        read("/api/movies/library").andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(3)))
            .andExpect(jsonPath("$[?(@.movie.tmdbId == " + candidate + ")].movie.mediaType", hasItem("TV")));
        read("/api/suggestions/personal").andExpect(status().isOk())
            .andExpect(jsonPath("$.categories[0].movies", hasSize(0)));
    }

    @Test void authenticatedOwnersAndScheduledRecomputationIgnoreLegacyMixedRows() throws Exception {
        mvc.perform(get("/api/suggestions/personal")).andExpect(status().isForbidden());
        mvc.perform(post("/api/suggestions/personalized/refresh")).andExpect(status().isForbidden());
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        metadata(candidate, "MOVIE", "Movie"); neighbor(seed, candidate, 1);
        recommendations.save(PersonalizedRecommendation.builder().user(owner).tmdbId(candidate)
            .mediaType("TV").title("Legacy TV").score(20.0).rankOrder(1).build());
        scheduler.recalculateDirtyUserRecommendations();
        read("/api/suggestions/personal").andExpect(status().isOk())
            .andExpect(jsonPath("$.categories", hasSize(1)))
            .andExpect(jsonPath("$.categories[0].movies[0].title").value("Movie"));
        read("/api/suggestions").andExpect(status().isOk())
            .andExpect(jsonPath("$.categories[0].movies[0].title").value("Movie"));
        String name = "other-" + UUID.randomUUID();
        owner = users.save(User.builder().username(name).password("test").build());
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].state").value("NO_HISTORY"))
            .andExpect(jsonPath("$.categories[0].movies", hasSize(0)));
    }

    @Test void detailsFailedAndRepeatedExplicitSavesPreserveLibraryAndInvalidateCachedReads() throws Exception {
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        neighbor(seed, candidate, 1); metadata(candidate, "MOVIE", "Candidate");
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(1)));
        read("/api/movies/tmdb/" + candidate + "?mediaType=MOVIE").andExpect(status().isOk());
        read("/api/movies/library").andExpect(jsonPath("$", hasSize(1)));
        mvc.perform(post("/api/movies/library").header("Authorization", token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"tmdbId\":" + candidate + ",\"title\":\"Candidate\",\"status\":\"WATCHED\",\"personalRating\":11}"))
            .andExpect(status().isBadRequest());
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(1)));
        save(candidate, "Candidate", "MOVIE", "WATCHLIST", "null");
        save(candidate, "Candidate", "MOVIE", "WATCHLIST", "null");
        // Simulate a clean cache marker to exercise exclusions independently of recomputation.
        User persisted = users.findById(owner.getId()).orElseThrow();
        persisted.setNeedsRecommendationRefresh(false); users.saveAndFlush(persisted);
        for (int i=0; i<2; i++) {
            read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(0)))
                .andExpect(jsonPath("$.categories[0].state").value("LIBRARY_EXHAUSTED"));
            read("/api/movies/library").andExpect(jsonPath("$", hasSize(2)));
        }
    }

    @Test void nonpositivePreferencesAndBlankMovieTitlesNeverBecomeFiller() throws Exception {
        save(seed, "Zero", "MOVIE", "WATCHED", "0");
        neighbor(seed, candidate, 1); metadata(candidate, "MOVIE", "Would be negative");
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].state").value("INSUFFICIENT_COVERAGE"))
            .andExpect(jsonPath("$.categories[0].movies", hasSize(0)));
        save(seed+10, "Positive", "MOVIE", "WATCHED", "null");
        neighbor(seed+10, candidate+1, 1); metadata(candidate+1, "MOVIE", "  ");
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].state").value("MISSING_METADATA"));
    }

    @Test void personalReasonNamesRealContributorsAndKeepsAudienceSeparateFromImdb() throws Exception {
        save(seed, "Watched Alpha", "MOVIE", "WATCHED", "7.5");
        save(seed + 10, "Watched Beta", "MOVIE", "WATCHED", "8");
        neighbor(seed, candidate, 1);
        neighbor(seed + 10, candidate, .5);
        catalog.save(Movie.builder().tmdbId(candidate).mediaType("MOVIE").title("Candidate")
            .tmdbVoteAverage(8.2).tmdbVoteCount(400).imdbRating(7.9).build());
        read("/api/suggestions/personal").andExpect(status().isOk())
            .andExpect(jsonPath("$.categories[0].movies[0].reason")
                .value("Because you watched Watched Alpha and Watched Beta (MovieLens similarity)"))
            .andExpect(jsonPath("$.categories[0].movies[0].voteAverage").value(8.2))
            .andExpect(jsonPath("$.categories[0].movies[0].voteCount").value(400))
            .andExpect(jsonPath("$.categories[0].movies[0].imdbRating").value(7.9));
    }

    @Test void sc01_sc02_scoresTheCatalogGainsAfterTheRecomputationShowWithoutOne() throws Exception {
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        neighbor(seed, candidate, 1);
        Movie row = catalog.save(Movie.builder().tmdbId(candidate).mediaType("MOVIE").title("Candidate")
            .tmdbVoteAverage(8.2).tmdbVoteCount(400).build());
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(candidate))
            .andExpect(jsonPath("$.categories[0].movies[0].imdbRating").isEmpty())
            .andExpect(jsonPath("$.categories[0].movies[0].rottenTomatoesRating").isEmpty());
        // A title-page visit (or another user's enrichment) stores both scores after the recomputation.
        row.setImdbRating(8.1); row.setRottenTomatoesRating(94);
        catalog.save(row);

        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies[0].imdbRating").value(8.1))
            .andExpect(jsonPath("$.categories[0].movies[0].rottenTomatoesRating").value(94.0));
    }

    @Test void rm01_dismissedTitleStaysGoneAfterReloadAndRecompute() throws Exception {
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        neighbor(seed, candidate, 2); metadata(candidate, "MOVIE", "Not for me");
        neighbor(seed, candidate + 1, 1); metadata(candidate + 1, "MOVIE", "Next one");
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(candidate));

        dismiss(candidate).andExpect(status().isNoContent());

        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(1)))
            .andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(candidate + 1));
        refresh().andExpect(status().isOk());
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(1)))
            .andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(candidate + 1));
    }

    @Test void rm02_rf01_nextStoredTitleTakesTheFreedPlaceWithoutARecompute() throws Exception {
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        // 45 candidates in a fixed order: seed+1 ranks first, seed+45 last; all are stored, 30 are served.
        for (int i = 1; i <= 45; i++) { neighbor(seed, seed + i, 2 - i * .01); metadata(seed + i, "MOVIE", "Movie " + i); }
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(30)))
            .andExpect(jsonPath("$.categories[0].movies[20].tmdbId").value(seed + 21));
        // Changing the candidates afterwards shows whether the read recomputed.
        neighbor(seed, seed + 99, 50); metadata(seed + 99, "MOVIE", "Would only appear after a recompute");

        dismiss(seed + 3).andExpect(status().isNoContent());

        // Home shows the first 20 (the stored 21st slides in); View all still shows 30, now with the stored 31st.
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(30)))
            .andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(seed + 1))
            .andExpect(jsonPath("$.categories[0].movies[2].tmdbId").value(seed + 4))
            .andExpect(jsonPath("$.categories[0].movies[19].tmdbId").value(seed + 21))
            .andExpect(jsonPath("$.categories[0].movies[29].tmdbId").value(seed + 31))
            .andExpect(jsonPath("$.categories[0].movies[*].tmdbId", not(hasItem((int) (seed + 99)))));
    }

    @Test void rf02_aLowReserveMarksTheUserAndTheNextReadRecomputes() throws Exception {
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        for (int i = 1; i <= 45; i++) { neighbor(seed, seed + i, 2 - i * .01); metadata(seed + i, "MOVIE", "Movie " + i); }
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(30)));
        neighbor(seed, seed + 99, 50); metadata(seed + 99, "MOVIE", "Only after a recompute");

        // 45 stored, 5 dismissed: 40 undismissed rows are still enough.
        for (int i = 1; i <= 5; i++) dismiss(seed + i).andExpect(status().isNoContent());
        assertEquals(false, users.findById(owner.getId()).orElseThrow().isNeedsRecommendationRefresh());
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies[*].tmdbId", not(hasItem((int) (seed + 99)))));

        // The sixth leaves 39: the user is marked, and the next read recomputes from the current pool.
        dismiss(seed + 6).andExpect(status().isNoContent());
        assertEquals(true, users.findById(owner.getId()).orElseThrow().isNeedsRecommendationRefresh());
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(30)))
            .andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(seed + 99))
            .andExpect(jsonPath("$.categories[0].movies[*].tmdbId", not(hasItem((int) (seed + 6)))));
    }

    @Test void rm03_undoRestoresTheTitleToItsPosition() throws Exception {
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        for (int i = 1; i <= 3; i++) { neighbor(seed, seed + i, 2 - i * .01); metadata(seed + i, "MOVIE", "Movie " + i); }
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies[1].tmdbId").value(seed + 2));
        dismiss(seed + 2).andExpect(status().isNoContent());
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(2)));

        undo(seed + 2).andExpect(status().isNoContent());
        undo(seed + 2).andExpect(status().isNoContent());

        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(3)))
            .andExpect(jsonPath("$.categories[0].movies[1].tmdbId").value(seed + 2));
        refresh().andExpect(status().isOk());
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies[1].tmdbId").value(seed + 2));
    }

    @Test void rm03_undoAfterARecomputeBringsTheTitleBackOnTheNextRead() throws Exception {
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        for (int i = 1; i <= 3; i++) { neighbor(seed, seed + i, 2 - i * .01); metadata(seed + i, "MOVIE", "Movie " + i); }
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(3)));
        dismiss(seed + 2).andExpect(status().isNoContent());
        // A recomputation between the dismissal and its undo drops the title from the stored rows.
        refresh().andExpect(status().isOk());

        undo(seed + 2).andExpect(status().isNoContent());

        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(3)))
            .andExpect(jsonPath("$.categories[0].movies[1].tmdbId").value(seed + 2));
    }

    @Test void rm04_doubleTapCreatesOneDismissal() throws Exception {
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        neighbor(seed, candidate, 1); metadata(candidate, "MOVIE", "Candidate");
        dismiss(candidate).andExpect(status().isNoContent());
        dismiss(candidate).andExpect(status().isNoContent());
        // Concurrent taps race past the existence check; the unique constraint keeps one row, both succeed.
        var pool = Executors.newFixedThreadPool(4);
        try {
            var start = new CountDownLatch(1);
            List<Future<Integer>> taps = new ArrayList<>();
            for (int i = 0; i < 4; i++) taps.add(pool.submit(() -> {
                start.await();
                return dismiss(candidate + 1).andReturn().getResponse().getStatus();
            }));
            start.countDown();
            for (var tap : taps) assertEquals(204, tap.get());
        } finally { pool.shutdownNow(); }
        assertEquals(1,
            dismissalRows.findTmdbIdsByUserIdAndMediaType(owner.getId(), "MOVIE").stream().filter(id -> id == candidate).count());
        assertEquals(1,
            dismissalRows.findTmdbIdsByUserIdAndMediaType(owner.getId(), "MOVIE").stream().filter(id -> id == candidate + 1).count());
        // One undo is enough to bring the title back.
        undo(candidate).andExpect(status().isNoContent());
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(candidate));
    }

    @Test void onlyTheOwnerCanDismissOrUndoTheirTitles() throws Exception {
        mvc.perform(post("/api/suggestions/personal/dismissals/" + candidate)).andExpect(status().isForbidden());
        mvc.perform(delete("/api/suggestions/personal/dismissals/" + candidate)).andExpect(status().isForbidden());
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        neighbor(seed, candidate, 1); metadata(candidate, "MOVIE", "Candidate");
        User first = owner;
        dismiss(candidate).andExpect(status().isNoContent());
        // Another account: its own dismissal and undo never touch the first owner's.
        owner = users.save(User.builder().username("other-" + UUID.randomUUID()).password("test").build());
        save(seed, "Watched", "MOVIE", "WATCHED", "null");
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(candidate));
        undo(candidate).andExpect(status().isNoContent());
        owner = first;
        read("/api/suggestions/personal").andExpect(jsonPath("$.categories[0].movies", hasSize(0)));
    }

    @Test void invalidTitleIdsAreRejected() throws Exception {
        dismiss(0).andExpect(status().isBadRequest());
    }

    void neighbor(long source, long target, double score) {
        similarities.save(MovieSimilarity.builder().tmdbId(source).neighborTmdbId(target).score(score).build());
    }
    /** Cached title with an eligible audience (8.0 from 300 votes): its quality factor is exactly 0.7. */
    void metadata(long id, String type, String title) {
        cache.save(CachedMovieList.builder().tmdbId(id).mediaType(type).title(title)
            .voteAverage(8.0).voteCount(300).listType(MovieListType.POPULAR).rankOrder(1).build());
    }
    void save(long id, String title, String type, String state, String rating) throws Exception {
        mvc.perform(post("/api/movies/library").header("Authorization", token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"tmdbId\":" + id + ",\"title\":\"" + title + "\",\"mediaType\":\"" + type
            + "\",\"status\":\"" + state + "\",\"personalRating\":" + rating + "}"))
            .andExpect(status().isCreated());
    }
    String token() { return "Bearer " + tokens.generateToken(owner.getUsername(), owner.getId(), owner.getRole()); }
    ResultActions read(String path) throws Exception { return mvc.perform(get(path).header("Authorization", token())); }
    ResultActions dismiss(long tmdbId) throws Exception {
        return mvc.perform(post("/api/suggestions/personal/dismissals/" + tmdbId).header("Authorization", token()));
    }
    ResultActions undo(long tmdbId) throws Exception {
        return mvc.perform(delete("/api/suggestions/personal/dismissals/" + tmdbId).header("Authorization", token()));
    }
    ResultActions refresh() throws Exception {
        return mvc.perform(post("/api/suggestions/personalized/refresh").header("Authorization", token()));
    }
}
