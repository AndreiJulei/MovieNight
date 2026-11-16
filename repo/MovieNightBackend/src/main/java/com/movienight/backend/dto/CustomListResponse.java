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
    /** Shared with the owner's accepted friends (#33). */
    private boolean shared;

    private int movieCount;
    private List<CustomListEntryResponse> entries;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
