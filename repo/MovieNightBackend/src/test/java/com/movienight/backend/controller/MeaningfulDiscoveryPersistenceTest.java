package com.movienight.backend.controller;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary;
import com.movienight.backend.model.User;
import com.movienight.backend.model.DiscoverySnapshot;
import com.movienight.backend.model.MovieListType;
import com.movienight.backend.repository.CachedMovieListRepository;
import com.movienight.backend.repository.DiscoverySnapshotRepository;
import com.movienight.backend.repository.UserRepository;
import com.movienight.backend.security.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.reset;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:meaningful-discovery-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=", "app.omdb.api-key=",
    "app.jwt.secret=meaningful-discovery-test-signing-key-at-least-32-bytes"
})
class MeaningfulDiscoveryPersistenceTest {
    @Autowired WebApplicationContext context;
    @Autowired UserRepository users;
    @Autowired CachedMovieListRepository cache;
    @Autowired DiscoverySnapshotRepository snapshots;
    @Autowired JwtTokenProvider tokens;
    @MockitoBean TmdbClient tmdb;
    @MockitoBean com.movienight.backend.client.AniListClient aniList; // disabled by default: no live AniList calls

    @BeforeEach void clearDisposableSnapshots() {
        reset(tmdb);
        cache.deleteAll();
        snapshots.deleteAll();
    }

