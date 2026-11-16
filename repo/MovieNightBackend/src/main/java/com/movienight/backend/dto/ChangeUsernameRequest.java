package com.movienight.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Request body for changing the signed-in user's username (#31). */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChangeUsernameRequest {
    @NotBlank(message = "Username is required")
    private String username;
}
