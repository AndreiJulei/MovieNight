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
    "spring.datasource.url=jdbc:h2:mem:accepted-friends-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=", "app.omdb.api-key=",
    "app.jwt.secret=accepted-friends-test-only-signing-key-at-least-32-bytes"
})
class AcceptedFriendshipsPersistenceTest {
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
    void invitationGrantsNoAccessUntilRecipientAcceptsAndRemovalRevokesBothDirections() throws Exception {
        invite(alice, bob).andExpect(status().isCreated());
        read(alice, "/api/friends").andExpect(jsonPath("$", hasSize(0)));
        read(bob, "/api/friends").andExpect(jsonPath("$", hasSize(0)));
        read(alice, "/api/friends/invitations").andExpect(status().isOk())
            .andExpect(jsonPath("$[0].senderId").value(alice.getId()))
            .andExpect(jsonPath("$[0].recipientId").value(bob.getId()))
            .andExpect(jsonPath("$[0].watchedCount").doesNotExist());
        read(bob, "/api/friends/invitations").andExpect(jsonPath("$", hasSize(1)));
        read(alice, "/api/friends/" + bob.getId() + "/library").andExpect(status().isForbidden());
        read(bob, "/api/friends/" + alice.getId() + "/profile").andExpect(status().isForbidden());
        write(bob, "POST", "/api/friends/" + alice.getId() + "/accept", "{}").andExpect(status().isOk());
        read(alice, "/api/friends").andExpect(jsonPath("$[0].id").value(bob.getId()));
        read(bob, "/api/friends").andExpect(jsonPath("$[0].id").value(alice.getId()));
        read(alice, "/api/friends/invitations").andExpect(jsonPath("$", hasSize(0)));
        read(alice, "/api/friends/" + bob.getId() + "/library").andExpect(status().isOk());
        write(alice, "DELETE", "/api/friends/" + bob.getId(), "").andExpect(status().isOk());
        read(bob, "/api/friends").andExpect(jsonPath("$", hasSize(0)));
        read(alice, "/api/friends/" + bob.getId() + "/library").andExpect(status().isForbidden());
        read(bob, "/api/friends/" + alice.getId() + "/profile").andExpect(status().isForbidden());
    }

