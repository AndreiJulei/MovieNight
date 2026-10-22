package com.movienight.backend.controller;

import com.movienight.backend.model.User;
import com.movienight.backend.repository.UserRepository;
import com.movienight.backend.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.UUID;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.contains;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Observe committed writes through independent authenticated API reads. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:watched-test;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "app.tmdb.api-key=", "app.omdb.api-key=",
        "app.jwt.secret=watched-test-only-signing-key-at-least-32-bytes"
})
class WatchedHistoryPersistenceTest {
    @Autowired private WebApplicationContext context;
    @Autowired private UserRepository users;
    @Autowired private JwtTokenProvider tokens;
    private MockMvc mvc;
    private String authorization;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        authorization = newAuthorization();
    }

    @Test
    void watchlistMovesToWatchedWithHalfPointRatingAndSurvivesRepeatAndReload() throws Exception {
        long movieId = add("WATCHLIST", "null").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString().transform(this::movieId);
        for (int repeat = 0; repeat < 2; repeat++) {
            update(movieId, "{\"status\":\"WATCHED\",\"personalRating\":7.5}")
                    .andExpect(status().isOk()).andExpect(jsonPath("$.personalRating").value(7.5));
        }
        mvc.perform(get("/api/movies/library").header("Authorization", authorization))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].status").value("WATCHED"))
                .andExpect(jsonPath("$[0].personalRating").value(7.5))
                .andExpect(jsonPath("$[0].notes").value("Keep my note"));
        mvc.perform(get("/api/movies/library").param("status", "WATCHLIST").header("Authorization", authorization))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
    }

    private String newAuthorization() {
        String name = "watched-" + UUID.randomUUID();
        User user = users.save(User.builder().username(name).email(name + "@example.test")
                .displayName(name).password("unused-test-password").build());
        return "Bearer " + tokens.generateToken(user.getUsername(), user.getId(), user.getRole());
    }

    @Test
    void zeroAndRemovedRatingRemainDistinctAfterReloadAndOmittedRatingIsPreserved() throws Exception {
        long id = movieId(add("WATCHED", "7.5").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        update(id, "{\"personalRating\":0}").andExpect(status().isOk());
        update(id, "{\"notes\":\"Updated note\"}").andExpect(status().isOk());
        expectRating(0.0);
        update(id, "{\"personalRating\":null}").andExpect(status().isOk());
        expectRating(null);
    }

    private void expectRating(Double rating) throws Exception {
        mvc.perform(get("/api/movies/library").header("Authorization", authorization))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].status").value("WATCHED"))
                .andExpect(jsonPath("$[0].personalRating").value(rating));
    }

    @Test
    void invalidRatingsAreRejectedWithoutChangingPersistedStateAndRetryWorks() throws Exception {
        long id = movieId(add("WATCHED", "7.5").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        for (String invalid : new String[]{"-0.5", "10.5", "7.25", "0.1"}) {
            update(id, "{\"personalRating\":" + invalid + "}").andExpect(status().isBadRequest());
            add("WATCHED", invalid).andExpect(status().isBadRequest());
            expectRating(7.5);
        }
        update(id, "{\"personalRating\":10}").andExpect(status().isOk());
        expectRating(10.0);
    }

    @Test
    void directWatchedAddCanStayUnratedAndAllHalfPointValuesSurviveReload() throws Exception {
        String response = mvc.perform(post("/api/movies/library").header("Authorization", authorization)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mediaType\":\"MOVIE\",\"title\":\"Unrated fixture\",\"status\":\"WATCHED\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        expectRating(null);
        long id = movieId(response);
        for (double rating = 0; rating <= 10; rating += 0.5) {
            update(id, "{\"personalRating\":" + rating + "}").andExpect(status().isOk());
            expectRating(rating);
        }
    }

    @Test
    void anotherOwnerAndAnonymousCallerCannotChangeOwnersHistory() throws Exception {
        long id = movieId(add("WATCHED", "7.5").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String other = newAuthorization();
        mvc.perform(put("/api/movies/library/" + id).header("Authorization", other)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"personalRating\":0}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/movies/library").header("Authorization", other))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(put("/api/movies/library/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"personalRating\":0}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/movies/library").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Anonymous\",\"status\":\"WATCHED\"}"))
                .andExpect(status().isForbidden());
        expectRating(7.5);
    }

    @Test
    void repeatedDirectAddKeepsOneEntryAndWatchlistRetryPreservesDecimalRating() throws Exception {
        String body = """
                {"mediaType":"MOVIE","tmdbId":90000001,"title":"Repeat fixture","status":"WATCHED","personalRating":7.5}
                """;
        for (int repeat = 0; repeat < 2; repeat++) {
            mvc.perform(post("/api/movies/library").header("Authorization", authorization)
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isCreated());
        }
        mvc.perform(post("/api/movies/library").header("Authorization", authorization)
                        .contentType(MediaType.APPLICATION_JSON).content(body.replace("WATCHED", "WATCHLIST")))
                .andExpect(status().isCreated());
        expectRating(7.5);
        mvc.perform(post("/api/movies/library").header("Authorization", authorization)
                        .contentType(MediaType.APPLICATION_JSON).content(body.replace("7.5", "null")))
                .andExpect(status().isCreated());
        expectRating(null);
    }

    @Test
    void updateUsesCatalogKeyEvenWhenItCollidesWithAnotherMoviesProviderId() throws Exception {
        long firstId = movieId(add("WATCHED", "0").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String response = mvc.perform(post("/api/movies/library").header("Authorization", authorization)
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"mediaType":"MOVIE","tmdbId":%d,"title":"Collision fixture","status":"WATCHLIST"}
                                """.formatted(firstId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long secondId = movieId(response);
        update(secondId, "{\"status\":\"WATCHED\",\"personalRating\":7.5}").andExpect(status().isOk());
        mvc.perform(get("/api/movies/library").header("Authorization", authorization))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[?(@.movie.id == " + firstId + ")].personalRating").value(contains(0.0)))
                .andExpect(jsonPath("$[?(@.movie.id == " + secondId + ")].personalRating").value(contains(7.5)));
    }

    @Test
    void unknownCatalogKeyDoesNotFallBackToAnUnrelatedProviderIdentity() throws Exception {
        mvc.perform(post("/api/movies/library").header("Authorization", authorization)
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"mediaType":"MOVIE","tmdbId":90000002,"title":"Exact identity fixture","status":"WATCHED","personalRating":7.5}
                                """))
                .andExpect(status().isCreated());
        update(90000002L, "{\"personalRating\":0}").andExpect(status().isBadRequest());
        expectRating(7.5);
    }

    private ResultActions add(String state, String rating) throws Exception {
        return mvc.perform(post("/api/movies/library").header("Authorization", authorization)
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"mediaType":"MOVIE","title":"Watched fixture %s","status":"%s","personalRating":%s,"notes":"Keep my note"}
                        """.formatted(UUID.randomUUID(), state, rating)));
    }

    private ResultActions update(long id, String body) throws Exception {
        return mvc.perform(put("/api/movies/library/" + id).header("Authorization", authorization)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private long movieId(String json) {
        return com.jayway.jsonpath.JsonPath.<Number>read(json, "$.movie.id").longValue();
    }
}
