package com.movienight.backend.controller;

import com.jayway.jsonpath.JsonPath;
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

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** #33 friend-visible lists through the real JWT/API/persistence boundary. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:shared-lists-test;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=", "app.omdb.api-key=",
        "app.jwt.secret=shared-lists-test-only-signing-key-at-least-32-bytes"
})
class SharedListsPersistenceTest {
    @Autowired private WebApplicationContext context;
    @Autowired private UserRepository users;
    @Autowired private JwtTokenProvider tokens;
    private MockMvc mvc;
    private User viewer, owner, outsider;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        viewer = newUser(); owner = newUser(); outsider = newUser();
        befriend(viewer, owner);
    }

    @Test
    void watchlistAndWatchedAreSharedByDefaultAndTheOwnerSeesTheFlags() throws Exception {
        save(owner, 99800101, "Seen", "WATCHED", "7");
        save(owner, 99800102, "Planned", "WATCHLIST", "null");
        send(owner, "GET", "/api/users/me", "").andExpect(jsonPath("$.sharesWatchlist").value(true))
                .andExpect(jsonPath("$.sharesWatched").value(true));
        send(viewer, "GET", "/api/friends/" + owner.getId() + "/library", "").andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[*].notes").doesNotExist());
    }

    @Test
    void PF02_aHiddenListDisappearsFromEveryFriendResponse() throws Exception {
        long seen = save(owner, 99800201, "Seen", "WATCHED", "9");
        save(owner, 99800202, "Planned", "WATCHLIST", "null");
        send(owner, "PUT", "/api/users/me/sharing", "{\"sharesWatched\":false}").andExpect(status().isOk())
                .andExpect(jsonPath("$.sharesWatched").value(false))
                .andExpect(jsonPath("$.sharesWatchlist").value(true));

        String library = "/api/friends/" + owner.getId() + "/library";
        send(viewer, "GET", library, "").andExpect(jsonPath("$[*].status").value(contains("WATCHLIST")));
        send(viewer, "GET", library + "?status=WATCHED", "").andExpect(jsonPath("$", hasSize(0)));
        send(viewer, "GET", "/api/friends/" + owner.getId() + "/profile", "")
                .andExpect(jsonPath("$.sharesWatched").value(false))
                .andExpect(jsonPath("$.sharesWatchlist").value(true));
        send(viewer, "GET", "/api/movies/" + seen + "/friends-ratings", "").andExpect(jsonPath("$", hasSize(0)));

        send(owner, "PUT", "/api/users/me/sharing", "{\"sharesWatchlist\":false,\"sharesWatched\":true}").andExpect(status().isOk());
        send(viewer, "GET", library, "").andExpect(jsonPath("$[*].status").value(contains("WATCHED")));
        send(viewer, "GET", "/api/friends/" + owner.getId() + "/profile", "").andExpect(jsonPath("$.sharesWatchlist").value(false));
        send(viewer, "GET", "/api/movies/" + seen + "/friends-ratings", "").andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void PF03_nonFriendsGetNothingForTheProfileOrAnyList() throws Exception {
        long listId = createList(owner, "Shared picks");
        send(owner, "PUT", "/api/lists/" + listId, "{\"shared\":true}").andExpect(status().isOk());
        for (String path : new String[]{"/profile", "/library", "/lists"}) {
            send(outsider, "GET", "/api/friends/" + owner.getId() + path, "").andExpect(status().isForbidden());
        }
        send(outsider, "GET", "/api/lists/" + listId, "").andExpect(status().isForbidden());
        mvc.perform(request(HttpMethod.GET, "/api/lists/" + listId)).andExpect(status().isForbidden());
        mvc.perform(request(HttpMethod.GET, "/api/lists/public")).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void PF04_sharingACustomListMakesItVisibleToFriendsAndUnsharingHidesItAgain() throws Exception {
        long listId = createList(owner, "Horror night");
        long hidden = createList(owner, "Private");
        String lists = "/api/friends/" + owner.getId() + "/lists";
        send(viewer, "GET", lists, "").andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        send(viewer, "GET", "/api/lists/" + listId, "").andExpect(status().isForbidden());

        send(owner, "PUT", "/api/lists/" + listId, "{\"shared\":true}").andExpect(status().isOk())
                .andExpect(jsonPath("$.shared").value(true));
        send(owner, "GET", "/api/lists", "").andExpect(jsonPath("$[?(@.id == " + listId + ")].shared").value(contains(true)));
        send(viewer, "GET", lists, "").andExpect(jsonPath("$[*].id").value(contains((int) listId)));
        send(viewer, "GET", "/api/lists/" + listId, "").andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Horror night"));
        send(viewer, "GET", "/api/lists/" + hidden, "").andExpect(status().isForbidden());
        // Only the owner may edit a shared list.
        send(viewer, "PUT", "/api/lists/" + listId, "{\"title\":\"Taken\"}").andExpect(status().isNotFound());

        send(owner, "PUT", "/api/lists/" + listId, "{\"shared\":false}").andExpect(status().isOk());
        send(viewer, "GET", lists, "").andExpect(jsonPath("$", hasSize(0)));
        send(viewer, "GET", "/api/lists/" + listId, "").andExpect(status().isForbidden());
    }

    @Test
    void PF05_afterHidingWatchedTheOwnersRatingsNoLongerContributeToFriendSuggestions() throws Exception {
        User other = newUser();
        befriend(viewer, other);
        save(owner, 99800501, "Consensus", "WATCHED", "8");
        save(other, 99800501, "Consensus", "WATCHED", "6");
        save(owner, 99800502, "Owner only", "WATCHED", "9");
        save(owner, 99800503, "Owner plan", "WATCHLIST", "null");
        send(viewer, "GET", "/api/suggestions/friends", "")
                .andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(99800501))
                .andExpect(jsonPath("$.categories[0].movies[0].score").value(14.0))
                .andExpect(jsonPath("$.categories[1].movies[*].tmdbId").value(contains(99800503)));

        send(owner, "PUT", "/api/users/me/sharing", "{\"sharesWatched\":false}").andExpect(status().isOk());
        send(viewer, "GET", "/api/suggestions/friends", "")
                .andExpect(jsonPath("$.categories[0].movies", hasSize(1)))
                .andExpect(jsonPath("$.categories[0].movies[0].tmdbId").value(99800501))
                .andExpect(jsonPath("$.categories[0].movies[0].score").value(6.0))
                .andExpect(jsonPath("$.categories[1].movies[*].tmdbId").value(contains(99800503)));

        send(owner, "PUT", "/api/users/me/sharing", "{\"sharesWatchlist\":false}").andExpect(status().isOk());
        send(viewer, "GET", "/api/suggestions/friends", "").andExpect(jsonPath("$.categories[1].movies", hasSize(0)));
    }

    private long save(User user, long tmdbId, String title, String status, String rating) throws Exception {
        String body = send(user, "POST", "/api/movies/library", "{\"title\":\"" + title + "\",\"tmdbId\":" + tmdbId
                + ",\"mediaType\":\"MOVIE\",\"status\":\"" + status + "\",\"personalRating\":" + rating
                + ",\"notes\":\"private\"}").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.<Number>read(body, "$.movie.id").longValue();
    }

    private long createList(User user, String title) throws Exception {
        String body = send(user, "POST", "/api/lists", "{\"title\":\"" + title + "\"}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.<Number>read(body, "$.id").longValue();
    }

    private void befriend(User a, User b) {
        try {
            send(a, "POST", "/api/friends/add", "{\"identifier\":\"" + b.getUsername() + "\"}").andExpect(status().isCreated());
            send(b, "POST", "/api/friends/" + a.getId() + "/accept", "{}").andExpect(status().isOk());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private User newUser() {
        String name = "share-" + UUID.randomUUID();
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
