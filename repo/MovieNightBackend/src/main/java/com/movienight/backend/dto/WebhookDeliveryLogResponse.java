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
public class WebhookDeliveryLogResponse {
    private Long id;
    private Long subscriptionId;
    private String eventId;
    private String eventType;
    private String payload;
    private Integer responseStatus;
    private String responseBody;
    private Long durationMs;
    private boolean success;
    private int attemptCount;
    private LocalDateTime createdAt;
}
