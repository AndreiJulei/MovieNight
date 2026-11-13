package com.movienight.backend.service;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The backend keeps its own public URL warm only when MN_SELF_PING_URL is set (#18, KA04). */
class SelfPingTaskTest {

    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void blankOrMissingUrlDisablesTheSelfPing() {
        assertFalse(new SelfPingTask(null).isEnabled());
        assertFalse(new SelfPingTask("").isEnabled());
        assertFalse(new SelfPingTask("   ").isEnabled());
        assertDoesNotThrow(() -> new SelfPingTask("").ping());
    }

    @Test
    void urlThatIsNotAbsoluteHttpDisablesTheSelfPing() {
        assertFalse(new SelfPingTask("movienight.example/api/health").isEnabled());
        assertFalse(new SelfPingTask("ftp://movienight.example/api/health").isEnabled());
    }

    @Test
    void configuredUrlIsRequestedOncePerPing() throws Exception {
        List<String> requests = new CopyOnWriteArrayList<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/health", exchange -> {
            requests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath());
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();
        SelfPingTask task = new SelfPingTask("http://127.0.0.1:" + server.getAddress().getPort() + "/api/health");

        assertTrue(task.isEnabled());
        task.ping();

        assertEquals(List.of("GET /api/health"), requests);
    }

    @Test
    void unreachableUrlDoesNotBreakTheScheduler() {
        // Port 9 (discard) on loopback is closed in test environments: the ping fails and is only logged.
        SelfPingTask task = new SelfPingTask("http://127.0.0.1:9/api/health");

        assertTrue(task.isEnabled());
        assertDoesNotThrow(task::ping);
    }
}