    @Test void popularAndTopRatedUseEvidenceAndWholeBoundedCandidatePool() throws Exception {
        String yesterday = LocalDate.now(ZoneOffset.UTC).minusDays(1).toString();
        when(tmdb.isConfigured()).thenReturn(true);
        when(tmdb.discoverMovies(anyString(), anyInt(), any(), any(), anyInt())).thenAnswer(call -> {
            String sort = call.getArgument(0);
            int page = call.getArgument(4);
            if ("popularity.desc".equals(sort) && page == 1) return List.of(
                movie(99101, "Too few votes", 9.0, 199, 100, yesterday),
                movie(99102, "Popular", 7.0, 200, 90, yesterday),
                movie(99103, "Future", 9.0, 2000, 200, LocalDate.now(ZoneOffset.UTC).plusDays(1).toString()));
            if ("popularity.desc".equals(sort) && page == 2) return List.of(movie(99104, "Also popular", 8.0, 300, 95, yesterday));
            if ("vote_average.desc".equals(sort) && page == 1) return List.of(movie(99105, "Small sample", 9.0, 1000, 20, yesterday));
            if ("vote_average.desc".equals(sort) && page == 2) return List.of(movie(99106, "Strong support", 8.2, 10000, 10, yesterday));
            if ("vote_count.desc".equals(sort) && page == 1) return List.of(movie(99106, "Strong support", 8.2, 10000, 10, yesterday));
            return List.of();
        });
        User user = users.save(User.builder().username("discovery-" + UUID.randomUUID()).password("test").build());
        String token = "Bearer " + tokens.generateToken(user.getUsername(), user.getId(), user.getRole());
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        mvc.perform(get("/api/suggestions/explore/movies").header("Authorization", token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.categories[?(@.id=='popular')].title").value("Popular & well rated"))
            .andExpect(jsonPath("$.categories[?(@.id=='popular')].movies[0].tmdbId").value(99104))
            .andExpect(jsonPath("$.categories[?(@.id=='popular')].movies[1].tmdbId").value(99102))
            .andExpect(jsonPath("$.categories[?(@.id=='top-rated')].movies[0].tmdbId").value(99106))
            .andExpect(jsonPath("$.categories[?(@.id=='top-rated')].movies[1].tmdbId").value(99105));
    }

    @Test void failedLaterPageRetainsLastSuccessAndSnapshotAgeIsVisible() throws Exception {
        String yesterday = LocalDate.now(ZoneOffset.UTC).minusDays(1).toString();
        when(tmdb.isConfigured()).thenReturn(true);
        when(tmdb.discoverMovies(anyString(), anyInt(), any(), any(), anyInt())).thenAnswer(call -> {
            int votes = call.getArgument(1);
            int page = call.getArgument(4);
            return votes == 200 && page == 1
                    ? List.of(movie(99201, "Retained", 7.5, 250, 90, yesterday)) : List.of();
        });
        User user = users.save(User.builder().username("discovery-" + UUID.randomUUID()).password("test").build());
        String token = "Bearer " + tokens.generateToken(user.getUsername(), user.getId(), user.getRole());
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        mvc.perform(get("/api/suggestions/explore/movies").header("Authorization", token))
            .andExpect(jsonPath("$.categories[?(@.id=='popular')].movies[0].title").value("Retained"));
        String published = snapshots.findByMediaTypeAndListType("MOVIE", MovieListType.POPULAR)
                .orElseThrow().getUpdatedAt().toString();
        when(tmdb.discoverMovies(anyString(), anyInt(), any(), any(), anyInt())).thenAnswer(call -> {
            int page = call.getArgument(4);
            if (page == 2) throw new IllegalStateException("Provider unavailable");
            return List.of(movie(99202, "Must not publish", 9.0, 2000, 100, yesterday));
        });
        mvc.perform(post("/api/suggestions/explore/MOVIE/popular/refresh").header("Authorization", token))
            .andExpect(status().is5xxServerError());
        mvc.perform(get("/api/suggestions/explore/movies").header("Authorization", token))
            .andExpect(jsonPath("$.categories[?(@.id=='popular')].movies[0].title").value("Retained"));
        org.assertj.core.api.Assertions.assertThat(snapshots.findByMediaTypeAndListType("MOVIE", MovieListType.POPULAR)
                .orElseThrow().getUpdatedAt().toString()).isEqualTo(published);
        DiscoverySnapshot snapshot = snapshots.findByMediaTypeAndListType("MOVIE", MovieListType.POPULAR).orElseThrow();
        snapshot.setUpdatedAt(LocalDateTime.now(ZoneOffset.UTC).minusHours(25)); snapshots.saveAndFlush(snapshot);
        mvc.perform(get("/api/suggestions/explore/movies").header("Authorization", token))
            .andExpect(jsonPath("$.categories[?(@.id=='popular')].state").value("STALE"));
        snapshot.setUpdatedAt(LocalDateTime.now(ZoneOffset.UTC).minusDays(8)); snapshots.saveAndFlush(snapshot);
        mvc.perform(get("/api/suggestions/explore/movies").header("Authorization", token))
            .andExpect(jsonPath("$.categories[?(@.id=='popular')].state").value("UNAVAILABLE"))
            .andExpect(jsonPath("$.categories[1].movies").isEmpty());
    }

    @Test void tvAndAnimeKeepTypedClassificationAndTheirOwnVoteThresholds() throws Exception {
        String yesterday = LocalDate.now(ZoneOffset.UTC).minusDays(1).toString();
        String tomorrow = LocalDate.now(ZoneOffset.UTC).plusDays(1).toString();
        when(tmdb.isConfigured()).thenReturn(true);
        when(tmdb.discoverTv(anyString(), anyInt(), any(), any(), any(), any(), any(), any(), any(), anyInt()))
            .thenAnswer(call -> {
                int votes = call.getArgument(1);
                int page = call.getArgument(9);
                if (page > 1) return List.of();
                if (votes == 100) return List.of(tv(99301, "Series", 7.0, 100, 30, yesterday, false),
                    tv(99302, "Upcoming premiere", 8.0, 1000, 50, tomorrow, false),
                    tv(99303, "Anime is separate", 9.0, 1000, 60, yesterday, true));
                if (votes == 500) return List.of(tv(99304, "TV top", 8.0, 500, 20, yesterday, false));
                if (votes == 150) return List.of(tv(99305, "Anime popular", 7.0, 150, 40, yesterday, true));
                if (votes == 300) return List.of(tv(99306, "Anime top", 8.0, 300, 25, yesterday, true));
                return List.of();
            });
        User user = users.save(User.builder().username("discovery-" + UUID.randomUUID()).password("test").build());
        String token = "Bearer " + tokens.generateToken(user.getUsername(), user.getId(), user.getRole());
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        mvc.perform(post("/api/suggestions/explore/tv/popular/refresh").header("Authorization", token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.categories[1].movies[0].title").value("Series"))
            .andExpect(jsonPath("$.categories[1].movies[0].voteCount").value(100))
            .andExpect(jsonPath("$.categories[1].movies.length()").value(1));
        mvc.perform(post("/api/suggestions/explore/tv/top-rated/refresh").header("Authorization", token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.categories[2].movies[0].title").value("TV top"));
        mvc.perform(post("/api/suggestions/explore/anime/popular/refresh").header("Authorization", token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.categories[1].movies[0].title").value("Anime popular"))
            .andExpect(jsonPath("$.categories[1].movies[0].voteCount").value(150));
        mvc.perform(post("/api/suggestions/explore/anime/top-rated/refresh").header("Authorization", token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.categories[2].movies[0].title").value("Anime top"));
    }

    @Test void animeShelvesExcludeKidsAndFamilyAndRequireJapaneseAnimationWhileTvDoesNot() throws Exception {
        when(tmdb.isConfigured()).thenReturn(true);
        when(tmdb.discoverTv(any(), any(), any(), any(), any(), any(), any(), any(), any(), anyInt()))
            .thenReturn(List.of());
        User user = users.save(User.builder().username("discovery-" + UUID.randomUUID()).password("test").build());
        String token = "Bearer " + tokens.generateToken(user.getUsername(), user.getId(), user.getRole());
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        for (String shelf : List.of("current-season", "popular", "top-rated", "upcoming"))
            mvc.perform(post("/api/suggestions/explore/anime/" + shelf + "/refresh").header("Authorization", token));
        org.mockito.Mockito.verify(tmdb, org.mockito.Mockito.atLeastOnce()).discoverTv(any(), any(), any(), any(), any(), any(),
            eq("16"), eq("10762|10751"), eq("ja"), anyInt());
        org.mockito.Mockito.verify(tmdb, org.mockito.Mockito.never()).discoverTv(any(), any(), any(), any(), any(), any(),
            any(), isNull(), eq("ja"), anyInt());
        mvc.perform(post("/api/suggestions/explore/tv/popular/refresh").header("Authorization", token));
        org.mockito.Mockito.verify(tmdb, org.mockito.Mockito.atLeastOnce()).discoverTv(any(), any(), any(), any(), any(), any(),
            isNull(), isNull(), isNull(), anyInt());
    }

    @Test void coldAndScheduledRefreshesCoalesceConcurrentRequests() throws Exception {
        String yesterday = LocalDate.now(ZoneOffset.UTC).minusDays(1).toString();
        when(tmdb.isConfigured()).thenReturn(true);
        java.util.concurrent.atomic.AtomicInteger tmdbCalls = new java.util.concurrent.atomic.AtomicInteger();
        when(tmdb.discoverMovies(anyString(), anyInt(), any(), any(), anyInt())).thenAnswer(call -> {
            int page = call.getArgument(4);
            tmdbCalls.incrementAndGet();
            try { Thread.sleep(40); } catch (InterruptedException ignored) {}
            return page == 1 ? List.of(movie(99401, "Coalesced", 8.0, 500, 100, yesterday)) : List.of();
        });
        User user = users.save(User.builder().username("discovery-" + UUID.randomUUID()).password("test").build());
        String token = "Bearer " + tokens.generateToken(user.getUsername(), user.getId(), user.getRole());
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();

        var f1 = java.util.concurrent.CompletableFuture.runAsync(() -> {
            try {
                mvc.perform(get("/api/suggestions/explore/movies").header("Authorization", token))
                    .andExpect(status().isOk());
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
        var f2 = java.util.concurrent.CompletableFuture.runAsync(() -> {
            try {
                mvc.perform(get("/api/suggestions/explore/movies").header("Authorization", token))
                    .andExpect(status().isOk());
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        java.util.concurrent.CompletableFuture.allOf(f1, f2).join();

        // With shared category coalescing, duplicate concurrent cold reads do not duplicate TMDB requests
        org.assertj.core.api.Assertions.assertThat(tmdbCalls.get()).isLessThanOrEqualTo(10);
    }

    private TmdbMovieSummary movie(long id, String title, double average, int votes, double popularity, String date) {
        TmdbMovieSummary movie = new TmdbMovieSummary();
        movie.setId(id); movie.setTitle(title); movie.setVoteAverage(average);
        movie.setVoteCount(votes); movie.setPopularity(popularity); movie.setReleaseDate(date);
        return movie;
    }

    private TmdbMovieSummary tv(long id, String title, double average, int votes, double popularity, String date, boolean anime) {
        TmdbMovieSummary item = new TmdbMovieSummary();
        item.setId(id); item.setName(title); item.setMediaType("tv"); item.setFirstAirDate(date);
        item.setVoteAverage(average); item.setVoteCount(votes); item.setPopularity(popularity);
        item.setGenreIds(List.of(anime ? 16 : 18)); item.setOriginalLanguage(anime ? "ja" : "en");
        return item;
    }
}
