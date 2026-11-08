package com.movienight.backend.controller;

import com.movienight.backend.dto.SimilarityReloadResult;
import com.movienight.backend.event.MovieNightDomainEvent;
import com.movienight.backend.exception.GlobalExceptionHandler;
import com.movienight.backend.service.MovieSimilarityDataLoader;
import com.movienight.backend.service.RecommendationMaintenanceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

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
    private RecommendationMaintenanceService recommendationMaintenanceService;

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
        SimilarityReloadResult result = SimilarityReloadResult.builder()
                .pairsCount(1500L)
                .modelIdentity("2023-07-20:abcdef123456")
                .invalidatedUsersCount(4)
                .build();

        when(movieSimilarityDataLoader.reloadSimilarityData()).thenReturn(result);

        mockMvc.perform(post("/api/webhooks/incoming/ml-sync")
                        .header("X-MovieNight-Secret", "test_ml_secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCESS"))
                .andExpect(jsonPath("$.pairsCount").value(1500))
                .andExpect(jsonPath("$.modelIdentity").value("2023-07-20:abcdef123456"))
                .andExpect(jsonPath("$.cacheInvalidated").value(true));

        verify(recommendationMaintenanceService).drainInFlightRecomputations(5000);
        verify(movieSimilarityDataLoader).reloadSimilarityData();
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

    @Test
    void setMaintenanceMode_withValidSecret_success() throws Exception {
        when(recommendationMaintenanceService.drainInFlightRecomputations(5000)).thenReturn(true);
        when(recommendationMaintenanceService.getInFlightCount()).thenReturn(0);

        mockMvc.perform(post("/api/webhooks/incoming/maintenance")
                        .header("X-MovieNight-Secret", "test_ml_secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\": true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCESS"))
                .andExpect(jsonPath("$.maintenanceMode").value(true))
                .andExpect(jsonPath("$.drained").value(true));

        verify(recommendationMaintenanceService).setMaintenanceMode(true);
    }
}
