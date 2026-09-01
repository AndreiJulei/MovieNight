package com.movienight.backend.repository;

import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.model.UserMovieEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserMovieEntryRepository extends JpaRepository<UserMovieEntry, Long> {

    /**
     * Fetch all movie entries for a specific user.
     */
    List<UserMovieEntry> findByUserIdOrderByCreatedAtDesc(Long userId);

    /**
     * Fetch movie entries filtered by tab status (e.g. all WATCHLIST or all WATCHED movies).
     */
    List<UserMovieEntry> findByUserIdAndStatusOrderByCreatedAtDesc(Long userId, MovieStatus status);

    /**
     * Find a user's specific entry for a movie.
     */
    Optional<UserMovieEntry> findByUserIdAndMovieId(Long userId, Long movieId);

    /**
     * Check if a movie is already in a user's library.
     */
    boolean existsByUserIdAndMovieId(Long userId, Long movieId);

    /**
     * Delete an entry when a user removes a movie from their library.
     */
    void deleteByUserIdAndMovieId(Long userId, Long movieId);

    /**
     * Social Feature Query:
     * Fetch ratings & notes for a specific movie from a list of friend IDs.
     */
    List<UserMovieEntry> findByMovieIdAndUserIdIn(Long movieId, List<Long> friendUserIds);
}
