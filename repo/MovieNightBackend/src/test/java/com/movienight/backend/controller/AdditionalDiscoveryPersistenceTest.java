package com.movienight.backend.controller;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary;
import com.movienight.backend.model.*;
import com.movienight.backend.repository.*;
import com.movienight.backend.security.JwtTokenProvider;
import com.movienight.backend.service.SuggestionScheduler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:additional-discovery-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=", "app.omdb.api-key=",
    "app.jwt.secret=additional-discovery-test-signing-key-at-least-32-bytes"
})
class AdditionalDiscoveryPersistenceTest {

    @Autowired WebApplicationContext context;
    @Autowired UserRepository users;
    @Autowired MovieRepository movies;
    @Autowired UserMovieEntryRepository userEntries;
    @Autowired CustomListRepository customLists;
    @Autowired CachedMovieListRepository cache;
    @Autowired DiscoverySnapshotRepository snapshots;
    @Autowired SuggestionScheduler scheduler;
    @Autowired com.movienight.backend.service.ExploreSessionManager sessionManager;
    @Autowired JwtTokenProvider tokens;
    @MockitoBean TmdbClient tmdb;

    @BeforeEach
    void setup() {
        reset(tmdb);
        userEntries.deleteAll();
        customLists.deleteAll();
        cache.deleteAll();
        snapshots.deleteAll();
        movies.deleteAll();
    }

    private String createAuthToken(User user) {
        return "Bearer " + tokens.generateToken(user.getUsername(), user.getId(), user.getRole());
    }

    private TmdbMovieSummary movie(long id, String title, double average, int votes, double popularity, String date) {
        TmdbMovieSummary m = new TmdbMovieSummary();
        m.setId(id);
        m.setTitle(title);
        m.setVoteAverage(average);
        m.setVoteCount(votes);
        m.setPopularity(popularity);
        m.setReleaseDate(date);
        return m;
    }

