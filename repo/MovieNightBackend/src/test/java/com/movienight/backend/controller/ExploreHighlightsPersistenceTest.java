package com.movienight.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.movienight.backend.client.OmdbClient;
import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.external.TmdbMovieDetailsResponse;
import com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary;
import com.movienight.backend.model.Movie;
import com.movienight.backend.model.MovieListType;
import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.model.User;
import com.movienight.backend.model.UserMovieEntry;
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
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * PD-10 (#26): Explore pages open with a spotlight hero (TMDB trending/week) and a
 * "Top 10 today" row (TMDB trending/day), served from discovery snapshots.
 */
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:explore-highlights-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=", "app.omdb.api-key=",
    "app.anilist.enabled=false",
    "app.discovery.top-rated-max-requests-per-second=100000",
    "app.jwt.secret=explore-highlights-test-signing-key-at-least-32-bytes"
})
class ExploreHighlightsPersistenceTest {

    @Autowired WebApplicationContext context;
    @Autowired UserRepository users;
    @Autowired MovieRepository movies;
    @Autowired UserMovieEntryRepository entries;
    @Autowired CachedMovieListRepository cache;
    @Autowired DiscoverySnapshotRepository snapshots;
    @Autowired SuggestionScheduler scheduler;
    @Autowired JwtTokenProvider tokens;
    @MockitoBean TmdbClient tmdb;
    @MockitoBean OmdbClient omdb;

    final String lastMonth = LocalDate.now(ZoneOffset.UTC).minusDays(30).toString();
    final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void setup() {
        reset(tmdb, omdb);
        entries.deleteAll();
        cache.deleteAll();
        snapshots.deleteAll();
        scheduler.clearPublicationMetaForTesting();
        when(tmdb.isConfigured()).thenReturn(true);
        when(tmdb.buildPosterUrl(anyString())).thenAnswer(call -> "https://img/w500" + call.getArgument(0));
        when(tmdb.buildBackdropUrl(anyString())).thenAnswer(call -> "https://img/original" + call.getArgument(0));
        when(tmdb.buildLogoUrl(anyString())).thenAnswer(call -> "https://img/logo" + call.getArgument(0));
        when(tmdb.getMediaDetails(anyLong(), anyString())).thenAnswer(call -> {
            long id = call.getArgument(0);
            TmdbMovieDetailsResponse details = new TmdbMovieDetailsResponse();
            details.setId(id);
            TmdbMovieDetailsResponse.Genre drama = new TmdbMovieDetailsResponse.Genre();
            drama.setName("Drama");
            TmdbMovieDetailsResponse.Genre mystery = new TmdbMovieDetailsResponse.Genre();
            mystery.setName("Mystery");
            details.setGenres(List.of(drama, mystery));
            return Optional.of(details);
        });
        when(tmdb.extractLogoUrl(any())).thenAnswer(call -> {
            TmdbMovieDetailsResponse details = call.getArgument(0);
            return "https://img/logo/" + details.getId() + ".png";
        });
    }

    private TmdbMovieSummary movie(long id) {
        TmdbMovieSummary m = new TmdbMovieSummary();
        m.setId(id);
        m.setTitle("Movie " + id);
        m.setMediaType("movie");
        m.setVoteAverage(7.4);
        m.setVoteCount(800);
        m.setPopularity(100.0);
        m.setReleaseDate(lastMonth);
        m.setPosterPath("/p" + id + ".jpg");
        m.setBackdropPath("/b" + id + ".jpg");
        m.setOriginalLanguage("en");
        return m;
    }

    private TmdbMovieSummary series(long id, String language, Integer... genres) {
        TmdbMovieSummary m = new TmdbMovieSummary();
        m.setId(id);
        m.setName("Series " + id);
        m.setMediaType("tv");
        m.setVoteAverage(8.0);
        m.setVoteCount(400);
        m.setPopularity(80.0);
        m.setFirstAirDate(lastMonth);
        m.setPosterPath("/p" + id + ".jpg");
        m.setBackdropPath("/b" + id + ".jpg");
        m.setOriginalLanguage(language);
        m.setOriginCountry("ja".equals(language) ? List.of("JP") : List.of("US"));
        m.setGenreIds(List.of(genres));
        return m;
    }

