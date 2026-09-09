package com.movienight.backend.service;

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
                .personalRating(9)
                .status(MovieStatus.WATCHED)
                .build();

        when(userMovieEntryRepository.findByUserIdAndPersonalRatingIsNotNull(1L))
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

        // User already has Inception in library (not the neighbors)
        when(userMovieEntryRepository.findTmdbIdsByUserId(1L))
                .thenReturn(Set.of(27205L));

        when(movieRepository.findAll()).thenReturn(Collections.emptyList());

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        // Verify old recs deleted and new saved
        verify(personalizedRecommendationRepository).deleteByUserId(1L);
        verify(personalizedRecommendationRepository).saveAll(anyList());
        verify(userRepository).save(testUser);
        assertThat(testUser.isNeedsRecommendationRefresh()).isFalse();
    }
}
