package com.movienight.backend.model;

import jakarta.persistence.*;
import lombok.*;

/**
 * Entity storing item-item cosine similarity neighbors computed from MovieLens backbone.
 */
@Entity
@Table(name = "movie_similarity", indexes = {
    @Index(name = "idx_sim_tmdb_id", columnList = "tmdbId"),
    @Index(name = "idx_sim_tmdb_neighbor", columnList = "tmdbId, neighborTmdbId", unique = true)
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MovieSimilarity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long tmdbId;

    @Column(nullable = false)
    private Long neighborTmdbId;

    @Column(nullable = false)
    private Double score;
}
