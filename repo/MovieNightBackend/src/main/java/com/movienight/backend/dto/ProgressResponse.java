package com.movienight.backend.dto;

import com.movienight.backend.service.AvatarCatalog;
import com.movienight.backend.service.Progression;

import java.util.List;

/** The owner's own progression, including XP-bar data that friends never receive (#32). */
public record ProgressResponse(long watchedCount, int level, int xpIntoLevel, int xpPerLevel,
                               RankResponse rank, RankResponse nextRank, long toNextRank,
                               AvatarResponse avatar, List<AvatarOption> avatars) {

    public record AvatarOption(String id, String file, int unlockLevel, boolean unlocked) {}

    public static ProgressResponse of(Progression p, AvatarResponse avatar, List<AvatarCatalog.Avatar> all) {
        return new ProgressResponse(p.watchedCount(), p.level(), p.xpIntoLevel(), p.xpPerLevel(),
                RankResponse.of(p.rank()), RankResponse.of(p.nextRank()), p.toNextRank(), avatar,
                all.stream().map(a -> new AvatarOption(a.id(), a.file(), a.unlockLevel(), a.unlockLevel() <= p.level())).toList());
    }
}
