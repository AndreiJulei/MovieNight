package com.movienight.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Represents an individual movie inside a CustomList, with its display position.
 */
@Entity
@Table(name = "custom_list_entries", uniqueConstraints = {
    @UniqueConstraint(name = "uk_custom_list_movie", columnNames = {"custom_list_id", "movie_id"})
}, indexes = {
    @Index(name = "idx_entry_list_position", columnList = "custom_list_id, position")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CustomListEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "custom_list_id", nullable = false)
    private CustomList customList;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "movie_id", nullable = false)
    private Movie movie;

    @Column(nullable = false)
    private Integer position;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime addedAt;
}
