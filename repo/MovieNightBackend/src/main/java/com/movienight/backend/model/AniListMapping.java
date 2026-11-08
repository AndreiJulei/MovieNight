package com.movienight.backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Disposable discovery-cache row: the outcome of resolving one TMDB TV title to at most one AniList
 * entry, including "no confident match" (matched=false). Keyed by typed TMDB identity only.
 */
@Entity
@Table(name = "anilist_mappings", uniqueConstraints =
    @UniqueConstraint(name = "uk_anilist_mapping_identity", columnNames = {"resource_type", "tmdb_id"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AniListMapping {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ResourceType resourceType;

    @Column(nullable = false)
    private Long tmdbId;

    @Column(nullable = false)
    private boolean matched;

    private Long anilistId;
    private Long malId;
    @Column(length = 20) private String format;
    private boolean adult;
    @Column(length = 1000) private String genres;
    /** Tags as "name|rank" joined by ';'. */
    @Column(length = 4000) private String tags;
    private Integer meanScore;
    private Integer popularity;
    private Integer episodes;
    private Integer seasonYear;

    @Column(nullable = false)
    private LocalDateTime fetchedAt;

    /** Rank of the named tag, or 0 when the match does not carry it. */
    public int tagRank(String name) {
        if (tags == null || tags.isBlank()) return 0;
        for (String entry : tags.split(";")) {
            int bar = entry.lastIndexOf('|');
            if (bar > 0 && entry.substring(0, bar).equalsIgnoreCase(name)) {
                try { return Integer.parseInt(entry.substring(bar + 1)); } catch (NumberFormatException ignored) { return 0; }
            }
        }
        return 0;
    }
}
