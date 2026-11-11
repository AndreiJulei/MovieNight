package com.movienight.backend.controller;

import com.movienight.backend.client.AniListClient;
import com.movienight.backend.client.AniListUnavailableException;
import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.external.AniListMedia;
import com.movienight.backend.dto.external.TmdbSearchResponse.TmdbMovieSummary;
import com.movienight.backend.model.AniListMapping;
import com.movienight.backend.model.CachedMovieList;
import com.movienight.backend.model.MovieListType;
import com.movienight.backend.model.ResourceType;
import com.movienight.backend.repository.AniListMappingRepository;
import com.movienight.backend.repository.CachedMovieListRepository;
import com.movienight.backend.repository.DiscoverySnapshotRepository;
import com.movienight.backend.service.SuggestionScheduler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:anime-enrichment-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=", "app.omdb.api-key=",
    "app.jwt.secret=anime-enrichment-test-signing-key-at-least-32-bytes"
})
class AnimeEnrichmentPersistenceTest {
    private static final int YEAR = LocalDate.now(ZoneOffset.UTC).minusDays(1).getYear();
    private static final String AIRED = LocalDate.now(ZoneOffset.UTC).minusDays(1).toString();

    @Autowired SuggestionScheduler scheduler;
    @Autowired CachedMovieListRepository cache;
    @Autowired DiscoverySnapshotRepository snapshots;
    @Autowired AniListMappingRepository mappings;
    @MockitoBean TmdbClient tmdb;
    @MockitoBean AniListClient anilist;

    @BeforeEach void setUp() {
        reset(tmdb, anilist);
        cache.deleteAll(); snapshots.deleteAll(); mappings.deleteAll();
        when(tmdb.isConfigured()).thenReturn(true);
        when(anilist.isEnabled()).thenReturn(true);
    }

    private TmdbMovieSummary tv(long id, String name, double average, int votes) {
        TmdbMovieSummary item = new TmdbMovieSummary();
        item.setId(id); item.setName(name); item.setMediaType("tv"); item.setFirstAirDate(AIRED);
        item.setVoteAverage(average); item.setVoteCount(votes); item.setPopularity(50.0);
        item.setGenreIds(List.of(16)); item.setOriginalLanguage("ja");
        return item;
    }

    private AniListMedia media(long id, String title, boolean adult, int score, int popularity, AniListMedia.Tag... tags) {
        return new AniListMedia(id, null, "TV", adult, List.of("Action"), List.of(tags), score, popularity, 12, YEAR, List.of(title));
    }

    private void tmdbReturns(TmdbMovieSummary... items) {
        when(tmdb.discoverTv(anyString(), anyInt(), any(), any(), any(), any(), any(), any(), any(), anyInt()))
            .thenAnswer(call -> (int) call.getArgument(9) == 1 ? List.of(items) : List.of());
    }

    private List<Long> shelf(MovieListType type) {
        return cache.findByMediaTypeOrderByRankOrderAsc("ANIME").stream()
            .filter(item -> item.getListType() == type).map(CachedMovieList::getTmdbId).toList();
    }

    // AL01
    @Test void adultKidsTaggedAndLowSignalMatchesAreExcludedFromPopularTopRatedAndCurrentSeason() {
        tmdbReturns(tv(1, "Good", 8.5, 1000), tv(2, "Adult", 8.5, 1000), tv(3, "Kids", 8.5, 1000),
            tv(4, "Child Cast", 8.5, 1000), tv(5, "Obscure", 8.5, 1000));
        when(anilist.searchAnime("Good")).thenReturn(List.of(media(11, "Good", false, 85, 90000)));
        when(anilist.searchAnime("Adult")).thenReturn(List.of(media(12, "Adult", true, 85, 90000)));
        when(anilist.searchAnime("Kids")).thenReturn(List.of(media(13, "Kids", false, 85, 90000, new AniListMedia.Tag("Kids", 80))));
        when(anilist.searchAnime("Child Cast")).thenReturn(List.of(media(14, "Child Cast", false, 85, 90000,
            new AniListMedia.Tag("Primarily Child Cast", 75))));
        when(anilist.searchAnime("Obscure")).thenReturn(List.of(media(15, "Obscure", false, 40, 100)));

        scheduler.refreshCategory("ANIME", MovieListType.POPULAR);
        scheduler.refreshCategory("ANIME", MovieListType.TOP_RATED);
        scheduler.refreshCategory("ANIME", MovieListType.CURRENTLY_AIRING);

        assertThat(shelf(MovieListType.POPULAR)).containsExactly(1L); // adult, kids, child-cast, low-signal out
        assertThat(shelf(MovieListType.TOP_RATED)).containsExactly(1L);
        assertThat(shelf(MovieListType.CURRENTLY_AIRING)).contains(1L, 5L).doesNotContain(2L, 3L, 4L);
    }

