package com.movienight.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Represents a real-world movie in our shared catalog.
 * 
 * CORE DESIGN PRINCIPLE:
 * Only ONE row exists per real movie across the ENTIRE system.
 * If 100 users add "Inception", there is still only 1 row in this table,
 * and all 100 users reference this single Movie by its ID.
 */
@Entity
@Table(name = "movies", indexes = {
    // Fast lookup by TMDB ID so we never re-fetch a movie from TMDB if we already have it
    @Index(name = "idx_movie_tmdb_id", columnList = "tmdbId", unique = true),
    // Fast search by title
    @Index(name = "idx_movie_title", columnList = "title")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Movie {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Unique identifier from The Movie Database (TMDB).
     * Used to de-duplicate and prevent redundant external API calls.
     */
    @Column(unique = true)
    private Long tmdbId;

    /**
     * Unique identifier from IMDb (e.g. "tt0133093").
     */
    @Column(length = 30)
    private String imdbId;

    /**
     * Official movie title (e.g. "The Matrix").
     */
    @Column(nullable = false, length = 300)
    private String title;

    /**
     * Release year (e.g. 1999).
     */
    private Integer releaseYear;

    /**
     * Plot summary / description.
     * Stored as TEXT column because descriptions easily exceed standard 255-character limits.
     */
    @Column(columnDefinition = "TEXT")
    private String overview;

    /**
     * URL or path to the vertical poster image.
     */
    @Column(length = 1000)
    private String posterUrl;

    /**
     * URL or path to the horizontal backdrop/banner image.
     */
    @Column(length = 1000)
    private String backdropUrl;

    /**
     * Comma-separated list of genres (e.g. "Action, Sci-Fi, Thriller").
     */
    @Column(length = 200)
    private String genres;

    /**
     * Runtime in minutes (e.g. 136).
     */
    private Integer runtimeMinutes;

    /**
     * YouTube video key for the official trailer (e.g. "vKQi3bBA1y8").
     */
    @Column(length = 100)
    private String trailerKey;

    /**
     * Main director(s) (e.g. "Lana Wachowski, Lilly Wachowski").
     */
    @Column(length = 300)
    private String director;

    /**
     * Main cast actors (e.g. "Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss").
     */
    @Column(length = 500)
    private String castMembers;

    // --- External Ratings (cached once per movie) ---

    /**
     * IMDb rating out of 10 (e.g. 8.7).
     */
    private Double imdbRating;

    /**
     * Rotten Tomatoes percentage score (e.g. 83).
     */
    private Integer rottenTomatoesRating;

    /**
     * TMDB community vote average out of 10 (e.g. 8.2).
     */
    private Double tmdbVoteAverage;

    /**
     * Total number of votes on TMDB.
     */
    private Integer tmdbVoteCount;

    // --- Audit Timestamps ---

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