    @Test
    void friendResponsesOmitNotesAndForgedRatingIdsCannotBypassConsent() throws Exception {
        String body = "{\"title\":\"Private opinion\",\"tmdbId\":99000401,\"status\":\"WATCHED\",\"personalRating\":0,\"notes\":\"owner secret\"}";
        var saved = write(bob, "POST", "/api/movies/library", body).andExpect(status().isCreated());
        long movieId = com.jayway.jsonpath.JsonPath.<Number>read(saved.andReturn().getResponse().getContentAsString(), "$.movie.id").longValue();
        String ratings = "/api/movies/" + movieId + "/friends-ratings?friendIds=" + bob.getId();
        read(alice, ratings).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        invite(alice, bob);
        read(alice, ratings).andExpect(jsonPath("$", hasSize(0)));
        write(bob, "POST", "/api/friends/" + alice.getId() + "/accept", "{}").andExpect(status().isOk());
        read(alice, "/api/friends/" + bob.getId() + "/library?status=WATCHED")
            .andExpect(jsonPath("$[0].personalRating").value(0))
            .andExpect(jsonPath("$[0]", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasKey("notes"))));
        read(alice, ratings).andExpect(jsonPath("$[0].personalRating").value(0))
            .andExpect(jsonPath("$[0]", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasKey("notes"))));
        read(outsider, ratings).andExpect(jsonPath("$", hasSize(0)));
        read(bob, "/api/movies/library").andExpect(jsonPath("$[0].notes").value("owner secret"));
        write(alice, "DELETE", "/api/friends/" + bob.getId(), "").andExpect(status().isOk());
        read(alice, ratings).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void duplicateAndCrossedInvitesStayPendingUntilExplicitAcceptance() throws Exception {
        invite(alice, bob).andExpect(status().isCreated());
        invite(alice, bob).andExpect(status().isCreated());
        invite(bob, alice).andExpect(status().isCreated());
        read(bob, "/api/friends/invitations").andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].senderId").value(alice.getId()));
        write(alice, "POST", "/api/friends/" + bob.getId() + "/accept", "{}").andExpect(status().isForbidden());
        write(outsider, "POST", "/api/friends/" + alice.getId() + "/accept", "{}").andExpect(status().isForbidden());
        write(outsider, "DELETE", "/api/friends/" + alice.getId(), "").andExpect(status().isOk());
        read(bob, "/api/friends/invitations").andExpect(jsonPath("$", hasSize(1)));
        read(bob, "/api/friends/" + alice.getId() + "/library").andExpect(status().isForbidden());
        // Recipient declines; a new invite can be cancelled by its sender.
        write(bob, "DELETE", "/api/friends/" + alice.getId(), "").andExpect(status().isOk());
        read(alice, "/api/friends/invitations").andExpect(jsonPath("$", hasSize(0)));
        invite(alice, bob).andExpect(status().isCreated());
        write(alice, "DELETE", "/api/friends/" + bob.getId(), "").andExpect(status().isOk());
        write(bob, "POST", "/api/friends/" + alice.getId() + "/accept", "{}").andExpect(status().isForbidden());
        invite(alice, alice).andExpect(status().isBadRequest());
        write(alice, "POST", "/api/friends/add", "{\"identifier\":\"missing-account\"}").andExpect(status().isBadRequest());
        write(alice, "POST", "/api/friends/add", "{\"identifier\":\"  \"}").andExpect(status().isBadRequest());
        read(alice, "/api/friends").andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void acceptedRatingsPreserveUnratedZeroAndHalfPointsAndKeepListsPrivate() throws Exception {
        invite(alice, bob);
        write(bob, "POST", "/api/friends/" + alice.getId() + "/accept", "{}").andExpect(status().isOk());
        long movieId = 0;
        for (String rating : new String[]{"null", "0", "7.5"}) {
            var saved = write(bob, "POST", "/api/movies/library", "{\"title\":\"Rating fixture\",\"tmdbId\":99000402,\"status\":\"WATCHED\",\"personalRating\":" + rating + ",\"notes\":\"Still private\"}")
                    .andExpect(status().isCreated());
            movieId = com.jayway.jsonpath.JsonPath.<Number>read(saved.andReturn().getResponse().getContentAsString(), "$.movie.id").longValue();
            var library = read(alice, "/api/friends/" + bob.getId() + "/library?status=WATCHED").andExpect(status().isOk());
            if (rating.equals("null")) library.andExpect(jsonPath("$[0].personalRating").isEmpty());
            else library.andExpect(jsonPath("$[0].personalRating").value(Double.valueOf(rating)));
        }
        write(bob, "POST", "/api/movies/library", "{\"title\":\"Plans\",\"tmdbId\":99000403,\"status\":\"WATCHLIST\"}")
            .andExpect(status().isCreated());
        read(alice, "/api/friends/" + bob.getId() + "/library?status=WATCHLIST")
            .andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].status").value("WATCHLIST"));
        var created = write(bob, "POST", "/api/lists", "{\"title\":\"Private list\"}").andExpect(status().isCreated());
        long listId = com.jayway.jsonpath.JsonPath.<Number>read(created.andReturn().getResponse().getContentAsString(), "$.id").longValue();
        read(alice, "/api/lists/" + listId).andExpect(status().isForbidden());
        read(alice, "/api/suggestions/friends").andExpect(jsonPath("$.categories[0].movies", hasSize(1)))
            .andExpect(jsonPath("$.categories[1].movies", hasSize(1)));
        write(bob, "DELETE", "/api/friends/" + alice.getId(), "").andExpect(status().isOk());
        read(alice, "/api/suggestions/friends").andExpect(jsonPath("$.categories[0].movies", hasSize(0)));
        read(alice, "/api/movies/" + movieId + "/friends-ratings").andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void simultaneousInvitationsLeaveOnePendingPair() throws Exception {
        var start = new java.util.concurrent.CountDownLatch(1);
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> { start.await(); return invite(alice, bob).andReturn().getResponse().getStatus(); });
            var second = executor.submit(() -> { start.await(); return invite(bob, alice).andReturn().getResponse().getStatus(); });
            start.countDown();
            org.junit.jupiter.api.Assertions.assertEquals(201, first.get(10, java.util.concurrent.TimeUnit.SECONDS));
            org.junit.jupiter.api.Assertions.assertEquals(201, second.get(10, java.util.concurrent.TimeUnit.SECONDS));
        }
        read(alice, "/api/friends/invitations").andExpect(jsonPath("$", hasSize(1)));
        read(bob, "/api/friends/invitations").andExpect(jsonPath("$", hasSize(1)));
        read(alice, "/api/friends").andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void anonymousRequestsAreDeniedAndLegacyLinksGrantNoConsent() throws Exception {
        var links = context.getBean(com.movienight.backend.repository.FriendshipRepository.class);
        links.saveAll(java.util.List.of(
            com.movienight.backend.model.Friendship.builder().user(alice).friend(bob).build(),
            com.movienight.backend.model.Friendship.builder().user(bob).friend(alice).build()));
        read(alice, "/api/friends").andExpect(jsonPath("$", hasSize(0)));
        read(alice, "/api/friends/" + bob.getId() + "/profile").andExpect(status().isForbidden());
        read(alice, "/api/friends/" + bob.getId() + "/library").andExpect(status().isForbidden());
        read(alice, "/api/movies/1/friends-ratings?friendIds=" + bob.getId()).andExpect(jsonPath("$", hasSize(0)));
        for (String path : new String[]{"/api/friends", "/api/friends/invitations", "/api/friends/" + bob.getId() + "/library", "/api/friends/" + bob.getId() + "/profile", "/api/movies/1/friends-ratings"}) {
            mvc.perform(get(path)).andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/friends/add").contentType(MediaType.APPLICATION_JSON).content("{\"identifier\":\"x\"}"))
            .andExpect(status().isForbidden());
        mvc.perform(post("/api/friends/" + alice.getId() + "/accept")).andExpect(status().isForbidden());
        mvc.perform(delete("/api/friends/" + bob.getId())).andExpect(status().isForbidden());
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
