package com.movienight.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Keeps a free Render instance awake: it sleeps after ~15 minutes without inbound traffic, so the
 * service requests its own public health URL (through Render's edge, counting as inbound) every
 * 10 minutes. Configured by MN_SELF_PING_URL; blank (local and test runs) disables it. After a
 * restart the GitHub keep-alive workflow is the safety net that wakes the service again.
 */
@Component
@Slf4j
public class SelfPingTask {

    private static final Duration TIMEOUT = Duration.ofSeconds(60);

    private final URI target;
    private final HttpClient client;

    public SelfPingTask(@Value("${MN_SELF_PING_URL:}") String url) {
        this.target = parse(url);
        this.client = target == null ? null
                : HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        if (target != null) log.info("Self-ping enabled every 10 minutes");
    }

    public boolean isEnabled() {
        return target != null;
    }

    @Scheduled(initialDelayString = "PT1M", fixedDelayString = "PT10M")
    public void ping() {
        if (target == null) return;
        try {
            HttpResponse<Void> response = client.send(
                    HttpRequest.newBuilder(target).timeout(TIMEOUT).GET().build(),
                    HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() >= 400) log.warn("Self-ping answered HTTP {}", response.statusCode());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (Exception failure) {
            // The next scheduled run tries again; the URL is not logged.
            log.warn("Self-ping failed: {}", failure.getClass().getSimpleName());
        }
    }

    private static URI parse(String url) {
        if (url == null || url.isBlank()) return null;
        try {
            URI uri = URI.create(url.trim());
            String scheme = uri.getScheme();
            if (uri.getHost() != null && ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) return uri;
        } catch (IllegalArgumentException ignored) {
            // fall through: invalid configuration disables the self-ping
        }
        log.warn("MN_SELF_PING_URL is not an absolute http(s) URL; self-ping disabled");
        return null;
    }
}
