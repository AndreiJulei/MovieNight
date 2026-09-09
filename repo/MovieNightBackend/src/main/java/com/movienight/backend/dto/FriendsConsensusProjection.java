package com.movienight.backend.dto;

public interface FriendsConsensusProjection {
    Long getTmdbId();
    String getTitle();
    String getPosterUrl();
    Integer getReleaseYear();
    Double getImdbRating();
    Double getRottenTomatoesRating();
    Double getAvgRating();
    Long getFriendsCount();
    Double getConsensusScore();
}
