package com.movienight.backend.controller;

import com.movienight.backend.dto.AddFriendRequest;
import com.movienight.backend.dto.FriendProfileResponse;
import com.movienight.backend.dto.UserMovieEntryResponse;
import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.service.FriendshipService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST Controller for social friendships and friend profile management.
 */
@RestController
@RequestMapping("/api/friends")
@RequiredArgsConstructor
public class FriendshipController {

    private final FriendshipService friendshipService;

    /**
     * Get all friends of the authenticated user with their movie stats.
     */
    @GetMapping
    public ResponseEntity<List<FriendProfileResponse>> getFriends(Authentication authentication) {
        return ResponseEntity.ok(friendshipService.getFriends(authentication.getName()));
    }

    /**
     * Add a friend by their username or display name.
     */
    @PostMapping("/add")
    public ResponseEntity<FriendProfileResponse> addFriend(
            @Valid @RequestBody AddFriendRequest request,
            Authentication authentication
    ) {
        FriendProfileResponse response = friendshipService.addFriend(authentication.getName(), request.getIdentifier());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Remove a friend.
     */
    @DeleteMapping("/{friendId}")
    public ResponseEntity<Map<String, String>> removeFriend(
            @PathVariable Long friendId,
            Authentication authentication
    ) {
        friendshipService.removeFriend(authentication.getName(), friendId);
        return ResponseEntity.ok(Map.of("message", "Friend removed successfully"));
    }

    /**
     * View a friend's movie library (optionally filtered by WATCHED or WATCHLIST).
     */
    @GetMapping("/{friendId}/library")
    public ResponseEntity<List<UserMovieEntryResponse>> getFriendLibrary(
            @PathVariable Long friendId,
            @RequestParam(required = false) MovieStatus status,
            Authentication authentication
    ) {
        return ResponseEntity.ok(friendshipService.getFriendLibrary(authentication.getName(), friendId, status));
    }

    /**
     * View a specific friend's profile details and stats.
     */
    @GetMapping("/{friendId}/profile")
    public ResponseEntity<FriendProfileResponse> getFriendProfile(
            @PathVariable Long friendId,
            Authentication authentication
    ) {
        return ResponseEntity.ok(friendshipService.getFriendProfile(authentication.getName(), friendId));
    }
}
