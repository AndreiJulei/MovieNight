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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** #31 account settings through the real JWT/API/persistence boundary. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:account-settings-test;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=", "app.omdb.api-key=",
        "app.jwt.secret=account-settings-test-only-signing-key-at-least-32-bytes"
})
class AccountSettingsPersistenceTest {
    private static final String PASSWORD = "correct-horse";

    @Autowired private WebApplicationContext context;
    @Autowired private UserRepository users;
    @Autowired private JwtTokenProvider tokens;
    @Autowired private PasswordEncoder encoder;
    private MockMvc mvc;
    private User alice, bob;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        alice = newUser();
        bob = newUser();
    }

    @Test
    void ST01_usernameChangeReturnsAFreshTokenAndFriendsSeeTheNewName() throws Exception {
        befriend(alice, bob);
        String oldToken = token(alice);
        String renamed = "renamed-" + shortId();
        String body = send(oldToken, "PUT", "/api/users/username", "{\"username\":\"  " + renamed + "  \"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(renamed))
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        String fresh = "Bearer " + JsonPath.read(body, "$.token");

        send(fresh, "GET", "/api/users/me", "").andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(renamed));
        send(token(bob), "GET", "/api/friends", "").andExpect(status().isOk())
                .andExpect(jsonPath("$[0].username").value(renamed));
        send(oldToken, "GET", "/api/users/me", "").andExpect(status().isForbidden());
    }

    @Test
    void staleTokenNeverAuthenticatesAsALaterOwnerOfTheOldUsername() throws Exception {
        String oldName = alice.getUsername();
        String oldToken = token(alice);
        send(oldToken, "PUT", "/api/users/username", "{\"username\":\"moved-" + shortId() + "\"}")
                .andExpect(status().isOk());
        send(token(bob), "PUT", "/api/users/username", "{\"username\":\"" + oldName + "\"}")
                .andExpect(status().isOk());
        send(oldToken, "GET", "/api/users/me", "").andExpect(status().isForbidden());
    }

    @Test
    void ST02_emailChangeRequiresTheCurrentPassword() throws Exception {
        String email = "new-" + shortId() + "@example.test";
        send(token(alice), "PUT", "/api/users/email",
                "{\"email\":\"" + email + "\",\"currentPassword\":\"wrong-password\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Current password is incorrect."));
        send(token(alice), "GET", "/api/users/me", "").andExpect(jsonPath("$.email").value(alice.getEmail()));

        send(token(alice), "PUT", "/api/users/email",
                "{\"email\":\"" + email + "\",\"currentPassword\":\"" + PASSWORD + "\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.email").value(email));
        send(token(alice), "GET", "/api/users/me", "").andExpect(jsonPath("$.email").value(email));
    }

    @Test
    void ST03_duplicateUsernameOrEmailIsRejectedWithASpecificMessage() throws Exception {
        send(token(alice), "PUT", "/api/users/username", "{\"username\":\"" + bob.getUsername().toUpperCase() + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("That username is already taken."));
        send(token(alice), "PUT", "/api/users/email",
                "{\"email\":\"" + bob.getEmail().toUpperCase() + "\",\"currentPassword\":\"" + PASSWORD + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("An account with this email already exists."));
        send(token(alice), "GET", "/api/users/me", "").andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(alice.getUsername()))
                .andExpect(jsonPath("$.email").value(alice.getEmail()));

        mvc.perform(get("/api/auth/check-name").param("username", bob.getUsername()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(false))
                .andExpect(jsonPath("$.message", containsString("taken")));
        mvc.perform(get("/api/auth/check-name").param("username", "free-" + shortId()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(true));
    }

    @Test
    void invalidUsernamesAndDisplayNamesAreRejected() throws Exception {
        for (String invalid : new String[]{"a", "has space", "at@sign", "x".repeat(51)}) {
            send(token(alice), "PUT", "/api/users/username", "{\"username\":\"" + invalid + "\"}")
                    .andExpect(status().isBadRequest());
        }
        send(token(alice), "PUT", "/api/users/profile", "{\"displayName\":\"Z\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("Z"));
        send(token(alice), "PUT", "/api/users/profile", "{\"displayName\":\"" + "x".repeat(51) + "\"}")
                .andExpect(status().isBadRequest());
        send(token(alice), "GET", "/api/users/me", "").andExpect(jsonPath("$.displayName").value("Z"));
    }

    @Test
    void ST04_signInWorksImmediatelyWithTheNewUsernameOrEmail() throws Exception {
        String renamed = "signin-" + shortId();
        String email = "signin-" + shortId() + "@example.test";
        String body = send(token(alice), "PUT", "/api/users/username", "{\"username\":\"" + renamed + "\"}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String fresh = "Bearer " + JsonPath.read(body, "$.token");
        send(fresh, "PUT", "/api/users/email", "{\"email\":\"" + email + "\",\"currentPassword\":\"" + PASSWORD + "\"}")
                .andExpect(status().isOk());

        for (String identifier : new String[]{renamed, email}) {
            mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"" + identifier + "\",\"username\":\"" + identifier + "\",\"password\":\"" + PASSWORD + "\"}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.username").value(renamed));
        }
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + alice.getEmail() + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void signupRejectsAUsernameThatDiffersFromAnExistingOneOnlyByCase() throws Exception {
        // Sign-in and username changes match usernames case-insensitively, so signup must too (#31).
        String upper = alice.getUsername().toUpperCase();
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"case-" + shortId() + "@example.test\",\"username\":\"" + upper
                                + "\",\"displayName\":\"case-" + shortId() + "\",\"password\":\"" + PASSWORD
                                + "\",\"confirmPassword\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/auth/check-name").param("username", upper))
                .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(false))
                .andExpect(jsonPath("$.name").value(upper));
    }

    private void befriend(User a, User b) throws Exception {
        send(token(a), "POST", "/api/friends/add", "{\"identifier\":\"" + b.getUsername() + "\"}").andExpect(status().isCreated());
        send(token(b), "POST", "/api/friends/" + a.getId() + "/accept", "{}").andExpect(status().isOk());
    }

    private String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    private User newUser() {
        String name = "acct-" + shortId();
        return users.save(User.builder().username(name).email(name + "@example.test")
                .displayName(name).password(encoder.encode(PASSWORD)).build());
    }

    private String token(User user) {
        return "Bearer " + tokens.generateToken(user.getUsername(), user.getId(), user.getRole());
    }

    private ResultActions send(String authorization, String method, String path, String body) throws Exception {
        var request = request(HttpMethod.valueOf(method), path).header("Authorization", authorization);
        if (!body.isEmpty()) request.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(request);
    }
}
