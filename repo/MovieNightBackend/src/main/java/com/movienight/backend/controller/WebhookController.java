package com.movienight.backend.controller;

import com.movienight.backend.dto.*;
import com.movienight.backend.service.WebhookService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST Controller for managing Webhook subscriptions, executing test pings, and inspecting delivery logs.
 */
@RestController
@RequestMapping("/api/webhooks")
@RequiredArgsConstructor
public class WebhookController {

    private final WebhookService webhookService;

    /**
     * Register a new webhook subscription.
     */
    @PostMapping
    public ResponseEntity<WebhookSubscriptionResponse> createSubscription(
            @Valid @RequestBody CreateWebhookSubscriptionRequest request,
            Authentication authentication
    ) {
        WebhookSubscriptionResponse response = webhookService.createSubscription(authentication.getName(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * List all webhook subscriptions owned by the authenticated user.
     */
    @GetMapping
    public ResponseEntity<List<WebhookSubscriptionResponse>> getUserSubscriptions(Authentication authentication) {
        return ResponseEntity.ok(webhookService.getUserSubscriptions(authentication.getName()));
    }

    /**
     * Get a specific webhook subscription by ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<WebhookSubscriptionResponse> getSubscription(
            @PathVariable Long id,
            Authentication authentication
    ) {
        return ResponseEntity.ok(webhookService.getSubscriptionById(authentication.getName(), id));
    }

    /**
     * Update target URL, secret, event subscriptions, or active status.
     */
    @PutMapping("/{id}")
    public ResponseEntity<WebhookSubscriptionResponse> updateSubscription(
            @PathVariable Long id,
            @RequestBody UpdateWebhookSubscriptionRequest request,
            Authentication authentication
    ) {
        return ResponseEntity.ok(webhookService.updateSubscription(authentication.getName(), id, request));
    }

    /**
     * Delete a webhook subscription.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> deleteSubscription(
            @PathVariable Long id,
            Authentication authentication
    ) {
        webhookService.deleteSubscription(authentication.getName(), id);
        return ResponseEntity.ok(Map.of("message", "Webhook subscription deleted successfully"));
    }

    /**
     * Trigger an immediate test ping event to verify target endpoint connectivity.
     */
    @PostMapping("/{id}/test")
    public ResponseEntity<TestWebhookResponse> testWebhook(
            @PathVariable Long id,
            Authentication authentication
    ) {
        return ResponseEntity.ok(webhookService.sendTestPing(authentication.getName(), id));
    }

    /**
     * Get recent delivery audit logs for a webhook subscription.
     */
    @GetMapping("/{id}/logs")
    public ResponseEntity<List<WebhookDeliveryLogResponse>> getDeliveryLogs(
            @PathVariable Long id,
            Authentication authentication
    ) {
        return ResponseEntity.ok(webhookService.getDeliveryLogs(authentication.getName(), id));
    }
}
