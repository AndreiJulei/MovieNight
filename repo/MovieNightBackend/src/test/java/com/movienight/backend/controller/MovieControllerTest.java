package com.movienight.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.movienight.backend.dto.*;
import com.movienight.backend.exception.GlobalExceptionHandler;
import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.service.UserMovieService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.security.Principal;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class MovieControllerTest {

    private MockMvc mockMvc;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private UserMovieService userMovieService;

    @InjectMocks
    private MovieController movieController;

    private Principal mockPrincipal;
    private UserMovieEntryResponse sampleEntryResponse;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(movieController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        mockPrincipal = new UsernamePasswordAuthenticationToken("john@example.com", null, Collections.emptyList());

        MovieResponse movieResponse = MovieResponse.builder()
                .id(100L)
                .tmdbId(27205L)
                .title("Inception")
                .releaseYear(2010)
                .overview("A dream within a dream.")
                .director("Christopher Nolan")
                .build();

        sampleEntryResponse = UserMovieEntryResponse.builder()
                .id(500L)
                .movie(movieResponse)
                .status(MovieStatus.WATCHLIST)
                .personalRating(null)
                .notes(null)
                .createdAt(LocalDateTime.now())
                .build();
    }

    @Test
    void getLibrary_returnsOkAndList() throws Exception {
        when(userMovieService.getUserLibrary("john@example.com", null))
                .thenReturn(List.of(sampleEntryResponse));

        mockMvc.perform(get("/api/movies/library")
                        .principal(mockPrincipal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(500L))
                .andExpect(jsonPath("$[0].movie.title").value("Inception"))
                .andExpect(jsonPath("$[0].status").value("WATCHLIST"));
    }

    @Test
    void addMovie_validRequest_returnsCreated() throws Exception {
        AddMovieRequest request = AddMovieRequest.builder()
                .tmdbId(27205L)
                .title("Inception")
                .releaseYear(2010)
                .status(MovieStatus.WATCHLIST)
                .build();

        when(userMovieService.addMovieToLibrary(eq("john@example.com"), any(AddMovieRequest.class)))
                .thenReturn(sampleEntryResponse);

        mockMvc.perform(post("/api/movies/library")
                        .principal(mockPrincipal)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(500L))
                .andExpect(jsonPath("$.movie.title").value("Inception"));
    }

    @Test
    void addMovie_missingTitle_returnsBadRequest() throws Exception {
        AddMovieRequest request = AddMovieRequest.builder()
                .tmdbId(27205L)
                .title("") // blank title violates @NotBlank
                .status(MovieStatus.WATCHLIST)
                .build();

        mockMvc.perform(post("/api/movies/library")
                        .principal(mockPrincipal)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateMovieEntry_validRequest_returnsOk() throws Exception {
        UpdateMovieEntryRequest request = UpdateMovieEntryRequest.builder()
                .status(MovieStatus.WATCHED)
                .personalRating(9)
                .notes("Superb movie")
                .build();

        UserMovieEntryResponse updatedResponse = UserMovieEntryResponse.builder()
                .id(500L)
                .movie(sampleEntryResponse.getMovie())
                .status(MovieStatus.WATCHED)
                .personalRating(9)
                .notes("Superb movie")
                .build();

        when(userMovieService.updateMovieEntry(eq("john@example.com"), eq(100L), any(UpdateMovieEntryRequest.class)))
                .thenReturn(updatedResponse);

        mockMvc.perform(put("/api/movies/library/100")
                        .principal(mockPrincipal)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("WATCHED"))
                .andExpect(jsonPath("$.personalRating").value(9))
                .andExpect(jsonPath("$.notes").value("Superb movie"));
    }

    @Test
    void removeMovie_returnsOk() throws Exception {
        mockMvc.perform(delete("/api/movies/library/100")
                        .principal(mockPrincipal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Movie removed from your library successfully"));

        verify(userMovieService).removeMovieFromLibrary("john@example.com", 100L);
    }
}
