package com.movienight.backend.controller;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import com.movienight.backend.dto.*;
import com.movienight.backend.exception.GlobalExceptionHandler;
import com.movienight.backend.service.CustomListService;
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
class CustomListControllerTest {

    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = JsonMapper.builder().build();

    @Mock
    private CustomListService customListService;

    @InjectMocks
    private CustomListController customListController;

    private Principal mockPrincipal;
    private CustomListResponse sampleListResponse;
    private CustomListSummaryResponse sampleSummaryResponse;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(customListController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        mockPrincipal = new UsernamePasswordAuthenticationToken("john@example.com", null, Collections.emptyList());

        sampleListResponse = CustomListResponse.builder()
                .id(1L)
                .userId(10L)
                .username("john@example.com")
                .displayName("John Wick")
                .title("Top Action Movies")
                .description("My personal top action picks")
                .isPublic(false)
                .movieCount(1)
                .entries(List.of(
                        CustomListEntryResponse.builder()
                                .id(101L)
                                .position(0)
                                .addedAt(LocalDateTime.now())
                                .movie(MovieResponse.builder()
                                        .id(50L)
                                        .title("The Matrix")
                                        .releaseYear(1999)
                                        .build())
                                .build()
                ))
                .createdAt(LocalDateTime.now())
                .build();

        sampleSummaryResponse = CustomListSummaryResponse.builder()
                .id(1L)
                .userId(10L)
                .username("john@example.com")
                .displayName("John Wick")
                .title("Top Action Movies")
                .isPublic(false)
                .movieCount(1)
                .previewPosterUrls(List.of("https://image.tmdb.org/t/p/w500/matrix.jpg"))
                .build();
    }

    @Test
    void createList_success() throws Exception {
        CreateCustomListRequest request = CreateCustomListRequest.builder()
                .title("Top Action Movies")
                .description("My personal top action picks")
                .isPublic(false)
                .build();

        when(customListService.createList(eq("john@example.com"), any(CreateCustomListRequest.class)))
                .thenReturn(sampleListResponse);

        mockMvc.perform(post("/api/lists")
                        .principal(mockPrincipal)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andDo(org.springframework.test.web.servlet.result.MockMvcResultHandlers.print())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1L))
                .andExpect(jsonPath("$.title").value("Top Action Movies"))
                .andExpect(jsonPath("$.movieCount").value(1));
    }

    @Test
    void getUserLists_success() throws Exception {
        when(customListService.getUserLists("john@example.com"))
                .thenReturn(List.of(sampleSummaryResponse));

        mockMvc.perform(get("/api/lists")
                        .principal(mockPrincipal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1L))
                .andExpect(jsonPath("$[0].title").value("Top Action Movies"));
    }

    @Test
    void getPublicLists_success() throws Exception {
        when(customListService.getPublicLists())
                .thenReturn(List.of(sampleSummaryResponse));

        mockMvc.perform(get("/api/lists/public"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1L))
                .andExpect(jsonPath("$[0].title").value("Top Action Movies"));
    }

    @Test
    void getListById_success() throws Exception {
        when(customListService.getListById(eq(1L), eq("john@example.com")))
                .thenReturn(sampleListResponse);

        mockMvc.perform(get("/api/lists/1")
                        .principal(mockPrincipal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1L))
                .andExpect(jsonPath("$.entries[0].movie.title").value("The Matrix"));
    }

    @Test
    void updateList_success() throws Exception {
        UpdateCustomListRequest request = UpdateCustomListRequest.builder()
                .title("Renamed List")
                .build();

        when(customListService.updateList(eq("john@example.com"), eq(1L), any(UpdateCustomListRequest.class)))
                .thenReturn(sampleListResponse);

        mockMvc.perform(put("/api/lists/1")
                        .principal(mockPrincipal)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1L));
    }

    @Test
    void deleteList_success() throws Exception {
        mockMvc.perform(delete("/api/lists/1")
                        .principal(mockPrincipal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Custom list deleted successfully"));

        verify(customListService).deleteList("john@example.com", 1L);
    }

    @Test
    void addMovieToList_success() throws Exception {
        AddMovieToListRequest request = AddMovieToListRequest.builder()
                .movieId(50L)
                .build();

        when(customListService.addMovieToList(eq("john@example.com"), eq(1L), any(AddMovieToListRequest.class)))
                .thenReturn(sampleListResponse);

        mockMvc.perform(post("/api/lists/1/movies")
                        .principal(mockPrincipal)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1L));
    }

    @Test
    void removeMovieFromList_success() throws Exception {
        when(customListService.removeMovieFromList("john@example.com", 1L, 50L))
                .thenReturn(sampleListResponse);

        mockMvc.perform(delete("/api/lists/1/movies/50")
                        .principal(mockPrincipal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1L));
    }

    @Test
    void reorderMovies_success() throws Exception {
        ReorderCustomListRequest request = ReorderCustomListRequest.builder()
                .orderedMovieIds(List.of(50L))
                .build();

        when(customListService.reorderMovies(eq("john@example.com"), eq(1L), any(ReorderCustomListRequest.class)))
                .thenReturn(sampleListResponse);

        mockMvc.perform(put("/api/lists/1/reorder")
                        .principal(mockPrincipal)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1L));
    }
}
