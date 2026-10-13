package com.movienight.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CustomListResponse {
    private Long id;
    private Long userId;
    private String username;
    private String displayName;
    private String title;
    private String description;
    private boolean isPublic;

    public boolean getIsPublic() {
        return this.isPublic;
    }

    private int movieCount;
    private List<CustomListEntryResponse> entries;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
