package com.movienight.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.AssertFalse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateCustomListRequest {

    @NotBlank(message = "List title is required")
    @Size(max = 150, message = "List title cannot exceed 150 characters")
    private String title;

    private String description;

    @Builder.Default
    @AssertFalse(message = "Custom lists are private; public sharing is unavailable")
    private Boolean isPublic = false;

    public boolean isPublic() {
        return Boolean.TRUE.equals(this.isPublic);
    }

    public void setIsPublic(Boolean isPublic) {
        this.isPublic = isPublic;
    }

    private List<Long> initialMovieIds;
}
