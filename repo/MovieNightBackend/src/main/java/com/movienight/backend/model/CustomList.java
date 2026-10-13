package com.movienight.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Represents a user-curated custom movie list (e.g. "Favorites", "Best of 2024", "Horror Night").
 */
@Entity
@Table(name = "custom_lists", indexes = {
    @Index(name = "idx_custom_list_user", columnList = "user_id"),
    @Index(name = "idx_custom_list_public", columnList = "is_public")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CustomList {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 150)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Builder.Default
    @Column(name = "is_public", nullable = false)
    private boolean isPublic = false;

    @Builder.Default
    @OneToMany(mappedBy = "customList", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<CustomListEntry> entries = new ArrayList<>();

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
