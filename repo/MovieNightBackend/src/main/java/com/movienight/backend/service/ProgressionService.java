package com.movienight.backend.service;

import com.movienight.backend.dto.AvatarResponse;
import com.movienight.backend.dto.ProgressResponse;
import com.movienight.backend.dto.RankResponse;
import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.model.User;
import com.movienight.backend.repository.UserLookup;
import com.movienight.backend.repository.UserMovieEntryRepository;
import com.movienight.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Derives levels and ranks from watched history and manages avatar choice (#32). */
@Service
@RequiredArgsConstructor
public class ProgressionService {

    /** What friends see of someone's progression (#32 LV04): level, rank badge and avatar only. */
    public record Badge(int level, RankResponse rank, AvatarResponse avatar) {}

    private final UserRepository userRepository;
    private final UserMovieEntryRepository entries;
    private final AvatarCatalog avatars;

    /** Derived on every read, so un-marking a watched title lowers it immediately. */
    public Progression progressionOf(User user) {
        return Progression.of(entries.countByUserIdAndStatus(user.getId(), MovieStatus.WATCHED));
    }

    /** Level and rank derive from the full watched count, even when the Watched list is hidden. */
    public Badge badgeOf(User user) {
        Progression p = progressionOf(user);
        return new Badge(p.level(), RankResponse.of(p.rank()), avatarOf(user, p));
    }

    @Transactional(readOnly = true)
    public ProgressResponse progress(String username) {
        User user = findUser(username);
        Progression p = progressionOf(user);
        return ProgressResponse.of(p, avatarOf(user, p), avatars.all());
    }

    @Transactional
    public ProgressResponse chooseAvatar(String username, String avatarId) {
        User user = findUser(username);
        Progression p = progressionOf(user);
        if (avatarId != null) {
            AvatarCatalog.Avatar avatar = avatars.find(avatarId)
                    .orElseThrow(() -> new IllegalArgumentException("That avatar does not exist."));
            if (avatar.unlockLevel() > p.level()) {
                throw new IllegalArgumentException("That avatar unlocks at level " + avatar.unlockLevel() + ".");
            }
        }
        user.setAvatarKey(avatarId);
        userRepository.save(user);
        return ProgressResponse.of(p, avatarOf(user, p), avatars.all());
    }

    private AvatarResponse avatarOf(User user, Progression progression) {
        return AvatarResponse.of(avatars.effective(user.getAvatarKey(), progression.level()));
    }

    private User findUser(String username) {
        return UserLookup.byAccountName(userRepository, username)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
    }
}
