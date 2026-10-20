package com.movienight.backend.dto;

import com.movienight.backend.model.MovieStatus;
import java.time.LocalDateTime;

/** Allowlisted friend-visible fields; private notes cannot be serialized. */
public record FriendLibraryEntryResponse(Long id, MovieResponse movie, MovieStatus status,
                                         Double personalRating, LocalDateTime watchedAt) {
    public static FriendLibraryEntryResponse from(UserMovieEntryResponse entry) {
        return new FriendLibraryEntryResponse(entry.getId(), entry.getMovie(), entry.getStatus(),
                entry.getPersonalRating(), entry.getWatchedAt());
    }
}
