package com.movienight.backend.dto;

import com.movienight.backend.service.Progression;

/** A rank badge: its stable key, display label, emblem name and watched-count threshold. */
public record RankResponse(String key, String label, String emblem, long threshold) {
    public static RankResponse of(Progression.Rank rank) {
        return rank == null ? null : new RankResponse(rank.name(), rank.label(), rank.emblem(), rank.threshold());
    }
}
