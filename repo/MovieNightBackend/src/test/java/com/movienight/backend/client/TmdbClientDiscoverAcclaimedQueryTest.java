package com.movienight.backend.client;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertTrue;

/** AC02: the acclaimed source asks TMDB for the best-rated, widely voted movies in any of the top genres. */
class TmdbClientDiscoverAcclaimedQueryTest {

    @Test
    void asksForTopGenresWithOrSemanticsSortedByRatingWithTheVoteMinimum() throws Exception {
        AtomicReference<String> query = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/discover/movie", exchange -> {
            query.set(exchange.getRequestURI().getRawQuery());
            byte[] body = "{\"results\":[]}".getBytes();
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            TmdbClient client = new TmdbClient("test-api-key", "http://127.0.0.1:" + server.getAddress().getPort(),
                    "https://image.tmdb.org/t/p");
            client.discoverAcclaimedMovies("18|80|53", 3000, 2);
        } finally {
            server.stop(0);
        }
        String raw = query.get();
        assertTrue(raw.contains("with_genres=18%7C80%7C53"), raw);
        assertTrue(raw.contains("sort_by=vote_average.desc"), raw);
        assertTrue(raw.contains("vote_count.gte=3000"), raw);
        assertTrue(raw.contains("page=2"), raw);
    }
}
