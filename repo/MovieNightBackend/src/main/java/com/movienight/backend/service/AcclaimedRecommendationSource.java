package com.movienight.backend.service;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary;
import com.movienight.backend.model.UserMovieEntry;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Acclaimed candidate source (#39, recs-refill-and-acclaimed): the movies with the highest TMDB audience rating
 * and many votes in the user's {@value #TOP_GENRES} most liked genres. The recommendation service gives them every third place.
 * <p>
 * Top genres are counted over liked films ({@link LikedFilmPolicy#liked}); ties go to the genre name,
 * alphabetically. A user whose liked films have no stored genres gets no acclaimed titles and no limitation.
 * Best effort, like the director source: a failed discover request keeps what earlier pages returned and
 * marks the source {@link Result#unavailable() unavailable}; it never fails the recomputation.
 */
final class AcclaimedRecommendationSource {

    static final String UNAVAILABLE_LIMITATION = "ACCLAIMED_SOURCE_UNAVAILABLE";

    static final int TOP_GENRES = 3;
    static final int MIN_VOTES = 3000;
    private static final int PAGES = 2;

    /**
     * TMDB movie genre ids by the names stored in {@code Movie.genres} (TMDB's own English names).
     * The list is fixed by TMDB, so a static map saves a request per recomputation.
     */
    private static final Map<String, Integer> GENRE_IDS = Map.ofEntries(
            Map.entry("Action", 28), Map.entry("Adventure", 12), Map.entry("Animation", 16),
            Map.entry("Comedy", 35), Map.entry("Crime", 80), Map.entry("Documentary", 99),
            Map.entry("Drama", 18), Map.entry("Family", 10751), Map.entry("Fantasy", 14),
            Map.entry("History", 36), Map.entry("Horror", 27), Map.entry("Music", 10402),
            Map.entry("Mystery", 9648), Map.entry("Romance", 10749), Map.entry("Science Fiction", 878),
            Map.entry("TV Movie", 10770), Map.entry("Thriller", 53), Map.entry("War", 10752),
            Map.entry("Western", 37));
    private static final Map<String, String> CANONICAL_NAMES = GENRE_IDS.keySet().stream()
            .collect(Collectors.toMap(name -> name.toLowerCase(Locale.ROOT), name -> name));

    /**
     * An acclaimed film and its explanation, "Highly rated <genre> on TMDB": the pick is an audience rating, so
     * the explanation names the provider and never claims critic approval (GLOSSARY.md, Audience rating).
     */
    record Candidate(TmdbMovieSummary film, String explanation) {}

    /** Candidates in TMDB's order (best rated first). */
    record Result(Map<Long, Candidate> candidates, boolean unavailable) {
        static final Result NONE = new Result(Map.of(), false);
    }

    private final TmdbClient tmdbClient;

    AcclaimedRecommendationSource(TmdbClient tmdbClient) {
        this.tmdbClient = tmdbClient;
    }

    /** Acclaimed candidates for this history, leaving out {@code excluded} (library and dismissed) titles. */
    Result collect(List<UserMovieEntry> entries, Set<Long> excluded) {
        Map<Integer, String> topGenres = topGenres(entries);
        if (topGenres.isEmpty()) return Result.NONE;
        String withGenres = topGenres.keySet().stream().map(String::valueOf).collect(Collectors.joining("|"));
        Map<Long, Candidate> candidates = new LinkedHashMap<>();
        for (int page = 1; page <= PAGES; page++) {
            List<TmdbMovieSummary> films;
            try {
                films = tmdbClient.discoverAcclaimedMovies(withGenres, MIN_VOTES, page);
            } catch (RuntimeException failure) {
                return new Result(candidates, true);
            }
            for (TmdbMovieSummary film : films) {
                if (film == null || film.getId() == null || film.getId() <= 0 || excluded.contains(film.getId())) continue;
                if (film.getVoteCount() == null || film.getVoteCount() < MIN_VOTES) continue;
                // The explanation names the first of the film's genres that is one of the user's top genres.
                Optional<String> genre = Optional.ofNullable(film.getGenreIds()).orElse(List.of()).stream()
                        .filter(topGenres::containsKey).map(topGenres::get).findFirst();
                if (genre.isEmpty()) continue;
                candidates.putIfAbsent(film.getId(),
                        new Candidate(film, "Highly rated " + genre.get().toLowerCase(Locale.ROOT) + " on TMDB"));
            }
        }
        return new Result(candidates, false);
    }

    /** The user's top genres as TMDB id → name, most liked first. */
    private static Map<Integer, String> topGenres(List<UserMovieEntry> entries) {
        Map<String, Integer> counts = new HashMap<>();
        Set<Long> counted = new HashSet<>();
        for (UserMovieEntry entry : entries) {
            if (!LikedFilmPolicy.liked(entry) || !counted.add(entry.getMovie().getTmdbId())) continue;
            String genres = entry.getMovie().getGenres();
            if (genres == null) continue;
            Arrays.stream(genres.split(",")).map(name -> CANONICAL_NAMES.get(name.trim().toLowerCase(Locale.ROOT)))
                    .filter(Objects::nonNull).distinct().forEach(name -> counts.merge(name, 1, Integer::sum));
        }
        Map<Integer, String> top = new LinkedHashMap<>();
        counts.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                .limit(TOP_GENRES)
                .forEach(e -> top.put(GENRE_IDS.get(e.getKey()), e.getKey()));
        return top;
    }
}
