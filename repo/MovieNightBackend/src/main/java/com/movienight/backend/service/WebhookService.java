package com.movienight.backend.service;

import com.movienight.backend.dto.*;
import com.movienight.backend.event.MovieNightDomainEvent;
import com.movienight.backend.exception.ResourceNotFoundException;
import com.movienight.backend.model.User;
import com.movienight.backend.model.WebhookDeliveryLog;
import com.movienight.backend.model.WebhookSubscription;
import com.movienight.backend.repository.UserRepository;
import com.movienight.backend.repository.WebhookDeliveryLogRepository;
import com.movienight.backend.repository.WebhookSubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class WebhookService {

    private final WebhookSubscriptionRepository subscriptionRepository;
    private final WebhookDeliveryLogRepository deliveryLogRepository;
    private final UserRepository userRepository;
    private final WebhookDispatcherService dispatcherService;

    private static final SecureRandom RANDOM = new SecureRandom();

    @Transactional
    public WebhookSubscriptionResponse createSubscription(String username, CreateWebhookSubscriptionRequest req) {
        User user = findUserByUsername(username);

        String secret = req.getSecret();
        if (secret == null || secret.isBlank()) {
            secret = generateSecret();
        }

        String events = (req.getEvents() != null && !req.getEvents().isBlank()) ? req.getEvents().trim() : "*";

        WebhookSubscription sub = WebhookSubscription.builder()
                .user(user)
                .targetUrl(req.getTargetUrl().trim())
                .secret(secret.trim())
                .description(req.getDescription() != null ? req.getDescription().trim() : null)
                .events(events)
                .isActive(true)
                .consecutiveFailures(0)
                .build();

        sub = subscriptionRepository.save(sub);
        log.info("Registered webhook subscription ID {} for user {}", sub.getId(), username);
        return mapToResponse(sub);
    }

    @Transactional(readOnly = true)
    public List<WebhookSubscriptionResponse> getUserSubscriptions(String username) {
        User user = findUserByUsername(username);
        return subscriptionRepository.findByUserIdOrderByCreatedAtDesc(user.getId()).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public WebhookSubscriptionResponse getSubscriptionById(String username, Long id) {
        User user = findUserByUsername(username);
        WebhookSubscription sub = findOwnedSubscription(id, user.getId());
        return mapToResponse(sub);
    }

    @Transactional
    public WebhookSubscriptionResponse updateSubscription(String username, Long id, UpdateWebhookSubscriptionRequest req) {
        User user = findUserByUsername(username);
        WebhookSubscription sub = findOwnedSubscription(id, user.getId());

        if (req.getTargetUrl() != null && !req.getTargetUrl().isBlank()) {
            sub.setTargetUrl(req.getTargetUrl().trim());
        }
        if (req.getSecret() != null && !req.getSecret().isBlank()) {
            sub.setSecret(req.getSecret().trim());
        }
        if (req.getDescription() != null) {
            sub.setDescription(req.getDescription().trim());
        }
        if (req.getEvents() != null && !req.getEvents().isBlank()) {
            sub.setEvents(req.getEvents().trim());
        }
        if (req.getIsActive() != null) {
            sub.setActive(req.getIsActive());
            if (req.getIsActive()) {
                sub.setConsecutiveFailures(0);
            }
        }

        sub = subscriptionRepository.save(sub);
        return mapToResponse(sub);
    }

    @Transactional
    public void deleteSubscription(String username, Long id) {
        User user = findUserByUsername(username);
        WebhookSubscription sub = findOwnedSubscription(id, user.getId());
        subscriptionRepository.delete(sub);
        log.info("Deleted webhook subscription ID {} for user {}", id, username);
    }

    /**
     * Send an immediate test ping event to the subscribed URL.
     */
    @Transactional
    public TestWebhookResponse sendTestPing(String username, Long id) {
        User user = findUserByUsername(username);
        WebhookSubscription sub = findOwnedSubscription(id, user.getId());

        MovieNightDomainEvent pingEvent = MovieNightDomainEvent.of(
                "test.ping",
                user.getId(),
                user.getUsername(),
                Map.of(
                        "subscriptionId", sub.getId(),
                        "message", "Test ping delivery from MovieNight webhook engine",
                        "status", "OK"
                )
        );

        return dispatcherService.dispatchSync(sub, pingEvent);
    }

    @Transactional(readOnly = true)
    public List<WebhookDeliveryLogResponse> getDeliveryLogs(String username, Long subscriptionId) {
        User user = findUserByUsername(username);
        // Verify ownership
        findOwnedSubscription(subscriptionId, user.getId());

        List<WebhookDeliveryLog> logs = deliveryLogRepository.findTop50BySubscriptionIdOrderByCreatedAtDesc(subscriptionId);
        return logs.stream().map(this::mapToLogResponse).collect(Collectors.toList());
    }

    // --- Helpers ---

    private User findUserByUsername(String username) {
        return userRepository.findByIdentifier(username)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + username));
    }

    private WebhookSubscription findOwnedSubscription(Long id, Long userId) {
        return subscriptionRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Webhook subscription not found with ID: " + id));
    }

    private String generateSecret() {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        return "whsec_" + HexFormat.of().formatHex(bytes);
    }

    public WebhookSubscriptionResponse mapToResponse(WebhookSubscription sub) {
        return WebhookSubscriptionResponse.builder()
                .id(sub.getId())
                .userId(sub.getUser().getId())
                .targetUrl(sub.getTargetUrl())
                .secret(sub.getSecret())
                .description(sub.getDescription())
                .events(sub.getEvents())
                .isActive(sub.isActive())
                .consecutiveFailures(sub.getConsecutiveFailures())
                .lastDeliveryAt(sub.getLastDeliveryAt())
                .lastDeliveryStatus(sub.getLastDeliveryStatus())
                .createdAt(sub.getCreatedAt())
                .updatedAt(sub.getUpdatedAt())
                .build();
    }

    public WebhookDeliveryLogResponse mapToLogResponse(WebhookDeliveryLog log) {
        return WebhookDeliveryLogResponse.builder()
                .id(log.getId())
                .subscriptionId(log.getSubscription().getId())
                .eventId(log.getEventId())
                .eventType(log.getEventType())
                .payload(log.getPayload())
                .responseStatus(log.getResponseStatus())
                .responseBody(log.getResponseBody())
                .durationMs(log.getDurationMs())
                .success(log.isSuccess())
                .attemptCount(log.getAttemptCount())
                .createdAt(log.getCreatedAt())
                .build();
    }
}
