package com.movienight.backend.controller;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.model.User;
import com.movienight.backend.repository.UserRepository;
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
import java.util.UUID;
import static org.hamcrest.Matchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:tv-titles;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=", "app.omdb.api-key=",
    "app.jwt.secret=tv-test-only-signing-key-at-least-32-bytes"})
class TvTitlesPersistenceTest {
    @Autowired WebApplicationContext context;
    @Autowired UserRepository users;
    @Autowired JwtTokenProvider tokens;
    @Autowired com.movienight.backend.repository.CachedMovieListRepository cache;
    @Autowired com.movienight.backend.repository.MovieRepository catalog;
    @MockitoBean TmdbClient tmdb;
    MockMvc mvc;
    User owner;
    static long nextId = 99800000;
    long id;

    @BeforeEach void setup() {
        reset(tmdb);
        cache.deleteAll();
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        owner = users.save(User.builder().username("tv-" + UUID.randomUUID()).password("test").build());
        id = ++nextId;
    }

    @Test void animeByJapaneseOriginIsSeparateFromTvAcrossDiscoverySearchAndDetails() throws Exception {
        when(tmdb.isConfigured()).thenReturn(true);
        var anime = new com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary();
        anime.setId(id); anime.setName("Anime"); anime.setMediaType("tv"); anime.setGenreIds(java.util.List.of(16));
        anime.setOriginalLanguage("en"); anime.setOriginCountry(java.util.List.of("JP"));
        var tv = new com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary();
        tv.setId(id + 1); tv.setName("Japanese drama"); tv.setMediaType("tv"); tv.setGenreIds(java.util.List.of(18));
        tv.setOriginalLanguage("ja"); tv.setOriginCountry(java.util.List.of("JP"));
        when(tmdb.discoverTv(any(), any(), any(), any(), any(), any(), any(), any(), anyInt()))
            .thenReturn(java.util.List.of(anime, tv, anime));
        when(tmdb.getTvOnTheAir(anyInt())).thenReturn(java.util.List.of(anime, tv));
        read("/api/movies/explore/tv").andExpect(status().isOk())
            .andExpect(jsonPath("$.categories[*].movies[*].title", not(hasItem("Anime"))))
            .andExpect(jsonPath("$.categories[*].movies[*].title", hasItem("Japanese drama")));
        read("/api/movies/explore/anime").andExpect(status().isOk())
            .andExpect(jsonPath("$.categories[*].movies[*].title", not(hasItem("Japanese drama"))))
            .andExpect(jsonPath("$.categories[0].movies", hasSize(1)))
            .andExpect(jsonPath("$.categories[0].movies[0].mediaType").value("ANIME"));
        when(tmdb.searchMovies("Anime")).thenReturn(java.util.List.of(anime, tv));
        read("/api/movies/search?query=Anime").andExpect(jsonPath("$[0].mediaType").value("ANIME"));
        var detail = new com.movienight.backend.dto.external.TmdbMovieDetailsResponse();
        detail.setId(id); detail.setName("Anime"); detail.setOriginalLanguage("en"); detail.setOriginCountry(java.util.List.of("JP"));
        var genre = new com.movienight.backend.dto.external.TmdbMovieDetailsResponse.Genre(); genre.setId(16); genre.setName("Animation");
        detail.setGenres(java.util.List.of(genre));
        when(tmdb.getTvDetails(id)).thenReturn(java.util.Optional.of(detail));
        read("/api/movies/tmdb/" + id + "?mediaType=TV").andExpect(jsonPath("$.mediaType").value("ANIME"));
        detail.setTitle("Anime film"); detail.setName(null);
        when(tmdb.getMovieDetails(id)).thenReturn(java.util.Optional.of(detail));
        read("/api/movies/tmdb/" + id + "?mediaType=MOVIE").andExpect(jsonPath("$.mediaType").value("MOVIE"));
        cache.deleteAll();
        cache.save(com.movienight.backend.model.CachedMovieList.builder().tmdbId(id).title("Anime")
            .mediaType("TV").listType(com.movienight.backend.model.MovieListType.POPULAR).rankOrder(1).build());
        read("/api/movies/explore/tv").andExpect(status().isOk())
            .andExpect(jsonPath("$.categories[*].movies[*].title", not(hasItem("Anime"))));
    }