    // AL02 + AL04
    @Test void unmatchedTitlesStayUnderTmdbRulesAndMappingIsStoredOnceAndReused() {
        tmdbReturns(tv(21, "No Match", 8.5, 1000));
        when(anilist.searchAnime(anyString())).thenReturn(List.of());

        scheduler.refreshCategory("ANIME", MovieListType.POPULAR);
        scheduler.refreshCategory("ANIME", MovieListType.POPULAR);
        scheduler.refreshCategory("ANIME", MovieListType.TOP_RATED);

        AniListMapping mapping = mappings.findByResourceTypeAndTmdbId(ResourceType.TV, 21L).orElseThrow();
        assertThat(mapping.isMatched()).isFalse();
        verify(anilist, times(1)).searchAnime("No Match");
        assertThat(mappings.count()).isEqualTo(1);
        assertThat(shelf(MovieListType.POPULAR)).containsExactly(21L);
        assertThat(cache.findByMediaTypeOrderByRankOrderAsc("ANIME")).hasSize(2); // one row per shelf, no duplicates
    }

    // AL03
    @Test void providerFailureLeavesPublishedShelfUnchangedAndKeepsEarlierMappings() {
        tmdbReturns(tv(31, "Kept", 8.5, 1000));
        when(anilist.searchAnime("Kept")).thenReturn(List.of(media(41, "Kept", false, 85, 90000)));
        scheduler.refreshCategory("ANIME", MovieListType.POPULAR);
        var published = snapshots.findByMediaTypeAndListType("ANIME", MovieListType.POPULAR).orElseThrow().getUpdatedAt();

        tmdbReturns(tv(31, "Kept", 8.5, 1000), tv(32, "New", 8.5, 1000));
        when(anilist.searchAnime("New")).thenThrow(new AniListUnavailableException("rate limited", 60, null));

        assertThatThrownBy(() -> scheduler.refreshCategory("ANIME", MovieListType.POPULAR))
            .isInstanceOf(AniListUnavailableException.class);

        assertThat(shelf(MovieListType.POPULAR)).containsExactly(31L);
        assertThat(snapshots.findByMediaTypeAndListType("ANIME", MovieListType.POPULAR).orElseThrow().getUpdatedAt())
            .isEqualTo(published);
        assertThat(mappings.findByResourceTypeAndTmdbId(ResourceType.TV, 32L)).isEmpty(); // nothing invented
        assertThat(mappings.findByResourceTypeAndTmdbId(ResourceType.TV, 31L)).isPresent();
    }

    // AL05
    @Test void mappingIsKeyedByTypedIdentitySoSameNumericMovieIdIsUnaffected() {
        tmdbReturns(tv(51, "Typed", 8.5, 1000));
        when(anilist.searchAnime("Typed")).thenReturn(List.of(media(61, "Typed", true, 85, 90000)));
        scheduler.refreshCategory("ANIME", MovieListType.POPULAR);

        assertThat(mappings.findByResourceTypeAndTmdbId(ResourceType.TV, 51L)).isPresent();
        assertThat(mappings.findByResourceTypeAndTmdbId(ResourceType.MOVIE, 51L)).isEmpty();
    }

    @Test void tvShelvesNeverQueryAniList() {
        tmdbReturns(tv(71, "Plain series", 8.5, 1000));
        scheduler.refreshCategory("TV", MovieListType.POPULAR);
        verify(anilist, never()).searchAnime(anyString());
    }

    // AL03, first load: no published shelf yet must not leave the page empty.
    @Test void firstPublicationFallsBackToTmdbRulesWhenAniListIsDownAndStopsCallingIt() {
        tmdbReturns(tv(81, "One", 8.5, 1000), tv(82, "Two", 8.5, 1000));
        when(anilist.searchAnime(anyString())).thenThrow(new AniListUnavailableException("rate limited", 16, null));

        scheduler.refreshCategory("ANIME", MovieListType.POPULAR);

        assertThat(shelf(MovieListType.POPULAR)).containsExactlyInAnyOrder(81L, 82L);
        verify(anilist, times(1)).searchAnime(anyString()); // circuit-broken after the first failure
        assertThat(mappings.count()).isZero(); // nothing invented or stored as "unmatched"
    }
}
