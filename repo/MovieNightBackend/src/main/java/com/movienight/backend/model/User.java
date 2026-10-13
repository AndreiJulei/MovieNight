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
