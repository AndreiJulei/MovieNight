package com.movienight.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.movienight.backend.client.OmdbClient;
import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary;
import com.movienight.backend.model.CachedMovieList;
import com.movienight.backend.model.MovieListType;
import com.movienight.backend.model.User;
import com.movienight.backend.repository.*;
import com.movienight.backend.security.JwtTokenProvider;
import com.movienight.backend.service.SuggestionScheduler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** PD-07 (#23): Top Rated caches up to 1,000 titles per category and View all pages through them. */
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:top-rated-thousand-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=", "app.omdb.api-key=",
    "app.discovery.top-rated-max-requests-per-second=100000",
    "app.jwt.secret=top-rated-thousand-test-signing-key-at-least-32-bytes"
})
class TopRatedThousandPersistenceTest {

    @Autowired WebApplicationContext context;
    @Autowired UserRepository users;
    @Autowired CachedMovieListRepository cache;
    @Autowired DiscoverySnapshotRepository snapshots;
    @Autowired SuggestionScheduler scheduler;
    @Autowired JwtTokenProvider tokens;
    @MockitoBean TmdbClient tmdb;
    @MockitoBean OmdbClient omdb;

    final String yesterday = LocalDate.now(ZoneOffset.UTC).minusDays(1).toString();

    @BeforeEach
    void setup() {
        reset(tmdb, omdb);
        cache.deleteAll();
        snapshots.deleteAll();
        scheduler.clearPublicationMetaForTesting();
        when(tmdb.isConfigured()).thenReturn(true);
    }

    private TmdbMovieSummary title(long id, double average, int votes) {
        TmdbMovieSummary m = new TmdbMovieSummary();
        m.setId(id);
        m.setTitle("Title " + id);
        m.setVoteAverage(average);
        m.setVoteCount(votes);
        m.setPopularity(10.0);
        m.setReleaseDate(yesterday);
        m.setFirstAirDate(yesterday);
        return m;
    }

    /** Both sources never run out: every page holds 20 new, distinct, eligible titles. */
    private AtomicInteger endlessMovieDiscovery() {
        AtomicInteger fetches = new AtomicInteger();
        when(tmdb.discoverMovies(anyString(), anyInt(), any(), any(), anyInt())).thenAnswer(call -> {
            fetches.incrementAndGet();
            boolean byAverage = "vote_average.desc".equals(call.getArgument(0));
            int page = call.getArgument(4);
            List<TmdbMovieSummary> results = new ArrayList<>();
            for (int i = 0; i < 20; i++) {
                int position = (page - 1) * 20 + i;
                results.add(byAverage
                        ? title(100_000 + position, 9.0 - position * 0.001, 5_000)
                        : title(200_000 + position, 7.0, 40_000 - position));
            }
            return results;
        });
        return fetches;
    }

    @Test
    void tr01_refreshCachesUpTo1000DistinctTitlesFrom50BestRatedAnd10MostVotedPages() {
        AtomicInteger fetches = endlessMovieDiscovery();

        scheduler.refreshCategory("MOVIE", MovieListType.TOP_RATED);

        assertThat(fetches.get()).isEqualTo(60);
        List<CachedMovieList> rows = cache.findByMediaTypeAndListTypeOrderByRankOrderAsc("MOVIE", MovieListType.TOP_RATED);
        assertThat(rows).hasSize(1000);
        assertThat(rows.stream().map(CachedMovieList::getTmdbId).distinct().count()).isEqualTo(1000);
        assertThat(rows.get(0).getRankOrder()).isEqualTo(1);
        assertThat(rows.get(999).getRankOrder()).isEqualTo(1000);
    }

