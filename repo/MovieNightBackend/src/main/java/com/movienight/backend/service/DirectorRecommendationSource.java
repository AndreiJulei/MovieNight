package com.movienight.backend.service;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.external.TmdbPerson;
import com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary;
import com.movienight.backend.model.UserMovieEntry;

import java.util.*;

/**
 * Same-director candidate source (PD-20, #38): a director with {@value #MIN_LIKED_FILMS}+ liked films
 * contributes the rest of their filmography (Nosferatu + The Witch → The Lighthouse, The Northman).
 * <p>
 * Directors are identified by TMDB person id, read from the credits of each liked film, so co-directors
 * count and name spellings cannot mismatch. Best effort: a failed credits request skips only that liked
 * film or that director and marks the source {@link Result#unavailable() unavailable}; it never fails the
 * recomputation.
 */
final class DirectorRecommendationSource {

    static final String UNAVAILABLE_LIMITATION = "DIRECTOR_SOURCE_UNAVAILABLE";

    private static final int MIN_LIKED_FILMS = 2;
    private static final int MAX_DIRECTORS = 3;
    /** Most recent liked films whose credits are read: bounds TMDB calls per recomputation. */
    static final int MAX_LIKED_FILMS_LOOKED_UP = 40;
    /** Relevance per liked film by the director, capped at three; above one TMDB recommendation (at most 1.0). */
    private static final double RELEVANCE_PER_LIKED_FILM = 1.0;
    private static final int MAX_LIKED_FILMS_COUNTED = 3;

    /** A film reached through liked directors; relevance sums over every qualifying director of the film. */
    record Candidate(TmdbMovieSummary film, double relevance, String explanation) {}

    record Result(Map<Long, Candidate> candidates, boolean unavailable) {}

    /** A director and the liked films (TMDB ids) they directed. */
    private record LikedDirector(TmdbPerson person, Set<Long> likedFilmIds) {
        int likedCount() { return likedFilmIds.size(); }
    }

    private final TmdbClient tmdbClient;

    DirectorRecommendationSource(TmdbClient tmdbClient) {
        this.tmdbClient = tmdbClient;
    }

    /**
     * Candidates from the user's liked directors. {@code entries} is newest first; {@code library} titles
     * are left out here so the user's own films do not show up as excluded candidates.
     */
    Result collect(List<UserMovieEntry> entries, Set<Long> library) {
        boolean unavailable = false;
        Map<Long, LikedDirector> directorsByPersonId = new HashMap<>();
        List<Long> likedFilmIds = entries.stream().filter(LikedFilmPolicy::liked)
                .map(e -> e.getMovie().getTmdbId()).distinct().limit(MAX_LIKED_FILMS_LOOKED_UP).toList();
        for (Long likedFilmId : likedFilmIds) {
            List<TmdbPerson> directors;
            try {
                directors = tmdbClient.getMovieDirectors(likedFilmId);
            } catch (RuntimeException failure) {
                unavailable = true;
                continue;
            }
            for (TmdbPerson director : directors) {
                directorsByPersonId.computeIfAbsent(director.id(), id -> new LikedDirector(director, new HashSet<>()))
                        .likedFilmIds().add(likedFilmId);
            }
        }
        List<LikedDirector> qualifying = directorsByPersonId.values().stream()
                .filter(d -> d.likedCount() >= MIN_LIKED_FILMS)
                .sorted(Comparator.comparingInt(LikedDirector::likedCount).reversed()
                        .thenComparing(d -> d.person().name(), String.CASE_INSENSITIVE_ORDER)
                        .thenComparingLong(d -> d.person().id()))
                .limit(MAX_DIRECTORS).toList();

        Map<Long, Candidate> candidates = new LinkedHashMap<>();
        for (LikedDirector director : qualifying) {
            List<TmdbMovieSummary> filmography;
            try {
                filmography = tmdbClient.getDirectedMovies(director.person().id());
            } catch (RuntimeException failure) {
                unavailable = true;
                continue;
            }
            double relevance = RELEVANCE_PER_LIKED_FILM * Math.min(MAX_LIKED_FILMS_COUNTED, director.likedCount());
            String explanation = "Because you liked " + director.likedCount() + " films by " + director.person().name();
            for (TmdbMovieSummary film : filmography) {
                if (film == null || film.getId() == null || film.getId() <= 0 || library.contains(film.getId())) continue;
                // Directors are visited most-liked first, so the first explanation names the strongest director.
                candidates.merge(film.getId(), new Candidate(film, relevance, explanation),
                        (first, next) -> new Candidate(first.film(), first.relevance() + next.relevance(), first.explanation()));
            }
        }
        return new Result(candidates, unavailable);
    }
}
