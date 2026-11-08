package com.movienight.backend.client;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class TmdbClientDiscoverTvQueryTest {

    private String captureQuery(String withoutGenres) throws Exception {
        AtomicReference<String> query = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/discover/tv", exchange -> {
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
            client.discoverTv("popularity.desc", 0, null, null, null, null, "16", withoutGenres, "ja", 1);
        } finally {
            server.stop(0);
        }
        return query.get();
    }

    @Test
    void sendsWithoutGenresWithEitherSemanticsEncodedAndKeepsOtherFilters() throws Exception {
        String raw = captureQuery("10762|10751");
        assertEquals(true, raw.contains("without_genres=10762%7C10751"), raw);
        assertEquals(true, raw.contains("with_genres=16"), raw);
        assertEquals(true, raw.contains("with_original_language=ja"), raw);
    }

    @Test
    void omitsWithoutGenresWhenNotRequested() throws Exception {
        assertFalse(captureQuery(null).contains("without_genres"));
    }
}
