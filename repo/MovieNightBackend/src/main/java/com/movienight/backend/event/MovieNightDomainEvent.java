package com.movienight.backend.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Core application domain event fired whenever mutations happen in the domain model.
 * Processed asynchronously by the WebhookDispatcherService to notify subscribed webhooks.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MovieNightDomainEvent {

    @Builder.Default
    private String eventId = UUID.randomUUID().toString();

    private String eventType;

    private Long userId;

    private String username;

    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();

    private Object data;

    public static MovieNightDomainEvent of(String eventType, Long userId, String username, Object data) {
        return MovieNightDomainEvent.builder()
                .eventId(UUID.randomUUID().toString())
                .eventType(eventType)
                .userId(userId)
                .username(username)
                .timestamp(LocalDateTime.now())
                .data(data)
                .build();
    }
}
