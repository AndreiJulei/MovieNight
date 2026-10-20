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

    private final com.movienight.backend.repository.FriendshipRepository friendshipRepository;
    private final MovieRepository movieRepository;
    private final UserMovieEntryRepository userMovieEntryRepository;
    private final UserRepository userRepository;
    private final org.springframework.context.ApplicationEventPublisher eventPublisher;

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
        // A provider identity takes precedence over matching display metadata.
        if (movie == null && request.getTmdbId() == null
                && (request.getImdbId() == null || request.getImdbId().isBlank())
                && request.getTitle() != null && !request.getTitle().isBlank()) {
            List<Movie> byTitle = movieRepository.findByTitleContainingIgnoreCase(request.getTitle().trim());
            for (Movie m : byTitle) {
                if (m.getTitle().equalsIgnoreCase(request.getTitle().trim())
                        && (request.getReleaseYear() == null || request.getReleaseYear().equals(m.getReleaseYear()))) {
                    movie = m;
                    break;
                }
            }
        }

        // If not found in catalog, persist the movie details
        if (movie == null) {
            log.info("Persisting new movie into shared catalog: {} ({})", request.getTitle(), request.getReleaseYear());
            String safeTitle = request.getTitle() != null && request.getTitle().length() > 300
                    ? request.getTitle().substring(0, 300) : request.getTitle();
            String safeDirector = request.getDirector() != null && request.getDirector().length() > 300
                    ? request.getDirector().substring(0, 300) : request.getDirector();
            String safeGenres = request.getGenres() != null && request.getGenres().length() > 500
                    ? request.getGenres().substring(0, 500) : request.getGenres();
            String safePosterUrl = request.getPosterUrl() != null && request.getPosterUrl().length() > 1000
                    ? request.getPosterUrl().substring(0, 1000) : request.getPosterUrl();

            movie = Movie.builder()
                    .tmdbId(request.getTmdbId())
                    .imdbId(request.getImdbId())
                    .title(safeTitle)
                    .releaseYear(request.getReleaseYear())
                    .overview(request.getOverview())
                    .posterUrl(safePosterUrl)
                    .backdropUrl(request.getBackdropUrl())
                    .genres(safeGenres)
                    .runtimeMinutes(request.getRuntimeMinutes())
                    .trailerKey(request.getTrailerKey())
                    .director(safeDirector)
                    .castMembers(request.getCastMembers())
                    .mediaType(request.getMediaType() != null && !request.getMediaType().isBlank() ? request.getMediaType() : "MOVIE")
                    .seasonsCount(request.getSeasonsCount())
                    .episodesCount(request.getEpisodesCount())
                    .imdbRating(request.getImdbRating())
                    .rottenTomatoesRating(request.getRottenTomatoesRating())
                    .tmdbVoteAverage(request.getTmdbVoteAverage())
                    .tmdbVoteCount(request.getTmdbVoteCount())
                    .build();
            try {
                movie = movieRepository.save(movie);
            } catch (org.springframework.dao.DataIntegrityViolationException dive) {
                if (request.getTmdbId() != null) {
                    movie = movieRepository.findByTmdbId(request.getTmdbId()).orElseThrow(() -> dive);
                } else {
                    throw dive;
                }
            }
        }

        // Step 2: Create or update the personal journal entry
        Optional<UserMovieEntry> existingEntry = userMovieEntryRepository.findByUserIdAndMovieId(user.getId(), movie.getId());
        UserMovieEntry entry;
        if (existingEntry.isPresent()) {
            entry = existingEntry.get();
            // Retrying an add is safe, including when the original response was lost.
            // Adding to watchlist is not an instruction to undo watched history.
            if (request.getStatus() == MovieStatus.WATCHLIST) {
                return mapToResponse(entry);
            }
            entry.setStatus(request.getStatus());
            entry.setPersonalRating(request.getPersonalRating());
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
        user.setNeedsRecommendationRefresh(true);
        userRepository.save(user);

        if (eventPublisher != null) {
            eventPublisher.publishEvent(com.movienight.backend.event.MovieNightDomainEvent.of(
                    "movie.added",
                    user.getId(),
                    user.getUsername(),
                    java.util.Map.of(
                            "entryId", entry.getId(),
                            "movieId", movie.getId(),
                            "tmdbId", movie.getTmdbId() != null ? movie.getTmdbId() : -1L,
                            "title", movie.getTitle(),
                            "status", entry.getStatus().name()
                    )
            ));
        }

        return mapToResponse(entry);
    }

    /**
     * Update a user's personal review, status, or score for a movie in their library.
     */
    @Transactional
    public UserMovieEntryResponse updateMovieEntry(String username, Long movieId, UpdateMovieEntryRequest request) {
        User user = findUserByUsername(username);

        // Mutations use the catalog key returned by the library API, never a provider ID.
        UserMovieEntry entry = userMovieEntryRepository.findByUserIdAndMovieId(user.getId(), movieId)
                .orElseThrow(() -> new IllegalArgumentException("Movie entry not found in your library for movie ID: " + movieId));

        if (request.getStatus() != null) {
            entry.setStatus(request.getStatus());
        }
        if (request.isPersonalRatingPresent() || request.getPersonalRating() != null) {
            entry.setPersonalRating(request.getPersonalRating());
        }
        if (request.getNotes() != null) {
            entry.setNotes(request.getNotes());
        }
        if (request.getWatchedAt() != null) {
            entry.setWatchedAt(request.getWatchedAt());
        }

        entry = userMovieEntryRepository.save(entry);
        user.setNeedsRecommendationRefresh(true);
        userRepository.save(user);

        if (eventPublisher != null) {
            eventPublisher.publishEvent(com.movienight.backend.event.MovieNightDomainEvent.of(
                    "movie.updated",
                    user.getId(),
                    user.getUsername(),
                    java.util.Map.of(
                            "entryId", entry.getId(),
                            "movieId", entry.getMovie().getId(),
                            "title", entry.getMovie().getTitle(),
                            "status", entry.getStatus().name()
                    )
            ));
        }

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
        userMovieEntryRepository.deleteByUserIdAndMovieIdOrTmdbId(user.getId(), movieId);
        user.setNeedsRecommendationRefresh(true);
        userRepository.save(user);

        if (eventPublisher != null) {
            eventPublisher.publishEvent(com.movienight.backend.event.MovieNightDomainEvent.of(
                    "movie.deleted",
                    user.getId(),
                    user.getUsername(),
                    java.util.Map.of("movieId", movieId)
            ));
        }

        log.info("Removed movie ID {} from library of user {}", movieId, username);
    }

    /**
     * Retrieve accepted friend ratings for a specific movie.
     */
    @Transactional(readOnly = true)
    public List<FriendRatingResponse> getFriendsRatings(String username, Long movieId, List<Long> requestedFriendIds) {
        User viewer = findUserByUsername(username);
        List<Long> acceptedIds = friendshipRepository.findAcceptedFriendIdsForUser(viewer.getId());
        List<Long> friendUserIds = requestedFriendIds == null ? acceptedIds : acceptedIds.stream()
                .filter(requestedFriendIds::contains).toList();
        if (friendUserIds.isEmpty()) return Collections.emptyList();

        List<UserMovieEntry> friendEntries = userMovieEntryRepository.findByMovieIdAndUserIdIn(movieId, friendUserIds);
        if (friendEntries.isEmpty()) {
            friendEntries = userMovieEntryRepository.findByMovieIdOrTmdbIdAndUserIdIn(movieId, friendUserIds);
        }
        return friendEntries.stream()
                .filter(entry -> entry.getStatus() == MovieStatus.WATCHED || entry.getStatus() == MovieStatus.WATCHLIST)
                .map(entry -> FriendRatingResponse.builder()
                        .userId(entry.getUser().getId())
                        .username(entry.getUser().getUsername())
                        .displayName(entry.getUser().getDisplayName())
                        .status(entry.getStatus())
                        .personalRating(entry.getPersonalRating())
                        .watchedAt(entry.getWatchedAt())
                        .build())
                .collect(Collectors.toList());
    }

    // --- Helper Methods ---

    private User findUserByUsername(String username) {
        String clean = username != null ? username.trim() : "";
        return userRepository.findByUsername(clean)
                .or(() -> userRepository.findByUsernameIgnoreCase(clean))
                .or(() -> userRepository.findByEmailIgnoreCase(clean))
                .orElseThrow(() -> new IllegalArgumentException("User not found with username: " + clean));
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
                .mediaType(movie.getMediaType())
                .seasonsCount(movie.getSeasonsCount())
                .episodesCount(movie.getEpisodesCount())
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
