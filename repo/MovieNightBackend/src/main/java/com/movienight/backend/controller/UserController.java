package com.movienight.backend.controller;

import com.movienight.backend.dto.*;
import com.movienight.backend.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /**
     * Check if a display name is unique.
     * GET /api/auth/check-name?displayName=neo
     */
    @GetMapping("/check-name")
    public ResponseEntity<CheckNameResponse> checkName(@RequestParam("displayName") String displayName) {
        CheckNameResponse response = userService.isDisplayNameAvailable(displayName);
        return ResponseEntity.ok(response);
    }

    /**
     * Sign up a new user.
     * POST /api/auth/signup
     */
    @PostMapping("/signup")
    public ResponseEntity<UserResponse> signup(@Valid @RequestBody SignupRequest request) {
        UserResponse response = userService.signup(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Login existing user and obtain JWT token.
     * POST /api/auth/login
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = userService.login(request);
        return ResponseEntity.ok(response);
    }
}
