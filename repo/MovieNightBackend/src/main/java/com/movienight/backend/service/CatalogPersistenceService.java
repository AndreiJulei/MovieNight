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

import java.time.LocalDateTime;
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

    /** Store OMDb values and remember that OMDb answered, even without scores (PD-08, SC06). Every OMDb path uses it. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordOmdbCheck(Long movieId, Double imdbRating, Integer rottenTomatoes, LocalDateTime checkedAt) {
        movieRepository.findById(movieId).ifPresent(m -> {
            if (imdbRating != null) m.setImdbRating(imdbRating);
            if (rottenTomatoes != null) m.setRottenTomatoesRating(rottenTomatoes);
            m.setOmdbCheckedAt(checkedAt);
            movieRepository.save(m);
        });
    }

    public record CoreDetails(
            String overview,
            String genres,
            String director,
            String castMembers,
            String trailerKey,
            Integer runtimeMinutes,
            String logoUrl
    ) {}

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Movie backfillCoreDetails(Long movieId, CoreDetails details) {
        if (details == null) {
            return movieRepository.findById(movieId).orElse(null);
        }
        return movieRepository.findById(movieId).map(m -> {
            if ((m.getOverview() == null || m.getOverview().isBlank()) && details.overview() != null) {
                m.setOverview(details.overview());
            }
            if ((m.getGenres() == null || m.getGenres().isBlank()) && details.genres() != null) {
                m.setGenres(details.genres());
            }
            if ((m.getDirector() == null || m.getDirector().isBlank()) && details.director() != null) {
                m.setDirector(details.director());
            }
            if ((m.getCastMembers() == null || m.getCastMembers().isBlank()) && details.castMembers() != null) {
                m.setCastMembers(details.castMembers());
            }
            if ((m.getTrailerKey() == null || m.getTrailerKey().isBlank()) && details.trailerKey() != null) {
                m.setTrailerKey(details.trailerKey());
            }
            if (m.getRuntimeMinutes() == null && details.runtimeMinutes() != null) {
                m.setRuntimeMinutes(details.runtimeMinutes());
            }
            if ((m.getLogoUrl() == null || m.getLogoUrl().isBlank()) && details.logoUrl() != null) {
                m.setLogoUrl(details.logoUrl());
            }
            return movieRepository.save(m);
        }).orElse(null);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Movie backfillCoreDetails(Long movieId, String overview, String genres,
                                     String director, String castMembers,
                                     String trailerKey, Integer runtimeMinutes) {
        return backfillCoreDetails(movieId, new CoreDetails(overview, genres, director, castMembers, trailerKey, runtimeMinutes, null));
    }
}

