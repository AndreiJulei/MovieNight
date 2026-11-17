package com.movienight.backend.client;

import com.movienight.backend.dto.external.TmdbPerson;
import com.movienight.backend.dto.external.TmdbSearchResponse;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Director lookups for the same-director recommendation source (PD-20, #38). */
class TmdbClientDirectorCreditsTest {

    private HttpServer server;
    private TmdbClient client;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        respond("/movie/426063/credits", 200, """
                {"cast":[{"id":1,"name":"Lily-Rose Depp"}],
                 "crew":[{"id":138781,"name":"Robert Eggers","job":"Director"},
                         {"id":138781,"name":"Robert Eggers","job":"Screenplay"},
                         {"id":5,"name":"Jarin Blaschke","job":"Director of Photography"},
                         {"id":7,"name":" ","job":"Director"}]}""");
        respond("/person/138781/movie_credits", 200, """
                {"cast":[{"id":999,"title":"Acting role"}],
                 "crew":[{"id":503919,"title":"The Lighthouse","job":"Director","vote_average":7.4,"vote_count":6000},
                         {"id":503919,"title":"The Lighthouse","job":"Writer"},
                         {"id":639933,"title":"The Northman","job":"Director"},
                         {"id":639933,"title":"The Northman","job":"Director"}]}""");
        respond("/movie/1/credits", 500, "{}");
        server.start();
        client = new TmdbClient("test-api-key", "http://127.0.0.1:" + server.getAddress().getPort(),
                "https://image.tmdb.org/t/p");
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private void respond(String path, int status, String json) {
        server.createContext(path, exchange -> {
            byte[] body = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
    }

    @Test
    void movieDirectorsAreTheNamedDirectorCrewOnlyOncePerPerson() {
        assertThat(client.getMovieDirectors(426063L)).containsExactly(new TmdbPerson(138781L, "Robert Eggers"));
    }

    @Test
    void directedMoviesKeepOnlyDirectorCreditsOncePerMovie() {
        assertThat(client.getDirectedMovies(138781L)).extracting(TmdbSearchResponse.TmdbMovieSummary::getId)
                .containsExactly(503919L, 639933L);
        assertThat(client.getDirectedMovies(138781L).get(0).getVoteCount()).isEqualTo(6000);
    }

    @Test
    void providerFailureIsReportedWithoutTheRequestUrl() {
        assertThatThrownBy(() -> client.getMovieDirectors(1L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Movie credits source unavailable. Retry the refresh.");
    }
}
