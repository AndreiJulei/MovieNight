package com.movienight.backend.controller;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import com.movienight.backend.dto.*;
import com.movienight.backend.exception.GlobalExceptionHandler;
import com.movienight.backend.service.WebhookService;
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
class WebhookControllerTest {

    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = JsonMapper.builder().build();

    @Mock
    private WebhookService webhookService;

    @InjectMocks
    private WebhookController webhookController;

    private Principal mockPrincipal;
    private WebhookSubscriptionResponse sampleSubscriptionResponse;
    private WebhookDeliveryLogResponse sampleLogResponse;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(webhookController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        mockPrincipal = new UsernamePasswordAuthenticationToken("john@example.com", null, Collections.emptyList());

        sampleSubscriptionResponse = WebhookSubscriptionResponse.builder()
                .id(10L)
                .userId(1L)
                .targetUrl("https://example.com/webhook")
                .secret("whsec_1234567890abcdef")
                .description("Production notification webhook")
                .events("movie.*,list.*")
                .isActive(true)
                .consecutiveFailures(0)
                .createdAt(LocalDateTime.now())
                .build();

        sampleLogResponse = WebhookDeliveryLogResponse.builder()
                .id(100L)
                .subscriptionId(10L)
                .eventId("evt-uuid-1")
                .eventType("movie.added")
                .responseStatus(200)
                .durationMs(45L)
                .success(true)
                .attemptCount(1)
                .createdAt(LocalDateTime.now())
                .build();
    }

    @Test
    void createSubscription_success() throws Exception {
        CreateWebhookSubscriptionRequest request = CreateWebhookSubscriptionRequest.builder()
                .targetUrl("https://example.com/webhook")
                .description("Production notification webhook")
                .events("movie.*,list.*")
                .build();

        when(webhookService.createSubscription(eq("john@example.com"), any(CreateWebhookSubscriptionRequest.class)))
                .thenReturn(sampleSubscriptionResponse);

        mockMvc.perform(post("/api/webhooks")
                        .principal(mockPrincipal)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(10L))
                .andExpect(jsonPath("$.targetUrl").value("https://example.com/webhook"))
                .andExpect(jsonPath("$.events").value("movie.*,list.*"));
    }

    @Test
    void getUserSubscriptions_success() throws Exception {
        when(webhookService.getUserSubscriptions("john@example.com"))
                .thenReturn(List.of(sampleSubscriptionResponse));

        mockMvc.perform(get("/api/webhooks")
                        .principal(mockPrincipal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(10L))
                .andExpect(jsonPath("$[0].targetUrl").value("https://example.com/webhook"));
    }

    @Test
    void getSubscription_success() throws Exception {
        when(webhookService.getSubscriptionById("john@example.com", 10L))
                .thenReturn(sampleSubscriptionResponse);

        mockMvc.perform(get("/api/webhooks/10")
                        .principal(mockPrincipal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(10L));
    }

    @Test
    void updateSubscription_success() throws Exception {
        UpdateWebhookSubscriptionRequest request = UpdateWebhookSubscriptionRequest.builder()
                .description("Updated webhook")
                .build();

        when(webhookService.updateSubscription(eq("john@example.com"), eq(10L), any(UpdateWebhookSubscriptionRequest.class)))
                .thenReturn(sampleSubscriptionResponse);

        mockMvc.perform(put("/api/webhooks/10")
                        .principal(mockPrincipal)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(10L));
    }

    @Test
    void deleteSubscription_success() throws Exception {
        mockMvc.perform(delete("/api/webhooks/10")
                        .principal(mockPrincipal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Webhook subscription deleted successfully"));

        verify(webhookService).deleteSubscription("john@example.com", 10L);
    }

    @Test
    void testWebhook_success() throws Exception {
        TestWebhookResponse testResponse = TestWebhookResponse.builder()
                .success(true)
                .responseStatus(200)
                .durationMs(32L)
                .message("Webhook delivered successfully")
                .build();

        when(webhookService.sendTestPing("john@example.com", 10L))
                .thenReturn(testResponse);

        mockMvc.perform(post("/api/webhooks/10/test")
                        .principal(mockPrincipal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.responseStatus").value(200));
    }

    @Test
    void getDeliveryLogs_success() throws Exception {
        when(webhookService.getDeliveryLogs("john@example.com", 10L))
                .thenReturn(List.of(sampleLogResponse));

        mockMvc.perform(get("/api/webhooks/10/logs")
                        .principal(mockPrincipal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(100L))
                .andExpect(jsonPath("$[0].eventType").value("movie.added"));
    }
}
