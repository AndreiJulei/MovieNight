package com.movienight.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TestWebhookResponse {
    private boolean success;
    private Integer responseStatus;
    private Long durationMs;
    private String message;
    private String responseBody;
}
