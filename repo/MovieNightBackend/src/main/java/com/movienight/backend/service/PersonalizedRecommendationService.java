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
    private final RecommendationDismissals dismissals;

    /** Rows a recomputation stores: the served list plus a reserve that refills it after dismissals. */
    static final int MAX_STORED = 60;
    /** Titles a read serves (View all); Home shows the first 20 of them. */
    static final int MAX_SERVED = 30;
    /** Fewer undismissed stored rows than this after a dismissal mark the user for a recomputation. */
    static final int LOW_RESERVE = 40;
    /** Liked films whose TMDB recommendations are read, and the pages read for each. */
    static final int TMDB_SEEDS = 5;
    static final int TMDB_PAGES = 2;
    /** Every third stored place holds an acclaimed title while personal candidates last. */
    static final int ACCLAIMED_EVERY = 3;

    /** A candidate that cleared the quality floor, scored as relevance × quality factor. */
    private record QualifiedCandidate(long tmdbId, double score, Double audience, Integer audienceVotes) {}

    /** TMDB audience rating and vote count; both null when no source has a usable rating. */
    private record Audience(Double average, Integer votes) {}

    /** The catalog's audience data first, then the discovery cache, then the provider summary. */
    private Audience audience(Movie movie, CachedMovieList cached, TmdbMovieSummary summary) {
        if (movie != null && validAudience(movie.getTmdbVoteAverage())) return new Audience(movie.getTmdbVoteAverage(), movie.getTmdbVoteCount());
        if (cached != null && validAudience(cached.getVoteAverage())) return new Audience(cached.getVoteAverage(), cached.getVoteCount());
        if (summary != null && validAudience(summary.getVoteAverage())) return new Audience(summary.getVoteAverage(), summary.getVoteCount());
        return new Audience(null, null);
    }

    /** The #37 quality factor from the audience rating and the catalog's IMDb and RT values. */
    private static double qualityFactor(Audience audience, Movie movie) {
        return RecommendationQualityPolicy.qualityFactor(audience.average(), audience.votes(),
                movie != null ? movie.getImdbRating() : null, movie != null ? movie.getRottenTomatoesRating() : null);
    }

    /** Highest score first; ties go to the lower TMDB id, so a ranking is stable. */
    private static final Comparator<QualifiedCandidate> BY_SCORE =
            Comparator.comparingDouble(QualifiedCandidate::score).reversed().thenComparing(QualifiedCandidate::tmdbId);

    private String title(Movie movie, CachedMovieList cached, TmdbMovieSummary summary) {
        return movie != null ? movie.getTitle() : cached != null ? cached.getTitle() : summary != null ? summary.getTitle() : null;
    }

    /** True only when the audience data already at hand fails the floor; unknown data stays a candidate. */
    private boolean knownBelowFloor(CachedMovieList cached, TmdbMovieSummary summary) {
        if (cached != null && validAudience(cached.getVoteAverage()))
            return !RecommendationQualityPolicy.eligible(cached.getVoteAverage(), cached.getVoteCount());
        if (summary != null && validAudience(summary.getVoteAverage()))
            return !RecommendationQualityPolicy.eligible(summary.getVoteAverage(), summary.getVoteCount());
        return false;
    }

    private List<UserMovieEntry> entries(User user) {
        return userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(user.getId());
    }

    private Set<Long> libraryIds(List<UserMovieEntry> entries) {
        return entries.stream().filter(e -> LikedFilmPolicy.isMovie(e.getMovie()))
            .filter(e -> e.getStatus() == MovieStatus.WATCHED || e.getStatus() == MovieStatus.WATCHLIST)
            .map(e -> e.getMovie().getTmdbId()).filter(Objects::nonNull).collect(Collectors.toSet());
    }

    /**
     * "Not interested" (#40). The next stored row takes the freed place on the next read. When this dismissal
     * takes the undismissed stored rows from {@value #LOW_RESERVE} or more to fewer, the user is marked for a
     * recomputation, so the next read (or the scheduled job) refills the reserve from the current pool (RF02).
     * A list that was already below the reserve is not marked again: its pool has nothing new to add, and
     * recomputing on every dismissal would reverse #40 RM02.
     */
    @Transactional
    public void dismiss(User user, long tmdbId) {
        Set<Long> dismissedBefore = dismissals.dismissedMovieIds(user);
        dismissals.dismiss(user, tmdbId);
        List<Long> undismissedBefore = personalizedRecommendationRepository
                .findByUserIdAndMediaTypeOrderByRankOrderAsc(user.getId(), "MOVIE").stream()
                .map(PersonalizedRecommendation::getTmdbId)
                .filter(id -> !dismissedBefore.contains(id)).toList();
        long undismissedAfter = undismissedBefore.stream().filter(id -> !Objects.equals(id, tmdbId)).count();
        boolean crossedLowReserve = undismissedBefore.size() >= LOW_RESERVE && undismissedAfter < LOW_RESERVE;
        if (crossedLowReserve && !user.isNeedsRecommendationRefresh()) {
            user.setNeedsRecommendationRefresh(true);
            userRepository.save(user);
        }
    }

    /**
     * Undo of "Not interested" (#40). The title returns to its stored place. If a recomputation dropped it
     * meanwhile, the user is marked for one, so it returns on the next read (RM03).
     */
    @Transactional
    public void undoDismissal(User user, long tmdbId) {
        if (!dismissals.undo(user, tmdbId)) return;
        if (personalizedRecommendationRepository.existsByUserIdAndMediaTypeAndTmdbId(user.getId(), "MOVIE", tmdbId)) return;
        user.setNeedsRecommendationRefresh(true);
        userRepository.save(user);
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
        // Dismissed titles are left out, so the next stored recommendation takes the freed place (#40 RM02).
        Set<Long> excluded = libraryIds(entries(user));
        excluded.addAll(dismissals.dismissedMovieIds(user));
        List<PersonalizedRecommendation> served = personalizedRecommendationRepository
            .findByUserIdAndMediaTypeOrderByRankOrderAsc(user.getId(), "MOVIE").stream()
            .filter(r -> !excluded.contains(r.getTmdbId()))
            .limit(MAX_SERVED).toList();
        // IMDb and RT come from the catalog at read time; the stored IMDb value is only a fallback (SC01, SC02).
        Map<Long, CatalogScores.Scores> catalogScores = CatalogScores.of(movieRepository, ResourceType.MOVIE,
                served.stream().map(PersonalizedRecommendation::getTmdbId).toList());
        List<SuggestionMovieItem> movies = served.stream().map(r -> {
            CatalogScores.Scores scores = catalogScores.getOrDefault(r.getTmdbId(), CatalogScores.Scores.NONE);
            return SuggestionMovieItem.builder().tmdbId(r.getTmdbId()).title(r.getTitle())
                .posterUrl(r.getPosterPath() != null && r.getPosterPath().startsWith("http")
                        ? r.getPosterPath() : tmdbClient.buildPosterUrl(r.getPosterPath()))
                .releaseYear(r.getReleaseYear()).voteAverage(r.getVoteAverage())
                .voteCount(r.getAudienceVoteCount())
                .imdbRating(scores.imdb() != null ? scores.imdb() : r.getImdbRating())
                .rottenTomatoesRating(scores.rottenTomatoes())
                .score(r.getScore()).mediaType("MOVIE").reason(r.getReason())
                .build();
        }).toList();
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
            if (LikedFilmPolicy.watchedMovie(e)) {
                weights.put(e.getMovie().getTmdbId(), LikedFilmPolicy.effectiveRating(e) - 5.5);
            }
        }
        Set<String> limitations = new LinkedHashSet<>();
        Map<Long, Double> scores = new HashMap<>();
        Map<Long, Map<Long, Double>> contributions = new HashMap<>();
        Map<Long, Set<String>> sources = new HashMap<>();
        Set<Long> covered = new HashSet<>();
        Map<Long, TmdbMovieSummary> summaries = new HashMap<>();
        Map<Long, DirectorRecommendationSource.Candidate> directorCandidates = Map.of();
        AcclaimedRecommendationSource.Result acclaimedFilms = AcclaimedRecommendationSource.Result.NONE;
        Set<Long> excluded = libraryIds(entries);
        Set<Long> dismissed = dismissals.dismissedMovieIds(user);
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
                    .limit(TMDB_SEEDS).map(Map.Entry::getKey).toList();
                for (Long seed : topSeeds) {
                    for (int page = 1; page <= TMDB_PAGES; page++) {
                        List<TmdbMovieSummary> recommendations = tmdbClient.getMovieRecommendations(seed, page);
                        if (recommendations == null) throw new IllegalStateException("Invalid movie recommendation response");
                        if (!recommendations.isEmpty()) covered.add(seed);
                        for (int i = 0; i < recommendations.size(); i++) {
                            TmdbMovieSummary rec = recommendations.get(i);
                            if (rec == null || rec.getId() == null || rec.getId() <= 0
                                    || (rec.getMediaType() != null && !"movie".equalsIgnoreCase(rec.getMediaType()))) {
                                throw new IllegalStateException("Invalid movie recommendation response");
                            }
                            // Position across both pages: page 2 continues page 1's falling boost.
                            double boost = Math.max(0.1, 1.0 - .04 * (i + (page - 1) * 20));
                            scores.merge(rec.getId(), boost, Double::sum);
                            contributions.computeIfAbsent(rec.getId(), ignored -> new HashMap<>())
                                    .merge(seed, boost, Double::sum);
                            sources.computeIfAbsent(rec.getId(), ignored -> new LinkedHashSet<>())
                                    .add("TMDB recommendations");
                            summaries.putIfAbsent(rec.getId(), rec);
                        }
                    }
                }
                DirectorRecommendationSource.Result directorFilms =
                        new DirectorRecommendationSource(tmdbClient).collect(entries, excluded);
                if (directorFilms.unavailable()) limitations.add(DirectorRecommendationSource.UNAVAILABLE_LIMITATION);
                directorCandidates = directorFilms.candidates();
                directorCandidates.forEach((id, candidate) -> {
                    scores.merge(id, candidate.relevance(), Double::sum);
                    summaries.putIfAbsent(id, candidate.film());
                });
                Set<Long> notRecommendable = new HashSet<>(excluded);
                notRecommendable.addAll(dismissed);
                acclaimedFilms = new AcclaimedRecommendationSource(tmdbClient).collect(entries, notRecommendable);
                if (acclaimedFilms.unavailable()) limitations.add(AcclaimedRecommendationSource.UNAVAILABLE_LIMITATION);
            }
            if (!covered.containsAll(weights.keySet())) limitations.add("PARTIAL_COVERAGE");
        }
        List<Map.Entry<Long, Double>> ranked = scores.entrySet().stream()
            .filter(e -> e.getValue() > 0 && Double.isFinite(e.getValue()))
            .sorted(Map.Entry.<Long, Double>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey())).toList();
        // A title that is also a personal candidate keeps its personal place and explanation.
        Map<Long, AcclaimedRecommendationSource.Candidate> acclaimed = new LinkedHashMap<>(acclaimedFilms.candidates());
        acclaimed.keySet().removeAll(scores.keySet());
        acclaimed.forEach((id, candidate) -> summaries.putIfAbsent(id, candidate.film()));
        Map<Long, String> watchedTitles = entries.stream()
                .filter(LikedFilmPolicy::watchedMovie)
                .collect(Collectors.toMap(e -> e.getMovie().getTmdbId(), e -> e.getMovie().getTitle(), (a, b) -> a));
        Map<Long, CachedMovieList> cache = cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc("MOVIE").stream()
            .filter(c -> validTitle(c.getTitle())).collect(Collectors.toMap(CachedMovieList::getTmdbId, c -> c, (a,b) -> a));
        // Bounded OMDb enrichment of the most relevant candidates not already known to miss the floor (PD-08),
        // in the order they would be placed. It runs before the catalog is read, so this ranking sees the
        // scores it stored.
        ratingEnricher.enrich(interleave(
                ranked.stream().map(Map.Entry::getKey)
                        .filter(id -> !excluded.contains(id) && !dismissed.contains(id) && !knownBelowFloor(cache.get(id), summaries.get(id))).toList(),
                acclaimed.keySet().stream().filter(id -> !knownBelowFloor(cache.get(id), summaries.get(id))).toList()));
        // Every source is explicitly movie-only before resolving metadata.
        Map<Long, Movie> catalog = movieRepository.findAll().stream().filter(LikedFilmPolicy::isMovie)
            .filter(m -> m.getTmdbId() != null && validTitle(m.getTitle()))
            .collect(Collectors.toMap(Movie::getTmdbId, m -> m, (a,b) -> a));
        boolean outsideLibrary = false;
        boolean missingMetadata = false;
        List<QualifiedCandidate> qualified = new ArrayList<>();
        for (Map.Entry<Long, Double> candidate : ranked) {
            long id = candidate.getKey();
            if (excluded.contains(id)) { limitations.add("LIBRARY_EXCLUDED"); continue; }
            if (dismissed.contains(id)) continue;
            outsideLibrary = true;
            Movie movie = catalog.get(id);
            CachedMovieList cached = cache.get(id);
            TmdbMovieSummary summary = summaries.get(id);
            Audience audience = audience(movie, cached, summary);
            // Floor: TMDB audience rating ≥ 6.5 with ≥ 300 votes. Unknown audience data is excluded as missing metadata.
            if (audience.average() == null) { limitations.add("METADATA_OMITTED"); missingMetadata = true; continue; }
            if (!RecommendationQualityPolicy.eligible(audience.average(), audience.votes())) continue;
            if (!validTitle(title(movie, cached, summary))) { limitations.add("METADATA_OMITTED"); missingMetadata = true; continue; }
            qualified.add(new QualifiedCandidate(id, candidate.getValue() * qualityFactor(audience, movie),
                    audience.average(), audience.votes()));
        }
        qualified.sort(BY_SCORE);
        // Acclaimed titles pass the same floor and are ranked by the quality factor alone.
        List<QualifiedCandidate> qualifiedAcclaimed = new ArrayList<>();
        for (long id : acclaimed.keySet()) {
            Movie movie = catalog.get(id);
            CachedMovieList cached = cache.get(id);
            TmdbMovieSummary summary = summaries.get(id);
            Audience audience = audience(movie, cached, summary);
            if (audience.average() == null || !RecommendationQualityPolicy.eligible(audience.average(), audience.votes())
                    || !validTitle(title(movie, cached, summary))) continue;
            qualifiedAcclaimed.add(new QualifiedCandidate(id, qualityFactor(audience, movie), audience.average(), audience.votes()));
        }
        qualifiedAcclaimed.sort(BY_SCORE);
        List<PersonalizedRecommendation> result = new ArrayList<>();
        for (QualifiedCandidate candidate : interleave(qualified, qualifiedAcclaimed)) {
            if (result.size() == MAX_STORED) break;
            long id = candidate.tmdbId();
            Movie movie = catalog.get(id);
            CachedMovieList cached = cache.get(id);
            TmdbMovieSummary summary = summaries.get(id);
            String title = title(movie, cached, summary);
            List<String> reasonTitles = contributions.getOrDefault(id, Map.of()).entrySet().stream()
                    .filter(e -> e.getValue() > 0 && watchedTitles.containsKey(e.getKey()))
                    .sorted(Map.Entry.<Long, Double>comparingByValue().reversed()
                            .thenComparing(Map.Entry.comparingByKey()))
                    .limit(2).map(e -> watchedTitles.get(e.getKey())).toList();
            String reason = acclaimed.containsKey(id) ? acclaimed.get(id).explanation()
                    : explanation(directorCandidates.get(id), reasonTitles, sources.getOrDefault(id, Set.of()));
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

    /**
     * Personal candidates in order, with an acclaimed title in every {@value #ACCLAIMED_EVERY}rd place.
     * An acclaimed place with no acclaimed title left takes the next personal one, and once personal
     * candidates run out the acclaimed ones fill the remaining places (AC04).
     */
    static <T> List<T> interleave(List<T> personal, List<T> acclaimed) {
        List<T> merged = new ArrayList<>(personal.size() + acclaimed.size());
        Iterator<T> p = personal.iterator();
        Iterator<T> a = acclaimed.iterator();
        while (p.hasNext() || a.hasNext()) {
            boolean acclaimedPlace = (merged.size() + 1) % ACCLAIMED_EVERY == 0;
            merged.add(a.hasNext() && (acclaimedPlace || !p.hasNext()) ? a.next() : p.next());
        }
        return merged;
    }

    /**
     * The director explanation wins when the director source reached the title (#38 decision): it names
     * the stronger, more specific signal. Otherwise the watched titles and sources that contributed most.
     */
    private String explanation(DirectorRecommendationSource.Candidate directorCandidate,
                               List<String> contributingWatchedTitles, Set<String> sourceNames) {
        if (directorCandidate != null) return directorCandidate.explanation();
        if (contributingWatchedTitles.isEmpty()) return null;
        return "Because you watched " + String.join(" and ", contributingWatchedTitles)
                + " (" + String.join(" and ", sourceNames) + ")";
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