    @Test
    void tr01_refreshStopsEarlyWhenTheProviderRunsOutOfTitles() {
        AtomicInteger fetches = new AtomicInteger();
        when(tmdb.discoverTv(anyString(), anyInt(), any(), any(), any(), any(), any(), any(), any(), anyInt()))
                .thenAnswer(call -> {
                    fetches.incrementAndGet();
                    boolean byAverage = "vote_average.desc".equals(call.getArgument(0));
                    int page = call.getArgument(9);
                    if (page > 7) return List.of();
                    List<TmdbMovieSummary> results = new ArrayList<>();
                    for (int i = 0; i < 20; i++) {
                        TmdbMovieSummary item = title((byAverage ? 300_000 : 400_000) + (page - 1) * 20 + i, 8.0, 900);
                        item.setMediaType("tv");
                        results.add(item);
                    }
                    return results;
                });

        scheduler.refreshCategory("TV", MovieListType.TOP_RATED);

        // Pages 1-7 hold titles and page 8 is empty, for each of the two sources.
        assertThat(fetches.get()).isEqualTo(16);
        assertThat(cache.findByMediaTypeAndListTypeOrderByRankOrderAsc("TV", MovieListType.TOP_RATED)).hasSize(280);
    }

    @Test
    void tr02_viewAllReachesTitle1000ThroughLoadMoreWithoutDuplicatesOrGaps() throws Exception {
        endlessMovieDiscovery();
        scheduler.refreshCategory("MOVIE", MovieListType.TOP_RATED);
        List<Long> published = cache.findByMediaTypeAndListTypeOrderByRankOrderAsc("MOVIE", MovieListType.TOP_RATED)
                .stream().map(CachedMovieList::getTmdbId).toList();

        User user = users.save(User.builder().username("top-rated-" + UUID.randomUUID()).password("p").build());
        String token = "Bearer " + tokens.generateToken(user.getUsername(), user.getId(), user.getRole());
        MockMvc mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        ObjectMapper json = new ObjectMapper();

        List<Long> seen = new ArrayList<>();
        String sessionId = null;
        int cursor = 0;
        int requests = 0;
        boolean hasMore = true;
        while (hasMore) {
            var request = get("/api/movies/explore/movies/top-rated").header("Authorization", token)
                    .param("cursor", String.valueOf(cursor)).param("limit", "40");
            if (sessionId != null) request.param("sessionId", sessionId);
            JsonNode page = json.readTree(mvc.perform(request).andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString());
            requests++;
            assertThat(page.get("movies").size()).isEqualTo(40);
            page.get("movies").forEach(movie -> seen.add(movie.get("tmdbId").asLong()));
            sessionId = page.get("sessionId").asText();
            cursor = page.get("cursor").asInt();
            hasMore = page.get("hasMore").asBoolean();
            assertThat(requests).isLessThanOrEqualTo(25);
        }

        assertThat(requests).isEqualTo(25);
        assertThat(seen).hasSize(1000).doesNotHaveDuplicates();
        assertThat(seen).containsExactlyElementsOf(published);
    }

    @Test
    void tr03_refreshIssuesNoOmdbRequests() {
        endlessMovieDiscovery();
        scheduler.refreshCategory("MOVIE", MovieListType.TOP_RATED);
        verifyNoInteractions(omdb);
    }

    @Test
    void tr04_failedPageMidRefreshLeavesThePreviousSnapshotServed() {
        endlessMovieDiscovery();
        scheduler.refreshCategory("MOVIE", MovieListType.TOP_RATED);
        List<Long> before = cache.findByMediaTypeAndListTypeOrderByRankOrderAsc("MOVIE", MovieListType.TOP_RATED)
                .stream().map(CachedMovieList::getTmdbId).toList();
        LocalDateTime publishedAt = snapshots.findByMediaTypeAndListType("MOVIE", MovieListType.TOP_RATED)
                .orElseThrow().getUpdatedAt();

        when(tmdb.discoverMovies(anyString(), anyInt(), any(), any(), anyInt())).thenAnswer(call -> {
            int page = call.getArgument(4);
            if (page == 30) throw new IllegalStateException("Provider discovery request failed. Retry.");
            return List.of(title(900_000 + page, 9.5, 9_000));
        });

        assertThatThrownBy(() -> scheduler.refreshCategory("MOVIE", MovieListType.TOP_RATED))
                .isInstanceOf(IllegalStateException.class);

        List<Long> after = cache.findByMediaTypeAndListTypeOrderByRankOrderAsc("MOVIE", MovieListType.TOP_RATED)
                .stream().map(CachedMovieList::getTmdbId).toList();
        assertThat(after).isEqualTo(before);
        assertThat(snapshots.findByMediaTypeAndListType("MOVIE", MovieListType.TOP_RATED).orElseThrow().getUpdatedAt())
                .isEqualTo(publishedAt);
    }
}
