package com.movienight.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Request body for changing the signed-in user's email; requires the current password (#31). */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChangeEmailRequest {
    @NotBlank(message = "Email is required")
    private String email;

    @NotBlank(message = "Current password is required")
    private String currentPassword;
}
