package com.movienight.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
/** Availability of a display name or username; {@code name} is the trimmed value that was checked. */
public class CheckNameResponse {
    private String name;
    private boolean available;
    private String message;
}
