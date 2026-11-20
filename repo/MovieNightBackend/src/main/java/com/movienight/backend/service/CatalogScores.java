package com.movienight.backend.service;

import com.movienight.backend.dto.SuggestionMovieItem;
import com.movienight.backend.model.Movie;
import com.movienight.backend.model.ResourceType;
import com.movienight.backend.repository.MovieRepository;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * IMDb and Rotten Tomatoes values the shared catalog holds for a list of titles, read in one query when the
 * list is read (recs-refill-and-acclaimed SC01–SC03). Scores the catalog gains later show on the next read.
 * List reads never call OMDb.
 */
final class CatalogScores {

    record Scores(Double imdb, Double rottenTomatoes) {
        static final Scores NONE = new Scores(null, null);
    }

    private CatalogScores() {}

    /** Scores by TMDB id; titles the catalog does not hold, or holds without scores, are left out. */
    static Map<Long, Scores> of(MovieRepository movieRepository, ResourceType resourceType, Collection<Long> tmdbIds) {
        Map<Long, Scores> scores = new HashMap<>();
        if (tmdbIds == null || tmdbIds.isEmpty()) return scores;
        for (Movie movie : movieRepository.findByResourceTypeAndTmdbIdIn(resourceType,
                tmdbIds.stream().filter(Objects::nonNull).distinct().toList())) {
            if (movie.getTmdbId() == null || movie.getImdbRating() == null && movie.getRottenTomatoesRating() == null) continue;
            scores.putIfAbsent(movie.getTmdbId(), new Scores(movie.getImdbRating(),
                    movie.getRottenTomatoesRating() == null ? null : movie.getRottenTomatoesRating().doubleValue()));
        }
        return scores;
    }

    /** Sets the catalog's IMDb and RT values on discovery cards of one media type that carry none yet. */
    static void fill(MovieRepository movieRepository, String mediaType, List<SuggestionMovieItem> items) {
        if (items == null || items.isEmpty()) return;
        Map<Long, Scores> scores = of(movieRepository, ResourceType.fromCategory(mediaType),
                items.stream().map(SuggestionMovieItem::getTmdbId).toList());
        for (SuggestionMovieItem item : items) {
            Scores found = scores.get(item.getTmdbId());
            if (found == null) continue;
            if (item.getImdbRating() == null) item.setImdbRating(found.imdb());
            if (item.getRottenTomatoesRating() == null) item.setRottenTomatoesRating(found.rottenTomatoes());
        }
    }
}
