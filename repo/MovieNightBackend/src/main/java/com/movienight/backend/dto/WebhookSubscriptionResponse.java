package com.movienight.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WebhookSubscriptionResponse {
    private Long id;
    private Long userId;
    private String targetUrl;
    private String secret;
    private String description;
    private String events;
    private boolean isActive;
    private int consecutiveFailures;
    private LocalDateTime lastDeliveryAt;
    private Integer lastDeliveryStatus;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
