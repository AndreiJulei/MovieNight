package com.movienight.backend.service;

import com.movienight.backend.dto.FriendProfileResponse;
import com.movienight.backend.dto.FriendInvitationResponse;
import org.springframework.security.access.AccessDeniedException;
import com.movienight.backend.dto.FriendLibraryEntryResponse;
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
        List<Friendship> friendships = friendshipRepository.findAcceptedByUserId(user.getId());

        return friendships.stream()
                .map(Friendship::getFriend)
                .map(this::buildFriendProfileResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<FriendInvitationResponse> getInvitations(String username) {
        User user = findUserByUsername(username);
        return friendshipRepository.findPendingForUser(user.getId()).stream()
                .map(this::invitationResponse).toList();
    }

    /** Sending or repeating an invitation never constitutes acceptance. */
    @Transactional
    public FriendInvitationResponse addFriend(String currentUsername, String targetIdentifier) {
        User user = findUserByUsername(currentUsername);
        String cleanTarget = targetIdentifier != null ? targetIdentifier.trim() : "";
        if (cleanTarget.startsWith("@")) cleanTarget = cleanTarget.substring(1);
        final String identifier = cleanTarget;
        User target = userRepository.findByUsernameIgnoreCase(identifier)
                .or(() -> userRepository.findByDisplayNameIgnoreCase(identifier))
                .or(() -> userRepository.findByEmailIgnoreCase(identifier))
                .orElseThrow(() -> new IllegalArgumentException("User not found."));
        if (user.getId().equals(target.getId())) throw new IllegalArgumentException("You cannot invite yourself.");
        lockPair(user.getId(), target.getId());
        if (friendshipRepository.existsAcceptedByUserIdAndFriendId(user.getId(), target.getId())) {
            throw new IllegalArgumentException("You are already friends.");
        }
        var existing = friendshipRepository.findByUserIdAndFriendId(user.getId(), target.getId())
                .or(() -> friendshipRepository.findByUserIdAndFriendId(target.getId(), user.getId()));
        Friendship invitation = existing.orElseGet(() -> friendshipRepository.save(
                Friendship.builder().user(user).friend(target).build()));
        return invitationResponse(invitation);
    }

    @Transactional
    public FriendProfileResponse acceptInvitation(String username, Long senderId) {
        User recipient = findUserByUsername(username);
        lockPair(recipient.getId(), senderId);
        Friendship invitation = friendshipRepository.findByUserIdAndFriendId(senderId, recipient.getId())
                .orElseThrow(() -> new AccessDeniedException("No incoming invitation from this account."));
        boolean newlyAccepted = !invitation.isAccepted();
        invitation.setAccepted(true);
        Friendship reverse = friendshipRepository.findByUserIdAndFriendId(recipient.getId(), senderId)
                .orElseGet(() -> Friendship.builder().user(recipient).friend(invitation.getUser()).build());
        reverse.setAccepted(true);
        friendshipRepository.saveAll(List.of(invitation, reverse));
        if (newlyAccepted && eventPublisher != null) {
            eventPublisher.publishEvent(com.movienight.backend.event.MovieNightDomainEvent.of(
                    "friend.added", recipient.getId(), recipient.getUsername(),
                    java.util.Map.of("friendId", senderId, "friendUsername", invitation.getUser().getUsername(),
                            "friendDisplayName", invitation.getUser().getDisplayName())));
        }
        return buildFriendProfileResponse(invitation.getUser());
    }

    /** Either participant may cancel, decline, or revoke their pair. */
    @Transactional
    public void removeFriend(String currentUsername, Long friendId) {
        User user = findUserByUsername(currentUsername);
        lockPair(user.getId(), friendId);
        boolean wasAccepted = friendshipRepository.existsAcceptedByUserIdAndFriendId(user.getId(), friendId);
        friendshipRepository.deleteByUserIdAndFriendId(user.getId(), friendId);
        friendshipRepository.deleteByUserIdAndFriendId(friendId, user.getId());
        if (wasAccepted && eventPublisher != null) {
            eventPublisher.publishEvent(com.movienight.backend.event.MovieNightDomainEvent.of(
                    "friend.removed", user.getId(), user.getUsername(), java.util.Map.of("friendId", friendId)));
        }
    }

    private void lockPair(Long first, Long second) {
        if (first.equals(second)) throw new IllegalArgumentException("Choose another account.");
        userRepository.lockById(Math.min(first, second))
                .orElseThrow(() -> new IllegalArgumentException("Account not found."));
        userRepository.lockById(Math.max(first, second))
                .orElseThrow(() -> new IllegalArgumentException("Account not found."));
    }

    private FriendInvitationResponse invitationResponse(Friendship invitation) {
        User sender = invitation.getUser(), recipient = invitation.getFriend();
        return new FriendInvitationResponse(sender.getId(), sender.getUsername(), sender.getDisplayName(),
                recipient.getId(), recipient.getUsername(), recipient.getDisplayName());
    }

    /**
     * View a friend's movie library (filtered by WATCHED or WATCHLIST).
     */
    @Transactional(readOnly = true)
    public List<FriendLibraryEntryResponse> getFriendLibrary(String currentUsername, Long friendId, MovieStatus status) {
        User user = findUserByUsername(currentUsername);

        if (!friendshipRepository.existsAcceptedByUserIdAndFriendId(user.getId(), friendId)) {
            throw new AccessDeniedException("You can only view movie libraries of your friends.");
        }

        User friend = userRepository.findById(friendId)
                .orElseThrow(() -> new IllegalArgumentException("Friend not found with ID: " + friendId));

        return userMovieService.getUserLibrary(friend.getUsername(), status).stream()
                .filter(e -> e.getStatus() == MovieStatus.WATCHED || e.getStatus() == MovieStatus.WATCHLIST)
                .map(FriendLibraryEntryResponse::from).toList();
    }

    /**
     * Get a specific friend's profile stats.
     */
    @Transactional(readOnly = true)
    public FriendProfileResponse getFriendProfile(String currentUsername, Long friendId) {
        User user = findUserByUsername(currentUsername);

        if (!friendshipRepository.existsAcceptedByUserIdAndFriendId(user.getId(), friendId)) {
            throw new AccessDeniedException("You can only view profiles of your friends.");
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
                .mapToDouble(UserMovieEntry::getPersonalRating)
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
