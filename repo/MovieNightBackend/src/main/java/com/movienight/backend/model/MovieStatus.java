package com.movienight.backend.model;

/**
 * Represents the status of a movie in a user's personal library.
 */
public enum MovieStatus {
    WATCHLIST, // "Want to watch"
    WATCHED,   // "Already seen & reviewed"
    DROPPED    // "Started but decided not to finish"
}
