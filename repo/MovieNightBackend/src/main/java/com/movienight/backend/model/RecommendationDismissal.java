package com.movienight.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A title the user removed from their personal recommendations ("Not interested").
 * Permanent: the title is excluded from every later recomputation until the user undoes it.
 */
@Entity
@Table(name = "recommendation_dismissals", uniqueConstraints =
    @UniqueConstraint(name = "uk_rec_dismissal_user_title", columnNames = {"user_id", "media_type", "tmdb_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecommendationDismissal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "tmdb_id", nullable = false)
    private Long tmdbId;

    @Builder.Default
    @Column(name = "media_type", nullable = false, length = 20)
    private String mediaType = "MOVIE";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
