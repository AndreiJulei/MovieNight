package com.movienight.backend.service;

import com.movienight.backend.model.Movie;
import com.movienight.backend.model.ResourceType;
import com.movienight.backend.repository.MovieRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Isolated persistence operations for catalog titles.
 * Uses REQUIRES_NEW transactions so that uniqueness collisions or background updates
 * do not contaminate the caller's transaction or Hibernate session.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CatalogPersistenceService {

    private final MovieRepository movieRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Movie saveIfAbsent(Movie movie, ResourceType resourceType, Long tmdbId) {
        Optional<Movie> existing = movieRepository.findByResourceTypeAndTmdbId(resourceType, tmdbId);
        if (existing.isPresent()) {
            return existing.get();
        }
        try {
            return movieRepository.save(movie);
        } catch (DataIntegrityViolationException dive) {
            log.debug("Concurrent insertion detected for {}:{}, reading persisted row", resourceType, tmdbId);
            return movieRepository.findByResourceTypeAndTmdbId(resourceType, tmdbId)
                    .orElse(movie);
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void updateRatings(Long movieId, Double imdbRating, Integer rtScore) {
        movieRepository.findById(movieId).ifPresent(m -> {
            boolean changed = false;
            if (imdbRating != null && !imdbRating.equals(m.getImdbRating())) {
                m.setImdbRating(imdbRating);
                changed = true;
            }
            if (rtScore != null && !rtScore.equals(m.getRottenTomatoesRating())) {
                m.setRottenTomatoesRating(rtScore);
                changed = true;
            }
            if (changed) {
                movieRepository.save(m);
                log.debug("Updated ratings for catalog movie {}: IMDb={}, RT={}", movieId, imdbRating, rtScore);
            }
        });
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Movie backfillCoreDetails(Long movieId, String overview, String genres,
                                     String director, String castMembers,
                                     String trailerKey, Integer runtimeMinutes) {
        return movieRepository.findById(movieId).map(m -> {
            if ((m.getOverview() == null || m.getOverview().isBlank()) && overview != null) {
                m.setOverview(overview);
            }
            if ((m.getGenres() == null || m.getGenres().isBlank()) && genres != null) {
                m.setGenres(genres);
            }
            if ((m.getDirector() == null || m.getDirector().isBlank()) && director != null) {
                m.setDirector(director);
            }
            if ((m.getCastMembers() == null || m.getCastMembers().isBlank()) && castMembers != null) {
                m.setCastMembers(castMembers);
            }
            if ((m.getTrailerKey() == null || m.getTrailerKey().isBlank()) && trailerKey != null) {
                m.setTrailerKey(trailerKey);
            }
            if (m.getRuntimeMinutes() == null && runtimeMinutes != null) {
                m.setRuntimeMinutes(runtimeMinutes);
            }
            return movieRepository.save(m);
        }).orElse(null);
    }
}

