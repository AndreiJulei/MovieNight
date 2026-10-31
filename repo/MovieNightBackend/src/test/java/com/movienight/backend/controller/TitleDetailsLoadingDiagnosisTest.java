package com.movienight.backend.controller;

import com.movienight.backend.model.User;
import com.movienight.backend.repository.MovieRepository;
import com.movienight.backend.repository.UserRepository;
import com.movienight.backend.security.JwtTokenProvider;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:title-diag;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "app.tmdb.api-key=test-diag-key",
    "app.omdb.api-key=test-omdb-key",
    "app.jwt.secret=title-diagnosis-signing-key-at-least-32-bytes"
})
class TitleDetailsLoadingDiagnosisTest {
    private static final Logger log = LoggerFactory.getLogger(TitleDetailsLoadingDiagnosisTest.class);

    record MockResponse(int status, String body, long delayMs, java.util.Map<String, String> headers) {
        MockResponse(int status, String body) {
            this(status, body, 0, java.util.Map.of());
        }
        MockResponse(int status, String body, long delayMs) {
            this(status, body, delayMs, java.util.Map.of());
        }
    }

    static HttpServer providerServer;
    static final ConcurrentMap<String, MockResponse> responses = new ConcurrentHashMap<>();
    static final ConcurrentLinkedQueue<String> recordedPaths = new ConcurrentLinkedQueue<>();

    @Autowired WebApplicationContext context;
    @Autowired UserRepository userRepository;
    @Autowired MovieRepository movieRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private MockMvc mvc;
    private String userToken;
    private static final AtomicInteger idCounter = new AtomicInteger(880000);