    @Test
    void tenPageCandidateBoundsAndStrongerCandidatesOnLaterPages() throws Exception {
        String yesterday = LocalDate.now(ZoneOffset.UTC).minusDays(1).toString();
        when(tmdb.isConfigured()).thenReturn(true);

        AtomicInteger pageFetches = new AtomicInteger();
        when(tmdb.discoverMovies(anyString(), anyInt(), any(), any(), anyInt())).thenAnswer(call -> {
            String sort = call.getArgument(0);
            int page = call.getArgument(4);
            pageFetches.incrementAndGet();

            if ("vote_average.desc".equals(sort)) {
                if (page == 1) {
                    // Page 1 has a candidate with small vote sample
                    return List.of(movie(1001, "Page 1 Movie", 8.0, 1000, 10, yesterday));
                }
                if (page == 10) {
                    // Page 10 has a candidate with higher Bayesian score (9.5 avg, 10000 votes)
                    return List.of(movie(1010, "Page 10 Strong Candidate", 9.5, 10000, 50, yesterday));
                }
                // Pages 2-9 return non-empty items
                return List.of(movie(1000 + page, "Movie " + page, 7.5, 1000, 10, yesterday));
            }
            if ("vote_count.desc".equals(sort)) {
                // Returns 10 pages as well. Page 1 includes an overlapping candidate (1001) that also appeared in vote_average.desc
                if (page == 1) {
                    return List.of(
                            movie(1001, "Page 1 Movie (Duplicate in vote_count stream)", 8.0, 1000, 10, yesterday),
                            movie(2098, "Vote Count Movie 98", 7.0, 2000, 10, yesterday),
                            movie(2099, "Vote Count Movie 99", 7.0, 2000, 10, yesterday));
                }
                return List.of(movie(2000 + page, "Vote Count Movie " + page, 7.0, 2000, 10, yesterday));
            }
            return List.of();
        });

        User user = users.save(User.builder().username("user-" + UUID.randomUUID()).password("p").build());
        String token = createAuthToken(user);
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();

        // Trigger refresh for MOVIE top-rated directly on scheduler
        scheduler.refreshCategory("MOVIE", MovieListType.TOP_RATED);

        // Verified that 10 pages per source were fetched (10 for vote_average + 10 for vote_count = 20 total)
        assertThat(pageFetches.get()).isEqualTo(20);

        // Overlapping candidate 1001 appears exactly once in the published database cache (deduplicated across streams)
        long count1001InCache = cache.findByMediaTypeAndListTypeOrderByRankOrderAsc("MOVIE", MovieListType.TOP_RATED)
                .stream().filter(e -> e.getTmdbId() == 1001L).count();
        assertThat(count1001InCache).isEqualTo(1);

        // Fetch category page 1
        var result = mvc.perform(get("/api/movies/explore/movies/top-rated").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies[0].tmdbId").value(1010)) // Page 10 stronger candidate ranks first!
                .andExpect(jsonPath("$.movies[0].title").value("Page 10 Strong Candidate"))
                .andExpect(jsonPath("$.sessionId").isNotEmpty())
                .andExpect(jsonPath("$.hasMore").value(true))
                .andExpect(jsonPath("$.movies[?(@.tmdbId==1001)]", hasSize(1))) // Overlapping candidate appears once in results
                .andReturn();
    }

    @Test
    void categoryPaginationBatchesAndLoadMoreMakesNoProviderCalls() throws Exception {
        String yesterday = LocalDate.now(ZoneOffset.UTC).minusDays(1).toString();
        when(tmdb.isConfigured()).thenReturn(true);

        when(tmdb.discoverMovies(anyString(), anyInt(), any(), any(), anyInt())).thenAnswer(call -> {
            int page = call.getArgument(4);
            if (page == 1) {
                List<TmdbMovieSummary> items = new ArrayList<>();
                for (int i = 1; i <= 25; i++) {
                    items.add(movie(3000 + i, "Popular " + i, 8.0, 300, 100 - i, yesterday));
                }
                return items;
            }
            return List.of();
        });

        User user = users.save(User.builder().username("user-" + UUID.randomUUID()).password("p").build());
        String token = createAuthToken(user);
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();

        // Initial batch of up to 20 items
        String body = mvc.perform(get("/api/movies/explore/movies/popular").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies", hasSize(20)))
                .andExpect(jsonPath("$.movies[0].tmdbId").value(3001))
                .andExpect(jsonPath("$.movies[19].tmdbId").value(3020))
                .andExpect(jsonPath("$.hasMore").value(true))
                .andReturn().getResponse().getContentAsString();

        String sessionId = com.jayway.jsonpath.JsonPath.read(body, "$.sessionId");
        int cursor = com.jayway.jsonpath.JsonPath.read(body, "$.cursor");

        // Clear mock invocations to strictly verify that Load more makes ZERO provider calls
        reset(tmdb);

        // Load more (batch 2) using sessionId and cursor
        mvc.perform(get("/api/movies/explore/movies/popular")
                .param("sessionId", sessionId)
                .param("cursor", String.valueOf(cursor))
                .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies", hasSize(5)))
                .andExpect(jsonPath("$.movies[0].tmdbId").value(3021))
                .andExpect(jsonPath("$.movies[4].tmdbId").value(3025))
                .andExpect(jsonPath("$.hasMore").value(false))
                .andExpect(jsonPath("$.terminalReason").value("PROVIDER_EXHAUSTED"));

        verifyNoInteractions(tmdb);
    }

    @Test
    void pinnedSessionIsIsolatedFromScheduledRefresh() throws Exception {
        String yesterday = LocalDate.now(ZoneOffset.UTC).minusDays(1).toString();
        when(tmdb.isConfigured()).thenReturn(true);

        when(tmdb.discoverMovies(anyString(), anyInt(), any(), any(), anyInt())).thenAnswer(call -> {
            int page = call.getArgument(4);
            if (page == 1) {
                List<TmdbMovieSummary> items = new ArrayList<>();
                for (int i = 1; i <= 25; i++) {
                    items.add(movie(4000 + i, "Original " + i, 8.0, 300, 100 - i, yesterday));
                }
                return items;
            }
            return List.of();
        });

        User user = users.save(User.builder().username("user-" + UUID.randomUUID()).password("p").build());
        String token = createAuthToken(user);
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();

        // 1. Open category, gets batch 1 of 20 items from original pool
        String body1 = mvc.perform(get("/api/movies/explore/movies/popular").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies[0].title").value("Original 1"))
                .andReturn().getResponse().getContentAsString();
        String sessionId = com.jayway.jsonpath.JsonPath.read(body1, "$.sessionId");
        int cursor = com.jayway.jsonpath.JsonPath.read(body1, "$.cursor");

        // 2. Now simulate a background scheduled refresh that replaces rows in cached_movie_list
        cache.deleteAll();
        cache.save(CachedMovieList.builder()
                .mediaType("MOVIE").listType(MovieListType.POPULAR).tmdbId(99999L)
                .title("New Scheduled Movie").rankOrder(1).voteAverage(9.0).voteCount(500)
                .popularity(100.0).releaseDate(yesterday).build());

        // 3. Requesting Load more on the active pinned session MUST still return the original pinned pool!
        mvc.perform(get("/api/movies/explore/movies/popular")
                .param("sessionId", sessionId)
                .param("cursor", String.valueOf(cursor))
                .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies", hasSize(5)))
                .andExpect(jsonPath("$.movies[0].title").value("Original 21")); // Not affected by cache change!

        // 4. Another user invokes explicit category refresh
        User otherUser = users.save(User.builder().username("other-" + UUID.randomUUID()).password("p").build());
        String otherToken = createAuthToken(otherUser);
        mvc.perform(post("/api/suggestions/explore/movies/popular/refresh").header("Authorization", otherToken))
                .andExpect(status().isOk());

        // Alice's pinned session MUST remain isolated and usable
        mvc.perform(get("/api/movies/explore/movies/popular")
                .param("sessionId", sessionId)
                .param("cursor", String.valueOf(cursor))
                .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies", hasSize(5)))
                .andExpect(jsonPath("$.movies[0].title").value("Original 21"));
    }

    @Test
    void sessionOwnershipAndRouteMismatchEnforcement() throws Exception {
        String yesterday = LocalDate.now(ZoneOffset.UTC).minusDays(1).toString();
        when(tmdb.isConfigured()).thenReturn(true);
        when(tmdb.discoverMovies(anyString(), anyInt(), any(), any(), anyInt())).thenReturn(List.of(
                movie(8001, "Movie 1", 8.0, 500, 50, yesterday),
                movie(8002, "Movie 2", 8.0, 500, 50, yesterday)
        ));

        User alice = users.save(User.builder().username("alice-" + UUID.randomUUID()).password("p").build());
        User bob = users.save(User.builder().username("bob-" + UUID.randomUUID()).password("p").build());
        String tokenAlice = createAuthToken(alice);
        String tokenBob = createAuthToken(bob);
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();

        // 1. Alice creates a session on movies/popular
        String body = mvc.perform(get("/api/movies/explore/movies/popular").header("Authorization", tokenAlice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionId").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        String aliceSessionId = com.jayway.jsonpath.JsonPath.read(body, "$.sessionId");

        // 2. Bob attempts to read Alice's session -> 403 Forbidden
        mvc.perform(get("/api/movies/explore/movies/popular")
                .param("sessionId", aliceSessionId)
                .header("Authorization", tokenBob))
                .andExpect(status().isForbidden());

        // 3. Anonymous user attempts to read Alice's session -> 401 Unauthorized
        mvc.perform(get("/api/movies/explore/movies/popular")
                .param("sessionId", aliceSessionId))
                .andExpect(status().isUnauthorized());

        // 4. Anonymous user views explore category: returns 200 OK, but NO session is created (sessionId=null, hasMore=false)
        mvc.perform(get("/api/movies/explore/movies/popular"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionId").doesNotExist())
                .andExpect(jsonPath("$.hasMore").value(false));

        // 5. Route mismatch: Alice uses movie popular session on tv/popular route -> 400 Bad Request
        mvc.perform(get("/api/movies/explore/tv/popular")
                .param("sessionId", aliceSessionId)
                .header("Authorization", tokenAlice))
                .andExpect(status().isBadRequest());

        // 6. Route mismatch: Alice uses movie popular session on movie top-rated route -> 400 Bad Request
        mvc.perform(get("/api/movies/explore/movies/top-rated")
                .param("sessionId", aliceSessionId)
                .header("Authorization", tokenAlice))
                .andExpect(status().isBadRequest());
    }

    @Test
    void sessionExpiresAfter30MinutesReturns410Gone() throws Exception {
        String yesterday = LocalDate.now(ZoneOffset.UTC).minusDays(1).toString();
        when(tmdb.isConfigured()).thenReturn(true);
        when(tmdb.discoverMovies(anyString(), anyInt(), any(), any(), anyInt())).thenReturn(List.of(
                movie(8501, "Movie Expiry Test", 8.0, 500, 50, yesterday)
        ));

        User alice = users.save(User.builder().username("alice-" + UUID.randomUUID()).password("p").build());
        String tokenAlice = createAuthToken(alice);
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();

        // 1. Session created at T0
        String body = mvc.perform(get("/api/movies/explore/movies/popular").header("Authorization", tokenAlice))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String sessionId = com.jayway.jsonpath.JsonPath.read(body, "$.sessionId");

        // 2. Advance clock by 31 minutes
        try {
            sessionManager.setClock(java.time.Clock.offset(java.time.Clock.systemUTC(), java.time.Duration.ofMinutes(31)));

            // 3. Requesting session after 30 minutes must return 410 GONE
            mvc.perform(get("/api/movies/explore/movies/popular")
                    .param("sessionId", sessionId)
                    .header("Authorization", tokenAlice))
                    .andExpect(status().isGone())
                    .andExpect(jsonPath("$.status").value(410))
                    .andExpect(jsonPath("$.message").value(containsString("Refresh discovery")));
        } finally {
            sessionManager.setClock(java.time.Clock.systemUTC());
        }
    }

    @Test
    void lostOrExpiredSessionReturns410Gone() throws Exception {
        User user = users.save(User.builder().username("user-" + UUID.randomUUID()).password("p").build());
        String token = createAuthToken(user);
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();

        // Unknown session ID returns HTTP 410 GONE, not 500
        mvc.perform(get("/api/movies/explore/movies/popular")
                .param("sessionId", "unknown-session-id")
                .header("Authorization", token))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.status").value(410))
                .andExpect(jsonPath("$.message").value(containsString("Refresh discovery")));
    }

    @Test
    void ownerLibraryDynamicExclusionsAndRemovals() throws Exception {
        String yesterday = LocalDate.now(ZoneOffset.UTC).minusDays(1).toString();
        when(tmdb.isConfigured()).thenReturn(true);

        when(tmdb.discoverMovies(anyString(), anyInt(), any(), any(), anyInt())).thenAnswer(call -> {
            int page = call.getArgument(4);
            if (page == 1) {
                List<TmdbMovieSummary> items = new ArrayList<>();
                for (int i = 1; i <= 30; i++) {
                    items.add(movie(5000 + i, "Explore Title " + i, 8.0, 300, 100 - i, yesterday));
                }
                return items;
            }
            return List.of();
        });

        User user = users.save(User.builder().username("user-" + UUID.randomUUID()).password("p").build());
        String token = createAuthToken(user);
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();

        // Put 5002 and 5005 into user's library (consumed in first batch)
        // Put 5028 into user's library (ahead of the first batch's cursor)
        Movie m2 = movies.save(Movie.builder().tmdbId(5002L).title("Explore Title 2").mediaType("MOVIE").build());
        Movie m5 = movies.save(Movie.builder().tmdbId(5005L).title("Explore Title 5").mediaType("MOVIE").build());
        Movie m28 = movies.save(Movie.builder().tmdbId(5028L).title("Explore Title 28").mediaType("MOVIE").build());

        UserMovieEntry entry2 = userEntries.save(UserMovieEntry.builder().user(user).movie(m2).status(MovieStatus.WATCHLIST).build());
        UserMovieEntry entry5 = userEntries.save(UserMovieEntry.builder().user(user).movie(m5).status(MovieStatus.WATCHED).build());
        UserMovieEntry entry28 = userEntries.save(UserMovieEntry.builder().user(user).movie(m28).status(MovieStatus.WATCHLIST).build());

        // 1. Initial batch: 5002 and 5005 should be skipped without counting toward the 20 batch limit!
        // 20 items will be returned: 5001, 5003, 5004, 5006..5022
        String body = mvc.perform(get("/api/movies/explore/movies/popular").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies", hasSize(20)))
                .andExpect(jsonPath("$.movies[?(@.tmdbId==5002)]").isEmpty())
                .andExpect(jsonPath("$.movies[?(@.tmdbId==5005)]").isEmpty())
                .andReturn().getResponse().getContentAsString();

        String sessionId = com.jayway.jsonpath.JsonPath.read(body, "$.sessionId");
        int cursor = com.jayway.jsonpath.JsonPath.read(body, "$.cursor");

        // 2. Also verify shelf previews exclude saved titles
        mvc.perform(get("/api/movies/explore/movies").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories[?(@.id=='popular')].movies[?(@.tmdbId==5002)]").isEmpty())
                .andExpect(jsonPath("$.categories[?(@.id=='popular')].movies[?(@.tmdbId==5005)]").isEmpty());

        // 3. User removes 5002 (behind cursor) and 5028 (ahead of cursor) from library
        userEntries.delete(entry2);
        userEntries.delete(entry28);

        // Load more: 5028 (ahead of cursor) IS returned, while 5002 (behind cursor) is NOT returned!
        mvc.perform(get("/api/movies/explore/movies/popular")
                .param("sessionId", sessionId)
                .param("cursor", String.valueOf(cursor))
                .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies[?(@.tmdbId==5028)]").isNotEmpty())
                .andExpect(jsonPath("$.movies[?(@.tmdbId==5002)]").isEmpty());

        // Resetting pagination (cursor=0) restores 5002
        mvc.perform(get("/api/movies/explore/movies/popular")
                .param("sessionId", sessionId)
                .param("cursor", "0")
                .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies[?(@.tmdbId==5002)]").isNotEmpty());
    }

    @Test
    void serverSideSortAndFiltersWithTerminalStates() throws Exception {
        String yesterday = LocalDate.now(ZoneOffset.UTC).minusDays(1).toString();
        when(tmdb.isConfigured()).thenReturn(true);

        when(tmdb.discoverMovies(anyString(), anyInt(), any(), any(), anyInt())).thenAnswer(call -> {
            int page = call.getArgument(4);
            if (page == 1) {
                return List.of(
                        movie(6001, "Zebra", 8.5, 1500, 100, "2020-01-01"),
                        movie(6002, "Apple", 7.0, 1400, 90, "2023-01-01"),
                        movie(6003, "Banana", 6.0, 1300, 80, "2021-01-01"),
                        movie(6004, "Low Rated", 5.5, 1300, 70, "2022-01-01")
                );
            }
            return List.of();
        });

        User user = users.save(User.builder().username("user-" + UUID.randomUUID()).password("p").build());
        String token = createAuthToken(user);
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();

        // 1. Initial category opening on top-rated (default recommendation order)
        String body = mvc.perform(get("/api/movies/explore/movies/top-rated").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies[0].title").value("Zebra"))
                .andReturn().getResponse().getContentAsString();
        String sessionId = com.jayway.jsonpath.JsonPath.read(body, "$.sessionId");

        // 2. Sort by title (alphabetical: Apple, Banana, Low Rated, Zebra)
        mvc.perform(get("/api/movies/explore/movies/top-rated")
                .param("sessionId", sessionId)
                .param("sortBy", "title")
                .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies[0].title").value("Apple"))
                .andExpect(jsonPath("$.movies[1].title").value("Banana"))
                .andExpect(jsonPath("$.movies[2].title").value("Low Rated"))
                .andExpect(jsonPath("$.movies[3].title").value("Zebra"));

        // 3. Sort by year (newest first: 2023 Apple, 2022 Low Rated, 2021 Banana, 2020 Zebra)
        mvc.perform(get("/api/movies/explore/movies/top-rated")
                .param("sessionId", sessionId)
                .param("sortBy", "year")
                .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies[0].title").value("Apple"))
                .andExpect(jsonPath("$.movies[1].title").value("Low Rated"));

        // 3b. Sort by TMDB audience rating (descending: 8.5 Zebra, 7.0 Apple, 6.0 Banana, 5.5 Low Rated)
        mvc.perform(get("/api/movies/explore/movies/top-rated")
                .param("sessionId", sessionId)
                .param("sortBy", "rating")
                .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies[0].title").value("Zebra"))
                .andExpect(jsonPath("$.movies[1].title").value("Apple"))
                .andExpect(jsonPath("$.movies[2].title").value("Banana"))
                .andExpect(jsonPath("$.movies[3].title").value("Low Rated"));

        // 3c. Whole-pool sorting across batches (cursor=0, limit=2 returns first 2 sorted items; cursor=2 returns next 2)
        mvc.perform(get("/api/movies/explore/movies/top-rated")
                .param("sessionId", sessionId)
                .param("sortBy", "title")
                .param("cursor", "0")
                .param("limit", "2")
                .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies", hasSize(2)))
                .andExpect(jsonPath("$.movies[0].title").value("Apple"))
                .andExpect(jsonPath("$.movies[1].title").value("Banana"))
                .andExpect(jsonPath("$.cursor").value(2))
                .andExpect(jsonPath("$.hasMore").value(true));

        mvc.perform(get("/api/movies/explore/movies/top-rated")
                .param("sessionId", sessionId)
                .param("sortBy", "title")
                .param("cursor", "2")
                .param("limit", "2")
                .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies", hasSize(2)))
                .andExpect(jsonPath("$.movies[0].title").value("Low Rated"))
                .andExpect(jsonPath("$.movies[1].title").value("Zebra"))
                .andExpect(jsonPath("$.cursor").value(4))
                .andExpect(jsonPath("$.hasMore").value(false));

        // 4. Filter minRating=6 (excludes "Low Rated" 5.5)
        mvc.perform(get("/api/movies/explore/movies/top-rated")
                .param("sessionId", sessionId)
                .param("minRating", "6")
                .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies", hasSize(3)))
                .andExpect(jsonPath("$.movies[?(@.title=='Low Rated')]").isEmpty());

        // 5. Filter minRating=9 (none match -> terminalReason: NO_MATCHING_UNSAVED_TITLES)
        mvc.perform(get("/api/movies/explore/movies/top-rated")
                .param("sessionId", sessionId)
                .param("minRating", "9")
                .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies", hasSize(0)))
                .andExpect(jsonPath("$.hasMore").value(false))
                .andExpect(jsonPath("$.terminalReason").value("NO_MATCHING_UNSAVED_TITLES"))
                .andExpect(jsonPath("$.underlyingLimit").value("PROVIDER_EXHAUSTED"));

        // 6. When all candidates in pool are saved to user library -> terminalReason: ALL_CANDIDATES_EXCLUDED_BY_LIBRARY
        Movie m1 = movies.save(Movie.builder().tmdbId(6001L).mediaType("MOVIE").title("Zebra").build());
        Movie m2 = movies.save(Movie.builder().tmdbId(6002L).mediaType("MOVIE").title("Apple").build());
        Movie m3 = movies.save(Movie.builder().tmdbId(6003L).mediaType("MOVIE").title("Banana").build());
        Movie m4 = movies.save(Movie.builder().tmdbId(6004L).mediaType("MOVIE").title("Low Rated").build());
        userEntries.save(UserMovieEntry.builder().user(user).movie(m1).status(MovieStatus.WATCHLIST).build());
        userEntries.save(UserMovieEntry.builder().user(user).movie(m2).status(MovieStatus.WATCHED).build());
        userEntries.save(UserMovieEntry.builder().user(user).movie(m3).status(MovieStatus.WATCHLIST).build());
        userEntries.save(UserMovieEntry.builder().user(user).movie(m4).status(MovieStatus.WATCHED).build());

        mvc.perform(get("/api/movies/explore/movies/top-rated")
                .param("sessionId", sessionId)
                .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movies", hasSize(0)))
                .andExpect(jsonPath("$.hasMore").value(false))
                .andExpect(jsonPath("$.terminalReason").value("ALL_CANDIDATES_EXCLUDED_BY_LIBRARY"))
                .andExpect(jsonPath("$.underlyingLimit").value("PROVIDER_EXHAUSTED"));

        // 7. Shelf overview (/api/movies/explore/movies) also reports ALL_CANDIDATES_EXCLUDED_BY_LIBRARY and underlyingLimit
        mvc.perform(get("/api/movies/explore/movies").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories[?(@.id=='top-rated')].movies[0]").doesNotExist())
                .andExpect(jsonPath("$.categories[?(@.id=='top-rated')].terminalReason").value(hasItem("ALL_CANDIDATES_EXCLUDED_BY_LIBRARY")))
                .andExpect(jsonPath("$.categories[?(@.id=='top-rated')].underlyingLimit").value(hasItem("PROVIDER_EXHAUSTED")));
    }

    @Test
    void legacySnapshotPreservesUnknownProvenanceWithoutFalselyClaimingExhaustion() throws Exception {
        // Spec Finding 2: When publication metadata is absent (legacy snapshot), provenance is unknown (underlyingLimit: null).
        // It must NOT falsely claim PROVIDER_EXHAUSTED.
        context.getBean(SuggestionScheduler.class).clearPublicationMetaForTesting();

        DiscoverySnapshot snapshot = snapshots.findByMediaTypeAndListType("MOVIE", MovieListType.POPULAR)
                .orElseGet(() -> snapshots.save(DiscoverySnapshot.builder()
                        .mediaType("MOVIE").listType(MovieListType.POPULAR)
                        .updatedAt(LocalDateTime.now(ZoneOffset.UTC))
                        .build()));
        snapshot.setUpdatedAt(LocalDateTime.now(ZoneOffset.UTC));
        snapshots.save(snapshot);

        cache.deleteByMediaTypeAndListType("MOVIE", MovieListType.POPULAR);
        cache.save(CachedMovieList.builder()
                .mediaType("MOVIE").listType(MovieListType.POPULAR).tmdbId(7001L)
                .title("Legacy Movie").rankOrder(1).voteAverage(8.0).voteCount(500)
                .popularity(100.0).releaseDate(LocalDate.now(ZoneOffset.UTC).minusDays(1).toString()).build());

        User user = users.save(User.builder().username("legacy-user-" + UUID.randomUUID()).password("p").build());
        String token = createAuthToken(user);
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();

        // Save candidate to user library to trigger ALL_CANDIDATES_EXCLUDED_BY_LIBRARY
        Movie movie = movies.save(Movie.builder().tmdbId(7001L).mediaType("MOVIE").title("Legacy Movie").build());
        userEntries.save(UserMovieEntry.builder().user(user).movie(movie).status(MovieStatus.WATCHLIST).build());

        // Explore category returns ALL_CANDIDATES_EXCLUDED_BY_LIBRARY, but underlyingLimit is null (not falsely PROVIDER_EXHAUSTED)
        mvc.perform(get("/api/movies/explore/movies/popular").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.terminalReason").value("ALL_CANDIDATES_EXCLUDED_BY_LIBRARY"))
                .andExpect(jsonPath("$.underlyingLimit").doesNotExist());

        // Shelf endpoint also reports ALL_CANDIDATES_EXCLUDED_BY_LIBRARY with null underlyingLimit
        mvc.perform(get("/api/movies/explore/movies").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories[?(@.id=='popular')].terminalReason").value(hasItem("ALL_CANDIDATES_EXCLUDED_BY_LIBRARY")))
                .andExpect(jsonPath("$.categories[?(@.id=='popular')].underlyingLimit").value(hasItem(nullValue())));
    }
}
