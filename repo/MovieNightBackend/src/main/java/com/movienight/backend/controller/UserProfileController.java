package com.movienight.backend.controller;

import com.movienight.backend.dto.ChangeEmailRequest;
import com.movienight.backend.dto.ChangePasswordRequest;
import com.movienight.backend.dto.ChangeUsernameRequest;
import com.movienight.backend.dto.LoginResponse;
import com.movienight.backend.dto.UpdateProfileRequest;
import com.movienight.backend.dto.UpdateSharingRequest;
import com.movienight.backend.dto.UserResponse;
import com.movienight.backend.dto.ProgressResponse;
import com.movienight.backend.dto.SetAvatarRequest;
import com.movienight.backend.service.ProgressionService;
import com.movienight.backend.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Controller for managing authenticated user profiles and security settings.
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserProfileController {

    private final UserService userService;
    private final ProgressionService progressionService;

    /** The owner's level, rank, XP bar and avatar choices (#32). */
    @GetMapping("/me/progress")
    public ResponseEntity<ProgressResponse> getProgress(Authentication authentication) {
        return ResponseEntity.ok(progressionService.progress(authentication.getName()));
    }

    /** Choose an avatar unlocked at the current level; null restores the default. */
    @PutMapping("/me/avatar")
    public ResponseEntity<ProgressResponse> chooseAvatar(
            @RequestBody SetAvatarRequest request,
            Authentication authentication
    ) {
        return ResponseEntity.ok(progressionService.chooseAvatar(authentication.getName(), request.avatar()));
    }

    /**
     * Get profile of the currently logged-in user.
     */
    @GetMapping("/me")
    public ResponseEntity<UserResponse> getProfile(Authentication authentication) {
        return ResponseEntity.ok(userService.getCurrentUserProfile(authentication.getName()));
    }

    /**
     * Update current user's display name.
     */
    @PutMapping("/profile")
    public ResponseEntity<UserResponse> updateProfile(
            @Valid @RequestBody UpdateProfileRequest request,
            Authentication authentication
    ) {
        UserResponse response = userService.updateDisplayName(authentication.getName(), request.getDisplayName());
        return ResponseEntity.ok(response);
    }

    /**
     * Change the username; the response carries a fresh token that replaces the client's current one.
     */
    @PutMapping("/username")
    public ResponseEntity<LoginResponse> changeUsername(
            @Valid @RequestBody ChangeUsernameRequest request,
            Authentication authentication
    ) {
        return ResponseEntity.ok(userService.changeUsername(authentication.getName(), request.getUsername()));
    }

    /**
     * Change the email after verifying the current password.
     */
    @PutMapping("/email")
    public ResponseEntity<UserResponse> changeEmail(
            @Valid @RequestBody ChangeEmailRequest request,
            Authentication authentication
    ) {
        return ResponseEntity.ok(userService.changeEmail(
                authentication.getName(), request.getEmail(), request.getCurrentPassword()));
    }

    /**
     * Share or hide the watchlist and watched history with accepted friends (#33).
     */
    @PutMapping("/me/sharing")
    public ResponseEntity<UserResponse> updateSharing(
            @RequestBody UpdateSharingRequest request,
            Authentication authentication
    ) {
        return ResponseEntity.ok(userService.updateSharing(authentication.getName(), request));
    }

    /**
     * Change current user's password.
     */
    @PutMapping("/password")
    public ResponseEntity<Map<String, String>> changePassword(
            @Valid @RequestBody ChangePasswordRequest request,
            Authentication authentication
    ) {
        userService.changePassword(authentication.getName(), request.getOldPassword(), request.getNewPassword());
        return ResponseEntity.ok(Map.of("message", "Password changed successfully"));
    }
}