    @Test void explicitDetailsAndSearchKeepEqualIdsAndNeverGuessAnEndpoint() throws Exception {
        when(tmdb.isConfigured()).thenReturn(true);
        var movie = new com.movienight.backend.dto.external.TmdbMovieDetailsResponse();
        movie.setId(id); movie.setTitle("Shared movie");
        var tv = new com.movienight.backend.dto.external.TmdbMovieDetailsResponse();
        tv.setId(id); tv.setName("Shared series");
        when(tmdb.getMovieDetails(id)).thenReturn(java.util.Optional.of(movie));
        when(tmdb.getTvDetails(id)).thenReturn(java.util.Optional.of(tv));
        read("/api/movies/tmdb/" + id).andExpect(status().isBadRequest());
        read("/api/movies/tmdb/" + id + "?mediaType=invalid").andExpect(status().isBadRequest());
        read("/api/movies/tmdb/" + id + "?mediaType=MOVIE").andExpect(status().isOk())
            .andExpect(jsonPath("$.title").value("Shared movie"));
        read("/api/movies/tmdb/" + id + "?mediaType=TV").andExpect(status().isOk())
            .andExpect(jsonPath("$.title").value("Shared series"));
        read("/api/movies/search?query=Shared").andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(2)));
        when(tmdb.getTvDetails(id + 100)).thenReturn(java.util.Optional.empty());
        when(tmdb.getMovieDetails(id + 100)).thenReturn(java.util.Optional.of(movie));
        read("/api/movies/tmdb/" + (id + 100) + "?mediaType=TV").andExpect(status().isNotFound());
        read("/api/movies/library").andExpect(jsonPath("$", hasSize(0)));
    }

    @Test void equalProviderIdsAndAnimeAliasesHaveIndependentPersistentLibraryState() throws Exception {
        save("MOVIE", "Movie", "WATCHLIST", "null").andExpect(status().isCreated());
        save("TV", "Series", "WATCHLIST", "null").andExpect(status().isCreated());
        save("ANIME", "Series", "WATCHLIST", "null").andExpect(status().isCreated());
        save("TV", "Series", "WATCHED", "0").andExpect(status().isCreated());
        save("TV", "Series", "WATCHED", "7.5").andExpect(status().isCreated());
        for (int attempt = 0; attempt < 2; attempt++) {
            read("/api/movies/library").andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[?(@.movie.mediaType == 'MOVIE')].status", hasItem("WATCHLIST")))
                .andExpect(jsonPath("$[?(@.movie.mediaType == 'TV')].personalRating", hasItem(7.5)));
        }
    }

    @Test void typedTitlesCanSharePrivateListsWithoutChangingLibrary() throws Exception {
        long movieKey = ((Number) com.jayway.jsonpath.JsonPath.read(save("MOVIE", "Movie", "WATCHLIST", "null")
            .andReturn().getResponse().getContentAsString(), "$.movie.id")).longValue();
        long tvKey = ((Number) com.jayway.jsonpath.JsonPath.read(save("TV", "Series", "WATCHLIST", "null")
            .andReturn().getResponse().getContentAsString(), "$.movie.id")).longValue();
        var response = mvc.perform(post("/api/lists").header("Authorization", token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"Mixed\",\"initialMovieIds\":[" + movieKey + "," + tvKey + "]}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.entries", hasSize(2))).andReturn();
        long listKey = ((Number) com.jayway.jsonpath.JsonPath.read(response.getResponse().getContentAsString(), "$.id")).longValue();
        read("/api/lists/" + listKey).andExpect(status().isOk()).andExpect(jsonPath("$.entries", hasSize(2)));
        read("/api/movies/library").andExpect(jsonPath("$", hasSize(2)));
    }

    @Test void concurrentSavesAreIdempotentAndCatalogMutationsCannotTouchEqualProviderIds() throws Exception {
        var gate = new java.util.concurrent.CountDownLatch(1);
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(3)) {
            var first = pool.submit(() -> { gate.await(); return save("TV", "Series", "WATCHLIST", "null").andReturn().getResponse().getStatus(); });
            var second = pool.submit(() -> { gate.await(); return save("ANIME", "Series", "WATCHLIST", "null").andReturn().getResponse().getStatus(); });
            var third = pool.submit(() -> { gate.await(); return save("MOVIE", "Movie", "WATCHLIST", "null").andReturn().getResponse().getStatus(); });
            gate.countDown();
            org.junit.jupiter.api.Assertions.assertEquals(201, first.get(15, java.util.concurrent.TimeUnit.SECONDS));
            org.junit.jupiter.api.Assertions.assertEquals(201, second.get(15, java.util.concurrent.TimeUnit.SECONDS));
            org.junit.jupiter.api.Assertions.assertEquals(201, third.get(15, java.util.concurrent.TimeUnit.SECONDS));
        }
        read("/api/movies/library").andExpect(jsonPath("$", hasSize(2)));
        long tvKey = ((Number) com.jayway.jsonpath.JsonPath.read(save("TV", "Series", "WATCHED", "0")
            .andReturn().getResponse().getContentAsString(), "$.movie.id")).longValue();
        mvc.perform(put("/api/movies/library/" + tvKey).header("Authorization", token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"personalRating\":null,\"notes\":\"Private TV note\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.personalRating").isEmpty());
        mvc.perform(put("/api/movies/library/" + tvKey).header("Authorization", token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"personalRating\":7.2}" )).andExpect(status().isBadRequest());
        mvc.perform(delete("/api/movies/library/" + tvKey).header("Authorization", token())).andExpect(status().isOk());
        read("/api/movies/library").andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].movie.mediaType").value("MOVIE"));
    }

    @Test void tvLibraryAndListsRemainOwnerOnlyAndUntypedWritesAreRejected() throws Exception {
        long tvKey = ((Number) com.jayway.jsonpath.JsonPath.read(save("TV", "Series", "WATCHED", "7.5")
            .andReturn().getResponse().getContentAsString(), "$.movie.id")).longValue();
        var result = mvc.perform(post("/api/lists").header("Authorization", token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"Private TV\",\"initialMovieIds\":[" + tvKey + "]}" )).andExpect(status().isCreated()).andReturn();
        long listKey = ((Number) com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.id")).longValue();
        var originalOwner = owner;
        owner = users.save(User.builder().username("outsider-" + UUID.randomUUID()).password("test").build());
        read("/api/lists/" + listKey).andExpect(status().isForbidden());
        read("/api/movies/library").andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(put("/api/movies/library/" + tvKey).header("Authorization", token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"notes\":\"Stolen\"}" )).andExpect(status().isBadRequest());
        mvc.perform(get("/api/movies/library")).andExpect(status().isForbidden());
        owner = originalOwner;
        save("", "Ambiguous", "WATCHLIST", "null").andExpect(status().isBadRequest());
        save("INVALID", "Invalid", "WATCHLIST", "null").andExpect(status().isBadRequest());
        read("/api/movies/library").andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].personalRating").value(7.5));
    }

    @Test void explicitCatalogKeySupportsLocalTitlesAndRejectsConflictingIdentity() throws Exception {
        var title = catalog.save(com.movienight.backend.model.Movie.builder().title("Local TV title").mediaType("TV").build());
        for (int attempt = 0; attempt < 2; attempt++) {
            mvc.perform(post("/api/movies/library").header("Authorization", token()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"catalogMovieId\":" + title.getId() + ",\"title\":\"Local TV title\",\"status\":\"WATCHLIST\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.movie.id").value(title.getId()));
        }
        mvc.perform(post("/api/movies/library").header("Authorization", token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"catalogMovieId\":" + title.getId() + ",\"mediaType\":\"MOVIE\",\"title\":\"Conflict\",\"status\":\"WATCHED\"}"))
            .andExpect(status().isBadRequest());
        read("/api/movies/library").andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].status").value("WATCHLIST"));
    }

    @Test void tvSharingRequiresAcceptedFriendshipAndMovieSuggestionsIgnoreTvIdentity() throws Exception {
        var tvOwner = owner;
        long tvKey = ((Number) com.jayway.jsonpath.JsonPath.read(save("TV", "Series", "WATCHED", "0")
            .andReturn().getResponse().getContentAsString(), "$.movie.id")).longValue();
        mvc.perform(put("/api/movies/library/" + tvKey).header("Authorization", token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"notes\":\"TV secret\"}" )).andExpect(status().isOk());
        owner = users.save(User.builder().username("friend-" + UUID.randomUUID()).displayName("Friend").password("test").build());
        var friend = owner;
        save("MOVIE", "Distinct movie", "WATCHED", "9").andExpect(status().isCreated());
        mvc.perform(post("/api/friends/add").header("Authorization", token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"identifier\":\"" + tvOwner.getUsername() + "\"}" )).andExpect(status().isCreated());
        read("/api/friends/" + tvOwner.getId() + "/library").andExpect(status().isForbidden());
        owner = tvOwner;
        mvc.perform(post("/api/friends/" + friend.getId() + "/accept").header("Authorization", token())).andExpect(status().isOk());
        read("/api/suggestions/friends").andExpect(status().isOk())
            .andExpect(jsonPath("$.categories[0].movies", hasSize(1)))
            .andExpect(jsonPath("$.categories[0].movies[0].mediaType").value("MOVIE"));
        owner = friend;
        read("/api/friends/" + tvOwner.getId() + "/library").andExpect(status().isOk())
            .andExpect(jsonPath("$[0].personalRating").value(0))
            .andExpect(jsonPath("$[0]", not(hasKey("notes"))));
        read("/api/movies/" + tvKey + "/friends-ratings").andExpect(status().isOk())
            .andExpect(jsonPath("$[0].personalRating").value(0))
            .andExpect(jsonPath("$[0]", not(hasKey("notes"))));
        read("/api/suggestions/friends").andExpect(jsonPath("$.categories[0].movies", hasSize(0)));
        mvc.perform(delete("/api/friends/" + tvOwner.getId()).header("Authorization", token())).andExpect(status().isOk());
        read("/api/friends/" + tvOwner.getId() + "/library").andExpect(status().isForbidden());
        read("/api/movies/" + tvKey + "/friends-ratings").andExpect(jsonPath("$", hasSize(0)));
    }

    ResultActions save(String type, String title, String state, String rating) throws Exception {
        return mvc.perform(post("/api/movies/library").header("Authorization", token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"tmdbId\":" + id + ",\"title\":\"" + title + "\",\"mediaType\":\"" + type
                + "\",\"status\":\"" + state + "\",\"personalRating\":" + rating + "}"));
    }
    String token() { return "Bearer " + tokens.generateToken(owner.getUsername(), owner.getId(), owner.getRole()); }
    ResultActions read(String path) throws Exception { return mvc.perform(get(path).header("Authorization", token())); }
}
