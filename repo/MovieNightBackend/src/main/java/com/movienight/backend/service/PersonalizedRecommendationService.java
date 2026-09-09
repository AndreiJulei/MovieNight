package com.movienight.backend.service;

import com.movienight.backend.model.*;
import com.movienight.backend.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Service calculating personalized movie recommendations using item-item cosine similarity vectors.
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

    /**
     * Recalculate personalized recommendations for a single user.
     */
    @Transactional
    public void recomputeRecommendationsForUser(User user) {
        Long userId = user.getId();
        List<UserMovieEntry> ratedEntries = userMovieEntryRepository.findByUserIdAndPersonalRatingIsNotNull(userId);

        if (ratedEntries.isEmpty()) {
            personalizedRecommendationRepository.deleteByUserId(userId);
            user.setNeedsRecommendationRefresh(false);
            userRepository.save(user);
            return;
        }

        // 1. Center ratings around 5.5 midpoint (so ratings > 5.5 give positive boosts, < 5.5 give negative penalties)
        Map<Long, Double> userTmdbWeights = new HashMap<>();
        Map<Long, String> userRatedTitles = new HashMap<>();

        for (UserMovieEntry entry : ratedEntries) {
            Movie movie = entry.getMovie();
            if (movie != null && movie.getTmdbId() != null && entry.getPersonalRating() != null) {
                Long tmdbId = movie.getTmdbId();
                double weight = entry.getPersonalRating() - 5.5;
                userTmdbWeights.put(tmdbId, weight);
                userRatedTitles.put(tmdbId, movie.getTitle());
            }
        }

        if (userTmdbWeights.isEmpty()) {
            user.setNeedsRecommendationRefresh(false);
            userRepository.save(user);
            return;
        }

        // 2. Fetch precomputed top-30 neighbors for all movies user rated
        List<MovieSimilarity> neighbors = movieSimilarityRepository.findByTmdbIdIn(userTmdbWeights.keySet());

        // 3. Aggregate scores per candidate movie
        Map<Long, Double> candidateScores = new HashMap<>();
        Map<Long, String> candidateTopReason = new HashMap<>();
        Map<Long, Double> candidateMaxContribution = new HashMap<>();

        for (MovieSimilarity sim : neighbors) {
            Long sourceTmdbId = sim.getTmdbId();
            Long candidateTmdbId = sim.getNeighborTmdbId();
            Double simScore = sim.getScore();

            double userWeight = userTmdbWeights.getOrDefault(sourceTmdbId, 0.0);
            double contribution = userWeight * simScore;

            candidateScores.merge(candidateTmdbId, contribution, Double::sum);

            // Track strongest positive connection for human-readable reason
            if (contribution > candidateMaxContribution.getOrDefault(candidateTmdbId, -999.0)) {
                candidateMaxContribution.put(candidateTmdbId, contribution);
                String sourceTitle = userRatedTitles.get(sourceTmdbId);
                if (sourceTitle != null) {
                    candidateTopReason.put(candidateTmdbId, "Because you rated " + sourceTitle);
                }
            }
        }

        // 4. Drop movies user has already added/watched
        Set<Long> userLibraryTmdbIds = userMovieEntryRepository.findTmdbIdsByUserId(userId);
        for (Long seenTmdbId : userLibraryTmdbIds) {
            candidateScores.remove(seenTmdbId);
        }

        // 5. Rank candidates by aggregated score descending
        List<Map.Entry<Long, Double>> topCandidates = candidateScores.entrySet().stream()
                .filter(e -> e.getValue() > 0.0) // Only positive recommendations
                .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                .limit(50)
                .collect(Collectors.toList());

        // 6. Persist personalized recommendations
        personalizedRecommendationRepository.deleteByUserId(userId);

        if (!topCandidates.isEmpty()) {
            Set<Long> candidateTmdbIds = topCandidates.stream().map(Map.Entry::getKey).collect(Collectors.toSet());
            Map<Long, Movie> movieMap = movieRepository.findAll().stream()
                    .filter(m -> m.getTmdbId() != null && candidateTmdbIds.contains(m.getTmdbId()))
                    .collect(Collectors.toMap(Movie::getTmdbId, m -> m, (m1, m2) -> m1));

            List<PersonalizedRecommendation> recommendations = new ArrayList<>();
            int rank = 1;

            for (Map.Entry<Long, Double> entry : topCandidates) {
                Long tmdbId = entry.getKey();
                Double score = entry.getValue();
                Movie movie = movieMap.get(tmdbId);

                String title = movie != null ? movie.getTitle() : "Title #" + tmdbId;
                String posterPath = movie != null ? movie.getPosterUrl() : null;
                Double voteAverage = movie != null ? movie.getImdbRating() : null;

                recommendations.add(PersonalizedRecommendation.builder()
                        .user(user)
                        .tmdbId(tmdbId)
                        .title(title)
                        .posterPath(posterPath)
                        .voteAverage(voteAverage)
                        .score(Math.round(score * 100.0) / 100.0)
                        .rankOrder(rank++)
                        .build());
            }

            personalizedRecommendationRepository.saveAll(recommendations);
            log.info("Computed {} personalized recommendations for user {}", recommendations.size(), user.getUsername());
        }

        user.setNeedsRecommendationRefresh(false);
        userRepository.save(user);
    }
}