    /** Trending pages of 20 movies, ids offset per window so the two charts differ. */
    private void trendingMovies() {
        when(tmdb.getTrending(eq("movie"), anyString(), anyInt())).thenAnswer(call -> {
            long base = "week".equals(call.getArgument(1)) ? 10_000 : 20_000;
            int page = call.getArgument(2);
            List<TmdbMovieSummary> results = new ArrayList<>();
            for (int i = 0; i < 20; i++) results.add(movie(base + (page - 1) * 20L + i + 1));
            return results;
        });
    }

    private MockMvc mvc() {
        return MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    private String tokenFor(User user) {
        return "Bearer " + tokens.generateToken(user.getUsername(), user.getId(), user.getRole());
    }

    private JsonNode highlights(String type, String token) throws Exception {
        var request = get("/api/movies/explore/" + type + "/highlights");
        if (token != null) request.header("Authorization", token);
        return json.readTree(mvc().perform(request).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode category(JsonNode response, String id) {
        return StreamSupport.stream(response.get("categories").spliterator(), false)
                .filter(c -> id.equals(c.get("id").asText())).findFirst().orElseThrow();
    }

    private List<Long> ids(JsonNode category) {
        return StreamSupport.stream(category.get("movies").spliterator(), false)
                .map(m -> m.get("tmdbId").asLong()).toList();
    }

    @Test
    void eh01_spotlightServesFiveWeeklyTrendingTitlesWithArtworkAndTopTenServesTenDailyRanks() throws Exception {
        trendingMovies();

        JsonNode response = highlights("movies", null);

        JsonNode spotlight = category(response, "spotlight");
        assertThat(spotlight.get("state").asText()).isEqualTo("READY");
        assertThat(ids(spotlight)).containsExactly(10_001L, 10_002L, 10_003L, 10_004L, 10_005L);
        JsonNode first = spotlight.get("movies").get(0);
        assertThat(first.get("backdropUrl").asText()).isEqualTo("https://img/original/b10001.jpg");
        assertThat(first.get("logoUrl").asText()).isEqualTo("https://img/logo/10001.png");
        assertThat(first.get("genres").get(0).asText()).isEqualTo("Drama");
        assertThat(first.get("mediaType").asText()).isEqualTo("MOVIE");

        JsonNode topTen = category(response, "top-10");
        assertThat(topTen.get("state").asText()).isEqualTo("READY");
        assertThat(ids(topTen)).containsExactly(20_001L, 20_002L, 20_003L, 20_004L, 20_005L,
                20_006L, 20_007L, 20_008L, 20_009L, 20_010L);
        assertThat(topTen.get("movies").get(0).get("posterUrl").asText()).isEqualTo("https://img/w500/p20001.jpg");
    }

    @Test
    void eh01_topTenIsAChartSoTitlesInTheLibraryKeepTheirRank() throws Exception {
        trendingMovies();
        User user = users.save(User.builder().username("highlights-" + UUID.randomUUID()).password("p").build());
        Movie chartTopper = movies.save(Movie.builder().tmdbId(20_001L).title("Movie 20001").mediaType("MOVIE").build());
        entries.save(UserMovieEntry.builder().user(user).movie(chartTopper).status(MovieStatus.WATCHED).build());

        JsonNode topTen = category(highlights("movies", tokenFor(user)), "top-10");

        assertThat(ids(topTen)).hasSize(10).first().isEqualTo(20_001L);
    }

    @Test
    void eh02_animeHighlightsShowOnlyAnimeTvTitlesAndTvHighlightsLeaveAnimeOut() throws Exception {
        // TMDB's TV chart mixes anime, kids anime, western animation and live action, in this rank order.
        when(tmdb.getTrending(eq("tv"), anyString(), anyInt())).thenAnswer(call -> {
            int page = call.getArgument(2);
            if (page > 2) return List.of();
            long base = page * 100L;
            return List.of(
                    series(base + 1, "en", 18),               // live-action drama
                    series(base + 2, "ja", 16, 10759),        // anime
                    series(base + 3, "ja", 16, 10762),        // kids anime: excluded by the anime policy
                    series(base + 4, "en", 16),               // western animation: TV, not anime
                    series(base + 5, "ja", 16, 18),           // anime
                    series(base + 6, "ko", 18),               // live-action drama
                    series(base + 7, "ja", 16, 10751));       // family anime: excluded by the anime policy
        });

        JsonNode anime = highlights("anime", null);
        assertThat(ids(category(anime, "top-10"))).containsExactly(102L, 105L, 202L, 205L);
        assertThat(ids(category(anime, "spotlight"))).containsExactly(102L, 105L, 202L, 205L);
        category(anime, "top-10").get("movies").forEach(m -> assertThat(m.get("mediaType").asText()).isEqualTo("ANIME"));

        JsonNode tv = highlights("tv", null);
        assertThat(ids(category(tv, "top-10"))).containsExactly(101L, 104L, 106L, 201L, 204L, 206L);
    }

    @Test
    void eh04_providerFailureMarksTheHighlightsUnavailableWhileTheShelvesStillLoad() throws Exception {
        when(tmdb.getTrending(anyString(), anyString(), anyInt()))
                .thenThrow(new IllegalStateException("Provider trending request failed. Retry."));
        when(tmdb.discoverMovies(anyString(), anyInt(), any(), any(), anyInt())).thenAnswer(call ->
                (int) call.getArgument(4) == 1 ? List.of(movie(30_001)) : List.of());

        JsonNode response = highlights("movies", null);
        assertThat(category(response, "spotlight").get("state").asText()).isEqualTo("UNAVAILABLE");
        assertThat(category(response, "top-10").get("state").asText()).isEqualTo("UNAVAILABLE");

        JsonNode shelves = json.readTree(mvc().perform(get("/api/movies/explore/movies"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(shelves.get("categories")).hasSize(4);
        assertThat(category(shelves, "newest").get("state").asText()).isEqualTo("READY");
    }

    @Test
    void eh04_aFailedRefreshKeepsServingThePreviousChart() throws Exception {
        trendingMovies();
        scheduler.refreshCategory("MOVIE", MovieListType.TRENDING_DAY);
        when(tmdb.getTrending(anyString(), anyString(), anyInt()))
                .thenThrow(new IllegalStateException("Provider trending request failed. Retry."));

        scheduler.scheduledTopTenRefresh();

        assertThat(ids(category(highlights("movies", null), "top-10"))).hasSize(10).first().isEqualTo(20_001L);
    }

    @Test
    void eh01_spotlightKeepsFiveSlidesWhenATopTitleHasNoBackdrop() throws Exception {
        when(tmdb.getTrending(eq("movie"), anyString(), anyInt())).thenAnswer(call -> {
            List<TmdbMovieSummary> results = new ArrayList<>();
            for (int i = 1; i <= 20; i++) {
                TmdbMovieSummary m = movie(10_000 + i);
                if (i == 2) m.setBackdropPath(null);
                results.add(m);
            }
            return results;
        });

        JsonNode spotlight = category(highlights("movies", null), "spotlight");

        assertThat(ids(spotlight)).containsExactly(10_001L, 10_003L, 10_004L, 10_005L, 10_006L);
    }

    @Test
    void topTenMissingItsFourHourRefreshIsRebuiltOnReadSoItStaysToday() throws Exception {
        trendingMovies();
        scheduler.refreshCategory("MOVIE", MovieListType.TRENDING_DAY);
        var snapshot = snapshots.findByMediaTypeAndListType("MOVIE", MovieListType.TRENDING_DAY).orElseThrow();
        snapshot.setUpdatedAt(java.time.LocalDateTime.now(ZoneOffset.UTC).minusHours(13));
        snapshots.save(snapshot);
        clearInvocations(tmdb);

        JsonNode topTen = category(highlights("movies", null), "top-10");

        verify(tmdb, atLeastOnce()).getTrending("movie", "day", 1);
        assertThat(topTen.get("state").asText()).isEqualTo("READY");
    }

    @Test
    void highlightsAreBuiltFromTmdbAloneWithoutOmdbRequests() throws Exception {
        trendingMovies();
        highlights("movies", null);
        verifyNoInteractions(omdb);
    }
}
