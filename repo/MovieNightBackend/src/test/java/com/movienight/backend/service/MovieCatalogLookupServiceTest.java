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
}
