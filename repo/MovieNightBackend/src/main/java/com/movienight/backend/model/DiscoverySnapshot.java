package com.movienight.backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Publication marker for a complete discovery shelf, including successful empty shelves. */
@Entity
@Table(name = "discovery_snapshots", uniqueConstraints =
    @UniqueConstraint(name = "uk_discovery_snapshot", columnNames = {"media_type", "list_type"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class DiscoverySnapshot {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String mediaType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private MovieListType listType;

    @Column(nullable = false)
    private LocalDateTime updatedAt;
}
