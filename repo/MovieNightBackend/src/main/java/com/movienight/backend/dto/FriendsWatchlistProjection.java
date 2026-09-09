package com.movienight.backend.dto;

public interface FriendsWatchlistProjection {
    Long getTmdbId();
    String getTitle();
    String getPosterUrl();
    Integer getReleaseYear();
    Double getImdbRating();
    Double getRottenTomatoesRating();
    Long getFriendsCount();
}
