package com.movienight.backend.dto.external;

import java.util.List;

/** One AniList anime entry, limited to the fields used to curate Explore shelves. */
public record AniListMedia(
        long id,
        Long idMal,
        String format,
        boolean isAdult,
        List<String> genres,
        List<Tag> tags,
        Integer meanScore,
        Integer popularity,
        Integer episodes,
        Integer seasonYear,
        List<String> titles
) {
    public record Tag(String name, int rank) {}
}
