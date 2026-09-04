package com.movienight.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request payload to add a friend by their username or display name.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AddFriendRequest {

    @NotBlank(message = "Username or display name is required")
    private String identifier;
}
