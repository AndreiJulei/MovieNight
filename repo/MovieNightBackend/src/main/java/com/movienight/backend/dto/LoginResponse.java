package com.movienight.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LoginResponse {
    private String token; // The JWT access token
    @Builder.Default
    private String tokenType = "Bearer";

    private Long id;
    private String username;
    private String displayName;
    private String role;
    private LocalDateTime createdAt;
}
