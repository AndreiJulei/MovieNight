package com.movienight.backend.service;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.external.TmdbPerson;
import com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary;
import com.movienight.backend.model.Movie;
import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.model.UserMovieEntry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.LongStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/** Same-director candidates (PD-20, #38): which directors qualify and what their films are worth. */
@ExtendWith(MockitoExtension.class)
class DirectorRecommendationSourceTest {

    @Mock
    private TmdbClient tmdbClient;

    private DirectorRecommendationSource source;

    @BeforeEach
    void setUp() {
        source = new DirectorRecommendationSource(tmdbClient);
    }

    private static UserMovieEntry liked(long tmdbId) {
        return UserMovieEntry.builder().status(MovieStatus.WATCHED).personalRating(8.0)
                .movie(Movie.builder().tmdbId(tmdbId).title("Film " + tmdbId).mediaType("MOVIE").build()).build();
    }

    private static TmdbMovieSummary film(long id) {
        TmdbMovieSummary summary = new TmdbMovieSummary();
        summary.setId(id);
        return summary;
    }

    /** {@code director} directed the liked films {@code likedIds} and, on TMDB, the film {@code otherFilm}. */
    private void directed(TmdbPerson director, long otherFilm, long... likedIds) {
        for (long likedId : likedIds) lenient().when(tmdbClient.getMovieDirectors(likedId)).thenReturn(List.of(director));
        lenient().when(tmdbClient.getDirectedMovies(director.id())).thenReturn(List.of(film(otherFilm)));
    }

    private static List<UserMovieEntry> likedFilms(long... ids) {
        return LongStream.of(ids).mapToObj(DirectorRecommendationSourceTest::liked).toList();
    }

    @Test
    @DisplayName("PD-20: at most three directors are used, most liked films first, ties by name")
    void atMostThreeDirectorsMostLikedFirstTiesByName() {
        directed(new TmdbPerson(1, "Zoe"), 101, 11, 12, 13);
        directed(new TmdbPerson(2, "Bo"), 102, 21, 22);
        directed(new TmdbPerson(3, "Al"), 103, 31, 32);
        directed(new TmdbPerson(4, "Cy"), 104, 41, 42);

        DirectorRecommendationSource.Result result =
                source.collect(likedFilms(11, 12, 13, 21, 22, 31, 32, 41, 42), Set.of());

        verify(tmdbClient, never()).getDirectedMovies(4L);
        assertThat(result.candidates().keySet()).containsExactly(101L, 103L, 102L);
        assertThat(result.unavailable()).isFalse();
    }

    @Test
    @DisplayName("PD-20: relevance is 1.0 per liked film, counting at most three")
    void relevanceCountsAtMostThreeLikedFilms() {
        directed(new TmdbPerson(1, "Two"), 101, 11, 12);
        directed(new TmdbPerson(2, "Four"), 102, 21, 22, 23, 24);

        DirectorRecommendationSource.Result result = source.collect(likedFilms(11, 12, 21, 22, 23, 24), Set.of());

        assertThat(result.candidates().get(101L).relevance()).isEqualTo(2.0);
        assertThat(result.candidates().get(102L).relevance()).isEqualTo(3.0);
        assertThat(result.candidates().get(102L).explanation()).isEqualTo("Because you liked 4 films by Four");
    }

    @Test
    @DisplayName("DR02: one liked film by a director qualifies nobody")
    void oneLikedFilmQualifiesNobody() {
        directed(new TmdbPerson(1, "Robert Eggers"), 101, 11);

        assertThat(source.collect(likedFilms(11), Set.of()).candidates()).isEmpty();
        verify(tmdbClient, never()).getDirectedMovies(anyLong());
    }

    @Test
    @DisplayName("PD-20: every co-director of a liked film is credited with it")
    void coDirectorsAreEachCredited() {
        TmdbPerson joel = new TmdbPerson(1, "Joel Coen"), ethan = new TmdbPerson(2, "Ethan Coen");
        when(tmdbClient.getMovieDirectors(11L)).thenReturn(List.of(joel, ethan));
        when(tmdbClient.getMovieDirectors(12L)).thenReturn(List.of(joel, ethan));
        when(tmdbClient.getDirectedMovies(1L)).thenReturn(List.of(film(101)));
        when(tmdbClient.getDirectedMovies(2L)).thenReturn(List.of(film(101), film(102)));

        DirectorRecommendationSource.Result result = source.collect(likedFilms(11, 12), Set.of());

        assertThat(result.candidates().get(101L).relevance()).isEqualTo(4.0);
        assertThat(result.candidates().get(101L).explanation()).isEqualTo("Because you liked 2 films by Ethan Coen");
        assertThat(result.candidates().get(102L).relevance()).isEqualTo(2.0);
    }

    @Test
    @DisplayName("DR03: a failed credits request skips only that liked film and marks the source unavailable")
    void failedCreditsRequestSkipsOnlyThatFilm() {
        directed(new TmdbPerson(1, "Robert Eggers"), 101, 11, 12);
        when(tmdbClient.getMovieDirectors(13L)).thenThrow(new IllegalStateException("Movie credits source unavailable"));

        DirectorRecommendationSource.Result result = source.collect(likedFilms(11, 13, 12), Set.of());

        assertThat(result.candidates()).containsOnlyKeys(101L);
        assertThat(result.unavailable()).isTrue();
    }

    @Test
    @DisplayName("DR03: a failed filmography request skips only that director")
    void failedFilmographySkipsOnlyThatDirector() {
        directed(new TmdbPerson(1, "Kept"), 101, 11, 12);
        directed(new TmdbPerson(2, "Failed"), 102, 21, 22);
        when(tmdbClient.getDirectedMovies(2L)).thenThrow(new IllegalStateException("Person credits source unavailable"));

        DirectorRecommendationSource.Result result = source.collect(likedFilms(11, 12, 21, 22), Set.of());

        assertThat(result.candidates()).containsOnlyKeys(101L);
        assertThat(result.unavailable()).isTrue();
    }

    @Test
    @DisplayName("PD-20: library titles, including the liked films themselves, are not candidates")
    void libraryTitlesAreNotCandidates() {
        when(tmdbClient.getMovieDirectors(anyLong())).thenReturn(List.of(new TmdbPerson(1, "Robert Eggers")));
        when(tmdbClient.getDirectedMovies(1L)).thenReturn(List.of(film(11), film(12), film(101), film(102)));

        DirectorRecommendationSource.Result result = source.collect(likedFilms(11, 12), Set.of(11L, 12L, 102L));

        assertThat(result.candidates()).containsOnlyKeys(101L);
    }

    @Test
    @DisplayName("PD-20: only the most recent liked films are looked up, bounding TMDB calls")
    void onlyTheMostRecentLikedFilmsAreLookedUp() {
        List<UserMovieEntry> entries = new ArrayList<>();
        for (long id = 1; id <= DirectorRecommendationSource.MAX_LIKED_FILMS_LOOKED_UP + 5; id++) entries.add(liked(id));
        UserMovieEntry disliked = liked(999);
        disliked.setPersonalRating(5.0);
        entries.add(0, disliked);
        when(tmdbClient.getMovieDirectors(anyLong())).thenReturn(List.of());

        source.collect(entries, Set.of());

        verify(tmdbClient, times(DirectorRecommendationSource.MAX_LIKED_FILMS_LOOKED_UP)).getMovieDirectors(anyLong());
        verify(tmdbClient, never()).getMovieDirectors(999L);
        verify(tmdbClient, never()).getMovieDirectors((long) DirectorRecommendationSource.MAX_LIKED_FILMS_LOOKED_UP + 1);
    }
}
