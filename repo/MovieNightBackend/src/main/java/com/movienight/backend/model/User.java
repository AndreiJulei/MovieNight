package com.movienight.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "users", indexes = {
    @Index(name = "idx_user_email", columnList = "email", unique = true),
    @Index(name = "idx_user_username", columnList = "username", unique = true),
    @Index(name = "idx_user_display_name", columnList = "displayName")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String email;

    @Column(nullable = false, unique = true, length = 50)
    private String username;

    @Column(nullable = false, length = 50)
    private String displayName;

    @Column(nullable = false)
    private String password;

    @Column(length = 10)
    private String resetCode;

    private LocalDateTime resetCodeExpiresAt;

    @Builder.Default
    @Column(nullable = false, length = 30)
    private String role = "ROLE_USER";

    @Builder.Default
    @Column(nullable = false)
    private boolean needsRecommendationRefresh = true;

    // Persist diagnostics alongside the disposable recommendation cache. Null invalidates legacy caches.
    private String personalRecommendationState;

    @Column(length = 1000)
    private String personalRecommendationLimitations;

    /** Chosen avatar from the avatar manifest (#32); null means the default initial avatar. */
    @Column(name = "avatar_key", length = 50)
    private String avatarKey;

    /** Whether accepted friends may see this user's watchlist (#33). */
    @Builder.Default
    @Column(name = "shares_watchlist", nullable = false)
    private boolean sharesWatchlist = true;

    /** Whether accepted friends may see this user's watched history and ratings (#33). */
    @Builder.Default
    @Column(name = "shares_watched", nullable = false)
    private boolean sharesWatched = true;

    /** Whether accepted friends may see library entries with this status (#33). */
    public boolean sharesStatus(MovieStatus status) {
        return (status == MovieStatus.WATCHED && sharesWatched) || (status == MovieStatus.WATCHLIST && sharesWatchlist);
    }

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    public void ensureDefaults() {
        if (email == null || email.isBlank()) {
            if (username != null && username.contains("@")) {
                email = username.toLowerCase();
            } else if (username != null) {
                email = username.toLowerCase() + "@example.com";
            } else {
                email = "user" + System.currentTimeMillis() + "@example.com";
            }
        }
        if (displayName == null || displayName.isBlank()) {
            displayName = username != null ? username : "MovieFan";
        }
    }
}
