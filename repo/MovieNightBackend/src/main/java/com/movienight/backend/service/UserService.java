package com.movienight.backend.service;

import com.movienight.backend.dto.*;
import com.movienight.backend.model.User;
import com.movienight.backend.repository.UserRepository;
import com.movienight.backend.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");

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
     * Sign up a new user with validated email, username, and confirmed password.
     */
    @Transactional
    public UserResponse signup(SignupRequest request) {
        String cleanEmail = request.getEffectiveEmail();
        String cleanUsername = request.getUsername() != null ? request.getUsername().trim() : "";
        String cleanDisplayName = request.getEffectiveDisplayName().trim();

        // 1. Email format validation
        if (cleanEmail.isBlank() || !EMAIL_PATTERN.matcher(cleanEmail).matches()) {
            throw new IllegalArgumentException("Please provide a valid email address (e.g. name@domain.com)");
        }

        // 2. Username format validation
        if (cleanUsername.isBlank() || cleanUsername.length() < 2 || cleanUsername.length() > 50) {
            throw new IllegalArgumentException("Username must be between 2 and 50 characters");
        }

        // 3. Confirm password validation
        if (request.getConfirmPassword() != null && !request.getConfirmPassword().isBlank()
                && !request.getConfirmPassword().equals(request.getPassword())) {
            throw new IllegalArgumentException("Passwords do not match. Please verify your password confirmation.");
        }

        // 4. Verify username / email uniqueness
        if (userRepository.existsByUsername(cleanUsername)) {
            throw new IllegalArgumentException("Username/email is already registered: " + cleanUsername);
        }
        if (!cleanEmail.equalsIgnoreCase(cleanUsername) && userRepository.existsByEmailIgnoreCase(cleanEmail)) {
            throw new IllegalArgumentException("An account with this email already exists: " + cleanEmail);
        }

        // 5. Verify trimmed display name uniqueness
        if (userRepository.existsByDisplayNameIgnoreCase(cleanDisplayName)) {
            throw new IllegalArgumentException("Display name is already in use: " + cleanDisplayName);
        }

        // 6. Hash password with BCrypt
        String hashedPassword = passwordEncoder.encode(request.getPassword());

        // 7. Build and persist User entity
        User user = User.builder()
                .email(cleanEmail)
                .username(cleanUsername)
                .displayName(cleanDisplayName)
                .password(hashedPassword)
                .role("ROLE_USER")
                .build();

        User savedUser = userRepository.save(user);
        log.info("New user registered successfully: {} ({})", cleanUsername, cleanEmail);

        return mapToUserResponse(savedUser);
    }

    /**
     * Login existing user using email (or username handle) + password.
     */
    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {
        String cleanIdentifier = request.getEffectiveIdentifier().toLowerCase();

        if (cleanIdentifier.isBlank()) {
            throw new IllegalArgumentException("Email address is required to sign in");
        }

        // 1. Fetch user by email or username
        User user = userRepository.findByEmailIgnoreCase(cleanIdentifier)
                .or(() -> userRepository.findByUsernameIgnoreCase(cleanIdentifier))
                .or(() -> userRepository.findByUsername(cleanIdentifier))
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password"));

        // 2. Verify raw password against stored BCrypt hash
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("Invalid email or password");
        }

        // 3. Generate signed JWT token
        String jwt = jwtTokenProvider.generateToken(user.getUsername(), user.getId(), user.getRole());

        return LoginResponse.builder()
                .token(jwt)
                .tokenType("Bearer")
                .id(user.getId())
                .email(user.getEmail())
                .username(user.getUsername())
                .displayName(user.getDisplayName())
                .role(user.getRole())
                .createdAt(user.getCreatedAt())
                .build();
    }

    /**
     * Generate and dispatch a 6-digit password reset OTP code.
     */
    @Transactional
    public ForgotPasswordResponse forgotPassword(ForgotPasswordRequest request) {
        String cleanEmail = request.getEmail() != null ? request.getEmail().trim().toLowerCase() : "";

        if (cleanEmail.isBlank() || !EMAIL_PATTERN.matcher(cleanEmail).matches()) {
            throw new IllegalArgumentException("Please provide a valid email address");
        }

        User user = userRepository.findByEmailIgnoreCase(cleanEmail)
                .or(() -> userRepository.findByUsername(cleanEmail))
                .orElse(null);

        String generatedCode = null;
        if (user != null) {
            int codeInt = ThreadLocalRandom.current().nextInt(100000, 1000000);
            generatedCode = String.format("%06d", codeInt);

            user.setResetCode(generatedCode);
            user.setResetCodeExpiresAt(LocalDateTime.now().plusMinutes(15));
            userRepository.save(user);

            log.info("=================================================");
            log.info("PASSWORD RESET MESSAGE for [{}]: Code = {}", cleanEmail, generatedCode);
            log.info("=================================================");
        }

        return ForgotPasswordResponse.builder()
                .success(true)
                .message("If an account exists with this email, a 6-digit reset code has been sent.")
                .devCode(generatedCode)
                .build();
    }

    /**
     * Verify 6-digit OTP code and update password.
     */
    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        String cleanEmail = request.getEmail() != null ? request.getEmail().trim().toLowerCase() : "";

        if (cleanEmail.isBlank() || !EMAIL_PATTERN.matcher(cleanEmail).matches()) {
            throw new IllegalArgumentException("Please enter a valid email address");
        }

        if (request.getCode() == null || request.getCode().trim().isBlank()) {
            throw new IllegalArgumentException("6-digit verification code is required");
        }

        if (request.getNewPassword() == null || request.getNewPassword().length() < 6) {
            throw new IllegalArgumentException("New password must be at least 6 characters");
        }

        if (!request.getNewPassword().equals(request.getConfirmPassword())) {
            throw new IllegalArgumentException("Passwords do not match");
        }

        User user = userRepository.findByEmailIgnoreCase(cleanEmail)
                .or(() -> userRepository.findByUsername(cleanEmail))
                .orElseThrow(() -> new IllegalArgumentException("Invalid or expired verification code"));

        if (user.getResetCode() == null || !user.getResetCode().equals(request.getCode().trim())) {
            throw new IllegalArgumentException("Invalid verification code. Please check your message or request a new code.");
        }

        if (user.getResetCodeExpiresAt() == null || LocalDateTime.now().isAfter(user.getResetCodeExpiresAt())) {
            throw new IllegalArgumentException("Verification code has expired. Please request a new code.");
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        user.setResetCode(null);
        user.setResetCodeExpiresAt(null);
        userRepository.save(user);

        log.info("Password reset successfully for user: {}", cleanEmail);
    }

    /**
     * Get current user's profile details.
     */
    @Transactional(readOnly = true)
    public UserResponse getCurrentUserProfile(String username) {
        User user = findUser(username);
        return mapToUserResponse(user);
    }

    /**
     * Update user's display name, checking uniqueness first.
     */
    @Transactional
    public UserResponse updateDisplayName(String username, String newDisplayName) {
        if (newDisplayName == null || newDisplayName.trim().isEmpty()) {
            throw new IllegalArgumentException("Display name cannot be blank");
        }

        String cleanNewName = newDisplayName.trim();
        if (cleanNewName.length() < 2 || cleanNewName.length() > 50) {
            throw new IllegalArgumentException("Display name must be between 2 and 50 characters");
        }

        User user = findUser(username);

        if (!user.getDisplayName().equalsIgnoreCase(cleanNewName)) {
            if (userRepository.existsByDisplayNameIgnoreCase(cleanNewName)) {
                throw new IllegalArgumentException("Display name is already taken: " + cleanNewName);
            }
            user.setDisplayName(cleanNewName);
            user = userRepository.save(user);
        }

        return mapToUserResponse(user);
    }

    /**
     * Change user's password after verifying the old password hash.
     */
    @Transactional
    public void changePassword(String username, String oldPassword, String newPassword) {
        User user = findUser(username);

        if (!passwordEncoder.matches(oldPassword, user.getPassword())) {
            throw new IllegalArgumentException("Current password is incorrect.");
        }

        if (newPassword == null || newPassword.trim().length() < 6) {
            throw new IllegalArgumentException("New password must be at least 6 characters.");
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }

    private User findUser(String username) {
        String clean = username != null ? username.trim() : "";
        return userRepository.findByUsername(clean)
                .or(() -> userRepository.findByUsernameIgnoreCase(clean))
                .or(() -> userRepository.findByEmailIgnoreCase(clean))
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + clean));
    }

    public UserResponse mapToUserResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .username(user.getUsername())
                .displayName(user.getDisplayName())
                .role(user.getRole())
                .createdAt(user.getCreatedAt())
                .build();
    }
}
