package com.movienight.backend.controller;

import com.movienight.backend.dto.*;
import com.movienight.backend.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /**
     * Check if a display name or username is unique.
     * GET /api/auth/check-name?displayName=neo
     */
    @GetMapping("/check-name")
    public ResponseEntity<CheckNameResponse> checkName(@RequestParam("displayName") String displayName) {
        CheckNameResponse response = userService.isDisplayNameAvailable(displayName);
        return ResponseEntity.ok(response);
    }

    /**
     * Sign up a new user with email, username, password and confirmation.
     * POST /api/auth/signup
     */
    @PostMapping("/signup")
    public ResponseEntity<UserResponse> signup(@Valid @RequestBody SignupRequest request) {
        UserResponse response = userService.signup(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Login existing user by email (or username) and obtain JWT token.
     * POST /api/auth/login
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = userService.login(request);
        return ResponseEntity.ok(response);
    }

    /**
     * Request a 6-digit password reset code dispatched via message/email.
     * POST /api/auth/forgot-password
     */
    @PostMapping("/forgot-password")
    public ResponseEntity<ForgotPasswordResponse> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        ForgotPasswordResponse response = userService.forgotPassword(request);
        return ResponseEntity.ok(response);
    }

    /**
     * Verify 6-digit OTP code and set new password.
     * POST /api/auth/reset-password
     */
    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, Object>> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        userService.resetPassword(request);
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Password has been successfully reset. You can now sign in with your new password."
        ));
    }
}
