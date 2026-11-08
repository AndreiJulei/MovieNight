package com.movienight.backend.controller;

import com.movienight.backend.dto.MovieResponse;
import com.movienight.backend.exception.GlobalExceptionHandler;
import com.movienight.backend.model.Movie;
import com.movienight.backend.service.MovieCatalogLookupService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class MovieCatalogControllerTest {

    private MockMvc mockMvc;

    @Mock
    private MovieCatalogLookupService lookupService;

    @Mock
    private com.movienight.backend.service.SuggestionService suggestionService;

    @Mock
    private com.movienight.backend.service.ExploreSessionManager exploreSessionManager;

    @Mock
    private com.movienight.backend.service.MovieSimilarityService movieSimilarityService;

    @InjectMocks
    private MovieCatalogController controller;

    private MovieResponse sampleMovieResponse;
    private Movie sampleMovie;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        sampleMovieResponse = MovieResponse.builder()
                .id(1L)
                .tmdbId(283995L)
                .title("Guardians of the Galaxy Vol. 2")
                .releaseYear(2017)
                .director("James Gunn")
                .build();

        sampleMovie = Movie.builder()
                .id(1L)
                .tmdbId(283995L)
                .title("Guardians of the Galaxy Vol. 2")
                .releaseYear(2017)
                .director("James Gunn")
                .build();
    }

    @Test
    void searchMovies_returnsOk() throws Exception {
        when(lookupService.searchMovies("Guardians")).thenReturn(List.of(sampleMovieResponse));

        mockMvc.perform(get("/api/movies/search")
                        .param("query", "Guardians"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Guardians of the Galaxy Vol. 2"))
                .andExpect(jsonPath("$[0].tmdbId").value(283995L));
    }

    @Test
    void getMovieDetails_returnsOk() throws Exception {
        when(lookupService.getOrFetchMovie(283995L, "MOVIE")).thenReturn(sampleMovie);
        when(lookupService.mapToResponse(sampleMovie)).thenReturn(sampleMovieResponse);

        mockMvc.perform(get("/api/movies/tmdb/283995").param("mediaType", "MOVIE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Guardians of the Galaxy Vol. 2"))
                .andExpect(jsonPath("$.director").value("James Gunn"));
    }

    @Test
    void getSimilarMovies_returnsOk() throws Exception {
        when(movieSimilarityService.getSimilarMovies(283995L, 10, null))
                .thenReturn(List.of(sampleMovieResponse));

        mockMvc.perform(get("/api/movies/283995/similar"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Guardians of the Galaxy Vol. 2"))
                .andExpect(jsonPath("$[0].tmdbId").value(283995L));
    }

    @Test
    void getCredits_returnsOk() throws Exception {
        MovieResponse.CastMemberDto castMember = MovieResponse.CastMemberDto.builder()
                .name("Chris Pratt")
                .role("Peter Quill / Star-Lord")
                .profileUrl("https://image.tmdb.org/t/p/w185/pratt.jpg")
                .build();
        when(lookupService.getCredits(283995L, null))
                .thenReturn(List.of(castMember));

        mockMvc.perform(get("/api/movies/283995/credits"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Chris Pratt"))
                .andExpect(jsonPath("$[0].role").value("Peter Quill / Star-Lord"))
                .andExpect(jsonPath("$[0].profileUrl").value("https://image.tmdb.org/t/p/w185/pratt.jpg"));
    }
}
