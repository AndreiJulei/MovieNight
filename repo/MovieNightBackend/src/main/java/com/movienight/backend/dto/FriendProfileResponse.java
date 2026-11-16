package com.movienight.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Data transfer object representing a friend's profile with calculated stats.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FriendProfileResponse {
    private Long id;
    private String username;
    private String displayName;
    /**
     * Level, rank badge and avatar (#32 LV04): no counts, since a watched count reveals the XP bar.
     * The sharing flags tell the friend view which lists to show as tabs (#33); see
     * docs/features/031-account-progression-profile for why these extra fields are exposed.
     */
    private int level;
    private RankResponse rank;
    private AvatarResponse avatar;
    private boolean sharesWatchlist;
    private boolean sharesWatched;
    private LocalDateTime createdAt;
}