    @DynamicPropertySource
    static void configureProviders(DynamicPropertyRegistry registry) throws Exception {
        providerServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        providerServer.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            String query = exchange.getRequestURI().getQuery();
            String fullUri = path + (query != null ? "?" + query : "");
            recordedPaths.add(fullUri);
            MockResponse mockResp = responses.get(fullUri);
            if (mockResp == null) {
                mockResp = responses.getOrDefault(path, new MockResponse(200, "{}"));
            }
            if (mockResp.delayMs() > 0) {
                try {
                    Thread.sleep(mockResp.delayMs());
                } catch (InterruptedException ignored) {}
            }
            byte[] bytes = mockResp.body().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            if (mockResp.headers() != null) {
                mockResp.headers().forEach((k, v) -> exchange.getResponseHeaders().set(k, v));
            }
            exchange.sendResponseHeaders(mockResp.status(), bytes.length);
            try (var os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        });
        providerServer.start();
        int port = providerServer.getAddress().getPort();
        registry.add("app.tmdb.base-url", () -> "http://127.0.0.1:" + port);
        registry.add("app.omdb.base-url", () -> "http://127.0.0.1:" + port);
    }

    @AfterAll
    static void tearDown() {
        if (providerServer != null) {
            providerServer.stop(0);
        }
    }

    @BeforeEach
    void setUp() {
        responses.clear();
        recordedPaths.clear();
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        User testUser = userRepository.save(User.builder()
                .username("diag-user-" + idCounter.incrementAndGet())
                .password("pass")
                .build());
        userToken = "Bearer " + jwtTokenProvider.generateToken(testUser.getUsername(), testUser.getId(), testUser.getRole());
    }

    private void sanitizeAndLog(String contextName, MvcResult result) {
        int status = result.getResponse().getStatus();
        String errorMsg = result.getResponse().getErrorMessage();
        Exception ex = result.getResolvedException();
        String body = "";
        try {
            body = result.getResponse().getContentAsString();
        } catch (Exception ignored) {}
        log.info("[DIAGNOSIS-RESULT] {} -> status: {}, message: {}, exception: {}, body: {}",
                contextName, status, errorMsg,
                ex != null ? ex.getClass().getName() + ": " + ex.getMessage() : "none",
                body);
    }

    @Test
    void test01_uncachedMovieRequest_successfulFixture() throws Exception {
        long tmdbId = idCounter.incrementAndGet();
        String moviePath = "/movie/" + tmdbId;
        String omdbPath = "/"; // OMDb uses query params on root
        responses.put(moviePath, new MockResponse(200, """
            {
              "id": %d,
              "title": "Clean Movie Title",
              "release_date": "2024-05-10",
              "overview": "A compelling plot description",
              "imdb_id": "tt9988776",
              "runtime": 120,
              "genres": [{"id": 28, "name": "Action"}],
              "credits": {"cast": [{"name": "Actor A", "order": 0}], "crew": [{"name": "Director D", "job": "Director"}]},
              "videos": {"results": [{"key": "trailer123", "site": "YouTube", "type": "Trailer"}]}
            }
            """.formatted(tmdbId)));
        responses.put("/?i=tt9988776&apikey=test-omdb-key", new MockResponse(200, """
            {"Response": "True", "imdbRating": "8.1", "Ratings": [{"Source": "Rotten Tomatoes", "Value": "88%%"}]}
            """));

        MvcResult result = mvc.perform(get("/api/movies/tmdb/" + tmdbId + "?mediaType=MOVIE")
                .header("Authorization", userToken))
                .andReturn();
        sanitizeAndLog("test01_uncachedMovie", result);
        assertEquals(200, result.getResponse().getStatus());
    }

    @Test
    void test02_uncachedTvRequest_successfulFixture() throws Exception {
        long tmdbId = idCounter.incrementAndGet();
        String tvPath = "/tv/" + tmdbId;
        responses.put(tvPath, new MockResponse(200, """
            {
              "id": %d,
              "name": "Clean TV Show",
              "first_air_date": "2023-09-15",
              "overview": "TV series plot overview",
              "number_of_seasons": 3,
              "number_of_episodes": 30,
              "genres": [{"id": 18, "name": "Drama"}],
              "credits": {"cast": [{"name": "TV Actor", "order": 0}], "crew": []},
              "videos": {"results": []}
            }
            """.formatted(tmdbId)));

        MvcResult result = mvc.perform(get("/api/movies/tmdb/" + tmdbId + "?mediaType=TV")
                .header("Authorization", userToken))
                .andReturn();
        sanitizeAndLog("test02_uncachedTv", result);
        assertEquals(200, result.getResponse().getStatus());
    }

    @Test
    void test03_concurrentInsertsForSameUncachedTitle() throws Exception {
        long tmdbId = idCounter.incrementAndGet();
        String moviePath = "/movie/" + tmdbId;
        responses.put(moviePath, new MockResponse(200, """
            {
              "id": %d,
              "title": "Concurrent Race Movie",
              "release_date": "2024-01-01",
              "overview": "Testing concurrency"
            }
            """.formatted(tmdbId), 50)); // small delay to ensure overlap

        int numThreads = 2;
        ExecutorService executor = Executors.newFixedThreadPool(numThreads);
        CountDownLatch startLatch = new CountDownLatch(1);
        Future<MvcResult>[] futures = new Future[numThreads];

        for (int i = 0; i < numThreads; i++) {
            futures[i] = executor.submit(() -> {
                startLatch.await();
                return mvc.perform(get("/api/movies/tmdb/" + tmdbId + "?mediaType=MOVIE")
                        .header("Authorization", userToken))
                        .andReturn();
            });
        }

        startLatch.countDown();
        for (int i = 0; i < numThreads; i++) {
            MvcResult res = futures[i].get(5, TimeUnit.SECONDS);
            sanitizeAndLog("test03_concurrentInsert_thread" + i, res);
            assertEquals(200, res.getResponse().getStatus(), "Concurrent request thread " + i + " must succeed with HTTP 200");
            assertTrue(res.getResponse().getContentAsString().contains("Concurrent Race Movie"));
        }
        executor.shutdown();

        // Direct verification: exactly one persisted entity for this typed title
        var persisted = movieRepository.findAll().stream()
                .filter(m -> Long.valueOf(tmdbId).equals(m.getTmdbId()) && m.getResourceType() == com.movienight.backend.model.ResourceType.MOVIE)
                .toList();
        assertEquals(1, persisted.size(), "Expected exactly one persisted Movie entity for concurrent requests");
    }

    @Test
    void test04_upstreamProviderReturns503OrTimeout() throws Exception {
        long tmdbId = idCounter.incrementAndGet();
        String moviePath = "/movie/" + tmdbId;
        responses.put(moviePath, new MockResponse(503, "{\"status_message\": \"Service Unavailable\"}"));

        MvcResult result = mvc.perform(get("/api/movies/tmdb/" + tmdbId + "?mediaType=MOVIE")
                .header("Authorization", userToken))
                .andReturn();
        sanitizeAndLog("test04_upstreamProvider503", result);
        assertEquals(503, result.getResponse().getStatus(), "Upstream 503 must map to HTTP 503 SERVICE_UNAVAILABLE");
    }

    @Test
    void test05_upstreamProviderReturns429RateLimit() throws Exception {
        long tmdbId = idCounter.incrementAndGet();
        String moviePath = "/movie/" + tmdbId;
        responses.put(moviePath, new MockResponse(429, "{\"status_message\": \"Too Many Requests\"}", 0, java.util.Map.of("Retry-After", "60")));

        MvcResult result = mvc.perform(get("/api/movies/tmdb/" + tmdbId + "?mediaType=MOVIE")
                .header("Authorization", userToken)
                .header("Origin", "http://localhost:5173"))
                .andReturn();
        sanitizeAndLog("test05_upstreamProvider429", result);
        assertEquals(429, result.getResponse().getStatus(), "Upstream 429 must map to HTTP 429 TOO_MANY_REQUESTS");
        assertEquals("60", result.getResponse().getHeader("Retry-After"), "Retry-After header must be forwarded to client");
        assertEquals("Retry-After", result.getResponse().getHeader("Access-Control-Expose-Headers"), "CORS must expose Retry-After to browser JavaScript");
    }

    @Test
    void test06_slowOmdbEnrichmentDoesNotBlockCoreDetails() throws Exception {
        long tmdbId = idCounter.incrementAndGet();
        String moviePath = "/movie/" + tmdbId;
        responses.put(moviePath, new MockResponse(200, """
            {
              "id": %d,
              "title": "Slow OMDb Movie",
              "release_date": "2024-02-02",
              "overview": "Core details available",
              "imdb_id": "tt8888999"
            }
            """.formatted(tmdbId)));
        // OMDb takes 2000ms
        responses.put("/?i=tt8888999&apikey=test-omdb-key", new MockResponse(200, """
            {"Response": "True", "imdbRating": "7.5", "Ratings": [{"Source": "Rotten Tomatoes", "Value": "91%"}]}
            """, 2000));

        long startTime = System.currentTimeMillis();
        MvcResult result = mvc.perform(get("/api/movies/tmdb/" + tmdbId + "?mediaType=MOVIE")
                .header("Authorization", userToken))
                .andExpect(status().isOk())
                .andReturn();
        long duration = System.currentTimeMillis() - startTime;
        sanitizeAndLog("test06_slowOmdb (" + duration + "ms)", result);

        // Core response must NOT wait for OMDb's 2000ms delay
        assertTrue(duration < 1500, "Core details took " + duration + "ms, waited for OMDb!");

        // Verify that after background enrichment finishes, the database row is updated with ratings
        org.awaitility.Awaitility.await().atMost(4, TimeUnit.SECONDS).untilAsserted(() -> {
            var movieOpt = movieRepository.findByResourceTypeAndTmdbId(com.movienight.backend.model.ResourceType.MOVIE, tmdbId);
            assertTrue(movieOpt.isPresent());
            assertEquals(7.5, movieOpt.get().getImdbRating());
            assertEquals(91, movieOpt.get().getRottenTomatoesRating());
        });
    }

    @Test
    void test07_incompleteCachedRowIsBackfilledSensibly() throws Exception {
        long tmdbId = idCounter.incrementAndGet();
        // Save incomplete row (like from cached summary)
        com.movienight.backend.model.Movie incomplete = movieRepository.save(com.movienight.backend.model.Movie.builder()
                .tmdbId(tmdbId)
                .title("Incomplete Title")
                .mediaType("MOVIE")
                .overview(null)
                .trailerKey(null)
                .build());

        String moviePath = "/movie/" + tmdbId;
        responses.put(moviePath, new MockResponse(200, """
            {
              "id": %d,
              "title": "Incomplete Title",
              "release_date": "2024-03-03",
              "overview": "Now populated overview",
              "videos": {"results": [{"key": "backfilledTrailer", "site": "YouTube", "type": "Trailer"}]}
            }
            """.formatted(tmdbId)));

        MvcResult result = mvc.perform(get("/api/movies/tmdb/" + tmdbId + "?mediaType=MOVIE")
                .header("Authorization", userToken))
                .andExpect(status().isOk())
                .andReturn();
        sanitizeAndLog("test07_incompleteRowBackfill", result);

        // Verify background backfill updates entity within bounded window
        org.awaitility.Awaitility.await().atMost(4, TimeUnit.SECONDS).untilAsserted(() -> {
            var updated = movieRepository.findById(incomplete.getId()).orElseThrow();
            assertEquals("Now populated overview", updated.getOverview());
            assertEquals("backfilledTrailer", updated.getTrailerKey());
        });

        // Repeated open does not fail and returns populated data
        MvcResult repeatedResult = mvc.perform(get("/api/movies/tmdb/" + tmdbId + "?mediaType=MOVIE")
                .header("Authorization", userToken))
                .andExpect(status().isOk())
                .andReturn();
        assertTrue(repeatedResult.getResponse().getContentAsString().contains("Now populated overview"));
    }
}
