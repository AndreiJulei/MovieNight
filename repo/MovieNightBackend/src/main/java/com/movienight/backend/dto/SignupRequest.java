package com.movienight.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SignupRequest {

    private String email;

    @NotBlank(message = "Username or email is required")
    @Size(min = 2, max = 50, message = "Username must be between 2 and 50 characters")
    private String username;

    @NotBlank(message = "Password is required")
    @Size(min = 6, message = "Password must be at least 6 characters")
    private String password;

    private String confirmPassword;

    private String displayName;

    public String getEffectiveEmail() {
        if (email != null && !email.isBlank()) {
            return email.trim().toLowerCase();
        }
        if (username != null && username.contains("@")) {
            return username.trim().toLowerCase();
        }
        return (username != null ? username.trim().toLowerCase() : "user") + "@example.com";
    }

    public String getEffectiveDisplayName() {
        if (displayName != null && !displayName.isBlank()) {
            return displayName.trim();
        }
        return username != null ? username.trim() : "";
    }
}
