package com.movienight.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Represents a user's personal connection to a movie (their "Personal Journal").
 * 
 * CORE DESIGN PRINCIPLE:
 * This table stores private user data:
 * - Which movie they saved
 * - Their status (WATCHLIST, WATCHED, DROPPED)
 * - Their personal score (1 to 10)
 * - Their personal review/notes (never visible to strangers)
 */
@Entity
@Table(name = "user_movie_entries", 
    uniqueConstraints = {
        // Enforces that a user can only have ONE entry per movie (cannot duplicate)
        @UniqueConstraint(name = "uk_user_movie", columnNames = {"user_id", "movie_id"})
    },
    indexes = {
        // Fast index for loading a user's entire watchlist
        @Index(name = "idx_user_status", columnList = "user_id, status"),
        // Fast index for finding friends' ratings on a specific movie
        @Index(name = "idx_movie_ratings", columnList = "movie_id, personal_rating")
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserMovieEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * The user who owns this entry.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /**
     * The shared movie from the global catalog.
     */
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "movie_id", nullable = false)
    private Movie movie;

    /**
     * Current status in the user's library (WATCHLIST, WATCHED, DROPPED).
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MovieStatus status;

    /**
     * Personal rating from 1 to 10.
     * Nullable because unwatched movies on the watchlist don't have a rating yet.
     */
    @Column
    private Integer personalRating;

    /**
     * User's private review or personal note.
     * Stored as TEXT so users can write detailed thoughts.
     */
    @Column(columnDefinition = "TEXT")
    private String notes;

    /**
     * Date/time when the user watched the movie.
     */
    private LocalDateTime watchedAt;

    // --- Audit Timestamps ---

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
