package com.movienight.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Ticket #19 (PD-03) SF04: sign in with an email or a username, in any letter case.
 * Real security, controllers, BCrypt and H2; the request body mirrors the browser client,
 * which sends the single identifier as both email and username.
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:sign-in-identifier-test;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "app.tmdb.api-key=", "app.omdb.api-key=",
        "app.jwt.secret=sign-in-identifier-test-only-signing-key-32b"
})
class SignInIdentifierPersistenceTest {
    private static final String PASSWORD = "Sf04-pass";
    private static final String INVALID_CREDENTIALS = "Invalid email/username or password";

    @Autowired private WebApplicationContext context;
    private final ObjectMapper json = new ObjectMapper();

    private MockMvc mvc;
    private String username;
    private String email;

    @BeforeEach
    void setUp() throws Exception {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        username = "NightOwl" + suffix;
        email = "owl." + suffix + "@example.test";
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "email", email, "username", username, "displayName", "Owl " + suffix,
                                "password", PASSWORD, "confirmPassword", PASSWORD))))
                .andExpect(status().isCreated());
    }

    @Test
    void signsInWithUsernameInAnyLetterCase() throws Exception {
        for (String identifier : new String[] { username, username.toLowerCase(), username.toUpperCase() }) {
            signIn(identifier, PASSWORD).andExpect(status().isOk())
                    .andExpect(jsonPath("$.token").isNotEmpty())
                    .andExpect(jsonPath("$.username").value(username));
        }
    }

    @Test
    void signsInWithEmailInAnyLetterCase() throws Exception {
        for (String identifier : new String[] { email, email.toUpperCase(), "  " + email + "  " }) {
            signIn(identifier, PASSWORD).andExpect(status().isOk())
                    .andExpect(jsonPath("$.username").value(username));
        }
    }

    @Test
    void wrongPasswordOrUnknownIdentifierGiveTheSameMessage() throws Exception {
        signIn(username, "wrong-pass").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(INVALID_CREDENTIALS));
        signIn("nobody-" + username, PASSWORD).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(INVALID_CREDENTIALS));
    }

    @Test
    void blankIdentifierAsksForEmailOrUsername() throws Exception {
        signIn("   ", PASSWORD).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(not(containsString("Email address is required"))))
                .andExpect(jsonPath("$.message").value(containsString("email or username")));
    }

    private ResultActions signIn(String identifier, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of(
                        "email", identifier, "username", identifier, "password", password))));
    }
}
