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
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
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

    @Mock
    private RecommendationDismissals dismissals;

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

    // ---- Refill (RF) and acclaimed (AC): recs-refill-and-acclaimed ----

    private static Movie catalogFilm(long id, String title) {
        return Movie.builder().tmdbId(id).title(title).mediaType("MOVIE").tmdbVoteAverage(7.4).tmdbVoteCount(5_000).build();
    }

    /** Inception watched; {@code count} neighbours 1..count in falling relevance, all clearing the floor. */
    private void rankedNeighbours(int count) {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                UserMovieEntry.builder().id(1L).user(testUser).movie(inception).personalRating(9.0).status(MovieStatus.WATCHED).build()));
        when(movieSimilarityRepository.findByTmdbIdIn(anySet())).thenReturn(java.util.stream.LongStream.rangeClosed(1, count)
                .mapToObj(id -> MovieSimilarity.builder().tmdbId(27205L).neighborTmdbId(id).score(1.0 - id * 0.001).build()).toList());
        when(movieRepository.findAll()).thenReturn(java.util.stream.LongStream.rangeClosed(1, count)
                .mapToObj(id -> catalogFilm(id, "Movie " + id)).toList());
        lenient().when(cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc("MOVIE")).thenReturn(Collections.emptyList());
    }

    private PersonalizedRecommendation storedRow(long id, int rank) {
        return PersonalizedRecommendation.builder().user(testUser).tmdbId(id).mediaType("MOVIE").title("Movie " + id)
                .voteAverage(7.4).audienceVoteCount(5_000).score(1.0).reason("Because you watched Inception (MovieLens similarity)")
                .rankOrder(rank).build();
    }

    /** A user whose stored list is current, so a read serves it without recomputing. */
    private void storedList(int rows) {
        testUser.setNeedsRecommendationRefresh(false);
        testUser.setPersonalRecommendationState("READY");
        when(personalizedRecommendationRepository.findByUserIdAndMediaTypeOrderByRankOrderAsc(1L, "MOVIE"))
                .thenReturn(java.util.stream.IntStream.rangeClosed(1, rows).mapToObj(i -> storedRow(i, i)).toList());
    }

    @Test
    @DisplayName("RF01: a recomputation stores up to 60 rows so dismissed titles have a reserve")
    void rf01_recomputationStoresSixtyRows() {
        rankedNeighbours(70);

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        assertThat(savedRecommendationIds()).hasSize(60).startsWith(1L, 2L, 3L).endsWith(60L);
    }

    @Test
    @DisplayName("RF01: a read serves the first 30 stored rows that are not dismissed, so a dismissal pulls in a new title")
    void rf01_readServesThirtyAndADismissalPullsInTheThirtyFirst() {
        storedList(60);
        when(dismissals.dismissedMovieIds(testUser)).thenReturn(Set.of(3L));

        var movies = personalizedRecommendationService.movieCategory(testUser).getMovies();

        assertThat(movies).hasSize(30);
        assertThat(movies).extracting(m -> m.getTmdbId()).doesNotContain(3L).contains(31L).doesNotContain(32L);
        verify(personalizedRecommendationRepository, never()).saveAll(anyList());
    }

    /** A stored list of {@code rows} titles 1..rows, of which {@code alreadyDismissed} were dismissed before. */
    private void storedListWithDismissals(int rows, Set<Long> alreadyDismissed) {
        storedList(rows);
        when(dismissals.dismissedMovieIds(testUser)).thenReturn(alreadyDismissed);
    }

    private static Set<Long> ids(long from, long to) {
        return java.util.stream.LongStream.rangeClosed(from, to).boxed().collect(java.util.stream.Collectors.toSet());
    }

    @Test
    @DisplayName("RF02: the dismissal that leaves fewer than 40 undismissed stored rows marks the user for recomputation")
    void rf02_dismissalCrossingBelowTheReserveMarksTheUser() {
        storedListWithDismissals(60, ids(1, 20)); // 40 undismissed before this dismissal

        personalizedRecommendationService.dismiss(testUser, 21L);

        verify(dismissals).dismiss(testUser, 21L);
        assertThat(testUser.isNeedsRecommendationRefresh()).isTrue();
        verify(userRepository).save(testUser);
    }

    @Test
    @DisplayName("RF02: a dismissal that keeps 40 undismissed stored rows does not mark the user")
    void rf02_dismissalAboveTheReserveDoesNotMarkTheUser() {
        storedListWithDismissals(60, ids(1, 19)); // 41 undismissed before, 40 after

        personalizedRecommendationService.dismiss(testUser, 20L);

        assertThat(testUser.isNeedsRecommendationRefresh()).isFalse();
        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("RF02 / #40 RM02: a list already below the reserve is not recomputed on every dismissal")
    void rf02_listAlreadyBelowTheReserveIsNotMarkedAgain() {
        storedListWithDismissals(35, Set.of()); // a small pool never reached the reserve

        personalizedRecommendationService.dismiss(testUser, 5L);

        assertThat(testUser.isNeedsRecommendationRefresh()).isFalse();
        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("RF02: dismissing a title that is not stored does not mark the user")
    void rf02_dismissingATitleOutsideTheStoredListDoesNotMarkTheUser() {
        storedListWithDismissals(60, ids(1, 20)); // 40 undismissed, unchanged by this dismissal

        personalizedRecommendationService.dismiss(testUser, 999L);

        assertThat(testUser.isNeedsRecommendationRefresh()).isFalse();
        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("RF03: TMDB recommendations are read for the top 5 liked seeds, pages 1 and 2")
    void rf03_tmdbRecommendationsForTopFiveSeedsTwoPages() {
        List<UserMovieEntry> history = new java.util.ArrayList<>();
        for (long id = 1; id <= 6; id++) {
            history.add(UserMovieEntry.builder().user(testUser).status(MovieStatus.WATCHED).personalRating(10.0 - id * 0.1)
                    .movie(Movie.builder().tmdbId(id).title("Seed " + id).mediaType("MOVIE").build()).build());
        }
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(history);
        when(tmdbClient.isConfigured()).thenReturn(true);
        when(tmdbClient.getMovieRecommendations(anyLong(), anyInt())).thenReturn(List.of());

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        for (long seed = 1; seed <= 5; seed++) {
            verify(tmdbClient).getMovieRecommendations(seed, 1);
            verify(tmdbClient).getMovieRecommendations(seed, 2);
        }
        verify(tmdbClient, never()).getMovieRecommendations(eq(6L), anyInt());
    }

    private static final int DRAMA = 18, CRIME = 80, THRILLER = 53, COMEDY = 35, HORROR = 27;

    private UserMovieEntry likedWithGenres(long tmdbId, String genres) {
        return UserMovieEntry.builder().user(testUser).status(MovieStatus.WATCHED).personalRating(8.0)
                .movie(Movie.builder().tmdbId(tmdbId).title("Liked " + tmdbId).genres(genres).mediaType("MOVIE").build()).build();
    }

    private static TmdbSearchResponse.TmdbMovieSummary acclaimedFilm(long id, int votes, Integer... genreIds) {
        TmdbSearchResponse.TmdbMovieSummary summary = film(id, "Acclaimed " + id);
        summary.setVoteAverage(8.4);
        summary.setVoteCount(votes);
        summary.setGenreIds(List.of(genreIds));
        return summary;
    }

    /**
     * Liked films counting drama 3, crime 2, comedy 1 and thriller 1: the top 3 genres are drama, crime and
     * comedy, which wins its tie with thriller alphabetically. Personal candidates are MovieLens neighbours
     * 1..personal, in that order.
     */
    private void likedDramaFanWithPersonalCandidates(int personal) {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                likedWithGenres(901L, "Drama, Crime"),
                likedWithGenres(902L, "Drama, Crime, Thriller"),
                likedWithGenres(903L, "Drama, Comedy")));
        when(movieSimilarityRepository.findByTmdbIdIn(anySet())).thenReturn(java.util.stream.LongStream.rangeClosed(1, personal)
                .mapToObj(id -> MovieSimilarity.builder().tmdbId(901L).neighborTmdbId(id).score(1.0 - id * 0.001).build()).toList());
        when(movieRepository.findAll()).thenReturn(java.util.stream.LongStream.rangeClosed(1, personal)
                .mapToObj(id -> catalogFilm(id, "Movie " + id)).toList());
        lenient().when(cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc("MOVIE")).thenReturn(Collections.emptyList());
        when(tmdbClient.isConfigured()).thenReturn(true);
        lenient().when(tmdbClient.getMovieRecommendations(anyLong(), anyInt())).thenReturn(List.of());
    }

    /** Acclaimed drama titles 1001..1000+count on TMDB, all clearing the floor. */
    private void acclaimedDramasOnTmdb(int count) {
        List<TmdbSearchResponse.TmdbMovieSummary> all = java.util.stream.LongStream.rangeClosed(1001, 1000 + count)
                .mapToObj(id -> acclaimedFilm(id, 9_000, DRAMA)).toList();
        when(tmdbClient.discoverAcclaimedMovies(anyString(), eq(3000), anyInt())).thenAnswer(call -> {
            int page = call.getArgument(2);
            return all.subList(Math.min(all.size(), (page - 1) * 20), Math.min(all.size(), page * 20));
        });
    }

    @Test
    @DisplayName("AC01: every third stored place holds an acclaimed title, at most 10 of the first 30")
    void ac01_everyThirdPlaceIsAcclaimed() {
        likedDramaFanWithPersonalCandidates(70);
        acclaimedDramasOnTmdb(40);

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        List<Long> ids = savedRecommendationIds();
        assertThat(ids).hasSize(60);
        for (int place = 1; place <= 30; place++) {
            boolean acclaimed = ids.get(place - 1) > 1000;
            assertThat(acclaimed).as("place %d", place).isEqualTo(place % 3 == 0);
        }
        assertThat(ids.subList(0, 30).stream().filter(id -> id > 1000)).hasSize(10);
        assertThat(ids.stream().filter(id -> id > 1000)).hasSize(20);
        // Personal titles keep their own order between the acclaimed places.
        assertThat(ids.subList(0, 5)).containsExactly(1L, 2L, 1001L, 3L, 4L);
    }

    @Test
    @DisplayName("AC02: acclaimed titles come from the 3 most liked genres, need 3000 votes and name the genre and provider")
    void ac02_topThreeGenresVoteMinimumAndExplanation() {
        likedDramaFanWithPersonalCandidates(0);
        when(tmdbClient.discoverAcclaimedMovies(anyString(), eq(3000), anyInt())).thenAnswer(call ->
                call.<Integer>getArgument(2) == 1 ? List.of(
                        acclaimedFilm(1001L, 9_000, HORROR, CRIME, DRAMA),
                        acclaimedFilm(1002L, 2_999, DRAMA),
                        acclaimedFilm(1003L, 9_000, HORROR),
                        acclaimedFilm(1004L, 9_000, COMEDY)) : List.of());

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        // Drama 3, crime 2; comedy and thriller tie at 1 and comedy wins alphabetically.
        verify(tmdbClient).discoverAcclaimedMovies(String.join("|", "" + DRAMA, "" + CRIME, "" + COMEDY), 3000, 1);
        verify(tmdbClient).discoverAcclaimedMovies(String.join("|", "" + DRAMA, "" + CRIME, "" + COMEDY), 3000, 2);
        assertThat(savedRecommendations()).extracting(PersonalizedRecommendation::getTmdbId, PersonalizedRecommendation::getReason)
                .containsExactlyInAnyOrder(
                        tuple(1001L, "Highly rated crime on TMDB"),
                        tuple(1004L, "Highly rated comedy on TMDB"));
    }

    @Test
    @DisplayName("AC03: no title twice; library and dismissed titles never appear as acclaimed")
    void ac03_noDuplicatesLibraryOrDismissed() {
        likedDramaFanWithPersonalCandidates(5);
        when(dismissals.dismissedMovieIds(testUser)).thenReturn(Set.of(1002L));
        when(tmdbClient.discoverAcclaimedMovies(anyString(), eq(3000), anyInt())).thenAnswer(call ->
                call.<Integer>getArgument(2) == 1 ? List.of(
                        acclaimedFilm(2L, 9_000, DRAMA),       // also a personal candidate
                        acclaimedFilm(901L, 9_000, DRAMA),     // in the library
                        acclaimedFilm(1002L, 9_000, DRAMA),    // dismissed
                        acclaimedFilm(1003L, 9_000, DRAMA),
                        acclaimedFilm(1003L, 9_000, DRAMA)) : List.of());

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        List<Long> ids = savedRecommendationIds();
        assertThat(ids).doesNotHaveDuplicates().doesNotContain(901L, 1002L).contains(2L, 1003L);
        assertThat(ids).hasSize(6);
    }

    @Test
    @DisplayName("AC03: an acclaimed title that resembles a disliked film (personal score below 0) gets no place")
    void ac03_acclaimedTitleResemblingADislikedFilmIsLeftOut() {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                likedWithGenres(901L, "Drama, Crime"),
                UserMovieEntry.builder().user(testUser).status(MovieStatus.WATCHED).personalRating(2.0)
                        .movie(Movie.builder().tmdbId(904L).title("Disliked 904").genres("Drama").mediaType("MOVIE").build()).build()));
        when(movieSimilarityRepository.findByTmdbIdIn(anySet())).thenReturn(List.of(
                MovieSimilarity.builder().tmdbId(901L).neighborTmdbId(1L).score(0.9).build(),
                MovieSimilarity.builder().tmdbId(904L).neighborTmdbId(1005L).score(0.9).build()));
        when(movieRepository.findAll()).thenReturn(List.of(catalogFilm(1L, "Movie 1")));
        lenient().when(cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc("MOVIE")).thenReturn(Collections.emptyList());
        when(tmdbClient.isConfigured()).thenReturn(true);
        lenient().when(tmdbClient.getMovieRecommendations(anyLong(), anyInt())).thenReturn(List.of());
        when(tmdbClient.discoverAcclaimedMovies(anyString(), eq(3000), anyInt())).thenAnswer(call ->
                call.<Integer>getArgument(2) == 1 ? List.of(
                        acclaimedFilm(1005L, 9_000, DRAMA),    // neighbour of the disliked film: score -3.15
                        acclaimedFilm(1006L, 9_000, DRAMA)) : List.of());

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        assertThat(savedRecommendationIds()).containsExactly(1L, 1006L);
    }

    @Test
    @DisplayName("AC04: when personal candidates run out, acclaimed titles fill the remaining places")
    void ac04_acclaimedFillsWhenPersonalRunsOut() {
        likedDramaFanWithPersonalCandidates(4);
        acclaimedDramasOnTmdb(40);

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        List<Long> ids = savedRecommendationIds();
        assertThat(ids.subList(0, 7)).containsExactly(1L, 2L, 1001L, 3L, 4L, 1002L, 1003L);
        assertThat(ids).hasSize(44);
    }

    @Test
    @DisplayName("AC05: a failed discover request publishes personal titles and records the limitation")
    void ac05_discoverFailurePublishesPersonalTitles() {
        likedDramaFanWithPersonalCandidates(3);
        when(tmdbClient.discoverAcclaimedMovies(anyString(), anyInt(), anyInt()))
                .thenThrow(new IllegalStateException("Acclaimed discovery source unavailable"));

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        assertThat(savedRecommendationIds()).containsExactly(1L, 2L, 3L);
        assertThat(testUser.getPersonalRecommendationState()).isEqualTo("READY");
        assertThat(testUser.getPersonalRecommendationLimitations()).contains("ACCLAIMED_SOURCE_UNAVAILABLE");
    }

    @Test
    @DisplayName("AC06: without watched history nothing is asked and the state stays NO_HISTORY")
    void ac06_noHistoryStaysNoHistory() {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());
        lenient().when(tmdbClient.isConfigured()).thenReturn(true);

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        verify(tmdbClient, never()).discoverAcclaimedMovies(anyString(), anyInt(), anyInt());
        assertThat(testUser.getPersonalRecommendationState()).isEqualTo("NO_HISTORY");
    }

    @Test
    @DisplayName("AC07: liked films without stored genres skip the acclaimed source silently")
    void ac07_noGenresSkipsTheSourceSilently() {
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(likedWithGenres(901L, null)));
        when(movieSimilarityRepository.findByTmdbIdIn(anySet())).thenReturn(List.of(
                MovieSimilarity.builder().tmdbId(901L).neighborTmdbId(1L).score(0.9).build()));
        when(movieRepository.findAll()).thenReturn(List.of(catalogFilm(1L, "Movie 1")));
        when(tmdbClient.isConfigured()).thenReturn(true);
        lenient().when(tmdbClient.getMovieRecommendations(anyLong(), anyInt())).thenReturn(List.of());

        personalizedRecommendationService.recomputeRecommendationsForUser(testUser);

        verify(tmdbClient, never()).discoverAcclaimedMovies(anyString(), anyInt(), anyInt());
        assertThat(savedRecommendationIds()).containsExactly(1L);
        assertThat(testUser.getPersonalRecommendationLimitations()).doesNotContain("ACCLAIMED_SOURCE_UNAVAILABLE");
    }
}
