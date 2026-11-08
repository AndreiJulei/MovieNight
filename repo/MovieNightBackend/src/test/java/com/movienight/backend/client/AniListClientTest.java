package com.movienight.backend.client;

import com.movienight.backend.dto.external.AniListMedia;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.IntFunction;

import static org.junit.jupiter.api.Assertions.*;

class AniListClientTest {
    private HttpServer server;
    private final AtomicInteger calls = new AtomicInteger();
    private final List<Long> sleeps = new ArrayList<>();
    private IntFunction<Object[]> responder; // call number -> {status, retryAfter or null, body}
    private final StringBuilder lastBody = new StringBuilder();

    @BeforeEach void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            lastBody.setLength(0);
            lastBody.append(new String(exchange.getRequestBody().readAllBytes()));
            Object[] r = responder.apply(calls.incrementAndGet());
            byte[] body = ((String) r[2]).getBytes();
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            if (r[1] != null) exchange.getResponseHeaders().add("Retry-After", (String) r[1]);
            exchange.sendResponseHeaders((Integer) r[0], body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
    }

    @AfterEach void stop() { server.stop(0); }

    private AniListClient client() {
        return new AniListClient("http://127.0.0.1:" + server.getAddress().getPort(), true, ms -> sleeps.add(ms), 0);
    }

    private static final String OK = """
            {"data":{"Page":{"media":[{"id":154587,"idMal":52991,"format":"TV","isAdult":false,
              "genres":["Adventure","Fantasy"],"meanScore":91,"popularity":250000,"episodes":28,"seasonYear":2023,
              "title":{"romaji":"Sousou no Frieren","english":"Frieren: Beyond Journey's End","native":null},
              "synonyms":["Frieren"],"tags":[{"name":"Shounen","rank":70}]}]}}}""";

    @Test void parsesEnrichmentFieldsAndSendsFormatFilteredSearch() {
        responder = n -> new Object[]{200, null, OK};
        List<AniListMedia> result = client().searchAnime("Frieren");
        assertEquals(1, result.size());
        AniListMedia m = result.get(0);
        assertEquals(154587, m.id()); assertEquals(52991L, m.idMal()); assertEquals("TV", m.format());
        assertFalse(m.isAdult()); assertEquals(91, m.meanScore()); assertEquals(250000, m.popularity());
        assertEquals(28, m.episodes()); assertEquals(2023, m.seasonYear());
        assertEquals(List.of("Adventure", "Fantasy"), m.genres());
        assertEquals("Shounen", m.tags().get(0).name()); assertEquals(70, m.tags().get(0).rank());
        assertTrue(m.titles().containsAll(List.of("Sousou no Frieren", "Frieren: Beyond Journey's End", "Frieren")));
        assertTrue(lastBody.toString().contains("format_in: [TV, ONA]"));
        assertTrue(lastBody.toString().contains("\"search\":\"Frieren\""));
    }

    @Test void shortRetryAfterOn429IsHonouredOnceThenSucceeds() {
        responder = n -> n == 1 ? new Object[]{429, "2", "{}"} : new Object[]{200, null, OK};
        assertEquals(1, client().searchAnime("Frieren").size());
        assertEquals(List.of(2000L), sleeps);
        assertEquals(2, calls.get());
    }

    @Test void longRetryAfterIsReportedWithoutWaiting() {
        responder = n -> new Object[]{429, "60", "{}"};
        AniListUnavailableException e = assertThrows(AniListUnavailableException.class, () -> client().searchAnime("x"));
        assertEquals(60, e.getRetryAfterSeconds());
        assertTrue(sleeps.isEmpty()); assertEquals(1, calls.get());
    }

    @Test void repeated429AfterRetryAndServerErrorsAndGraphQlErrorsAllSurfaceAsUnavailable() {
        responder = n -> new Object[]{429, "1", "{}"};
        assertThrows(AniListUnavailableException.class, () -> client().searchAnime("x"));
        assertEquals(2, calls.get());
        responder = n -> new Object[]{500, null, "{}"};
        assertThrows(AniListUnavailableException.class, () -> client().searchAnime("x"));
        responder = n -> new Object[]{200, null, "{\"errors\":[{\"message\":\"bad\"}]}"};
        assertThrows(AniListUnavailableException.class, () -> client().searchAnime("x"));
    }

    @Test void emptyResultIsNotAnError() {
        responder = n -> new Object[]{200, null, "{\"data\":{\"Page\":{\"media\":[]}}}"};
        assertTrue(client().searchAnime("nothing").isEmpty());
    }

    @Test void spacesConsecutiveRequestsByTheMinimumInterval() {
        responder = n -> new Object[]{200, null, "{\"data\":{\"Page\":{\"media\":[]}}}"};
        AniListClient paced = new AniListClient("http://127.0.0.1:" + server.getAddress().getPort(), true,
                ms -> sleeps.add(ms), 60_000);
        paced.searchAnime("a");
        assertTrue(sleeps.isEmpty());
        paced.searchAnime("b");
        assertEquals(1, sleeps.size());
        assertTrue(sleeps.get(0) > 50_000 && sleeps.get(0) <= 60_000);
    }
}
