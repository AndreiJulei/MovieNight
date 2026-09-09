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

    /**
     * Get all TMDB IDs of movies on a user's library (indexed, fast Set check).
     */
    @org.springframework.data.jpa.repository.Query("SELECT e.movie.tmdbId FROM UserMovieEntry e WHERE e.user.id = :userId AND e.movie.tmdbId IS NOT NULL")
    java.util.Set<Long> findTmdbIdsByUserId(@org.springframework.data.repository.query.Param("userId") Long userId);

    /**
     * Fetch user entries where the user has provided a personal rating.
     */
    List<UserMovieEntry> findByUserIdAndPersonalRatingIsNotNull(Long userId);

    /**
     * Friends' Suggestions (Consensus Query):
     * Movies watched & rated by friends that the user has NOT added,
     * ranked by (avg friend rating * number of friends who rated it).
     */
    @org.springframework.data.jpa.repository.Query(
        "SELECT e.movie.tmdbId AS tmdbId, " +
        "       e.movie.title AS title, " +
        "       e.movie.posterUrl AS posterUrl, " +
        "       e.movie.releaseYear AS releaseYear, " +
        "       e.movie.imdbRating AS imdbRating, " +
        "       e.movie.rottenTomatoesRating AS rottenTomatoesRating, " +
        "       AVG(e.personalRating) AS avgRating, " +
        "       COUNT(DISTINCT e.user.id) AS friendsCount, " +
        "       (AVG(e.personalRating) * COUNT(DISTINCT e.user.id)) AS consensusScore " +
        "FROM UserMovieEntry e " +
        "WHERE e.user.id IN :friendUserIds " +
        "  AND e.status = 'WATCHED' " +
        "  AND e.personalRating IS NOT NULL " +
        "  AND e.movie.id NOT IN (" +
        "      SELECT myEntry.movie.id FROM UserMovieEntry myEntry WHERE myEntry.user.id = :userId" +
        "  ) " +
        "GROUP BY e.movie.tmdbId, e.movie.title, e.movie.posterUrl, e.movie.releaseYear, e.movie.imdbRating, e.movie.rottenTomatoesRating " +
        "ORDER BY (AVG(e.personalRating) * COUNT(DISTINCT e.user.id)) DESC"
    )
    List<com.movienight.backend.dto.FriendsConsensusProjection> findFriendsConsensusWatched(
        @org.springframework.data.repository.query.Param("friendUserIds") List<Long> friendUserIds,
        @org.springframework.data.repository.query.Param("userId") Long userId
    );

    /**
     * Friends' Watchlists Query:
     * Movies on friends' watchlists that the user has NOT added.
     */
    @org.springframework.data.jpa.repository.Query(
        "SELECT e.movie.tmdbId AS tmdbId, " +
        "       e.movie.title AS title, " +
        "       e.movie.posterUrl AS posterUrl, " +
        "       e.movie.releaseYear AS releaseYear, " +
        "       e.movie.imdbRating AS imdbRating, " +
        "       e.movie.rottenTomatoesRating AS rottenTomatoesRating, " +
        "       COUNT(DISTINCT e.user.id) AS friendsCount " +
        "FROM UserMovieEntry e " +
        "WHERE e.user.id IN :friendUserIds " +
        "  AND e.status = 'WATCHLIST' " +
        "  AND e.movie.id NOT IN (" +
        "      SELECT myEntry.movie.id FROM UserMovieEntry myEntry WHERE myEntry.user.id = :userId" +
        "  ) " +
        "GROUP BY e.movie.tmdbId, e.movie.title, e.movie.posterUrl, e.movie.releaseYear, e.movie.imdbRating, e.movie.rottenTomatoesRating " +
        "ORDER BY COUNT(DISTINCT e.user.id) DESC"
    )
    List<com.movienight.backend.dto.FriendsWatchlistProjection> findFriendsWatchlistMovies(
        @org.springframework.data.repository.query.Param("friendUserIds") List<Long> friendUserIds,
        @org.springframework.data.repository.query.Param("userId") Long userId
    );
}
