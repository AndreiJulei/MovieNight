package com.movienight.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Represents an outgoing webhook registration for external integrations.
 */
@Entity
@Table(name = "webhook_subscriptions", indexes = {
    @Index(name = "idx_webhook_user", columnList = "user_id"),
    @Index(name = "idx_webhook_active", columnList = "is_active")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WebhookSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 1000)
    private String targetUrl;

    /**
     * Shared secret key used to compute cryptographic HMAC-SHA256 signatures for payload verification.
     */
    @Column(nullable = false, length = 128)
    private String secret;

    @Column(length = 255)
    private String description;

    /**
     * Comma-separated list of event patterns to listen to (e.g. "movie.*,list.*" or "*").
     */
    @Builder.Default
    @Column(nullable = false, length = 500)
    private String events = "*";

    @Builder.Default
    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;

    @Builder.Default
    @Column(name = "consecutive_failures", nullable = false)
    private int consecutiveFailures = 0;

    private LocalDateTime lastDeliveryAt;

    private Integer lastDeliveryStatus;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
