package com.movienight.backend.dto;

/** Show or hide the watchlist and watched history from accepted friends; null leaves a flag unchanged. */
public record UpdateSharingRequest(Boolean sharesWatchlist, Boolean sharesWatched) {}
