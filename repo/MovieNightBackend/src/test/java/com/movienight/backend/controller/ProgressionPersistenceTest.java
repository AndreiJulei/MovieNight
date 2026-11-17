package com.movienight.backend.controller;

import com.movienight.backend.model.User;
import com.movienight.backend.repository.UserRepository;
import com.movienight.backend.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** #32 levels, ranks and avatar unlocks through the real JWT/API/persistence boundary. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:progression-test;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=", "app.omdb.api-key=",
        "app.jwt.secret=progression-test-only-signing-key-at-least-32-bytes"
})
class ProgressionPersistenceTest {
    private static final AtomicLong NEXT_TMDB = new AtomicLong(99700000);

    @Autowired private WebApplicationContext context;
    @Autowired private UserRepository users;
    @Autowired private JwtTokenProvider tokens;
    private MockMvc mvc;
    private User owner;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        owner = newUser();
    }

    @Test
    void LV02_unmarkingAWatchedTitleLowersLevelAndRankOnTheNextLoad() throws Exception {
        long last = 0;
        for (int i = 0; i < 10; i++) last = save(owner, "WATCHED");
        save(owner, "WATCHLIST"); // the watchlist earns nothing
        send(owner, "GET", "/api/users/me/progress", "").andExpect(status().isOk())
                .andExpect(jsonPath("$.watchedCount").value(10))
                .andExpect(jsonPath("$.level").value(2))
                .andExpect(jsonPath("$.xpIntoLevel").value(0))
                .andExpect(jsonPath("$.xpPerLevel").value(15))
                .andExpect(jsonPath("$.rank.label").value("The Hobbit"))
                .andExpect(jsonPath("$.nextRank.label").value("The Maverick"))
                .andExpect(jsonPath("$.toNextRank").value(15));

        send(owner, "PUT", "/api/movies/library/" + last, "{\"status\":\"WATCHLIST\"}").andExpect(status().isOk());
        send(owner, "GET", "/api/users/me/progress", "").andExpect(status().isOk())
                .andExpect(jsonPath("$.watchedCount").value(9))
                .andExpect(jsonPath("$.level").value(1))
                .andExpect(jsonPath("$.rank.label").value("Popcorn Rookie"))
                .andExpect(jsonPath("$.toNextRank").value(1));
    }

    @Test
    void LV03_lockedAvatarCannotBeSelectedAndALevelDropFallsBackToTheDefault() throws Exception {
        send(owner, "GET", "/api/users/me/progress", "").andExpect(status().isOk())
                .andExpect(jsonPath("$.avatar").doesNotExist())
                .andExpect(jsonPath("$.avatars[?(@.id == 'oppenheimer-thinking')].unlocked").value(org.hamcrest.Matchers.contains(false)));
        send(owner, "PUT", "/api/users/me/avatar", "{\"avatar\":\"oppenheimer-thinking\"}").andExpect(status().isBadRequest());
        send(owner, "PUT", "/api/users/me/avatar", "{\"avatar\":\"no-such-avatar\"}").andExpect(status().isBadRequest());
        send(owner, "PUT", "/api/users/me/avatar", "{\"avatar\":\"clapper\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.avatar.id").value("clapper"));

        // The Professional (50 watched, level 4) unlocks the Oppenheimer avatars.
        long last = 0;
        for (int i = 0; i < 50; i++) last = save(owner, "WATCHED");
        send(owner, "PUT", "/api/users/me/avatar", "{\"avatar\":\"oppenheimer-thinking\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.avatar.id").value("oppenheimer-thinking"));
        send(owner, "GET", "/api/users/me/progress", "").andExpect(jsonPath("$.avatar.id").value("oppenheimer-thinking"));

        send(owner, "DELETE", "/api/movies/library/" + last, "").andExpect(status().is2xxSuccessful());
        send(owner, "GET", "/api/users/me/progress", "").andExpect(jsonPath("$.level").value(3))
                .andExpect(jsonPath("$.avatar").doesNotExist());

        send(owner, "PUT", "/api/users/me/avatar", "{\"avatar\":null}").andExpect(status().isOk())
                .andExpect(jsonPath("$.avatar").doesNotExist());
    }

    @Test
    void LV04_friendsSeeLevelRankAndAvatarButNoXpBarData() throws Exception {
        User friend = newUser();
        befriend(owner, friend);
        for (int i = 0; i < 12; i++) save(owner, "WATCHED");
        send(owner, "PUT", "/api/users/me/avatar", "{\"avatar\":\"popcorn\"}").andExpect(status().isOk());

        for (String path : new String[]{"/api/friends/" + owner.getId() + "/profile", "/api/friends"}) {
            String root = path.endsWith("/profile") ? "$" : "$[0]";
            send(friend, "GET", path, "").andExpect(status().isOk())
                    .andExpect(jsonPath(root + ".level").value(2))
                    .andExpect(jsonPath(root + ".rank.label").value("The Hobbit"))
                    .andExpect(jsonPath(root + ".rank.emblem").value("ticket"))
                    .andExpect(jsonPath(root + ".avatar.id").value("popcorn"))
                    .andExpect(jsonPath(root + ".xpIntoLevel").doesNotExist())
                    .andExpect(jsonPath(root + ".watchedCount").doesNotExist())
                    .andExpect(jsonPath(root + ".watchlistCount").doesNotExist())
                    .andExpect(jsonPath(root + ".avgRating").doesNotExist())
                    .andExpect(jsonPath(root + ".xpPerLevel").doesNotExist())
                    .andExpect(jsonPath(root + ".nextRank").doesNotExist())
                    .andExpect(jsonPath(root + ".toNextRank").doesNotExist());
        }
        send(newUser(), "GET", "/api/friends/" + owner.getId() + "/profile", "").andExpect(status().isForbidden());
    }

    private long save(User user, String status) throws Exception {
        long tmdbId = NEXT_TMDB.incrementAndGet();
        String body = send(user, "POST", "/api/movies/library", "{\"title\":\"T" + tmdbId + "\",\"tmdbId\":" + tmdbId
                + ",\"mediaType\":\"MOVIE\",\"status\":\"" + status + "\"}").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        // Library mutations take the catalog key, not the provider ID.
        return com.jayway.jsonpath.JsonPath.<Number>read(body, "$.movie.id").longValue();
    }

    private void befriend(User a, User b) throws Exception {
        send(a, "POST", "/api/friends/add", "{\"identifier\":\"" + b.getUsername() + "\"}").andExpect(status().isCreated());
        send(b, "POST", "/api/friends/" + a.getId() + "/accept", "{}").andExpect(status().isOk());
    }

    private User newUser() {
        String name = "level-" + UUID.randomUUID();
        return users.save(User.builder().username(name).email(name + "@example.test")
                .displayName(name).password("unused-test-password").build());
    }

    private ResultActions send(User user, String method, String path, String body) throws Exception {
        var request = request(HttpMethod.valueOf(method), path)
                .header("Authorization", "Bearer " + tokens.generateToken(user.getUsername(), user.getId(), user.getRole()));
        if (!body.isEmpty()) request.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(request);
    }
}
