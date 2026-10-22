package com.movienight.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Shared disposable table caching TMDB /discover/movie feeds for instant zero-latency serving.
 */
@Entity
@Table(name = "cached_movie_list", indexes = {
    @Index(name = "idx_cache_type_rank", columnList = "listType, rankOrder"),
    @Index(name = "idx_cache_media_type_rank", columnList = "mediaType, listType, rankOrder"),
    @Index(name = "idx_cache_tmdb_id", columnList = "tmdbId")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CachedMovieList {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Builder.Default
    @Column(nullable = false, length = 20)
    private String mediaType = "MOVIE";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ResourceType resourceType;

    @PrePersist @PreUpdate
    void setProviderIdentity() { resourceType = ResourceType.fromCategory(mediaType); }

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private MovieListType listType;

    @Column(nullable = false)
    private Long tmdbId;

    @Column(nullable = false)
    private String title;

    private String posterPath;

    private Double voteAverage;

    private String releaseDate;

    @Column(nullable = false)
    private Integer rankOrder;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime cachedAt;
}
