package com.movienight.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CustomListEntryResponse {
    private Long id;
    private MovieResponse movie;
    private Integer position;
    private LocalDateTime addedAt;
}
