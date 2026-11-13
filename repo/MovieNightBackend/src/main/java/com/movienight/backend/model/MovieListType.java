package com.movienight.backend.model;

public enum MovieListType {
    TOP_RATED,
    POPULAR,
    RECENT,
    UPCOMING,
    CURRENTLY_AIRING,
    /** TMDB trending/week chart: the Explore spotlight hero (PD-10). Refreshed daily. */
    TRENDING_WEEK,
    /** TMDB trending/day chart: the Explore "Top 10 today" row (PD-10). Refreshed every few hours. */
    TRENDING_DAY;

    /** Explore highlight charts, served apart from the four browsable shelves. */
    public boolean isHighlightChart() {
        return this == TRENDING_WEEK || this == TRENDING_DAY;
    }
}
