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
import static org.mockito.ArgumentMatchers.anyCollection;
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
    private DiscoverySnapshotRepository discoverySnapshotRepository;

    @Mock
    private PersonalizedRecommendationRepository personalizedRecommendationRepository;

    @Mock
    private PersonalizedRecommendationService personalizedRecommendationService;

    @Mock
    private TmdbClient tmdbClient;

    @Mock
    private MovieRepository movieRepository;

    @Mock
    private SuggestionScheduler suggestionScheduler;

    @Mock
    private UserLibraryExclusionService userLibraryExclusionService;

    @InjectMocks
    private SuggestionService suggestionService;

    private User testUser;

    @BeforeEach
    void setUp() {
        lenient().when(userLibraryExclusionService.getExcludedTmdbIds(any(), any())).thenReturn(Collections.emptySet());
        lenient().when(userLibraryExclusionService.normalizeMediaType(any())).thenAnswer(call -> {
            String s = call.getArgument(0);
            if (s == null) return "MOVIE";
            String up = s.trim().toUpperCase();
            if (up.contains("TV") || up.contains("SERIES")) return "TV";
            if (up.contains("ANIME")) return "ANIME";
            return "MOVIE";
        });
        testUser = User.builder()
                .id(1L)
                .username("john@example.com")
                .displayName("John")
                .needsRecommendationRefresh(false)
                .build();
    }

    @Test
    @DisplayName("getSuggestions should return 6 discovery rows and exclude user's own movies")
    void testGetSuggestions() {
        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(testUser));
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(Collections.emptyList());

        when(personalizedRecommendationService.movieCategory(testUser)).thenReturn(
                com.movienight.backend.dto.SuggestionCategoryResponse.builder().id("movies")
                    .movies(List.of(com.movienight.backend.dto.SuggestionMovieItem.builder()
                        .tmdbId(200L).title("Interstellar").mediaType("MOVIE").build())).build());

        // 2. Friends Consensus
        when(friendshipRepository.findAcceptedFriendIdsForUser(1L)).thenReturn(List.of(2L, 3L));
        // #33: both friends keep the default sharing of Watched and Watchlist.
        when(userRepository.findAllById(List.of(2L, 3L))).thenReturn(List.of(
                User.builder().id(2L).build(), User.builder().id(3L).build()));

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
        when(cachedMovieListRepository.findByMediaTypeAndListTypeOrderByRankOrderAsc("MOVIE", MovieListType.POPULAR))
                .thenReturn(List.of(popularItem));
        when(cachedMovieListRepository.findByMediaTypeAndListTypeOrderByRankOrderAsc("MOVIE", MovieListType.RECENT))
                .thenReturn(Collections.emptyList());
        when(cachedMovieListRepository.findByMediaTypeAndListTypeOrderByRankOrderAsc("MOVIE", MovieListType.UPCOMING))
                .thenReturn(Collections.emptyList());
        for (MovieListType shelf : List.of(MovieListType.POPULAR, MovieListType.RECENT, MovieListType.UPCOMING)) {
            when(discoverySnapshotRepository.findByMediaTypeAndListType("MOVIE", shelf))
                .thenReturn(Optional.of(DiscoverySnapshot.builder().mediaType("MOVIE").listType(shelf)
                    .updatedAt(java.time.LocalDateTime.now(java.time.ZoneOffset.UTC)).build()));
        }

        SuggestionsResponse response = suggestionService.getSuggestions("john@example.com");

        assertThat(response).isNotNull();
        assertThat(response.getCategories()).hasSize(6);

        // Check for-you category
        assertThat(response.getCategories().get(0).getId()).isEqualTo("for-you");
        assertThat(response.getCategories().get(0).getMovies()).hasSize(1);
        assertThat(response.getCategories().get(0).getMovies().get(0).getTitle()).isEqualTo("Interstellar");

        // Check friends category
        assertThat(response.getCategories().get(1).getId()).isEqualTo("friends");
        assertThat(response.getCategories().get(1).getMovies()).hasSize(1);
        assertThat(response.getCategories().get(1).getMovies().get(0).getTitle()).isEqualTo("Goodfellas");
    }

    @Test
    @DisplayName("getPersonalRecommendations should return watched-history movie candidates")
    void testGetPersonalRecommendationsCategoryAware() {
        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(testUser));
        when(personalizedRecommendationService.movieCategory(testUser)).thenReturn(
                com.movienight.backend.dto.SuggestionCategoryResponse.builder().id("movies")
                    .title("Personal movie recommendations")
                    .movies(List.of(com.movienight.backend.dto.SuggestionMovieItem.builder()
                        .tmdbId(200L).title("Inception").mediaType("MOVIE").build())).build());

        SuggestionsResponse response = suggestionService.getPersonalRecommendations("john@example.com");

        assertThat(response).isNotNull();
        // User only watched MOVIE, so only 1 row: Movie Recommendations!
        assertThat(response.getCategories()).hasSize(1);
        assertThat(response.getCategories().get(0).getId()).isEqualTo("movies");
        assertThat(response.getCategories().get(0).getTitle()).isEqualTo("Personal movie recommendations");
        assertThat(response.getCategories().get(0).getMovies()).hasSize(1);
        assertThat(response.getCategories().get(0).getMovies().get(0).getTitle()).isEqualTo("Inception");
    }

    @Test
    @DisplayName("getExploreMedia should return explore rows for movies")
    void testGetExploreMediaMovies() {
        CachedMovieList popular = CachedMovieList.builder()
                .mediaType("MOVIE")
                .listType(MovieListType.POPULAR)
                .tmdbId(500L)
                .title("The Dark Knight")
                .build();
        when(cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc("MOVIE"))
                .thenReturn(List.of(popular));

        SuggestionsResponse response = suggestionService.getExploreMedia("movies");
        assertThat(response).isNotNull();
        assertThat(response.getCategories()).isNotEmpty();
        assertThat(response.getCategories().get(0).getId()).isEqualTo("newest");
        assertThat(response.getCategories().get(1).getId()).isEqualTo("popular");
        assertThat(response.getCategories().get(1).getState()).isEqualTo("UNAVAILABLE");
        assertThat(response.getCategories().get(1).getMovies()).isEmpty();
    }

    @Test
    @DisplayName("SC03: an Explore card shows the IMDb and RT values the catalog holds, for titles outside the library")
    void sc03_exploreRowsCarryCatalogScores() {
        when(discoverySnapshotRepository.findByMediaType("MOVIE")).thenReturn(java.util.Arrays.stream(new MovieListType[] {
                        MovieListType.RECENT, MovieListType.POPULAR, MovieListType.TOP_RATED, MovieListType.UPCOMING})
                .map(type -> DiscoverySnapshot.builder().mediaType("MOVIE").listType(type)
                        .updatedAt(java.time.LocalDateTime.now(java.time.ZoneOffset.UTC)).build()).toList());
        when(cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc("MOVIE")).thenReturn(List.of(
                CachedMovieList.builder().mediaType("MOVIE").listType(MovieListType.TOP_RATED).tmdbId(500L).title("The Dark Knight").build(),
                CachedMovieList.builder().mediaType("MOVIE").listType(MovieListType.TOP_RATED).tmdbId(501L).title("Unscored").build()));
        when(movieRepository.findByResourceTypeAndTmdbIdIn(eq(ResourceType.MOVIE), anyCollection())).thenReturn(List.of(
                Movie.builder().tmdbId(500L).mediaType("MOVIE").title("The Dark Knight").imdbRating(9.0).rottenTomatoesRating(94).build()));

        SuggestionsResponse response = suggestionService.getExploreMedia("movies", "john@example.com");

        var topRated = response.getCategories().stream().filter(c -> c.getId().equals("top-rated")).findFirst().orElseThrow();
        assertThat(topRated.getMovies()).extracting(m -> m.getTmdbId(), m -> m.getImdbRating(), m -> m.getRottenTomatoesRating())
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(500L, 9.0, 94.0),
                        org.assertj.core.groups.Tuple.tuple(501L, null, null));
    }
}
