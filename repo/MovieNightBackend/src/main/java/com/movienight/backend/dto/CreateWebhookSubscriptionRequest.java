package com.movienight.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateWebhookSubscriptionRequest {

    @NotBlank(message = "Target URL is required")
    private String targetUrl;

    /**
     * Optional HMAC secret. If not provided, a secure random key will be generated automatically.
     */
    private String secret;

    private String description;

    /**
     * Comma-separated event list or wildcard "*". Defaults to "*".
     */
    private String events;
}
