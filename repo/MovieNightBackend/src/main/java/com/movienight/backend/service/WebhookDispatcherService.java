package com.movienight.backend.service;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import com.movienight.backend.dto.TestWebhookResponse;
import com.movienight.backend.event.MovieNightDomainEvent;
import com.movienight.backend.model.WebhookDeliveryLog;
import com.movienight.backend.model.WebhookSubscription;
import com.movienight.backend.repository.WebhookDeliveryLogRepository;
import com.movienight.backend.repository.WebhookSubscriptionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Asynchronous dispatcher for outgoing webhooks.
 * Computes cryptographic HMAC-SHA256 signatures and tracks delivery logs and health.
 */
@Service
@Slf4j
public class WebhookDispatcherService {

    private final WebhookSubscriptionRepository subscriptionRepository;
    private final WebhookDeliveryLogRepository deliveryLogRepository;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public WebhookDispatcherService(
            WebhookSubscriptionRepository subscriptionRepository,
            WebhookDeliveryLogRepository deliveryLogRepository
    ) {
        this.subscriptionRepository = subscriptionRepository;
        this.deliveryLogRepository = deliveryLogRepository;
        this.objectMapper = JsonMapper.builder().build();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    /**
     * Asynchronous listener receiving all MovieNightDomainEvents.
     */
    @Async
    @EventListener
    public void onDomainEvent(MovieNightDomainEvent event) {
        try {
            List<WebhookSubscription> activeSubscriptions = subscriptionRepository.findAllByIsActiveTrue();
            for (WebhookSubscription sub : activeSubscriptions) {
                // User check: event belongs to user, or subscription matches user, or system-wide event
                if (event.getUserId() != null && !event.getUserId().equals(sub.getUser().getId())) {
                    continue;
                }

                // Event pattern matching
                if (!matchesEvent(sub.getEvents(), event.getEventType())) {
                    continue;
                }

                deliverToSubscription(sub, event);
            }
        } catch (Exception e) {
            log.error("Error in WebhookDispatcherService onDomainEvent: {}", e.getMessage(), e);
        }
    }

    /**
     * Synchronous delivery for test pings.
     */
    public TestWebhookResponse dispatchSync(WebhookSubscription sub, MovieNightDomainEvent event) {
        return deliverToSubscription(sub, event);
    }

    /**
     * Execute HTTP POST dispatch, calculate HMAC-SHA256, and persist delivery log.
     */
    @Transactional
    public TestWebhookResponse deliverToSubscription(WebhookSubscription sub, MovieNightDomainEvent event) {
        long startTime = System.currentTimeMillis();
        String payloadJson;
        try {
            payloadJson = objectMapper.writeValueAsString(event);
        } catch (Exception e) {
            log.error("Failed to serialize webhook event {}: {}", event.getEventId(), e.getMessage());
            return TestWebhookResponse.builder()
                    .success(false)
                    .message("Failed to serialize event payload: " + e.getMessage())
                    .build();
        }

        long timestampEpochMs = Instant.now().toEpochMilli();
        String signature = computeHmacSha256(payloadJson, sub.getSecret());
        String deliveryId = UUID.randomUUID().toString();

        Integer statusCode = null;
        String responseBody = null;
        boolean success = false;
        String errorMessage = null;

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(sub.getTargetUrl()))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .header("User-Agent", "MovieNight-Webhooks/1.0")
                    .header("X-MovieNight-Event", event.getEventType())
                    .header("X-MovieNight-Delivery", deliveryId)
                    .header("X-MovieNight-Timestamp", String.valueOf(timestampEpochMs))
                    .header("X-MovieNight-Signature", "sha256=" + signature)
                    .POST(HttpRequest.BodyPublishers.ofString(payloadJson, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            statusCode = response.statusCode();
            responseBody = response.body();
            if (responseBody != null && responseBody.length() > 2000) {
                responseBody = responseBody.substring(0, 2000) + "... [truncated]";
            }
            success = (statusCode >= 200 && statusCode < 300);
        } catch (Exception ex) {
            errorMessage = ex.getMessage();
            responseBody = "Delivery error: " + ex.getClass().getSimpleName() + ": " + ex.getMessage();
            statusCode = -1;
            success = false;
        }

        long durationMs = System.currentTimeMillis() - startTime;

        // Persist delivery log
        WebhookDeliveryLog deliveryLog = WebhookDeliveryLog.builder()
                .subscription(sub)
                .eventId(event.getEventId())
                .eventType(event.getEventType())
                .payload(payloadJson)
                .responseStatus(statusCode)
                .responseBody(responseBody)
                .durationMs(durationMs)
                .success(success)
                .attemptCount(1)
                .build();
        deliveryLogRepository.save(deliveryLog);

        // Update subscription health counters
        sub.setLastDeliveryAt(LocalDateTime.now());
        sub.setLastDeliveryStatus(statusCode);
        if (success) {
            sub.setConsecutiveFailures(0);
        } else {
            int failures = sub.getConsecutiveFailures() + 1;
            sub.setConsecutiveFailures(failures);
            if (failures >= 10) {
                sub.setActive(false);
                log.warn("Webhook subscription ID {} disabled after 10 consecutive failures.", sub.getId());
            }
        }
        subscriptionRepository.save(sub);

        return TestWebhookResponse.builder()
                .success(success)
                .responseStatus(statusCode)
                .durationMs(durationMs)
                .message(success ? "Webhook delivered successfully" : (errorMessage != null ? errorMessage : "HTTP Status " + statusCode))
                .responseBody(responseBody)
                .build();
    }

    /**
     * Match event type against comma-separated patterns (supports '*' and prefixes like 'movie.*').
     */
    public boolean matchesEvent(String subscriptionEvents, String eventType) {
        if (subscriptionEvents == null || subscriptionEvents.isBlank() || "*".equals(subscriptionEvents.trim())) {
            return true;
        }
        String[] patterns = subscriptionEvents.split(",");
        for (String p : patterns) {
            String pattern = p.trim();
            if (pattern.equals(eventType)) return true;
            if (pattern.endsWith(".*")) {
                String prefix = pattern.substring(0, pattern.length() - 2);
                if (eventType.startsWith(prefix + ".")) return true;
            }
        }
        return false;
    }

    /**
     * Compute HMAC-SHA256 signature in hex format.
     */
    public static String computeHmacSha256(String data, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] rawHmac = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(rawHmac);
        } catch (Exception e) {
            throw new RuntimeException("Failed to calculate HMAC SHA256", e);
        }
    }
}
