package com.movienight.backend.service;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.external.TmdbPerson;
import com.movienight.backend.dto.external.TmdbSearchResponse;
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
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
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

    private static final long NOSFERATU = 426063L, THE_WITCH = 310131L, THE_LIGHTHOUSE = 503919L, THE_NORTHMAN = 639933L;
    private static final long EGGERS = 138781L;

    private UserMovieEntry watched(long tmdbId, String title, String director, Double rating) {
        return UserMovieEntry.builder().user(testUser).status(MovieStatus.WATCHED).personalRating(rating)
                .movie(Movie.builder().tmdbId(tmdbId).title(title).director(director).mediaType("MOVIE").build()).build();
    }

    private static TmdbSearchResponse.TmdbMovieSummary film(long id, String title) {
        TmdbSearchResponse.TmdbMovieSummary summary = new TmdbSearchResponse.TmdbMovieSummary();
        summary.setId(id);
        summary.setTitle(title);
        summary.setVoteAverage(7.4);
        summary.setVoteCount(5_000);
        return summary;
    }

    /** TMDB knows Robert Eggers as the director of Nosferatu and The Witch, with The Lighthouse and The Northman. */
    private void eggersOnTmdb() {
        when(tmdbClient.isConfigured()).thenReturn(true);
        lenient().when(tmdbClient.getMovieDirectors(anyLong())).thenReturn(List.of(new TmdbPerson(EGGERS, "Robert Eggers")));
        lenient().when(tmdbClient.getDirectedMovies(EGGERS)).thenReturn(List.of(film(NOSFERATU, "Nosferatu"),
                film(THE_WITCH, "The Witch"), film(THE_LIGHTHOUSE, "The Lighthouse"), film(THE_NORTHMAN, "The Northman")));
    }

    @SuppressWarnings("unchecked")
    private List<PersonalizedRecommendation> savedRecommendations() {
        ArgumentCaptor<List<PersonalizedRecommendation>> saved = ArgumentCaptor.forClass(List.class);
        verify(personalizedRecommendationRepository).saveAll(saved.capture());
        return saved.getValue();
    }

    @Test
    @DisplayName("DR01: two liked films by a director recommend their other films, explained by the director")
    void dr01_twoLikedFilmsByADirectorRecommendTheirOtherFilms() {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                watched(NOSFERATU, "Nosferatu", "Robert Eggers", 8.0),
                watched(THE_WITCH, "The Witch", "Robert Eggers", null)));
        eggersOnTmdb();

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        assertThat(savedRecommendations()).extracting(PersonalizedRecommendation::getTmdbId, PersonalizedRecommendation::getReason)
                .containsExactlyInAnyOrder(
                        tuple(THE_LIGHTHOUSE, "Because you liked 2 films by Robert Eggers"),
                        tuple(THE_NORTHMAN, "Because you liked 2 films by Robert Eggers"));
    }

    @Test
    @DisplayName("DR02: one liked film by a director adds no director candidates")
    void dr02_oneLikedFilmByADirectorAddsNothing() {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                watched(NOSFERATU, "Nosferatu", "Robert Eggers", 8.0),
                watched(THE_WITCH, "The Witch", "Robert Eggers", 6.9)));
        eggersOnTmdb();

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        verify(tmdbClient, never()).getDirectedMovies(anyLong());
        verify(personalizedRecommendationRepository, never()).saveAll(anyList());
    }

    @Test
    @DisplayName("DR03: a credits failure skips the director source and keeps the other recommendations")
    void dr03_creditsFailureKeepsTheOtherRecommendations() {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                watched(NOSFERATU, "Nosferatu", "Robert Eggers", 8.0),
                watched(THE_WITCH, "The Witch", "Robert Eggers", 8.0)));
        when(movieSimilarityRepository.findByTmdbIdIn(anySet())).thenReturn(List.of(
                MovieSimilarity.builder().tmdbId(NOSFERATU).neighborTmdbId(11L).score(0.8).build()));
        when(movieRepository.findAll()).thenReturn(List.of(
                Movie.builder().tmdbId(11L).title("Neighbour").mediaType("MOVIE").tmdbVoteAverage(7.4).tmdbVoteCount(5_000).build()));
        when(tmdbClient.isConfigured()).thenReturn(true);
        when(tmdbClient.getMovieDirectors(anyLong())).thenThrow(new IllegalStateException("Movie credits source unavailable"));

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        assertThat(savedRecommendationIds()).containsExactly(11L);
        assertThat(testUser.getPersonalRecommendationState()).isEqualTo("READY");
        assertThat(testUser.getPersonalRecommendationLimitations()).contains("DIRECTOR_SOURCE_UNAVAILABLE");
    }

    @Test
    @DisplayName("DR01: at equal quality, a director's film outranks the top TMDB recommendation")
    void dr01_directorFilmOutranksTheTopTmdbRecommendation() {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                watched(NOSFERATU, "Nosferatu", "Robert Eggers", 8.0),
                watched(THE_WITCH, "The Witch", "Robert Eggers", 8.0)));
        eggersOnTmdb();
        lenient().when(tmdbClient.getMovieRecommendations(eq(NOSFERATU), eq(1))).thenReturn(List.of(film(12L, "TMDB pick")));

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        List<Long> ids = savedRecommendationIds();
        assertThat(ids.indexOf(THE_LIGHTHOUSE)).isLessThan(ids.indexOf(12L));
        assertThat(ids.indexOf(THE_NORTHMAN)).isLessThan(ids.indexOf(12L));
    }

    @Test
    @DisplayName("DR01: the user's own liked films by the director are not reported as excluded candidates")
    void dr01_ownLikedFilmsAreNotReportedAsExcluded() {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                watched(NOSFERATU, "Nosferatu", "Robert Eggers", 8.0),
                watched(THE_WITCH, "The Witch", "Robert Eggers", 8.0)));
        eggersOnTmdb();

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        assertThat(testUser.getPersonalRecommendationLimitations()).doesNotContain("LIBRARY_EXCLUDED");
    }

    @Test
    @DisplayName("DR03: a filmography failure keeps the other recommendations and records the limitation")
    void dr03_filmographyFailureKeepsTheOtherRecommendations() {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                watched(NOSFERATU, "Nosferatu", "Robert Eggers", 8.0),
                watched(THE_WITCH, "The Witch", "Robert Eggers", 8.0)));
        when(movieSimilarityRepository.findByTmdbIdIn(anySet())).thenReturn(List.of(
                MovieSimilarity.builder().tmdbId(NOSFERATU).neighborTmdbId(11L).score(0.8).build()));
        when(movieRepository.findAll()).thenReturn(List.of(
                Movie.builder().tmdbId(11L).title("Neighbour").mediaType("MOVIE").tmdbVoteAverage(7.4).tmdbVoteCount(5_000).build()));
        when(tmdbClient.isConfigured()).thenReturn(true);
        when(tmdbClient.getMovieDirectors(anyLong())).thenReturn(List.of(new TmdbPerson(EGGERS, "Robert Eggers")));
        when(tmdbClient.getDirectedMovies(EGGERS)).thenThrow(new IllegalStateException("Person credits source unavailable"));

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        assertThat(savedRecommendationIds()).containsExactly(11L);
        assertThat(testUser.getPersonalRecommendationLimitations()).contains("DIRECTOR_SOURCE_UNAVAILABLE");
    }

    @Test
    @DisplayName("PD-20: a director's film below the quality floor is not recommended")
    void directorFilmBelowTheQualityFloorIsNotRecommended() {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                watched(NOSFERATU, "Nosferatu", "Robert Eggers", 8.0),
                watched(THE_WITCH, "The Witch", "Robert Eggers", 8.0)));
        when(tmdbClient.isConfigured()).thenReturn(true);
        when(tmdbClient.getMovieDirectors(anyLong())).thenReturn(List.of(new TmdbPerson(EGGERS, "Robert Eggers")));
        TmdbSearchResponse.TmdbMovieSummary obscureShort = film(77L, "Obscure short");
        obscureShort.setVoteCount(12);
        when(tmdbClient.getDirectedMovies(EGGERS)).thenReturn(List.of(film(THE_LIGHTHOUSE, "The Lighthouse"), obscureShort));

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        assertThat(savedRecommendationIds()).containsExactly(THE_LIGHTHOUSE);
    }

    @Test
    @DisplayName("PD-20: a title from both the director and TMDB adds both relevances and keeps the director explanation")
    void directorAndTmdbRelevanceAddUpWithTheDirectorExplanation() {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                watched(NOSFERATU, "Nosferatu", "Robert Eggers", 8.0),
                watched(THE_WITCH, "The Witch", "Robert Eggers", 8.0)));
        eggersOnTmdb();
        when(tmdbClient.getMovieRecommendations(anyLong(), eq(1))).thenAnswer(call ->
                call.getArgument(0).equals(NOSFERATU) ? List.of(film(THE_LIGHTHOUSE, "The Lighthouse")) : List.of());

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        List<PersonalizedRecommendation> saved = savedRecommendations();
        PersonalizedRecommendation lighthouse = saved.stream().filter(r -> r.getTmdbId() == THE_LIGHTHOUSE).findFirst().orElseThrow();
        PersonalizedRecommendation northman = saved.stream().filter(r -> r.getTmdbId() == THE_NORTHMAN).findFirst().orElseThrow();
        // Same quality data, so the score ratio is the relevance ratio: (2.0 director + 1.0 TMDB) / 2.0 director.
        assertThat(lighthouse.getScore() / northman.getScore()).isCloseTo(1.5, org.assertj.core.data.Offset.offset(1e-9));
        assertThat(lighthouse.getReason()).isEqualTo("Because you liked 2 films by Robert Eggers");
    }
}
