package com.movienight.backend.controller;

import com.movienight.backend.model.Movie;
import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.model.User;
import com.movienight.backend.model.UserMovieEntry;
import com.movienight.backend.repository.MovieRepository;
import com.movienight.backend.repository.UserMovieEntryRepository;
import com.movienight.backend.repository.UserRepository;
import com.movienight.backend.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.UUID;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real JWT security, controllers, transactions, and H2; no mocked persistence. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:watchlist-test;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "app.tmdb.api-key=", "app.omdb.api-key=",
        "app.jwt.secret=watchlist-test-only-signing-key-at-least-32-bytes"
})
class WatchlistPersistenceTest {
    @Autowired private WebApplicationContext context;
    @Autowired private UserRepository users;
    @Autowired private MovieRepository movies;
    @Autowired private UserMovieEntryRepository entries;
    @Autowired private JwtTokenProvider tokens;

    private MockMvc mvc;
    private User owner;
    private String authorization;
    private Movie movie;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        owner = newUser();
        authorization = auth(owner);
        movie = movies.save(Movie.builder().tmdbId(Math.abs(UUID.randomUUID().getMostSignificantBits()))
                .title("Watchlist fixture " + UUID.randomUUID()).releaseYear(2026).mediaType("MOVIE").build());
    }

    @Test
    void browsingAndOpeningDetailsDoNotAddToLibrary() throws Exception {
        mvc.perform(get("/api/movies/search").param("query", movie.getTitle()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].tmdbId").value(movie.getTmdbId()));
        mvc.perform(get("/api/movies/tmdb/" + movie.getTmdbId()).param("mediaType", "MOVIE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(movie.getId()));
        expectEmpty(authorization);
    }

    @Test
    void explicitSaveAndRepeatSurviveIndependentReadsAsOneEntry() throws Exception {
        save(movie).andExpect(status().isCreated()).andExpect(jsonPath("$.movie.id").value(movie.getId()));
        save(movie).andExpect(status().isCreated());
        for (int read = 0; read < 2; read++) {
            mvc.perform(get("/api/movies/library").param("status", "WATCHLIST").header("Authorization", authorization))
                    .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)))
                    .andExpect(jsonPath("$[0].movie.tmdbId").value(movie.getTmdbId()))
                    .andExpect(jsonPath("$[0].status").value("WATCHLIST"));
        }
    }

    @Test
    void invalidSaveLeavesLibraryEmptyAndValidRetrySucceeds() throws Exception {
        mvc.perform(post("/api/movies/library").header("Authorization", authorization)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"\",\"status\":\"WATCHLIST\"}"))
                .andExpect(status().isBadRequest());
        expectEmpty(authorization);
        save(movie).andExpect(status().isCreated());
        mvc.perform(get("/api/movies/library").header("Authorization", authorization))
                .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void ownerIsolationAndAnonymousRejection() throws Exception {
        save(movie).andExpect(status().isCreated());
        expectEmpty(auth(newUser()));
        mvc.perform(post("/api/movies/library").contentType(MediaType.APPLICATION_JSON).content(body(movie)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/movies/library")).andExpect(status().isForbidden());
    }

    @Test
    void duplicateWatchlistAddKeepsWatchedStateRatingAndNotes() throws Exception {
        entries.save(UserMovieEntry.builder().user(owner).movie(movie).status(MovieStatus.WATCHED)
                .personalRating(8).notes("Keep my note").build());
        save(movie).andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("WATCHED"))
                .andExpect(jsonPath("$.personalRating").value(8)).andExpect(jsonPath("$.notes").value("Keep my note"));
        mvc.perform(get("/api/movies/library").header("Authorization", authorization))
                .andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].status").value("WATCHED"));
    }

    @Test
    void sameTitleAndYearDoNotMergeDistinctProviderMovies() throws Exception {
        save(movie).andExpect(status().isCreated());
        long otherTmdbId = movie.getTmdbId() - 1;
        mvc.perform(post("/api/movies/library").header("Authorization", authorization)
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"tmdbId":%d,"title":"%s","releaseYear":2026,"status":"WATCHLIST"}
                                """.formatted(otherTmdbId, movie.getTitle())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.movie.tmdbId").value(otherTmdbId));
        mvc.perform(get("/api/movies/library").header("Authorization", authorization))
                .andExpect(jsonPath("$", hasSize(2)));
    }

    @Test
    void providerIdEqualToAnotherCatalogKeyDoesNotChangeThatEntry() throws Exception {
        entries.save(UserMovieEntry.builder().user(owner).movie(movie).status(MovieStatus.WATCHED).build());
        Movie other = movies.save(Movie.builder().tmdbId(movie.getId()).title("Different movie")
                .releaseYear(2026).mediaType("MOVIE").build());
        save(other).andExpect(status().isCreated()).andExpect(jsonPath("$.movie.id").value(other.getId()));
        mvc.perform(get("/api/movies/library").header("Authorization", authorization))
                .andExpect(jsonPath("$", hasSize(2)));
    }

    private User newUser() {
        String name = "fixture-" + UUID.randomUUID();
        return users.save(User.builder().username(name).email(name + "@example.test")
                .displayName(name).password("unused-test-password").build());
    }

    private String auth(User user) {
        return "Bearer " + tokens.generateToken(user.getUsername(), user.getId(), user.getRole());
    }

    private String body(Movie target) {
        return """
                {"tmdbId":%d,"title":"%s","releaseYear":2026,"status":"WATCHLIST"}
                """.formatted(target.getTmdbId(), target.getTitle());
    }

    private org.springframework.test.web.servlet.ResultActions save(Movie target) throws Exception {
        return mvc.perform(post("/api/movies/library").header("Authorization", authorization)
                .contentType(MediaType.APPLICATION_JSON).content(body(target)));
    }

    private void expectEmpty(String auth) throws Exception {
        mvc.perform(get("/api/movies/library").header("Authorization", auth))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
    }
}
