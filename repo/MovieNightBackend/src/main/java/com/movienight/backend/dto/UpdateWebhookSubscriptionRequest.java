package com.movienight.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateWebhookSubscriptionRequest {

    private String targetUrl;

    private String secret;

    private String description;

    private String events;

    private Boolean isActive;
}
