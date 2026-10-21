package com.movienight.backend.service;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.SuggestionCategoryResponse;
import com.movienight.backend.dto.SuggestionMovieItem;
import com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary;
import com.movienight.backend.model.*;
import com.movienight.backend.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import java.util.stream.Collectors;

/** Movie-only watched-history ranking shared by reads, explicit refresh and scheduled work. */
@Service
@RequiredArgsConstructor
public class PersonalizedRecommendationService {
    private final MovieSimilarityRepository movieSimilarityRepository;
    private final UserMovieEntryRepository userMovieEntryRepository;
    private final PersonalizedRecommendationRepository personalizedRecommendationRepository;
    private final MovieRepository movieRepository;
    private final UserRepository userRepository;
    private final TmdbClient tmdbClient;
    private final CachedMovieListRepository cachedMovieListRepository;

    private boolean isMovie(Movie movie) {
        return movie != null && (movie.getMediaType() == null || "MOVIE".equalsIgnoreCase(movie.getMediaType()));
    }

    private List<UserMovieEntry> entries(User user) {
        return userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(user.getId());
    }

    private Set<Long> libraryIds(List<UserMovieEntry> entries) {
        return entries.stream().filter(e -> isMovie(e.getMovie()))
            .filter(e -> e.getStatus() == MovieStatus.WATCHED || e.getStatus() == MovieStatus.WATCHLIST)
            .map(e -> e.getMovie().getTmdbId()).filter(Objects::nonNull).collect(Collectors.toSet());
    }

    @Transactional
    public SuggestionCategoryResponse movieCategory(User user) {
        if (user.isNeedsRecommendationRefresh() || user.getPersonalRecommendationState() == null) {
            recomputeRecommendationsForUser(user);
        }
        Set<Long> excluded = libraryIds(entries(user));
        List<SuggestionMovieItem> movies = personalizedRecommendationRepository
            .findByUserIdAndMediaTypeOrderByRankOrderAsc(user.getId(), "MOVIE").stream()
            .filter(r -> !excluded.contains(r.getTmdbId()))
            .map(r -> SuggestionMovieItem.builder().tmdbId(r.getTmdbId()).title(r.getTitle())
                .posterUrl(tmdbClient.buildPosterUrl(r.getPosterPath())).releaseYear(r.getReleaseYear()).voteAverage(r.getVoteAverage())
                .score(r.getScore()).mediaType("MOVIE").reason("Based on your watched movies and personal ratings")
                .build()).toList();
        List<String> limitations = new ArrayList<>();
        if (user.getPersonalRecommendationLimitations() != null && !user.getPersonalRecommendationLimitations().isBlank()) {
            limitations.addAll(Arrays.asList(user.getPersonalRecommendationLimitations().split(",")));
        }
        String state = user.getPersonalRecommendationState();
        if (movies.isEmpty() && "READY".equals(state)) {
            state = "LIBRARY_EXHAUSTED";
            if (!limitations.contains("LIBRARY_EXCLUDED")) limitations.add("LIBRARY_EXCLUDED");
        }
        return SuggestionCategoryResponse.builder().id("movies").title("Personal movie recommendations")
            .movies(movies).state(state).limitations(limitations).build();
    }

