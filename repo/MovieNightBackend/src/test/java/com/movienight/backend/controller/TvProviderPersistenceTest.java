package com.movienight.backend.controller;

import com.movienight.backend.model.User;
import com.movienight.backend.repository.UserRepository;
import com.movienight.backend.security.JwtTokenProvider;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import static org.hamcrest.Matchers.hasSize;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:tv-provider;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=test-only-key", "app.omdb.api-key=",
    "app.jwt.secret=tv-provider-signing-key-at-least-32-bytes"})
class TvProviderPersistenceTest {
    record Response(int status, String body) { }
    static HttpServer provider;
    static final ConcurrentMap<String, Response> responses = new ConcurrentHashMap<>();
    static final ConcurrentLinkedQueue<String> paths = new ConcurrentLinkedQueue<>();
    @Autowired WebApplicationContext context;
    @Autowired UserRepository users;
    @Autowired JwtTokenProvider tokens;

    @DynamicPropertySource static void fixture(DynamicPropertyRegistry properties) throws Exception {
        provider = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        provider.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath(); paths.add(path);
            var response = responses.getOrDefault(path, new Response(200, "{\"results\":[]}"));
            byte[] bytes = response.body().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(response.status(), bytes.length);
            try (var output = exchange.getResponseBody()) { output.write(bytes); }
        });
        provider.start();
        properties.add("app.tmdb.base-url", () -> "http://127.0.0.1:" + provider.getAddress().getPort());
    }
    @AfterAll static void stop() { if (provider != null) provider.stop(0); }

    @Test void realProviderClientDistinguishesMissingFailureMalformedAndRetryWithoutCrossingResources() throws Exception {
        MockMvc mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        var owner = users.save(User.builder().username("tv-provider-owner").password("test").build());
        String token = "Bearer " + tokens.generateToken(owner.getUsername(), owner.getId(), owner.getRole());
        String detail = "/api/movies/tmdb/99190001?mediaType=TV";
        responses.put("/movie/99190001", new Response(200, "{\"id\":99190001,\"title\":\"Wrong movie\"}"));
        responses.put("/tv/99190001", new Response(404, "{}")); paths.clear();
        mvc.perform(get(detail).header("Authorization", token)).andExpect(status().isNotFound());
        assertThat(paths).doesNotContain("/movie/99190001");
        for (String malformed : new String[]{"null", "{}", "broken", "{\"id\":99190001,\"title\":\"Wrong resource\"}"}) {
            responses.put("/tv/99190001", new Response(200, malformed));
            mvc.perform(get(detail).header("Authorization", token)).andExpect(status().is5xxServerError());
        }
        responses.put("/tv/99190001", new Response(503, "{}"));
        mvc.perform(get(detail).header("Authorization", token)).andExpect(status().is5xxServerError());
        responses.put("/tv/99190001", new Response(200, "{\"id\":99190001,\"name\":\"Anime series\",\"genres\":[{\"id\":16,\"name\":\"Animation\"}],\"original_language\":\"en\",\"origin_country\":[\"JP\"]}"));
        mvc.perform(get(detail).header("Authorization", token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.mediaType").value("ANIME")).andExpect(jsonPath("$.releaseYear").isEmpty());
        mvc.perform(get("/api/movies/tmdb/99190001?mediaType=MOVIE").header("Authorization", token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Wrong movie"));
        responses.put("/search/multi", new Response(503, "{}"));
        mvc.perform(get("/api/movies/search?query=unavailable").header("Authorization", token)).andExpect(status().is5xxServerError());
        responses.put("/search/multi", new Response(200, "{\"results\":[]}"));
        mvc.perform(get("/api/movies/search?query=unavailable").header("Authorization", token)).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        responses.put("/tv/on_the_air", new Response(503, "{}"));
        mvc.perform(get("/api/movies/explore/tv").header("Authorization", token)).andExpect(status().is5xxServerError());
        responses.put("/tv/on_the_air", new Response(200, "{\"results\":[]}"));
        mvc.perform(get("/api/movies/explore/tv").header("Authorization", token)).andExpect(status().isOk()).andExpect(jsonPath("$.categories", hasSize(0)));
        mvc.perform(get("/api/movies/library").header("Authorization", token)).andExpect(jsonPath("$", hasSize(0)));
    }
}
