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
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Observe persistence and authorization through real JWT-authenticated HTTP reads. */
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:friend-suggestions-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=", "app.omdb.api-key=",
    "app.jwt.secret=friend-suggestions-test-only-signing-key-at-least-32-bytes"
})
class FriendSuggestionsPersistenceTest {
    @Autowired private WebApplicationContext context;
    @Autowired private UserRepository users;
    @Autowired private JwtTokenProvider tokens;
    private MockMvc mvc;
    private User alice, bob, outsider;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        alice = newUser(); bob = newUser(); outsider = newUser();
    }

    @Test
    void suppliedWatchedRatingsRankByConsensusIncludingZeroOnIndependentReads() throws Exception {
        accept(alice, bob); accept(alice, outsider);
        save(bob, 99500101, "A", "WATCHED", "8");
        save(outsider, 99500101, "A", "WATCHED", "6");
        save(bob, 99500102, "B", "WATCHED", "9");
        save(bob, 99500103, "Zero", "WATCHED", "0");
        save(outsider, 99500103, "Zero", "WATCHED", "null");
        save(bob, 99500104, "Unrated", "WATCHED", "null");
        for (int i = 0; i < 2; i++) {
            read(alice, "/api/suggestions/friends").andExpect(status().isOk())
                .andExpect(jsonPath("$.categories[0].movies", hasSize(3)))
                .andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(99500101))
                .andExpect(jsonPath("$.categories[0].movies[0].score").value(14.0))
                .andExpect(jsonPath("$.categories[0].movies[1].score").value(9.0))
                .andExpect(jsonPath("$.categories[0].movies[2].score").value(0.0))
                .andExpect(jsonPath("$.categories[0].movies[0].notes").doesNotExist());
        }
    }

    @Test
    void separatesWatchlistsWithRatedPrecedenceAndStableTiesAndMovieOnlySources() throws Exception {
        accept(alice, bob); accept(alice, outsider);
        save(bob, 99500202, "Tie high ID", "WATCHED", "7");
        save(bob, 99500201, "Tie low ID", "WATCHED", "7");
        save(outsider, 99500201, "Overlap", "WATCHLIST", "null");
        save(bob, 99500204, "Planned high ID", "WATCHLIST", "null");
        save(bob, 99500203, "Planned low ID", "WATCHLIST", "null");
        save(outsider, 99500205, "Popular plan", "WATCHLIST", "null");
        save(bob, 99500205, "Popular plan", "WATCHLIST", "null");
        write(bob, "POST", "/api/movies/library", "{\"title\":\"TV deferred\",\"tmdbId\":99500206,\"mediaType\":\"TV\",\"status\":\"WATCHED\",\"personalRating\":10}")
            .andExpect(status().isCreated());
        for (String path : new String[]{"/api/suggestions/friends", "/api/suggestions"}) {
            read(alice, path).andExpect(status().isOk())
                .andExpect(jsonPath("$.categories[?(@.id == 'friends')].movies[0].tmdbId").value(org.hamcrest.Matchers.contains(99500201)))
                .andExpect(jsonPath("$.categories[?(@.id == 'friends')].movies[1].tmdbId").value(org.hamcrest.Matchers.contains(99500202)))
                .andExpect(jsonPath("$.categories[?(@.id == 'friends')].movies[*].tmdbId").value(org.hamcrest.Matchers.contains(99500201, 99500202)))
                .andExpect(jsonPath("$.categories[?(@.id == 'friends-watchlist')].movies[*].tmdbId").value(org.hamcrest.Matchers.contains(99500205, 99500203, 99500204)))
                .andExpect(jsonPath("$.categories[?(@.id == 'friends')].movies[0].mediaType").value(org.hamcrest.Matchers.contains("MOVIE")));
        }
    }

    @Test
    void excludesLibraryButNotCustomListsAndRequiresCurrentAcceptedConsent() throws Exception {
        save(bob, 99500301, "Eligible", "WATCHED", "8");
        save(bob, 99500302, "Already planned", "WATCHED", "9");
        save(bob, 99500303, "Already watched", "WATCHLIST", "null");
        save(outsider, 99500304, "Stranger movie", "WATCHED", "10");
        save(alice, 99500302, "Already planned", "WATCHLIST", "null");
        save(alice, 99500303, "Already watched", "WATCHED", "null");
        invite(alice, bob).andExpect(status().isCreated());
        read(alice, "/api/suggestions/friends").andExpect(jsonPath("$.categories[0].movies", hasSize(0)))
            .andExpect(jsonPath("$.categories[1].movies", hasSize(0)));
        write(bob, "POST", "/api/friends/" + alice.getId() + "/accept", "{}").andExpect(status().isOk());
        long catalogId = com.jayway.jsonpath.JsonPath.<java.util.List<Number>>read(read(bob, "/api/movies/library").andReturn().getResponse().getContentAsString(), "$[?(@.movie.tmdbId == 99500301)].movie.id").get(0).longValue();
        write(alice, "POST", "/api/lists", "{\"title\":\"Independent\",\"initialMovieIds\":[" + catalogId + "]}").andExpect(status().isCreated());
        read(alice, "/api/suggestions/friends").andExpect(jsonPath("$.categories[0].movies", hasSize(1)))
            .andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(99500301))
            .andExpect(jsonPath("$.categories[1].movies", hasSize(0)));
        save(alice, 99500301, "Eligible", "WATCHLIST", "null");
        read(alice, "/api/suggestions/friends").andExpect(jsonPath("$.categories[0].movies", hasSize(0)));
        save(bob, 99500305, "Revoked", "WATCHED", "10");
        read(alice, "/api/suggestions/friends").andExpect(jsonPath("$.categories[0].movies", hasSize(1)));
        write(alice, "DELETE", "/api/friends/" + bob.getId(), "").andExpect(status().isOk());
        read(alice, "/api/suggestions/friends").andExpect(jsonPath("$.categories[0].movies", hasSize(0)))
            .andExpect(jsonPath("$.categories[1].movies", hasSize(0)));
        mvc.perform(get("/api/suggestions/friends")).andExpect(status().isForbidden());
    }

    private void accept(User viewer, User friend) throws Exception {
        invite(viewer, friend).andExpect(status().isCreated());
        write(friend, "POST", "/api/friends/" + viewer.getId() + "/accept", "{}").andExpect(status().isOk());
    }
    private void save(User user, long id, String title, String status, String rating) throws Exception {
        write(user, "POST", "/api/movies/library", "{\"title\":\"" + title + "\",\"tmdbId\":" + id
            + ",\"status\":\"" + status + "\",\"personalRating\":" + rating + ",\"notes\":\"private\"}")
            .andExpect(status().isCreated());
    }

    private User newUser() {
        String name = "friends-" + UUID.randomUUID();
        return users.save(User.builder().username(name).email(name + "@example.test")
            .displayName(name).password("unused-test-password").build());
    }
    private String token(User user) {
        return "Bearer " + tokens.generateToken(user.getUsername(), user.getId(), user.getRole());
    }
    private ResultActions read(User user, String path) throws Exception {
        return mvc.perform(get(path).header("Authorization", token(user)));
    }
    private ResultActions invite(User sender, User recipient) throws Exception {
        return write(sender, "POST", "/api/friends/add", "{\"identifier\":\"" + recipient.getUsername() + "\"}");
    }
    private ResultActions write(User user, String method, String path, String body) throws Exception {
        return mvc.perform(request(org.springframework.http.HttpMethod.valueOf(method), path)
            .header("Authorization", token(user)).contentType(MediaType.APPLICATION_JSON).content(body));
    }
}
