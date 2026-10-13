package com.movienight.backend.service;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.external.TmdbSearchResponse;
import com.movienight.backend.model.*;
import com.movienight.backend.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Service calculating personalized movie, TV series, and anime recommendations
 * using item-item cosine similarity vectors and live TMDB recommendation algorithms.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PersonalizedRecommendationService {

    private final MovieSimilarityRepository movieSimilarityRepository;
    private final UserMovieEntryRepository userMovieEntryRepository;
    private final PersonalizedRecommendationRepository personalizedRecommendationRepository;
    private final MovieRepository movieRepository;
    private final UserRepository userRepository;
    private final TmdbClient tmdbClient;
    private final CachedMovieListRepository cachedMovieListRepository;

    /**
     * Recalculate personalized recommendations for a single user across Movies, TV Series, and Anime.
     * Category-aware rule:
     * - Only recommend Movies if user has watched >= 1 movie
     * - Only recommend TV Series if user has watched >= 1 TV show
     * - Only recommend Anime if user has watched >= 1 anime
     * - Never recommend a category if user watched 0 in it
     */
    @Transactional
    public void recomputeRecommendationsForUser(User user) {
        Long userId = user.getId();
        List<UserMovieEntry> userEntries = userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(userId);

        // Filter watched entries (or entries with explicit personal rating)
        List<UserMovieEntry> activeEntries = userEntries.stream()
                .filter(e -> e.getStatus() == MovieStatus.WATCHED || e.getPersonalRating() != null)
                .toList();

        if (activeEntries.isEmpty()) {
            personalizedRecommendationRepository.deleteByUserId(userId);
            user.setNeedsRecommendationRefresh(false);
            userRepository.save(user);
            return;
        }

        Set<Long> userLibraryTmdbIds = userMovieEntryRepository.findTmdbIdsByUserId(userId);
        List<PersonalizedRecommendation> allRecs = new ArrayList<>();

        // 1. Group active entries by category
        List<UserMovieEntry> movieEntries = activeEntries.stream()
                .filter(e -> e.getMovie() != null && (e.getMovie().getMediaType() == null || "MOVIE".equalsIgnoreCase(e.getMovie().getMediaType())))
                .toList();

        List<UserMovieEntry> tvEntries = activeEntries.stream()
                .filter(e -> e.getMovie() != null && "TV".equalsIgnoreCase(e.getMovie().getMediaType()))
                .toList();

        List<UserMovieEntry> animeEntries = activeEntries.stream()
                .filter(e -> e.getMovie() != null && "ANIME".equalsIgnoreCase(e.getMovie().getMediaType()))
                .toList();

        // 2. Movie Recommendations (only if user has watched >= 1 movie)
        if (!movieEntries.isEmpty()) {
            List<PersonalizedRecommendation> movieRecs = computeMovieRecommendations(user, movieEntries, userLibraryTmdbIds);
            allRecs.addAll(movieRecs);
        }

        // 3. TV Series Recommendations (only if user has watched >= 1 TV show)
        if (!tvEntries.isEmpty()) {
            List<PersonalizedRecommendation> tvRecs = computeTvRecommendations(user, tvEntries, userLibraryTmdbIds, "TV");
            allRecs.addAll(tvRecs);
        }

        // 4. Anime Recommendations (only if user has watched >= 1 anime)
        if (!animeEntries.isEmpty()) {
            List<PersonalizedRecommendation> animeRecs = computeTvRecommendations(user, animeEntries, userLibraryTmdbIds, "ANIME");
            allRecs.addAll(animeRecs);
        }

        // Save all recommendations
        personalizedRecommendationRepository.deleteByUserId(userId);
        if (!allRecs.isEmpty()) {
            personalizedRecommendationRepository.saveAll(allRecs);
            log.info("Saved {} personalized recommendations for user {}", allRecs.size(), user.getUsername());
        }

        user.setNeedsRecommendationRefresh(false);
        userRepository.save(user);
    }

    private List<PersonalizedRecommendation> computeMovieRecommendations(
            User user,
            List<UserMovieEntry> movieEntries,
            Set<Long> userLibraryTmdbIds
    ) {
        Map<Long, Double> userTmdbWeights = new HashMap<>();
        for (UserMovieEntry entry : movieEntries) {
            Movie movie = entry.getMovie();
            if (movie != null && movie.getTmdbId() != null) {
                double rating = entry.getPersonalRating() != null ? entry.getPersonalRating() : 7.0;
                userTmdbWeights.put(movie.getTmdbId(), rating - 5.5);
            }
        }

        Map<Long, Double> candidateScores = new HashMap<>();

        // MovieLens item-item cosine similarity vectors
        if (!userTmdbWeights.isEmpty()) {
            List<MovieSimilarity> neighbors = movieSimilarityRepository.findByTmdbIdIn(userTmdbWeights.keySet());
            if (neighbors != null) {
                for (MovieSimilarity sim : neighbors) {
                    Long sourceTmdbId = sim.getTmdbId();
                    Long candidateTmdbId = sim.getNeighborTmdbId();
                    double weight = userTmdbWeights.getOrDefault(sourceTmdbId, 0.0);
                    candidateScores.merge(candidateTmdbId, weight * sim.getScore(), Double::sum);
                }
            }
        }

        // TMDB live recommendations for highest weighted movies
        if (tmdbClient.isConfigured()) {
            List<Long> topRatedSourceIds = userTmdbWeights.entrySet().stream()
                    .filter(e -> e.getValue() > 0)
                    .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                    .limit(3)
                    .map(Map.Entry::getKey)
                    .toList();

            for (Long sourceTmdbId : topRatedSourceIds) {
                List<TmdbSearchResponse.TmdbMovieSummary> tmdbRecs = tmdbClient.getMovieRecommendations(sourceTmdbId, 1);
                if (tmdbRecs != null) {
                    for (int i = 0; i < tmdbRecs.size(); i++) {
                        TmdbSearchResponse.TmdbMovieSummary rec = tmdbRecs.get(i);
                        if (rec.getId() != null) {
                            double decayScore = Math.max(0.1, 1.0 - (i * 0.04));
                            candidateScores.merge(rec.getId(), decayScore, Double::sum);
                        }
                    }
                }
            }
        }

        // Exclude user library
        for (Long seenId : userLibraryTmdbIds) {
            candidateScores.remove(seenId);
        }

        List<Map.Entry<Long, Double>> topCandidates = candidateScores.entrySet().stream()
                .filter(e -> e.getValue() > 0.0)
                .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                .limit(30)
                .toList();

        if (topCandidates.isEmpty()) {
            return Collections.emptyList();
        }

        Set<Long> candidateTmdbIds = topCandidates.stream().map(Map.Entry::getKey).collect(Collectors.toSet());
        Map<Long, Movie> movieMap = movieRepository.findAll().stream()
                .filter(m -> m.getTmdbId() != null && candidateTmdbIds.contains(m.getTmdbId()))
                .collect(Collectors.toMap(Movie::getTmdbId, m -> m, (m1, m2) -> m1));

        Map<Long, CachedMovieList> cachedMap = cachedMovieListRepository.findAll().stream()
                .filter(c -> c.getTmdbId() != null && candidateTmdbIds.contains(c.getTmdbId()))
                .collect(Collectors.toMap(CachedMovieList::getTmdbId, c -> c, (c1, c2) -> c1));

        List<PersonalizedRecommendation> result = new ArrayList<>();
        int rank = 1;

        for (Map.Entry<Long, Double> entry : topCandidates) {
            Long tmdbId = entry.getKey();
            Double score = entry.getValue();
            Movie movie = movieMap.get(tmdbId);
            CachedMovieList cached = cachedMap.get(tmdbId);

            String title = movie != null ? movie.getTitle() : (cached != null ? cached.getTitle() : "Title #" + tmdbId);
            String posterPath = movie != null ? movie.getPosterUrl() : (cached != null ? cached.getPosterPath() : null);
            Double voteAverage = movie != null ? movie.getImdbRating() : (cached != null ? cached.getVoteAverage() : null);

            result.add(PersonalizedRecommendation.builder()
                    .user(user)
                    .tmdbId(tmdbId)
                    .mediaType("MOVIE")
                    .title(title)
                    .posterPath(posterPath)
                    .voteAverage(voteAverage)
                    .score(Math.round(score * 100.0) / 100.0)
                    .rankOrder(rank++)
                    .build());
        }

        return result;
    }

    private List<PersonalizedRecommendation> computeTvRecommendations(
            User user,
            List<UserMovieEntry> entries,
            Set<Long> userLibraryTmdbIds,
            String mediaType
    ) {
        Map<Long, Double> userTmdbWeights = new HashMap<>();
        for (UserMovieEntry entry : entries) {
            Movie movie = entry.getMovie();
            if (movie != null && movie.getTmdbId() != null) {
                double rating = entry.getPersonalRating() != null ? entry.getPersonalRating() : 7.0;
                userTmdbWeights.put(movie.getTmdbId(), rating - 5.5);
            }
        }

        Map<Long, Double> candidateScores = new HashMap<>();
        Map<Long, TmdbSearchResponse.TmdbMovieSummary> candidateSummaryMap = new HashMap<>();

        if (tmdbClient.isConfigured()) {
            List<Long> topRatedSourceIds = userTmdbWeights.entrySet().stream()
                    .filter(e -> e.getValue() > 0)
                    .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                    .limit(3)
                    .map(Map.Entry::getKey)
                    .toList();

            for (Long sourceTmdbId : topRatedSourceIds) {
                List<TmdbSearchResponse.TmdbMovieSummary> tmdbRecs = tmdbClient.getTvRecommendations(sourceTmdbId, 1);
                if (tmdbRecs != null) {
                    for (int i = 0; i < tmdbRecs.size(); i++) {
                        TmdbSearchResponse.TmdbMovieSummary rec = tmdbRecs.get(i);
                        if (rec.getId() != null) {
                            double decayScore = Math.max(0.1, 1.0 - (i * 0.04));
                            candidateScores.merge(rec.getId(), decayScore, Double::sum);
                            candidateSummaryMap.put(rec.getId(), rec);
                        }
                    }
                }
            }
        }

        // If no TMDB recommendations, or for additional candidates, take top-rated items from cache
        List<CachedMovieList> cachedCandidates = cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc(mediaType);
        if (cachedCandidates != null) {
            for (CachedMovieList cached : cachedCandidates) {
                if (cached.getTmdbId() != null && !candidateScores.containsKey(cached.getTmdbId())) {
                    candidateScores.put(cached.getTmdbId(), 0.5);
                }
            }
        }

        // Exclude user library
        for (Long seenId : userLibraryTmdbIds) {
            candidateScores.remove(seenId);
        }

        List<Map.Entry<Long, Double>> topCandidates = candidateScores.entrySet().stream()
                .filter(e -> e.getValue() > 0.0)
                .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                .limit(30)
                .toList();

        if (topCandidates.isEmpty()) {
            return Collections.emptyList();
        }

        Set<Long> candidateTmdbIds = topCandidates.stream().map(Map.Entry::getKey).collect(Collectors.toSet());
        Map<Long, Movie> movieMap = movieRepository.findAll().stream()
                .filter(m -> m.getTmdbId() != null && candidateTmdbIds.contains(m.getTmdbId()))
                .collect(Collectors.toMap(Movie::getTmdbId, m -> m, (m1, m2) -> m1));

        Map<Long, CachedMovieList> cachedMap = cachedCandidates != null ? cachedCandidates.stream()
                .filter(c -> c.getTmdbId() != null && candidateTmdbIds.contains(c.getTmdbId()))
                .collect(Collectors.toMap(CachedMovieList::getTmdbId, c -> c, (c1, c2) -> c1)) : Collections.emptyMap();

        List<PersonalizedRecommendation> result = new ArrayList<>();
        int rank = 1;

        for (Map.Entry<Long, Double> entry : topCandidates) {
            Long tmdbId = entry.getKey();
            Double score = entry.getValue();
            Movie movie = movieMap.get(tmdbId);
            CachedMovieList cached = cachedMap.get(tmdbId);
            TmdbSearchResponse.TmdbMovieSummary summary = candidateSummaryMap.get(tmdbId);

            String title = movie != null ? movie.getTitle() :
                    (cached != null ? cached.getTitle() : (summary != null ? summary.getEffectiveTitle() : "Title #" + tmdbId));
            String posterPath = movie != null ? movie.getPosterUrl() :
                    (cached != null ? cached.getPosterPath() : (summary != null ? summary.getPosterPath() : null));
            Double voteAverage = movie != null ? movie.getImdbRating() :
                    (cached != null ? cached.getVoteAverage() : (summary != null ? summary.getVoteAverage() : null));

            result.add(PersonalizedRecommendation.builder()
                    .user(user)
                    .tmdbId(tmdbId)
                    .mediaType(mediaType)
                    .title(title)
                    .posterPath(posterPath)
                    .voteAverage(voteAverage)
                    .score(Math.round(score * 100.0) / 100.0)
                    .rankOrder(rank++)
                    .build());
        }

        return result;
    }
}
