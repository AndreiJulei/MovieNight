package com.movienight.backend.service;

import com.movienight.backend.dto.*;
import com.movienight.backend.model.Movie;
import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.model.User;
import com.movienight.backend.model.UserMovieEntry;
import com.movienight.backend.repository.MovieRepository;
import com.movienight.backend.repository.UserMovieEntryRepository;
import com.movienight.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Service managing the user's movie library and orchestrating the
 * interaction between the shared Movie catalog and individual UserMovieEntry records.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class UserMovieService {

    private final MovieRepository movieRepository;
    private final UserMovieEntryRepository userMovieEntryRepository;
    private final UserRepository userRepository;

    /**
     * Retrieve a user's movie library, optionally filtered by status (e.g. WATCHLIST, WATCHED).
     */
    @Transactional(readOnly = true)
    public List<UserMovieEntryResponse> getUserLibrary(String username, MovieStatus status) {
        User user = findUserByUsername(username);

        List<UserMovieEntry> entries;
        if (status != null) {
            entries = userMovieEntryRepository.findByUserIdAndStatusOrderByCreatedAtDesc(user.getId(), status);
        } else {
            entries = userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(user.getId());
        }

        return entries.stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    /**
     * Add a movie to the user's library.
     * 
     * GOLDEN RULE WORKFLOW:
     * 1. Look up the movie in our shared 'movies' table by TMDB ID or IMDb ID.
     * 2. If it does not exist yet, save it once as a shared Movie entity.
     * 3. Create or update the user's personal UserMovieEntry record linked to that Movie.
     */
    @Transactional
    public UserMovieEntryResponse addMovieToLibrary(String username, AddMovieRequest request) {
        User user = findUserByUsername(username);

        // Step 1: Check shared catalog before creating a new Movie row
        Movie movie = null;
        if (request.getTmdbId() != null) {
            movie = movieRepository.findByTmdbId(request.getTmdbId()).orElse(null);
        }
        if (movie == null && request.getImdbId() != null && !request.getImdbId().isBlank()) {
            movie = movieRepository.findByImdbId(request.getImdbId()).orElse(null);
        }

        // If not found in catalog, persist the movie details
        if (movie == null) {
            log.info("Persisting new movie into shared catalog: {} ({})", request.getTitle(), request.getReleaseYear());
            movie = Movie.builder()
                    .tmdbId(request.getTmdbId())
                    .imdbId(request.getImdbId())
                    .title(request.getTitle())
                    .releaseYear(request.getReleaseYear())
                    .overview(request.getOverview())
                    .posterUrl(request.getPosterUrl())
                    .backdropUrl(request.getBackdropUrl())
                    .genres(request.getGenres())
                    .runtimeMinutes(request.getRuntimeMinutes())
                    .trailerKey(request.getTrailerKey())
                    .director(request.getDirector())
                    .castMembers(request.getCastMembers())
                    .imdbRating(request.getImdbRating())
                    .rottenTomatoesRating(request.getRottenTomatoesRating())
                    .tmdbVoteAverage(request.getTmdbVoteAverage())
                    .tmdbVoteCount(request.getTmdbVoteCount())
                    .build();
            movie = movieRepository.save(movie);
        }

        // Step 2: Create or update the personal journal entry
        Optional<UserMovieEntry> existingEntry = userMovieEntryRepository.findByUserIdAndMovieId(user.getId(), movie.getId());
        UserMovieEntry entry;
        if (existingEntry.isPresent()) {
            entry = existingEntry.get();
            entry.setStatus(request.getStatus());
            if (request.getPersonalRating() != null) {
                entry.setPersonalRating(request.getPersonalRating());
            }
            if (request.getNotes() != null) {
                entry.setNotes(request.getNotes());
            }
            if (request.getWatchedAt() != null) {
                entry.setWatchedAt(request.getWatchedAt());
            }
        } else {
            entry = UserMovieEntry.builder()
                    .user(user)
                    .movie(movie)
                    .status(request.getStatus())
                    .personalRating(request.getPersonalRating())
                    .notes(request.getNotes())
                    .watchedAt(request.getWatchedAt())
                    .build();
        }

        entry = userMovieEntryRepository.save(entry);
        return mapToResponse(entry);
    }

    /**
     * Update a user's personal review, status, or score for a movie in their library.
     */
    @Transactional
    public UserMovieEntryResponse updateMovieEntry(String username, Long movieId, UpdateMovieEntryRequest request) {
        User user = findUserByUsername(username);

        UserMovieEntry entry = userMovieEntryRepository.findByUserIdAndMovieId(user.getId(), movieId)
                .orElseThrow(() -> new IllegalArgumentException("Movie entry not found in your library for movie ID: " + movieId));

        if (request.getStatus() != null) {
            entry.setStatus(request.getStatus());
        }
        if (request.getPersonalRating() != null) {
            entry.setPersonalRating(request.getPersonalRating());
        }
        if (request.getNotes() != null) {
            entry.setNotes(request.getNotes());
        }
        if (request.getWatchedAt() != null) {
            entry.setWatchedAt(request.getWatchedAt());
        }

        entry = userMovieEntryRepository.save(entry);
        return mapToResponse(entry);
    }

    /**
     * Remove a movie from the user's library.
     * Note: This only deletes the UserMovieEntry journal row.
     * The shared Movie entity stays in the shared catalog for other users!
     */
    @Transactional
    public void removeMovieFromLibrary(String username, Long movieId) {
        User user = findUserByUsername(username);
        userMovieEntryRepository.deleteByUserIdAndMovieId(user.getId(), movieId);
        log.info("Removed movie ID {} from library of user {}", movieId, username);
    }

    /**
     * Retrieve friend ratings and notes for a specific movie.
     */
    @Transactional(readOnly = true)
    public List<FriendRatingResponse> getFriendsRatings(Long movieId, List<Long> friendUserIds) {
        if (friendUserIds == null || friendUserIds.isEmpty()) {
            return Collections.emptyList();
        }

        List<UserMovieEntry> friendEntries = userMovieEntryRepository.findByMovieIdAndUserIdIn(movieId, friendUserIds);
        return friendEntries.stream()
                .map(entry -> FriendRatingResponse.builder()
                        .userId(entry.getUser().getId())
                        .username(entry.getUser().getUsername())
                        .displayName(entry.getUser().getDisplayName())
                        .status(entry.getStatus())
                        .personalRating(entry.getPersonalRating())
                        .notes(entry.getNotes())
                        .watchedAt(entry.getWatchedAt())
                        .build())
                .collect(Collectors.toList());
    }

    // --- Helper Methods ---

    private User findUserByUsername(String username) {
        String cleanUsername = username.trim().toLowerCase();
        return userRepository.findByUsername(cleanUsername)
                .orElseThrow(() -> new IllegalArgumentException("User not found with username: " + cleanUsername));
    }

    public UserMovieEntryResponse mapToResponse(UserMovieEntry entry) {
        Movie movie = entry.getMovie();
        MovieResponse movieResponse = MovieResponse.builder()
                .id(movie.getId())
                .tmdbId(movie.getTmdbId())
                .imdbId(movie.getImdbId())
                .title(movie.getTitle())
                .releaseYear(movie.getReleaseYear())
                .overview(movie.getOverview())
                .posterUrl(movie.getPosterUrl())
                .backdropUrl(movie.getBackdropUrl())
                .genres(movie.getGenres())
                .runtimeMinutes(movie.getRuntimeMinutes())
                .trailerKey(movie.getTrailerKey())
                .director(movie.getDirector())
                .castMembers(movie.getCastMembers())
                .imdbRating(movie.getImdbRating())
                .rottenTomatoesRating(movie.getRottenTomatoesRating())
                .tmdbVoteAverage(movie.getTmdbVoteAverage())
                .tmdbVoteCount(movie.getTmdbVoteCount())
                .build();

        return UserMovieEntryResponse.builder()
                .id(entry.getId())
                .movie(movieResponse)
                .status(entry.getStatus())
                .personalRating(entry.getPersonalRating())
                .notes(entry.getNotes())
                .watchedAt(entry.getWatchedAt())
                .createdAt(entry.getCreatedAt())
                .updatedAt(entry.getUpdatedAt())
                .build();
    }
}
