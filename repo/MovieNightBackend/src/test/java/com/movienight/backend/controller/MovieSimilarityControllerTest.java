package com.movienight.backend.controller;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary;
import com.movienight.backend.model.CachedMovieList;
import com.movienight.backend.model.Movie;
import com.movienight.backend.model.MovieListType;
import com.movienight.backend.model.MovieSimilarity;
import com.movienight.backend.model.ResourceType;
import com.movienight.backend.repository.CachedMovieListRepository;
import com.movienight.backend.repository.MovieRepository;
import com.movienight.backend.repository.MovieSimilarityRepository;
import com.movienight.backend.service.MovieSimilarityDataLoader;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:movie-similarity-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "app.tmdb.api-key=",
    "app.omdb.api-key=",
    "app.jwt.secret=movie-similarity-test-signing-key-at-least-32-bytes"
})
class MovieSimilarityControllerTest {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private MovieSimilarityRepository movieSimilarityRepository;

    @Autowired
    private MovieRepository movieRepository;

    @Autowired
    private CachedMovieListRepository cachedMovieListRepository;

    @MockitoBean
    private TmdbClient tmdbClient;

    @MockitoBean
    private MovieSimilarityDataLoader movieSimilarityDataLoader;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
                .apply(springSecurity())
                .build();
        reset(tmdbClient);
        movieSimilarityRepository.deleteAllInBatch();
        movieRepository.deleteAllInBatch();
        cachedMovieListRepository.deleteAllInBatch();
    }

    @Test
    @DisplayName("SIM01: GET /api/movies/{tmdbId}/similar returns HTTP 200 with top similar movies up to default limit 10")
    void getSimilarMovies_defaultLimit_returnsPrecomputedSimilarMovies() throws Exception {
        Long targetTmdbId = 550L;

        // Seed 15 neighbors with descending scores
        for (int i = 1; i <= 15; i++) {
            long neighborId = 1000L + i;
            movieSimilarityRepository.save(MovieSimilarity.builder()
                    .tmdbId(targetTmdbId)
                    .neighborTmdbId(neighborId)
                    .score(1.0 - (i * 0.05))
                    .build());

            movieRepository.save(Movie.builder()
                    .tmdbId(neighborId)
                    .title("Similar Movie " + i)
                    .releaseYear(2000 + i)
                    .posterUrl("/p" + i + ".jpg")
                    .backdropUrl("/b" + i + ".jpg")
                    .tmdbVoteAverage(7.0 + (i * 0.1))
                    .resourceType(ResourceType.MOVIE)
                    .mediaType("MOVIE")
                    .build());
        }

        mockMvc.perform(get("/api/movies/{tmdbId}/similar", targetTmdbId)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(10)))
                .andExpect(jsonPath("$[0].tmdbId").value(1001L))
                .andExpect(jsonPath("$[0].title").value("Similar Movie 1"))
                .andExpect(jsonPath("$[0].releaseYear").value(2001))
                .andExpect(jsonPath("$[0].posterUrl").value("/p1.jpg"))
                .andExpect(jsonPath("$[0].backdropUrl").value("/b1.jpg"))
                .andExpect(jsonPath("$[0].tmdbVoteAverage").value(7.1))
                .andExpect(jsonPath("$[9].tmdbId").value(1010L))
                .andExpect(jsonPath("$[9].title").value("Similar Movie 10"));
    }

    @Test
    @DisplayName("SIM01 / SIM02: Custom limit query parameter is respected and clamped to max 30")
    void getSimilarMovies_customLimitAndMaxClamp() throws Exception {
        Long targetTmdbId = 550L;

        for (int i = 1; i <= 35; i++) {
            long neighborId = 2000L + i;
            movieSimilarityRepository.save(MovieSimilarity.builder()
                    .tmdbId(targetTmdbId)
                    .neighborTmdbId(neighborId)
                    .score(0.99 - (i * 0.01))
                    .build());

            movieRepository.save(Movie.builder()
                    .tmdbId(neighborId)
                    .title("Batch Movie " + i)
                    .releaseYear(2020)
                    .resourceType(ResourceType.MOVIE)
                    .mediaType("MOVIE")
                    .build());
        }

        // Test limit=5
        mockMvc.perform(get("/api/movies/{tmdbId}/similar", targetTmdbId)
                        .param("limit", "5")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(5)));

        // Test limit=50 (should clamp to max 30)
        mockMvc.perform(get("/api/movies/{tmdbId}/similar", targetTmdbId)
                        .param("limit", "50")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(30)));
    }

    @Test
    @DisplayName("Domain Isolation: mediaType=tv bypasses movie_similarity and routes directly to TMDB TV recommendations")
    void getSimilarMovies_mediaTypeTv_bypassesMovieSimilarityAndCallsTvRecommendations() throws Exception {
        Long showId = 1399L;

        // Seed a movie similarity for ID 1399 that should be ignored when mediaType=tv
        movieSimilarityRepository.save(MovieSimilarity.builder()
                .tmdbId(showId)
                .neighborTmdbId(9999L)
                .score(0.95)
                .build());
        movieRepository.save(Movie.builder()
                .tmdbId(9999L)
                .title("Should Not Be Returned Movie")
                .resourceType(ResourceType.MOVIE)
                .build());

        TmdbMovieSummary tvSummary = new TmdbMovieSummary();
        tvSummary.setId(63247L);
        tvSummary.setName("Westworld");
        tvSummary.setFirstAirDate("2016-10-02");
        tvSummary.setMediaType("tv");
        tvSummary.setPosterPath("/westworld.jpg");
        tvSummary.setBackdropPath("/westworld-backdrop.jpg");
        tvSummary.setVoteAverage(8.1);
        tvSummary.setVoteCount(5000);

        when(tmdbClient.getTvRecommendations(eq(showId), anyInt())).thenReturn(List.of(tvSummary));
        when(tmdbClient.buildPosterUrl("/westworld.jpg")).thenReturn("https://image.tmdb.org/t/p/w500/westworld.jpg");
        when(tmdbClient.buildBackdropUrl("/westworld-backdrop.jpg")).thenReturn("https://image.tmdb.org/t/p/w1280/westworld-backdrop.jpg");

        mockMvc.perform(get("/api/movies/{tmdbId}/similar", showId)
                        .param("mediaType", "tv")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].tmdbId").value(63247L))
                .andExpect(jsonPath("$[0].title").value("Westworld"))
                .andExpect(jsonPath("$[0].releaseYear").value(2016))
                .andExpect(jsonPath("$[0].mediaType").value("TV"));

        verify(tmdbClient, never()).getMovieRecommendations(any(), anyInt());
        verify(tmdbClient, times(1)).getTvRecommendations(eq(showId), anyInt());
    }

    @Test
    @DisplayName("SIM02: Precomputed neighbors missing from movie catalog resolve from cached discover list")
    void getSimilarMovies_resolvesFromCachedDiscoverList() throws Exception {
        Long targetTmdbId = 550L;
        Long neighborId = 777L;

        movieSimilarityRepository.save(MovieSimilarity.builder()
                .tmdbId(targetTmdbId)
                .neighborTmdbId(neighborId)
                .score(0.9)
                .build());

        cachedMovieListRepository.save(CachedMovieList.builder()
                .tmdbId(neighborId)
                .title("Cached Discover Title")
                .releaseDate("2023-01-15")
                .posterPath("/cached.jpg")
                .voteAverage(7.8)
                .voteCount(300)
                .rankOrder(1)
                .mediaType("MOVIE")
                .listType(MovieListType.POPULAR)
                .build());

        when(tmdbClient.buildPosterUrl("/cached.jpg")).thenReturn("https://image.tmdb.org/t/p/w500/cached.jpg");

        mockMvc.perform(get("/api/movies/{tmdbId}/similar", targetTmdbId)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].tmdbId").value(neighborId))
                .andExpect(jsonPath("$[0].title").value("Cached Discover Title"))
                .andExpect(jsonPath("$[0].releaseYear").value(2023))
                .andExpect(jsonPath("$[0].posterUrl").value("https://image.tmdb.org/t/p/w500/cached.jpg"))
                .andExpect(jsonPath("$[0].tmdbVoteAverage").value(7.8));
    }

    @Test
    @DisplayName("SIM03: When title has no precomputed similarity rows, falls back gracefully to TMDB recommendations")
    void getSimilarMovies_noPrecomputedNeighbors_fallsBackToTmdbRecommendations() throws Exception {
        Long unknownTmdbId = 999999L;

        TmdbMovieSummary recSummary = new TmdbMovieSummary();
        recSummary.setId(888L);
        recSummary.setTitle("Fallback Recommended Movie");
        recSummary.setReleaseDate("2024-05-10");
        recSummary.setPosterPath("/fallback-poster.jpg");
        recSummary.setBackdropPath("/fallback-backdrop.jpg");
        recSummary.setVoteAverage(8.4);
        recSummary.setVoteCount(1500);

        when(tmdbClient.getMovieRecommendations(eq(unknownTmdbId), anyInt()))
                .thenReturn(List.of(recSummary));
        when(tmdbClient.buildPosterUrl("/fallback-poster.jpg")).thenReturn("https://image.tmdb.org/t/p/w500/fallback-poster.jpg");
        when(tmdbClient.buildBackdropUrl("/fallback-backdrop.jpg")).thenReturn("https://image.tmdb.org/t/p/w1280/fallback-backdrop.jpg");

        mockMvc.perform(get("/api/movies/{tmdbId}/similar", unknownTmdbId)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].tmdbId").value(888L))
                .andExpect(jsonPath("$[0].title").value("Fallback Recommended Movie"))
                .andExpect(jsonPath("$[0].releaseYear").value(2024))
                .andExpect(jsonPath("$[0].posterUrl").value("https://image.tmdb.org/t/p/w500/fallback-poster.jpg"))
                .andExpect(jsonPath("$[0].backdropUrl").value("https://image.tmdb.org/t/p/w1280/fallback-backdrop.jpg"))
                .andExpect(jsonPath("$[0].tmdbVoteAverage").value(8.4));
    }

    @Test
    @DisplayName("SIM03: Gracefully returns empty list HTTP 200 when TMDB fallback fails or is unavailable")
    void getSimilarMovies_fallbackFailure_returnsEmptyListGracefully() throws Exception {
        Long missingId = 777777L;

        when(tmdbClient.getMovieRecommendations(eq(missingId), anyInt()))
                .thenThrow(new IllegalStateException("TMDB recommendation service down"));

        mockMvc.perform(get("/api/movies/{tmdbId}/similar", missingId)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }
}
