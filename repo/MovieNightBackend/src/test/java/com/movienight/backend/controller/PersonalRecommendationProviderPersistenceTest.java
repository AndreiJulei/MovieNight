package com.movienight.backend.controller;

import com.movienight.backend.model.*;
import com.movienight.backend.repository.*;
import com.movienight.backend.security.JwtTokenProvider;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real TMDB HTTP client; only the remote provider is replaced with controlled responses. */
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:personal-provider-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop", "app.omdb.api-key=", "app.tmdb.api-key=test-only-key",
    "app.jwt.secret=personal-provider-test-signing-key-at-least-32-bytes"
})
class PersonalRecommendationProviderPersistenceTest {
    static HttpServer provider;
    static volatile String body = "{\"results\":[]}";
    static volatile int status = 200;
    @Autowired WebApplicationContext context;
    @Autowired UserRepository users;
    @Autowired MovieRepository catalog;
    @Autowired UserMovieEntryRepository entries;
    @Autowired MovieSimilarityRepository similarities;
    MockMvc mvc;
    String token;

    @DynamicPropertySource static void providerUrl(DynamicPropertyRegistry properties) throws Exception {
        provider = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        provider.createContext("/movie/", exchange -> {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            try (var output = exchange.getResponseBody()) { output.write(bytes); }
        });
        provider.start();
        properties.add("app.tmdb.base-url", () -> "http://127.0.0.1:" + provider.getAddress().getPort());
    }
    @AfterAll static void stopProvider() { if (provider != null) provider.stop(0); }

    @Test void validEmptyHttpFailureMalformedResponseAndRetryRemainDistinguishable() throws Exception {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        User owner = users.save(User.builder().username("provider-owner").password("test").build());
        var tokens = context.getBean(JwtTokenProvider.class);
        token = "Bearer " + tokens.generateToken(owner.getUsername(), owner.getId(), owner.getRole());
        Movie watched = catalog.save(Movie.builder().tmdbId(99700001L).title("Watched").mediaType("MOVIE").build());
        catalog.save(Movie.builder().tmdbId(99700002L).title("Candidate").mediaType("MOVIE").build());
        entries.save(UserMovieEntry.builder().user(owner).movie(watched).status(MovieStatus.WATCHED).build());
        similarities.save(MovieSimilarity.builder().tmdbId(99700001L).neighborTmdbId(99700002L).score(1.0).build());
        refresh().andExpect(status().isOk());
        read().andExpect(status().isOk()).andExpect(jsonPath("$.categories[0].movies", hasSize(1)));
        for (String malformed : new String[]{"{}", "null", "{\"results\":null}", "broken json", "{\"results\":[{\"id\":1,\"media_type\":\"tv\",\"name\":\"TV\"}]}"}) {
            body = malformed;
            refresh().andExpect(status().is5xxServerError());
            read().andExpect(status().is5xxServerError());
        }
        status = 503; body = "{}";
        refresh().andExpect(status().is5xxServerError());
        read().andExpect(status().is5xxServerError());
        status = 200; body = "{\"results\":[{\"id\":99700003,\"title\":\"From TMDB\",\"release_date\":\"2001-02-03\",\"poster_path\":\"/poster.jpg\"}]}";
        refresh().andExpect(status().isOk());
        read().andExpect(status().isOk()).andExpect(jsonPath("$.categories[0].movies", hasSize(2)))
            .andExpect(jsonPath("$.categories[0].movies[1].title").value("From TMDB"))
            .andExpect(jsonPath("$.categories[0].movies[1].releaseYear").value(2001))
            .andExpect(jsonPath("$.categories[0].movies[1].posterUrl").value("https://image.tmdb.org/t/p/w500/poster.jpg"));
        mvc.perform(get("/api/movies/library").header("Authorization", token)).andExpect(jsonPath("$", hasSize(1)));
    }
    ResultActions read() throws Exception { return mvc.perform(get("/api/suggestions/personal").header("Authorization", token)); }
    ResultActions refresh() throws Exception { return mvc.perform(post("/api/suggestions/personalized/refresh").header("Authorization", token)); }
}
