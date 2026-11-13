package com.movienight.backend.service;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.model.*;
import com.movienight.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import org.mockito.ArgumentCaptor;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PersonalizedRecommendationServiceTest {

    @Mock
    private MovieSimilarityRepository movieSimilarityRepository;

    @Mock
    private UserMovieEntryRepository userMovieEntryRepository;

    @Mock
    private PersonalizedRecommendationRepository personalizedRecommendationRepository;

    @Mock
    private MovieRepository movieRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private TmdbClient tmdbClient;

    @Mock
    private CachedMovieListRepository cachedMovieListRepository;

    @Mock
    private RecommendationMaintenanceService recommendationMaintenanceService;

    @Mock
    private RecommendationRatingEnricher recommendationRatingEnricher;

    @InjectMocks
    private PersonalizedRecommendationService personalizedRecommendationService;

    private User testUser;
    private Movie inception;

    @BeforeEach
    void setUp() {
        testUser = User.builder()
                .id(1L)
                .username("john@example.com")
                .displayName("John")
                .needsRecommendationRefresh(true)
                .build();

        inception = Movie.builder()
                .id(100L)
                .tmdbId(27205L)
                .title("Inception")
                .mediaType("MOVIE")
                .build();
    }

    @Test
    @DisplayName("recomputeRecommendationsForUser should calculate scores, filter seen movies, and update flag")
    void testRecomputeRecommendations() {
        // User rated Inception 9/10 -> weight = (9 - 5.5) = +3.5
        UserMovieEntry entry = UserMovieEntry.builder()
                .id(1L)
                .user(testUser)
                .movie(inception)
                .personalRating(9.0)
                .status(MovieStatus.WATCHED)
                .build();

        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L))
                .thenReturn(List.of(entry));

        // Inception has 2 neighbors: Interstellar (157336, sim=0.8) and Shutter Island (11324, sim=0.7)
        MovieSimilarity sim1 = MovieSimilarity.builder()
                .tmdbId(27205L)
                .neighborTmdbId(157336L)
                .score(0.8)
                .build();

        MovieSimilarity sim2 = MovieSimilarity.builder()
                .tmdbId(27205L)
                .neighborTmdbId(11324L)
                .score(0.7)
                .build();

        when(movieSimilarityRepository.findByTmdbIdIn(anySet()))
                .thenReturn(List.of(sim1, sim2));

        when(movieRepository.findAll()).thenReturn(List.of(
                Movie.builder().tmdbId(157336L).title("Interstellar").mediaType("MOVIE")
                        .tmdbVoteAverage(8.5).tmdbVoteCount(38_000).build(),
                Movie.builder().tmdbId(11324L).title("Shutter Island").mediaType("MOVIE")
                        .tmdbVoteAverage(8.2).tmdbVoteCount(25_000).build()));
        when(cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc("MOVIE"))
                .thenReturn(Collections.emptyList());

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        // Verify old recs deleted and new saved
        verify(personalizedRecommendationRepository).deleteByUserId(1L);
        verify(personalizedRecommendationRepository).saveAll(anyList());
        verify(userRepository).save(testUser);
        assertThat(testUser.isNeedsRecommendationRefresh()).isFalse();
    }

    /** Inception watched and rated 9; each given neighbour is equally similar to it. */
    private void watchedInceptionWithEquallySimilarNeighbours(Long... neighbours) {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                UserMovieEntry.builder().id(1L).user(testUser).movie(inception)
                        .personalRating(9.0).status(MovieStatus.WATCHED).build()));
        when(movieSimilarityRepository.findByTmdbIdIn(anySet())).thenReturn(java.util.Arrays.stream(neighbours)
                .map(id -> MovieSimilarity.builder().tmdbId(27205L).neighborTmdbId(id).score(0.8).build()).toList());
        when(cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc("MOVIE")).thenReturn(Collections.emptyList());
    }

    @SuppressWarnings("unchecked")
    private List<Long> savedRecommendationIds() {
        ArgumentCaptor<List<PersonalizedRecommendation>> saved = ArgumentCaptor.forClass(List.class);
        verify(personalizedRecommendationRepository).saveAll(saved.capture());
        return saved.getValue().stream().map(PersonalizedRecommendation::getTmdbId).toList();
    }

    @Test
    @DisplayName("PR01: candidates below the TMDB floor or without audience data never appear")
    void pr01_floorExcludesLowRatedFewVotesAndUnknownCandidates() {
        watchedInceptionWithEquallySimilarNeighbours(1L, 2L, 3L, 4L);
        when(movieRepository.findAll()).thenReturn(List.of(
                Movie.builder().tmdbId(1L).title("Well regarded").mediaType("MOVIE").tmdbVoteAverage(7.6).tmdbVoteCount(4_000).build(),
                Movie.builder().tmdbId(2L).title("Low rated").mediaType("MOVIE").tmdbVoteAverage(5.9).tmdbVoteCount(9_000).build(),
                Movie.builder().tmdbId(3L).title("Few votes").mediaType("MOVIE").tmdbVoteAverage(8.9).tmdbVoteCount(40).build(),
                Movie.builder().tmdbId(4L).title("No audience data").mediaType("MOVIE").build()));

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        assertThat(savedRecommendationIds()).containsExactly(1L);
        assertThat(testUser.getPersonalRecommendationState()).isEqualTo("READY");
    }

    @Test
    @DisplayName("PR01: when the floor removes every candidate, fewer (zero) results are shown, not a lowered floor")
    void pr01_floorRemovingEverythingShowsNothing() {
        watchedInceptionWithEquallySimilarNeighbours(2L);
        when(movieRepository.findAll()).thenReturn(List.of(
                Movie.builder().tmdbId(2L).title("Low rated").mediaType("MOVIE").tmdbVoteAverage(5.9).tmdbVoteCount(9_000).build()));

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        verify(personalizedRecommendationRepository, never()).saveAll(anyList());
        assertThat(testUser.getPersonalRecommendationState()).isEqualTo("INSUFFICIENT_COVERAGE");
    }

    @Test
    @DisplayName("PR02: between equally relevant candidates, high on IMDb and Rotten Tomatoes ranks first")
    void pr02_candidateRatedWellOnImdbAndRottenTomatoesOutranksAnEquallyRelevantOne() {
        watchedInceptionWithEquallySimilarNeighbours(10L, 20L);
        when(movieRepository.findAll()).thenReturn(List.of(
                Movie.builder().tmdbId(10L).title("Neither").mediaType("MOVIE").tmdbVoteAverage(7.4).tmdbVoteCount(5_000).build(),
                Movie.builder().tmdbId(20L).title("Acclaimed").mediaType("MOVIE").tmdbVoteAverage(7.4).tmdbVoteCount(5_000)
                        .imdbRating(7.6).rottenTomatoesRating(91).build()));

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        assertThat(savedRecommendationIds()).containsExactly(20L, 10L);
    }

    @Test
    @DisplayName("Enrichment is offered the non-library candidates that may clear the floor, most relevant first")
    void enrichmentReceivesPossiblyEligibleCandidatesInRelevanceOrder() {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                UserMovieEntry.builder().id(1L).user(testUser).movie(inception).personalRating(9.0).status(MovieStatus.WATCHED).build()));
        when(movieSimilarityRepository.findByTmdbIdIn(anySet())).thenReturn(List.of(
                MovieSimilarity.builder().tmdbId(27205L).neighborTmdbId(5L).score(0.4).build(),
                MovieSimilarity.builder().tmdbId(27205L).neighborTmdbId(6L).score(0.9).build(),
                MovieSimilarity.builder().tmdbId(27205L).neighborTmdbId(7L).score(0.7).build()));
        when(cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc("MOVIE")).thenReturn(List.of(
                CachedMovieList.builder().tmdbId(7L).title("Known low").mediaType("MOVIE").voteAverage(5.0).voteCount(900).build()));
        when(movieRepository.findAll()).thenReturn(List.of());

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        verify(recommendationRatingEnricher).enrich(List.of(6L, 5L));
    }
}
