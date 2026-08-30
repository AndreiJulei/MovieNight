package com.movienight.backend.service;

import com.movienight.backend.dto.*;
import com.movienight.backend.model.User;
import com.movienight.backend.repository.UserRepository;
import com.movienight.backend.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    /**
     * Check if a trimmed display name is available.
     */
    @Transactional(readOnly = true)
    public CheckNameResponse isDisplayNameAvailable(String rawDisplayName) {
        if (rawDisplayName == null || rawDisplayName.trim().isEmpty()) {
            return CheckNameResponse.builder()
                    .displayName("")
                    .available(false)
                    .message("Display name cannot be blank")
                    .build();
        }

        String trimmed = rawDisplayName.trim();

        if (trimmed.length() < 2 || trimmed.length() > 50) {
            return CheckNameResponse.builder()
                    .displayName(trimmed)
                    .available(false)
                    .message("Display name must be between 2 and 50 characters")
                    .build();
        }

        boolean exists = userRepository.existsByDisplayNameIgnoreCase(trimmed);

        if (exists) {
            return CheckNameResponse.builder()
                    .displayName(trimmed)
                    .available(false)
                    .message("Display name is already taken")
                    .build();
        } else {
            return CheckNameResponse.builder()
                    .displayName(trimmed)
                    .available(true)
                    .message("Display name is available")
                    .build();
        }
    }

    /**
     * Sign up a new user: validate, hash password with BCrypt, save to DB.
     */
    @Transactional
    public UserResponse signup(SignupRequest request) {
        String cleanUsername = request.getUsername().trim().toLowerCase();
        String cleanDisplayName = request.getDisplayName().trim();

        // 1. Verify username / email uniqueness
        if (userRepository.existsByUsername(cleanUsername)) {
            throw new IllegalArgumentException("Username/email is already registered: " + cleanUsername);
        }

        // 2. Verify trimmed display name uniqueness
        if (userRepository.existsByDisplayNameIgnoreCase(cleanDisplayName)) {
            throw new IllegalArgumentException("Display name is already in use: " + cleanDisplayName);
        }

        // 3. Hash the password with BCrypt
        String hashedPassword = passwordEncoder.encode(request.getPassword());

        // 4. Build and save the User entity to DB via JpaRepository
        User user = User.builder()
                .username(cleanUsername)
                .displayName(cleanDisplayName)
                .password(hashedPassword)
                .role("ROLE_USER")
                .build();

        User savedUser = userRepository.save(user);

        // 5. Return safe response without password
        return mapToUserResponse(savedUser);
    }

    /**
     * Login an existing user: verify password, generate JWT token.
     */
    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {
        String cleanUsername = request.getUsername().trim().toLowerCase();

        // 1. Fetch user by username / email
        User user = userRepository.findByUsername(cleanUsername)
                .orElseThrow(() -> new IllegalArgumentException("Invalid username or password"));

        // 2. Verify raw password against stored BCrypt hash using passwordEncoder.matches()
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("Invalid username or password");
        }

        // 3. Generate signed JWT token
        String jwt = jwtTokenProvider.generateToken(user.getUsername(), user.getId(), user.getRole());

        // 4. Return LoginResponse with JWT and profile
        return LoginResponse.builder()
                .token(jwt)
                .tokenType("Bearer")
                .id(user.getId())
                .username(user.getUsername())
                .displayName(user.getDisplayName())
                .role(user.getRole())
                .createdAt(user.getCreatedAt())
                .build();
    }

    public UserResponse mapToUserResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .displayName(user.getDisplayName())
                .role(user.getRole())
                .createdAt(user.getCreatedAt())
                .build();
    }
}
