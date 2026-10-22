package com.movienight.backend.model;

import java.util.Locale;

/** Provider identity; ANIME is a classification of the TV resource. */
public enum ResourceType {
    MOVIE, TV;

    public static ResourceType fromCategory(String category) {
        if (category == null) throw new IllegalArgumentException("Explicit movie/TV resource type is required");
        return switch (category.trim().toUpperCase(Locale.ROOT)) {
            case "MOVIE" -> MOVIE;
            case "TV", "ANIME" -> TV;
            default -> throw new IllegalArgumentException("Invalid resource type: expected MOVIE or TV (ANIME is a TV classification)");
        };
    }

    public String classify(boolean animation, String language, java.util.List<String> countries) {
        if (this == MOVIE) return "MOVIE";
        return animation && ("ja".equalsIgnoreCase(language) || countries != null && countries.contains("JP"))
                ? "ANIME" : "TV";
    }
}
