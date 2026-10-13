package com.movienight.backend.dto;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateCustomListRequest {

    @Size(max = 150, message = "List title cannot exceed 150 characters")
    private String title;

    private String description;

    private Boolean isPublic;
}
