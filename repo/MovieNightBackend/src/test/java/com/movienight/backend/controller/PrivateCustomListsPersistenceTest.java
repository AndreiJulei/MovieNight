package com.movienight.backend.controller;

import com.movienight.backend.model.CustomList;
import com.movienight.backend.model.User;
import com.movienight.backend.model.Movie;
import com.movienight.backend.repository.MovieRepository;
import com.movienight.backend.repository.CustomListRepository;
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

/** Real JWT/API/persistence boundary; fixture setup is not used to verify writes. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:private-lists-test;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "app.tmdb.api-key=", "app.omdb.api-key=",
        "app.jwt.secret=private-lists-test-only-signing-key-at-least-32-bytes"
})
class PrivateCustomListsPersistenceTest {
    @Autowired private WebApplicationContext context;
    @Autowired private UserRepository users;
    @Autowired private CustomListRepository lists;
    @Autowired private MovieRepository movies;
    @Autowired private JwtTokenProvider tokens;
    private MockMvc mvc;
    private User owner;
    private String authorization;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        owner = newUser();
        authorization = token(owner);
    }

    @Test
    void legacyPublicFlagNeverGrantsAccessOrExposesListsInPublicIndex() throws Exception {
        long id = lists.save(CustomList.builder().user(owner).title("Legacy private content").isPublic(true).build()).getId();
        mvc.perform(get("/api/lists/public")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get("/api/lists/" + id).header("Authorization", token(newUser())))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/lists/" + id)).andExpect(status().isForbidden());
        read(id).andExpect(status().isOk()).andExpect(jsonPath("$.isPublic").value(false));
    }

    @Test
    void createRenameValidationAndPrivacyAreRecoveredByIndependentReads() throws Exception {
        long id = id(create("{\"title\":\"  Weekend picks  \"}").andExpect(status().isCreated()));
        read(id).andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Weekend picks"));
        write("PUT", "/api/lists/" + id, "{\"title\":\"  Rewatches  \"}").andExpect(status().isOk());
        for (String invalid : new String[]{"   ", "x".repeat(151)}) {
            String body = "{\"title\":\"" + invalid + "\"}";
            create(body).andExpect(status().isBadRequest());
            write("PUT", "/api/lists/" + id, body).andExpect(status().isBadRequest());
        }
        create("{\"title\":\"Public attempt\",\"isPublic\":true}").andExpect(status().isBadRequest());
        write("PUT", "/api/lists/" + id, "{\"isPublic\":true}").andExpect(status().isBadRequest());
        read(id).andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Rewatches"))
                .andExpect(jsonPath("$.isPublic").value(false));
        mvc.perform(get("/api/lists").header("Authorization", authorization))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(id));
    }

    private ResultActions write(String method, String path, String body) throws Exception {
        return mvc.perform(request(org.springframework.http.HttpMethod.valueOf(method), path)
                .header("Authorization", authorization).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void initialMembershipsDeduplicateAndUnknownCatalogKeysRejectTheWholeCreate() throws Exception {
        long catalogId = movies.save(Movie.builder().title("Catalog-only fixture").tmdbId(99000001L).build()).getId();
        long id = id(create("{\"title\":\"A\",\"initialMovieIds\":[" + catalogId + "," + catalogId + "]}")
                .andExpect(status().isCreated()));
        read(id).andExpect(status().isOk()).andExpect(jsonPath("$.entries", hasSize(1)))
                .andExpect(jsonPath("$.entries[0].movie.id").value(catalogId));
        create("{\"title\":\"Invalid\",\"initialMovieIds\":[" + catalogId + ",9223372036854775807]}")
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/lists").header("Authorization", authorization))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)));
        mvc.perform(get("/api/movies/library").header("Authorization", authorization))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void membershipsAndDeletionStayIndependentOfOtherListsAndWatchedHistory() throws Exception {
        long catalogId = movies.save(Movie.builder().title("Only in lists").tmdbId(99000002L).build()).getId();
        // A separate movie's provider ID deliberately collides with the first catalog key.
        long collisionId = movies.save(Movie.builder().title("Collision movie").tmdbId(catalogId).build()).getId();
        long first = id(create("{\"title\":\"Same name\"}").andExpect(status().isCreated()));
        long second = id(create("{\"title\":\"Same name\"}").andExpect(status().isCreated()));
        String membership = "{\"movieId\":" + collisionId + "}";
        for (long listId : new long[]{first, first, second}) {
            write("POST", "/api/lists/" + listId + "/movies", membership).andExpect(status().isOk());
            read(listId).andExpect(jsonPath("$.entries", hasSize(1)))
                    .andExpect(jsonPath("$.entries[0].movie.id").value(collisionId));
        }
        mvc.perform(get("/api/movies/library").header("Authorization", authorization))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        // Explicit watched save is independent of either list's membership.
        write("POST", "/api/movies/library", "{\"mediaType\":\"MOVIE\",\"tmdbId\":" + catalogId +
                ",\"title\":\"Collision movie\",\"status\":\"WATCHED\",\"personalRating\":7.5,\"notes\":\"Private note\"}")
                .andExpect(status().isCreated());
        write("DELETE", "/api/lists/" + first + "/movies/" + collisionId, "").andExpect(status().isOk());
        read(first).andExpect(jsonPath("$.entries", hasSize(0)));
        read(second).andExpect(jsonPath("$.entries", hasSize(1)));
        write("DELETE", "/api/lists/" + second, "").andExpect(status().isOk());
        read(second).andExpect(status().isNotFound());
        mvc.perform(get("/api/movies/library").header("Authorization", authorization))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].movie.id").value(collisionId))
                .andExpect(jsonPath("$[0].status").value("WATCHED"))
                .andExpect(jsonPath("$[0].personalRating").value(7.5))
                .andExpect(jsonPath("$[0].notes").value("Private note"));
    }

    @Test
    void otherOwnersAndAnonymousCallersCannotReadOrMutateAnyListRoute() throws Exception {
        long movieId = movies.save(Movie.builder().title("Ownership fixture").build()).getId();
        long listId = id(create("{\"title\":\"Owner only\",\"initialMovieIds\":[" + movieId + "]}")
                .andExpect(status().isCreated()));
        String otherToken = token(newUser());
        mvc.perform(get("/api/lists").header("Authorization", otherToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get("/api/lists/" + listId).header("Authorization", otherToken)).andExpect(status().isForbidden());
        String[][] attempts = {
                {"PUT", "/api/lists/" + listId, "{\"title\":\"Stolen\"}"},
                {"DELETE", "/api/lists/" + listId, ""},
                {"POST", "/api/lists/" + listId + "/movies", "{\"movieId\":" + movieId + "}"},
                {"DELETE", "/api/lists/" + listId + "/movies/" + movieId, ""},
                {"PUT", "/api/lists/" + listId + "/reorder", "{\"orderedMovieIds\":[" + movieId + "]}"}
        };
        for (String[] attempt : attempts) {
            mvc.perform(request(org.springframework.http.HttpMethod.valueOf(attempt[0]), attempt[1])
                            .header("Authorization", otherToken).contentType(MediaType.APPLICATION_JSON).content(attempt[2]))
                    .andExpect(status().isNotFound());
            mvc.perform(request(org.springframework.http.HttpMethod.valueOf(attempt[0]), attempt[1])
                            .contentType(MediaType.APPLICATION_JSON).content(attempt[2]))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/lists")).andExpect(status().isForbidden());
        mvc.perform(post("/api/lists").contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Anonymous\"}"))
                .andExpect(status().isForbidden());
        read(listId).andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Owner only"))
                .andExpect(jsonPath("$.entries", hasSize(1)));
    }

    @Test
    void simultaneousRepeatedMembershipAddsBothSucceedAndLeaveOneMembership() throws Exception {
        long movieId = movies.save(Movie.builder().title("Concurrent fixture").build()).getId();
        long listId = id(create("{\"title\":\"Concurrent list\"}").andExpect(status().isCreated()));
        var start = new java.util.concurrent.CountDownLatch(1);
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Integer> add = () -> {
                start.await();
                return write("POST", "/api/lists/" + listId + "/movies", "{\"movieId\":" + movieId + "}")
                        .andReturn().getResponse().getStatus();
            };
            var first = executor.submit(add);
            var second = executor.submit(add);
            start.countDown();
            org.junit.jupiter.api.Assertions.assertEquals(200, first.get(10, java.util.concurrent.TimeUnit.SECONDS));
            org.junit.jupiter.api.Assertions.assertEquals(200, second.get(10, java.util.concurrent.TimeUnit.SECONDS));
        }
        read(listId).andExpect(status().isOk()).andExpect(jsonPath("$.entries", hasSize(1)));
    }

    @Test
    void movieLookupCannotReclassifyTvAndListsAcceptTvCatalogKeys() throws Exception {
        long tvId = movies.save(Movie.builder().title("Existing TV series").tmdbId(99000003L).mediaType("TV").build()).getId();
        long listId = id(create("{\"title\":\"TV titles\"}").andExpect(status().isCreated()));
        mvc.perform(get("/api/movies/tmdb/99000003").param("mediaType", "MOVIE").header("Authorization", authorization))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/movies/" + tvId).header("Authorization", authorization))
                .andExpect(status().isOk()).andExpect(jsonPath("$.mediaType").value("TV"))
                .andExpect(jsonPath("$.title").value("Existing TV series"));
        write("POST", "/api/lists/" + listId + "/movies", "{\"movieId\":" + tvId + "}")
                .andExpect(status().isOk());
        create("{\"title\":\"Wrong type\",\"initialMovieIds\":[" + tvId + "]}")
                .andExpect(status().isCreated());
        read(listId).andExpect(jsonPath("$.entries", hasSize(1)));
    }

    private User newUser() {
        String name = "lists-" + UUID.randomUUID();
        return users.save(User.builder().username(name).email(name + "@example.test")
                .displayName(name).password("unused-test-password").build());
    }

    private String token(User user) {
        return "Bearer " + tokens.generateToken(user.getUsername(), user.getId(), user.getRole());
    }

    private ResultActions read(long id) throws Exception {
        return mvc.perform(get("/api/lists/" + id).header("Authorization", authorization));
    }

    private ResultActions create(String body) throws Exception {
        return mvc.perform(post("/api/lists").header("Authorization", authorization)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private long id(ResultActions result) throws Exception {
        return com.jayway.jsonpath.JsonPath.<Number>read(result.andReturn().getResponse().getContentAsString(), "$.id").longValue();
    }
}
