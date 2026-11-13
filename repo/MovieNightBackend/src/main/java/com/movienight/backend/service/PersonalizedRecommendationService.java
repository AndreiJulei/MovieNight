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
    private final RecommendationMaintenanceService recommendationMaintenanceService;
    private final RecommendationRatingEnricher ratingEnricher;

    /** A candidate that cleared the quality floor, scored as relevance × quality factor. */
    private record QualifiedCandidate(long tmdbId, double score, Double audience, Integer audienceVotes) {}

    /** True only when the audience data already at hand fails the floor; unknown data stays a candidate. */
    private boolean knownBelowFloor(CachedMovieList cached, TmdbMovieSummary summary) {
        if (cached != null && validAudience(cached.getVoteAverage()))
            return !RecommendationQualityPolicy.eligible(cached.getVoteAverage(), cached.getVoteCount());
        if (summary != null && validAudience(summary.getVoteAverage()))
            return !RecommendationQualityPolicy.eligible(summary.getVoteAverage(), summary.getVoteCount());
        return false;
    }

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
        if (recommendationMaintenanceService != null) {
            recommendationMaintenanceService.checkRecommendationAccess();
        }
        List<PersonalizedRecommendation> previous = personalizedRecommendationRepository
                .findByUserIdAndMediaTypeOrderByRankOrderAsc(user.getId(), "MOVIE");
        if (user.isNeedsRecommendationRefresh() || user.getPersonalRecommendationState() == null
                || previous.stream().anyMatch(row -> row.getReason() == null)) {
            recomputeRecommendationsForUser(user);
        }
        Set<Long> excluded = libraryIds(entries(user));
        List<SuggestionMovieItem> movies = personalizedRecommendationRepository
            .findByUserIdAndMediaTypeOrderByRankOrderAsc(user.getId(), "MOVIE").stream()
            .filter(r -> !excluded.contains(r.getTmdbId()))
            .map(r -> SuggestionMovieItem.builder().tmdbId(r.getTmdbId()).title(r.getTitle())
                .posterUrl(r.getPosterPath() != null && r.getPosterPath().startsWith("http")
                        ? r.getPosterPath() : tmdbClient.buildPosterUrl(r.getPosterPath()))
                .releaseYear(r.getReleaseYear()).voteAverage(r.getVoteAverage())
                .voteCount(r.getAudienceVoteCount()).imdbRating(r.getImdbRating())
                .score(r.getScore()).mediaType("MOVIE").reason(r.getReason())
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
        if (recommendationMaintenanceService != null) {
            recommendationMaintenanceService.startRecomputation();
        }
        try {
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
        Map<Long, Map<Long, Double>> contributions = new HashMap<>();
        Map<Long, Set<String>> sources = new HashMap<>();
        Set<Long> covered = new HashSet<>();
        Map<Long, TmdbMovieSummary> summaries = new HashMap<>();
        if (!weights.isEmpty()) {
            for (MovieSimilarity sim : movieSimilarityRepository.findByTmdbIdIn(weights.keySet()).stream()
                    .sorted(Comparator.comparing(MovieSimilarity::getTmdbId).thenComparing(MovieSimilarity::getNeighborTmdbId)).toList()) {
                if (sim.getNeighborTmdbId() > 0 && Double.isFinite(sim.getScore())) {
                    covered.add(sim.getTmdbId());
                    scores.merge(sim.getNeighborTmdbId(), weights.get(sim.getTmdbId()) * sim.getScore(), Double::sum);
                    contributions.computeIfAbsent(sim.getNeighborTmdbId(), ignored -> new HashMap<>())
                            .merge(sim.getTmdbId(), weights.get(sim.getTmdbId()) * sim.getScore(), Double::sum);
                    if (weights.get(sim.getTmdbId()) * sim.getScore() > 0)
                        sources.computeIfAbsent(sim.getNeighborTmdbId(), ignored -> new LinkedHashSet<>())
                                .add("MovieLens similarity");
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
                        double boost = Math.max(0.1, 1.0 - .04 * i);
                        scores.merge(rec.getId(), boost, Double::sum);
                        contributions.computeIfAbsent(rec.getId(), ignored -> new HashMap<>())
                                .merge(seed, boost, Double::sum);
                        sources.computeIfAbsent(rec.getId(), ignored -> new LinkedHashSet<>())
                                .add("TMDB recommendations");
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
        Map<Long, String> watchedTitles = entries.stream()
                .filter(e -> e.getStatus() == MovieStatus.WATCHED && isMovie(e.getMovie())
                        && e.getMovie().getTmdbId() != null)
                .collect(Collectors.toMap(e -> e.getMovie().getTmdbId(), e -> e.getMovie().getTitle(), (a, b) -> a));
        Map<Long, CachedMovieList> cache = cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc("MOVIE").stream()
            .filter(c -> validTitle(c.getTitle())).collect(Collectors.toMap(CachedMovieList::getTmdbId, c -> c, (a,b) -> a));
        // Bounded OMDb enrichment of the most relevant candidates not already known to miss the floor (PD-08).
        // It runs before the catalog is read, so this ranking sees the scores it stored.
        ratingEnricher.enrich(ranked.stream().map(Map.Entry::getKey)
                .filter(id -> !excluded.contains(id) && !knownBelowFloor(cache.get(id), summaries.get(id))).toList());
        // Every source is explicitly movie-only before resolving metadata.
        Map<Long, Movie> catalog = movieRepository.findAll().stream().filter(this::isMovie)
            .filter(m -> m.getTmdbId() != null && validTitle(m.getTitle()))
            .collect(Collectors.toMap(Movie::getTmdbId, m -> m, (a,b) -> a));
        boolean outsideLibrary = false;
        boolean missingMetadata = false;
        List<QualifiedCandidate> qualified = new ArrayList<>();
        for (Map.Entry<Long, Double> candidate : ranked) {
            long id = candidate.getKey();
            if (excluded.contains(id)) { limitations.add("LIBRARY_EXCLUDED"); continue; }
            outsideLibrary = true;
            Movie movie = catalog.get(id);
            CachedMovieList cached = cache.get(id);
            TmdbMovieSummary summary = summaries.get(id);
            Double audience = null;
            Integer audienceVotes = null;
            if (movie != null && validAudience(movie.getTmdbVoteAverage())) {
                audience = movie.getTmdbVoteAverage(); audienceVotes = movie.getTmdbVoteCount();
            } else if (cached != null && validAudience(cached.getVoteAverage())) {
                audience = cached.getVoteAverage(); audienceVotes = cached.getVoteCount();
            } else if (summary != null && validAudience(summary.getVoteAverage())) {
                audience = summary.getVoteAverage(); audienceVotes = summary.getVoteCount();
            }
            // Floor: TMDB audience rating ≥ 6.5 with ≥ 300 votes. Unknown audience data is excluded as missing metadata.
            if (audience == null) { limitations.add("METADATA_OMITTED"); missingMetadata = true; continue; }
            if (!RecommendationQualityPolicy.eligible(audience, audienceVotes)) continue;
            double quality = RecommendationQualityPolicy.qualityFactor(audience, audienceVotes,
                    movie != null ? movie.getImdbRating() : null, movie != null ? movie.getRottenTomatoesRating() : null);
            qualified.add(new QualifiedCandidate(id, candidate.getValue() * quality, audience, audienceVotes));
        }
        qualified.sort(Comparator.comparingDouble(QualifiedCandidate::score).reversed()
                .thenComparing(QualifiedCandidate::tmdbId));
        List<PersonalizedRecommendation> result = new ArrayList<>();
        for (QualifiedCandidate candidate : qualified) {
            long id = candidate.tmdbId();
            Movie movie = catalog.get(id);
            CachedMovieList cached = cache.get(id);
            TmdbMovieSummary summary = summaries.get(id);
            String title = movie != null ? movie.getTitle() : cached != null ? cached.getTitle() : summary != null ? summary.getTitle() : null;
            if (!validTitle(title)) { limitations.add("METADATA_OMITTED"); missingMetadata = true; continue; }
            if (result.size() == 30) continue;
            List<String> reasonTitles = contributions.getOrDefault(id, Map.of()).entrySet().stream()
                    .filter(e -> e.getValue() > 0 && watchedTitles.containsKey(e.getKey()))
                    .sorted(Map.Entry.<Long, Double>comparingByValue().reversed()
                            .thenComparing(Map.Entry.comparingByKey()))
                    .limit(2).map(e -> watchedTitles.get(e.getKey())).toList();
            String reason = reasonTitles.isEmpty() ? null : "Because you watched "
                    + String.join(" and ", reasonTitles) + " ("
                    + String.join(" and ", sources.getOrDefault(id, Set.of())) + ")";
            result.add(PersonalizedRecommendation.builder().user(user).tmdbId(id).mediaType("MOVIE").title(title)
                .posterPath(movie != null ? movie.getPosterUrl() : cached != null ? cached.getPosterPath() : summary.getPosterPath())
                .voteAverage(candidate.audience()).audienceVoteCount(candidate.audienceVotes())
                .imdbRating(movie != null ? movie.getImdbRating() : null).reason(reason)
                .releaseYear(movie != null ? movie.getReleaseYear() : year(cached != null ? cached.getReleaseDate() : summary.getReleaseDate()))
                .score(candidate.score()).rankOrder(result.size() + 1).build());
        }
        // A floor that removes every candidate shows nothing rather than silently lowering the floor.
        String state = !result.isEmpty() ? "READY" : weights.isEmpty() ? "NO_HISTORY" : ranked.isEmpty() ? "INSUFFICIENT_COVERAGE"
            : !outsideLibrary ? "LIBRARY_EXHAUSTED" : missingMetadata ? "MISSING_METADATA" : "INSUFFICIENT_COVERAGE";
        // Publish only after every configured provider request succeeded; replace legacy mixed rows too.
        personalizedRecommendationRepository.deleteByUserId(user.getId());
        personalizedRecommendationRepository.flush();
        if (!result.isEmpty()) personalizedRecommendationRepository.saveAll(result);
        user.setPersonalRecommendationState(state);
        user.setPersonalRecommendationLimitations(String.join(",", limitations));
        user.setNeedsRecommendationRefresh(false);
        userRepository.save(user);
        } finally {
            if (recommendationMaintenanceService != null) {
                recommendationMaintenanceService.endRecomputation();
            }
        }
    }

    private boolean validTitle(String title) { return title != null && !title.isBlank(); }
    private boolean validAudience(Double value) {
        return value != null && Double.isFinite(value) && value >= 0 && value <= 10;
    }
    private Integer year(String date) {
        if (date == null || !date.matches("\\d{4}-\\d{2}-\\d{2}")) return null;
        return Integer.valueOf(date.substring(0, 4));
    }
}
