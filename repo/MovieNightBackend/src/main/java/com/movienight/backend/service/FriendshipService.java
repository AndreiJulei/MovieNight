package com.movienight.backend.service;

import com.movienight.backend.dto.FriendProfileResponse;
import com.movienight.backend.dto.UserMovieEntryResponse;
import com.movienight.backend.model.Friendship;
import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.model.User;
import com.movienight.backend.model.UserMovieEntry;
import com.movienight.backend.repository.FriendshipRepository;
import com.movienight.backend.repository.UserMovieEntryRepository;
import com.movienight.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.OptionalDouble;
import java.util.stream.Collectors;

/**
 * Service managing social friendships, friend profile stats,
 * and access to friends' movie libraries.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class FriendshipService {

    private final FriendshipRepository friendshipRepository;
    private final UserRepository userRepository;
    private final UserMovieEntryRepository userMovieEntryRepository;
    private final UserMovieService userMovieService;
    private final org.springframework.context.ApplicationEventPublisher eventPublisher;

    /**
     * Retrieve all friends of the current user, each enriched with their profile stats.
     */
    @Transactional(readOnly = true)
    public List<FriendProfileResponse> getFriends(String currentUsername) {
        User user = findUserByUsername(currentUsername);
        List<Friendship> friendships = friendshipRepository.findByUserId(user.getId());

        return friendships.stream()
                .map(Friendship::getFriend)
                .map(this::buildFriendProfileResponse)
                .collect(Collectors.toList());
    }

    /**
     * Add a friend by their username or display name.
     */
    @Transactional
    public FriendProfileResponse addFriend(String currentUsername, String targetIdentifier) {
        User user = findUserByUsername(currentUsername);

        String cleanTarget = targetIdentifier != null ? targetIdentifier.trim() : "";
        User target = userRepository.findByUsername(cleanTarget)
                .or(() -> userRepository.findByUsernameIgnoreCase(cleanTarget))
                .or(() -> userRepository.findByDisplayNameIgnoreCase(cleanTarget))
                .or(() -> userRepository.findByEmailIgnoreCase(cleanTarget))
                .orElseThrow(() -> new IllegalArgumentException("User not found with identifier: " + targetIdentifier));

        if (user.getId().equals(target.getId())) {
            throw new IllegalArgumentException("You cannot add yourself as a friend.");
        }

        if (friendshipRepository.existsByUserIdAndFriendId(user.getId(), target.getId())) {
            throw new IllegalArgumentException("You are already friends with " + target.getDisplayName() + ".");
        }

        // Establish symmetric 2-way friendship
        Friendship f1 = Friendship.builder().user(user).friend(target).build();
        Friendship f2 = Friendship.builder().user(target).friend(user).build();
        friendshipRepository.saveAll(List.of(f1, f2));

        if (eventPublisher != null) {
            eventPublisher.publishEvent(com.movienight.backend.event.MovieNightDomainEvent.of(
                    "friend.added",
                    user.getId(),
                    user.getUsername(),
                    java.util.Map.of(
                            "friendId", target.getId(),
                            "friendUsername", target.getUsername(),
                            "friendDisplayName", target.getDisplayName()
                    )
            ));
        }

        log.info("Established friendship between {} and {}", user.getUsername(), target.getUsername());
        return buildFriendProfileResponse(target);
    }

    /**
     * Remove a friendship in both directions.
     */
    @Transactional
    public void removeFriend(String currentUsername, Long friendId) {
        User user = findUserByUsername(currentUsername);
        friendshipRepository.deleteByUserIdAndFriendId(user.getId(), friendId);
        friendshipRepository.deleteByUserIdAndFriendId(friendId, user.getId());

        if (eventPublisher != null) {
            eventPublisher.publishEvent(com.movienight.backend.event.MovieNightDomainEvent.of(
                    "friend.removed",
                    user.getId(),
                    user.getUsername(),
                    java.util.Map.of("friendId", friendId)
            ));
        }

        log.info("Removed friendship between user ID {} and friend ID {}", user.getId(), friendId);
    }

    /**
     * View a friend's movie library (filtered by WATCHED or WATCHLIST).
     */
    @Transactional(readOnly = true)
    public List<UserMovieEntryResponse> getFriendLibrary(String currentUsername, Long friendId, MovieStatus status) {
        User user = findUserByUsername(currentUsername);

        if (!friendshipRepository.existsByUserIdAndFriendId(user.getId(), friendId)) {
            throw new IllegalArgumentException("You can only view movie libraries of your friends.");
        }

        User friend = userRepository.findById(friendId)
                .orElseThrow(() -> new IllegalArgumentException("Friend not found with ID: " + friendId));

        return userMovieService.getUserLibrary(friend.getUsername(), status);
    }

    /**
     * Get a specific friend's profile stats.
     */
    @Transactional(readOnly = true)
    public FriendProfileResponse getFriendProfile(String currentUsername, Long friendId) {
        User user = findUserByUsername(currentUsername);

        if (!friendshipRepository.existsByUserIdAndFriendId(user.getId(), friendId)) {
            throw new IllegalArgumentException("You can only view profiles of your friends.");
        }

        User friend = userRepository.findById(friendId)
                .orElseThrow(() -> new IllegalArgumentException("Friend not found with ID: " + friendId));

        return buildFriendProfileResponse(friend);
    }

    // --- Helper Methods ---

    private User findUserByUsername(String username) {
        String clean = username != null ? username.trim() : "";
        return userRepository.findByUsername(clean)
                .or(() -> userRepository.findByUsernameIgnoreCase(clean))
                .or(() -> userRepository.findByEmailIgnoreCase(clean))
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + clean));
    }

    private FriendProfileResponse buildFriendProfileResponse(User friend) {
        List<UserMovieEntry> entries = userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(friend.getId());

        long watchedCount = entries.stream()
                .filter(e -> e.getStatus() == MovieStatus.WATCHED)
                .count();

        long watchlistCount = entries.stream()
                .filter(e -> e.getStatus() == MovieStatus.WATCHLIST)
                .count();

        OptionalDouble avg = entries.stream()
                .filter(e -> e.getStatus() == MovieStatus.WATCHED && e.getPersonalRating() != null)
                .mapToInt(UserMovieEntry::getPersonalRating)
                .average();

        Double avgRating = avg.isPresent() ? Math.round(avg.getAsDouble() * 10.0) / 10.0 : null;

        return FriendProfileResponse.builder()
                .id(friend.getId())
                .username(friend.getUsername())
                .displayName(friend.getDisplayName())
                .watchedCount(watchedCount)
                .watchlistCount(watchlistCount)
                .avgRating(avgRating)
                .createdAt(friend.getCreatedAt())
                .build();
    }
}
