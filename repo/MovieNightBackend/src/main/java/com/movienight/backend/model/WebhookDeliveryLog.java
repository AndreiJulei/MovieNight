package com.movienight.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Audit log of every webhook dispatch attempt, including headers, response code, and latency.
 */
@Entity
@Table(name = "webhook_delivery_logs", indexes = {
    @Index(name = "idx_delivery_sub", columnList = "subscription_id"),
    @Index(name = "idx_delivery_created", columnList = "created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WebhookDeliveryLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "subscription_id", nullable = false)
    private WebhookSubscription subscription;

    @Column(nullable = false, length = 64)
    private String eventId;

    @Column(nullable = false, length = 64)
    private String eventType;

    @Column(columnDefinition = "TEXT")
    private String payload;

    private Integer responseStatus;

    @Column(columnDefinition = "TEXT")
    private String responseBody;

    private Long durationMs;

    @Column(nullable = false)
    private boolean success;

    @Builder.Default
    @Column(nullable = false)
    private int attemptCount = 1;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
