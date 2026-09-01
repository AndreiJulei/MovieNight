package com.movienight.backend.repository;

import com.movienight.backend.model.Movie;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MovieRepository extends JpaRepository<Movie, Long> {

    /**
     * Golden Rule Query:
     * Check if a movie from TMDB already exists in our database before making an external API call.
     */
    Optional<Movie> findByTmdbId(Long tmdbId);

    /**
     * Look up a movie by its IMDb identifier (e.g. "tt0133093").
     */
    Optional<Movie> findByImdbId(String imdbId);

    /**
     * Fast local search: find all movies in our catalog whose title contains the search query.
     */
    List<Movie> findByTitleContainingIgnoreCase(String query);

    /**
     * Check if a TMDB movie is already stored.
     */
    boolean existsByTmdbId(Long tmdbId);
}
