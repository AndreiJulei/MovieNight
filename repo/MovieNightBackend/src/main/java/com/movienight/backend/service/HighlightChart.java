package com.movienight.backend.service;

import com.movienight.backend.model.MovieListType;

import java.time.Duration;
import java.util.Arrays;

/**
 * Explore highlight charts (PD-10): the spotlight hero's TMDB trending/week titles and the "Top 10 today"
 * trending/day row. Each chart owns its TMDB time window, how many titles it shows, when it is due again
 * (rebuilt on read if its scheduled refresh was missed, e.g. while the server slept) and when it is too old
 * to show at all.
 */
enum HighlightChart {
    SPOTLIGHT("spotlight", "Trending this week", MovieListType.TRENDING_WEEK, "week", 5,
            Duration.ofHours(24), Duration.ofDays(7)),
    TOP_TEN("top-10", "Top 10 today", MovieListType.TRENDING_DAY, "day", 10,
            Duration.ofHours(6), Duration.ofDays(2));

    final String id;
    final String title;
    final MovieListType listType;
    /** TMDB trending time window: "week" or "day". */
    final String timeWindow;
    final int titles;
    final Duration dueAfter;
    final Duration maxAge;

    HighlightChart(String id, String title, MovieListType listType, String timeWindow, int titles,
                   Duration dueAfter, Duration maxAge) {
        this.id = id;
        this.title = title;
        this.listType = listType;
        this.timeWindow = timeWindow;
        this.titles = titles;
        this.dueAfter = dueAfter;
        this.maxAge = maxAge;
    }

    static HighlightChart of(MovieListType listType) {
        return Arrays.stream(values()).filter(chart -> chart.listType == listType).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Not a highlight chart: " + listType));
    }
}
