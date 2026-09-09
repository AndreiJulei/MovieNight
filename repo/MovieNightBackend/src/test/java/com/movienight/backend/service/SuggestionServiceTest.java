package com.movienight.backend.service;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.FriendsConsensusProjection;
import com.movienight.backend.dto.SuggestionsResponse;
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
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SuggestionServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private UserMovieEntryRepository userMovieEntryRepository;

    @Mock
    private FriendshipRepository friendshipRepository;

    @Mock
    private CachedMovieListRepository cachedMovieListRepository;

    @Mock
    private PersonalizedRecommendationRepository personalizedRecommendationRepository;

    @Mock
    private PersonalizedRecommendationService personalizedRecommendationService;

    @Mock
    private TmdbClient tmdbClient;

    @InjectMocks
    private SuggestionService suggestionService;

    private User testUser;

    @BeforeEach
    void setUp() {
        testUser = User.builder()
                .id(1L)
                .username("john@example.com")
                .displayName("John")
                .needsRecommendationRefresh(false)
                .build();
    }

    @Test
    @DisplayName("getSuggestions should return 5 discovery rows and exclude user's own movies")
    void testGetSuggestions() {
        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(testUser));
        when(userMovieEntryRepository.findTmdbIdsByUserId(1L)).thenReturn(Set.of(100L));

        // 1. Personalized
        PersonalizedRecommendation rec = PersonalizedRecommendation.builder()
                .tmdbId(200L)
                .title("Interstellar")
                .score(8.5)
                .build();
        when(personalizedRecommendationRepository.findByUserIdOrderByRankOrderAsc(1L))
                .thenReturn(List.of(rec));

        // 2. Friends Consensus
        when(friendshipRepository.findAllFriendIdsForUser(1L)).thenReturn(List.of(2L, 3L));

        FriendsConsensusProjection consensusMock = mock(FriendsConsensusProjection.class);
        when(consensusMock.getTmdbId()).thenReturn(300L);
        when(consensusMock.getTitle()).thenReturn("Goodfellas");
        when(consensusMock.getAvgRating()).thenReturn(9.0);
        when(consensusMock.getFriendsCount()).thenReturn(2L);

        when(userMovieEntryRepository.findFriendsConsensusWatched(List.of(2L, 3L), 1L))
                .thenReturn(List.of(consensusMock));
        when(userMovieEntryRepository.findFriendsWatchlistMovies(List.of(2L, 3L), 1L))
                .thenReturn(Collections.emptyList());

        // 3. Discover rows
        CachedMovieList popularItem = CachedMovieList.builder()
                .listType(MovieListType.POPULAR)
                .tmdbId(400L)
                .title("Dune")
                .rankOrder(1)
                .build();
        when(cachedMovieListRepository.findByListTypeOrderByRankOrderAsc(MovieListType.POPULAR))
                .thenReturn(List.of(popularItem));
        when(cachedMovieListRepository.findByListTypeOrderByRankOrderAsc(MovieListType.RECENT))
                .thenReturn(Collections.emptyList());
        when(cachedMovieListRepository.findByListTypeOrderByRankOrderAsc(MovieListType.UPCOMING))
                .thenReturn(Collections.emptyList());

        SuggestionsResponse response = suggestionService.getSuggestions("john@example.com");

        assertThat(response).isNotNull();
        assertThat(response.getCategories()).hasSize(5);

        // Check for-you category
        assertThat(response.getCategories().get(0).getId()).isEqualTo("for-you");
        assertThat(response.getCategories().get(0).getMovies()).hasSize(1);
        assertThat(response.getCategories().get(0).getMovies().get(0).getTitle()).isEqualTo("Interstellar");

        // Check friends category
        assertThat(response.getCategories().get(1).getId()).isEqualTo("friends");
        assertThat(response.getCategories().get(1).getMovies()).hasSize(1);
        assertThat(response.getCategories().get(1).getMovies().get(0).getTitle()).isEqualTo("Goodfellas");
    }
}
