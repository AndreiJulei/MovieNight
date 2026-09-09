package com.movienight.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Precomputed personalized recommendation rows for users.
 */
@Entity
@Table(name = "personalized_recommendations", indexes = {
    @Index(name = "idx_rec_user_rank", columnList = "user_id, rankOrder"),
    @Index(name = "idx_rec_user_tmdb", columnList = "user_id, tmdbId", unique = true)
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PersonalizedRecommendation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private Long tmdbId;

    @Column(nullable = false)
    private String title;

    private String posterPath;

    private Double voteAverage;

    @Column(nullable = false)
    private Double score;

    @Column(nullable = false)
    private Integer rankOrder;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