    @Transactional
    public void recomputeRecommendationsForUser(User user) {
        List<UserMovieEntry> entries = entries(user);
        Map<Long, Double> weights = new TreeMap<>();
        for (UserMovieEntry e : entries) {
            if (e.getStatus() == MovieStatus.WATCHED && isMovie(e.getMovie())
                    && e.getMovie().getTmdbId() != null && e.getMovie().getTmdbId() > 0) {
                weights.put(e.getMovie().getTmdbId(), (e.getPersonalRating() == null ? 7.0 : e.getPersonalRating()) - 5.5);
            }
        }
        Set<String> limitations = new LinkedHashSet<>();
        Map<Long, Double> scores = new HashMap<>();
        Set<Long> covered = new HashSet<>();
        Map<Long, TmdbMovieSummary> summaries = new HashMap<>();
        if (!weights.isEmpty()) {
            for (MovieSimilarity sim : movieSimilarityRepository.findByTmdbIdIn(weights.keySet()).stream()
                    .sorted(Comparator.comparing(MovieSimilarity::getTmdbId).thenComparing(MovieSimilarity::getNeighborTmdbId)).toList()) {
                if (sim.getNeighborTmdbId() > 0 && Double.isFinite(sim.getScore())) {
                    covered.add(sim.getTmdbId());
                    scores.merge(sim.getNeighborTmdbId(), weights.get(sim.getTmdbId()) * sim.getScore(), Double::sum);
                }
            }
            if (!tmdbClient.isConfigured()) limitations.add("TMDB_UNCONFIGURED");
            else {
                List<Long> topSeeds = weights.entrySet().stream().filter(e -> e.getValue() > 0)
                    .sorted(Map.Entry.<Long, Double>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                    .limit(3).map(Map.Entry::getKey).toList();
                for (Long seed : topSeeds) {
                    List<TmdbMovieSummary> recommendations = tmdbClient.getMovieRecommendations(seed, 1);
                    if (recommendations == null) throw new IllegalStateException("Invalid movie recommendation response");
                    if (!recommendations.isEmpty()) covered.add(seed);
                    for (int i = 0; i < recommendations.size(); i++) {
                        TmdbMovieSummary rec = recommendations.get(i);
                        if (rec == null || rec.getId() == null || rec.getId() <= 0
                                || (rec.getMediaType() != null && !"movie".equalsIgnoreCase(rec.getMediaType()))) {
                            throw new IllegalStateException("Invalid movie recommendation response");
                        }
                        scores.merge(rec.getId(), Math.max(0.1, 1.0 - .04 * i), Double::sum);
                        summaries.putIfAbsent(rec.getId(), rec);
                    }
                }
            }
            if (!covered.containsAll(weights.keySet())) limitations.add("PARTIAL_COVERAGE");
        }
        List<Map.Entry<Long, Double>> ranked = scores.entrySet().stream()
            .filter(e -> e.getValue() > 0 && Double.isFinite(e.getValue()))
            .sorted(Map.Entry.<Long, Double>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey())).toList();
        Set<Long> excluded = libraryIds(entries);
        // Every source is explicitly movie-only before resolving metadata.
        Map<Long, Movie> catalog = movieRepository.findAll().stream().filter(this::isMovie)
            .filter(m -> m.getTmdbId() != null && validTitle(m.getTitle()))
            .collect(Collectors.toMap(Movie::getTmdbId, m -> m, (a,b) -> a));
        Map<Long, CachedMovieList> cache = cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc("MOVIE").stream()
            .filter(c -> validTitle(c.getTitle())).collect(Collectors.toMap(CachedMovieList::getTmdbId, c -> c, (a,b) -> a));
        List<PersonalizedRecommendation> result = new ArrayList<>();
        boolean eligible = false;
        for (Map.Entry<Long, Double> candidate : ranked) {
            long id = candidate.getKey();
            if (excluded.contains(id)) { limitations.add("LIBRARY_EXCLUDED"); continue; }
            eligible = true;
            Movie movie = catalog.get(id);
            CachedMovieList cached = cache.get(id);
            TmdbMovieSummary summary = summaries.get(id);
            String title = movie != null ? movie.getTitle() : cached != null ? cached.getTitle() : summary != null ? summary.getTitle() : null;
            if (!validTitle(title)) { limitations.add("METADATA_OMITTED"); continue; }
            if (result.size() == 30) continue;
            result.add(PersonalizedRecommendation.builder().user(user).tmdbId(id).mediaType("MOVIE").title(title)
                .posterPath(movie != null ? movie.getPosterUrl() : cached != null ? cached.getPosterPath() : summary.getPosterPath())
                .voteAverage(movie != null ? movie.getImdbRating() : cached != null ? cached.getVoteAverage() : summary.getVoteAverage())
                .releaseYear(movie != null ? movie.getReleaseYear() : year(cached != null ? cached.getReleaseDate() : summary.getReleaseDate()))
                .score(candidate.getValue()).rankOrder(result.size() + 1).build());
        }
        String state = !result.isEmpty() ? "READY" : weights.isEmpty() ? "NO_HISTORY" : ranked.isEmpty() ? "INSUFFICIENT_COVERAGE"
            : eligible ? "MISSING_METADATA" : "LIBRARY_EXHAUSTED";
        // Publish only after every configured provider request succeeded; replace legacy mixed rows too.
        personalizedRecommendationRepository.deleteByUserId(user.getId());
        personalizedRecommendationRepository.flush();
        if (!result.isEmpty()) personalizedRecommendationRepository.saveAll(result);
        user.setPersonalRecommendationState(state);
        user.setPersonalRecommendationLimitations(String.join(",", limitations));
        user.setNeedsRecommendationRefresh(false);
        userRepository.save(user);
    }

    private boolean validTitle(String title) { return title != null && !title.isBlank(); }
    private Integer year(String date) {
        if (date == null || !date.matches("\\d{4}-\\d{2}-\\d{2}")) return null;
        return Integer.valueOf(date.substring(0, 4));
    }
}
