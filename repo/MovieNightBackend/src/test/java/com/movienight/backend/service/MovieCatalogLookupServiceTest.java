package com.movienight.backend.service;

import com.movienight.backend.client.OmdbClient;
import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.MovieResponse;
import com.movienight.backend.dto.external.OmdbResponse;
import com.movienight.backend.dto.external.TmdbMovieDetailsResponse;
import com.movienight.backend.dto.external.TmdbSearchResponse;
import com.movienight.backend.model.Movie;
import com.movienight.backend.repository.MovieRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MovieCatalogLookupServiceTest {

    @Mock
    private MovieRepository movieRepository;

    @Mock
    private TmdbClient tmdbClient;

    @Mock
    private OmdbClient omdbClient;

    @Mock
    private com.movienight.backend.repository.CachedMovieListRepository cachedMovieListRepository;

    @InjectMocks
    private MovieCatalogLookupService lookupService;

    private Movie localMovie;

    @BeforeEach
    void setUp() {
        localMovie = Movie.builder()
                .id(1L)
                .tmdbId(283995L)
                .imdbId("tt3896198")
                .title("Guardians of the Galaxy Vol. 2")
                .releaseYear(2017)
                .overview("The Guardians fight to keep their family together...")
                .director("James Gunn")
                .castMembers("Chris Pratt, Zoe Saldaña, Dave Bautista")
                .trailerKey("wUn05hdkhjM")
                .imdbRating(7.6)
                .rottenTomatoesRating(85)
                .build();
    }

    @Test
    void searchMovies_combinesLocalAndTmdbResults() {
        TmdbSearchResponse.TmdbMovieSummary tmdbSummary = new TmdbSearchResponse.TmdbMovieSummary();
        tmdbSummary.setId(999999L);
        tmdbSummary.setTitle("Guardians 3");
        tmdbSummary.setReleaseDate("2023-05-05");

        when(movieRepository.findByTitleContainingIgnoreCase("Guardians")).thenReturn(List.of(localMovie));
        when(tmdbClient.isConfigured()).thenReturn(true);
        when(tmdbClient.searchMovies("Guardians")).thenReturn(List.of(tmdbSummary));

        List<MovieResponse> results = lookupService.searchMovies("Guardians");

        assertEquals(2, results.size());
        assertEquals("Guardians of the Galaxy Vol. 2", results.get(0).getTitle());
        assertEquals("Guardians 3", results.get(1).getTitle());
    }

    @Test
    void getOrFetchMovie_whenAlreadyCached_returnsFromDbWithoutApiCalls() {
        when(movieRepository.findByTmdbId(283995L)).thenReturn(Optional.of(localMovie));

        Movie result = lookupService.getOrFetchMovie(283995L);

        assertNotNull(result);
        assertEquals(283995L, result.getTmdbId());
        verify(tmdbClient, never()).getMovieDetails(anyLong());
        verify(omdbClient, never()).getMovieRatings(anyString());
    }

    @Test
    void getOrFetchMovie_whenNotCached_fetchesFromTmdbAndOmdbAndSaves() {
        TmdbMovieDetailsResponse tmdbResponse = new TmdbMovieDetailsResponse();
        tmdbResponse.setId(283995L);
        tmdbResponse.setImdbId("tt3896198");
        tmdbResponse.setTitle("Guardians of the Galaxy Vol. 2");
        tmdbResponse.setReleaseDate("2017-04-25");
        tmdbResponse.setOverview("The Guardians must fight...");
        tmdbResponse.setRuntime(137);

        TmdbMovieDetailsResponse.CrewMember director = new TmdbMovieDetailsResponse.CrewMember();
        director.setName("James Gunn");
        director.setJob("Director");

        TmdbMovieDetailsResponse.CastMember actor = new TmdbMovieDetailsResponse.CastMember();
        actor.setName("Chris Pratt");
        actor.setOrder(0);

        TmdbMovieDetailsResponse.Credits credits = new TmdbMovieDetailsResponse.Credits();
        credits.setCrew(List.of(director));
        credits.setCast(List.of(actor));
        tmdbResponse.setCredits(credits);

        TmdbMovieDetailsResponse.VideoResult video = new TmdbMovieDetailsResponse.VideoResult();
        video.setSite("YouTube");
        video.setType("Trailer");
        video.setKey("wUn05hdkhjM");
        TmdbMovieDetailsResponse.Videos videos = new TmdbMovieDetailsResponse.Videos();
        videos.setResults(List.of(video));
        tmdbResponse.setVideos(videos);

        OmdbResponse omdbResponse = new OmdbResponse();
        omdbResponse.setResponse("True");

        when(movieRepository.findByTmdbId(283995L)).thenReturn(Optional.empty());
        when(tmdbClient.getMovieDetails(283995L)).thenReturn(Optional.of(tmdbResponse));
        when(omdbClient.isConfigured()).thenReturn(true);
        when(omdbClient.getMovieRatings("tt3896198")).thenReturn(Optional.of(omdbResponse));
        when(omdbClient.extractImdbRating(omdbResponse)).thenReturn(7.6);
        when(omdbClient.extractRottenTomatoesScore(omdbResponse)).thenReturn(85);
        when(movieRepository.save(any(Movie.class))).thenReturn(localMovie);

        Movie result = lookupService.getOrFetchMovie(283995L);

        assertNotNull(result);
        assertEquals("Guardians of the Galaxy Vol. 2", result.getTitle());
        verify(movieRepository).save(any(Movie.class));
    }

    @Test
    void searchMovies_withTvAndAnime_correctlyClassifiesMediaTypes() {
        TmdbSearchResponse.TmdbMovieSummary tvShow = new TmdbSearchResponse.TmdbMovieSummary();
        tvShow.setId(1396L);
        tvShow.setName("Breaking Bad");
        tvShow.setMediaType("tv");
        tvShow.setFirstAirDate("2008-01-20");

        TmdbSearchResponse.TmdbMovieSummary anime = new TmdbSearchResponse.TmdbMovieSummary();
        anime.setId(1429L);
        anime.setName("Attack on Titan");
        anime.setMediaType("tv");
        anime.setFirstAirDate("2013-04-07");
        anime.setGenreIds(List.of(16, 10759));
        anime.setOriginalLanguage("ja");

        when(movieRepository.findByTitleContainingIgnoreCase("test")).thenReturn(Collections.emptyList());
        when(tmdbClient.isConfigured()).thenReturn(true);
        when(tmdbClient.searchMovies("test")).thenReturn(List.of(tvShow, anime));

        List<MovieResponse> results = lookupService.searchMovies("test");

        assertEquals(2, results.size());
        assertEquals("Breaking Bad", results.get(0).getTitle());
        assertEquals("TV", results.get(0).getMediaType());
        assertEquals(2008, results.get(0).getReleaseYear());

        assertEquals("Attack on Titan", results.get(1).getTitle());
        assertEquals("ANIME", results.get(1).getMediaType());
        assertEquals(2013, results.get(1).getReleaseYear());
    }

    @Test
    void getOrFetchMovie_withTvSeries_fetchesFromTvEndpoint() {
        TmdbMovieDetailsResponse tvDetails = new TmdbMovieDetailsResponse();
        tvDetails.setId(1396L);
        tvDetails.setName("Breaking Bad");
        tvDetails.setFirstAirDate("2008-01-20");
        tvDetails.setNumberOfSeasons(5);
        tvDetails.setNumberOfEpisodes(62);

        when(movieRepository.findByTmdbId(1396L)).thenReturn(Optional.empty());
        when(tmdbClient.getTvDetails(1396L)).thenReturn(Optional.of(tvDetails));
        when(movieRepository.save(any(Movie.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Movie result = lookupService.getOrFetchMovie(1396L, "TV");

        assertNotNull(result);
        assertEquals("Breaking Bad", result.getTitle());
        assertEquals("TV", result.getMediaType());
        assertEquals(5, result.getSeasonsCount());
        assertEquals(62, result.getEpisodesCount());
        assertEquals(2008, result.getReleaseYear());
    }
}
