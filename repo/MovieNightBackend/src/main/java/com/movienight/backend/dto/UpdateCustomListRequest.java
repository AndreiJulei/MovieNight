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
    @jakarta.validation.constraints.Pattern(regexp = "(?s).*\\S.*", message = "List title cannot be blank")
    private String title;

    private String description;

    /** True shares the list with accepted friends only (#33); null leaves sharing unchanged. */
    private Boolean shared;
}
