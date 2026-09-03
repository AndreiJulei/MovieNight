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
        when(lookupService.getOrFetchMovie(283995L)).thenReturn(sampleMovie);
        when(lookupService.mapToResponse(sampleMovie)).thenReturn(sampleMovieResponse);

        mockMvc.perform(get("/api/movies/tmdb/283995"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Guardians of the Galaxy Vol. 2"))
                .andExpect(jsonPath("$.director").value("James Gunn"));
    }
}
