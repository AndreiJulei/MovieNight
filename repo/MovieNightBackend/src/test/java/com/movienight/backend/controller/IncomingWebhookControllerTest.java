package com.movienight.backend.controller;

import com.movienight.backend.event.MovieNightDomainEvent;
import com.movienight.backend.exception.GlobalExceptionHandler;
import com.movienight.backend.model.User;
import com.movienight.backend.repository.UserRepository;
import com.movienight.backend.service.MovieSimilarityDataLoader;
import com.movienight.backend.service.PersonalizedRecommendationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Collections;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class IncomingWebhookControllerTest {

    private MockMvc mockMvc;

    @Mock
    private MovieSimilarityDataLoader movieSimilarityDataLoader;

    @Mock
    private PersonalizedRecommendationService personalizedRecommendationService;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private IncomingWebhookController incomingWebhookController;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(incomingWebhookController, "mlSyncSecret", "test_ml_secret");
        mockMvc = MockMvcBuilders.standaloneSetup(incomingWebhookController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void syncMlModel_withValidSecret_success() throws Exception {
        User user = User.builder()
                .id(1L)
                .username("john@example.com")
                .needsRecommendationRefresh(true)
                .build();

        when(movieSimilarityDataLoader.reloadSimilarityData()).thenReturn(1500L);
        when(userRepository.findAll()).thenReturn(List.of(user));

        mockMvc.perform(post("/api/webhooks/incoming/ml-sync")
                        .header("X-MovieNight-Secret", "test_ml_secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCESS"))
                .andExpect(jsonPath("$.message").isNotEmpty());

        verify(movieSimilarityDataLoader).reloadSimilarityData();
        verify(personalizedRecommendationService).recomputeRecommendationsForUser(user);
        verify(eventPublisher).publishEvent(any(MovieNightDomainEvent.class));
    }

    @Test
    void syncMlModel_withInvalidSecret_unauthorized() throws Exception {
        mockMvc.perform(post("/api/webhooks/incoming/ml-sync")
                        .header("X-MovieNight-Secret", "wrong_secret"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value("UNAUTHORIZED"));
    }

    @Test
    void syncMlModel_withMissingSecret_unauthorized() throws Exception {
        mockMvc.perform(post("/api/webhooks/incoming/ml-sync"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value("UNAUTHORIZED"));
    }
}
