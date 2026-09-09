package com.movienight.backend.controller;

import com.movienight.backend.dto.SuggestionCategoryResponse;
import com.movienight.backend.dto.SuggestionsResponse;
import com.movienight.backend.exception.GlobalExceptionHandler;
import com.movienight.backend.model.User;
import com.movienight.backend.repository.UserRepository;
import com.movienight.backend.service.PersonalizedRecommendationService;
import com.movienight.backend.service.SuggestionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
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
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class SuggestionControllerTest {

    private MockMvc mockMvc;

    @Mock
    private SuggestionService suggestionService;

    @Mock
    private PersonalizedRecommendationService personalizedRecommendationService;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private SuggestionController suggestionController;

    private Principal mockPrincipal;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(suggestionController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        mockPrincipal = new UsernamePasswordAuthenticationToken("john@example.com", null, Collections.emptyList());
    }

    @Test
    @DisplayName("GET /api/suggestions should return suggestion categories for authenticated user")
    void testGetSuggestions() throws Exception {
        SuggestionsResponse response = SuggestionsResponse.builder()
                .categories(List.of(
                        SuggestionCategoryResponse.builder()
                                .id("for-you")
                                .title("Suggestions for You")
                                .movies(Collections.emptyList())
                                .build()
                ))
                .build();

        when(suggestionService.getSuggestions("john@example.com")).thenReturn(response);

        mockMvc.perform(get("/api/suggestions")
                        .principal(mockPrincipal)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories[0].id").value("for-you"))
                .andExpect(jsonPath("$.categories[0].title").value("Suggestions for You"));
    }

    @Test
    @DisplayName("POST /api/suggestions/personalized/refresh should recompute recommendations")
    void testRefreshPersonalizedRecommendations() throws Exception {
        User user = User.builder()
                .id(1L)
                .username("john@example.com")
                .displayName("John")
                .build();

        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(user));

        mockMvc.perform(post("/api/suggestions/personalized/refresh")
                        .principal(mockPrincipal)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").exists());

        verify(personalizedRecommendationService).recomputeRecommendationsForUser(user);
    }
}
