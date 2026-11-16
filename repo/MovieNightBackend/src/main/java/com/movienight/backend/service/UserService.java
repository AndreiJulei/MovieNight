package com.movienight.backend.service;

import com.movienight.backend.dto.*;
import com.movienight.backend.model.User;
import com.movienight.backend.repository.UserLookup;
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
    /** Changed usernames are sign-in handles: no spaces and no "@", so they never collide with an email. */
    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[A-Za-z0-9._-]{2,50}$");
    private static final String USERNAME_RULE = "Username must be 2–50 letters, numbers, dots, dashes or underscores.";
    private static final String USERNAME_TAKEN = "That username is already taken.";
    private static final String EMAIL_TAKEN = "An account with this email already exists.";

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
                    .name("")
                    .available(false)
                    .message("Display name cannot be blank")
                    .build();
        }

        String trimmed = rawDisplayName.trim();

        if (trimmed.length() < 2 || trimmed.length() > 50) {
            return CheckNameResponse.builder()
                    .name(trimmed)
                    .available(false)
                    .message("Display name must be between 2 and 50 characters")
                    .build();
        }

        boolean exists = userRepository.existsByDisplayNameIgnoreCase(trimmed);

        if (exists) {
            return CheckNameResponse.builder()
                    .name(trimmed)
                    .available(false)
                    .message("Display name is already taken")
                    .build();
        } else {
            return CheckNameResponse.builder()
                    .name(trimmed)
                    .available(true)
                    .message("Display name is available")
                    .build();
        }
    }

    /**
     * Check whether a username is free to claim (case-insensitive); reused by signup and Settings.
     */
    @Transactional(readOnly = true)
    public CheckNameResponse isUsernameAvailable(String rawUsername) {
        String trimmed = rawUsername == null ? "" : rawUsername.trim();
        if (!USERNAME_PATTERN.matcher(trimmed).matches()) {
            return CheckNameResponse.builder().name(trimmed).available(false).message(USERNAME_RULE).build();
        }
        boolean taken = userRepository.existsByUsernameIgnoreCase(trimmed);
        return CheckNameResponse.builder().name(trimmed).available(!taken)
                .message(taken ? USERNAME_TAKEN : "Username is available").build();
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

        // 4. Verify username / email uniqueness. Case-insensitive, like a username change (#31),
        //    since sign-in matches usernames case-insensitively.
        if (userRepository.existsByUsernameIgnoreCase(cleanUsername)) {
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
            throw new IllegalArgumentException("Please enter your email or username");
        }

        // 1. Fetch user by email or username
        User user = userRepository.findByEmailIgnoreCase(cleanIdentifier)
                .or(() -> userRepository.findByUsernameIgnoreCase(cleanIdentifier))
                .or(() -> userRepository.findByUsername(cleanIdentifier))
                .orElseThrow(() -> new IllegalArgumentException("Invalid email/username or password"));

        // 2. Verify raw password against stored BCrypt hash
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("Invalid email/username or password");
        }

        return loginResponse(user);
    }

    /** A fresh signed token plus the user's profile; the token subject is the current username. */
    private LoginResponse loginResponse(User user) {
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
     * Change the username. The JWT subject is the username, so the caller receives a fresh token.
     */
    @Transactional
    public LoginResponse changeUsername(String currentUsername, String rawUsername) {
        String clean = rawUsername == null ? "" : rawUsername.trim();
        if (!USERNAME_PATTERN.matcher(clean).matches()) throw new IllegalArgumentException(USERNAME_RULE);
        User user = lockUser(currentUsername);
        if (!user.getUsername().equals(clean)) {
            userRepository.findByUsernameIgnoreCase(clean)
                    .filter(other -> !other.getId().equals(user.getId()))
                    .ifPresent(other -> { throw new IllegalArgumentException(USERNAME_TAKEN); });
            user.setUsername(clean);
            userRepository.saveAndFlush(user);
            log.info("User {} changed username", user.getId());
        }
        return loginResponse(user);
    }

    /**
     * Change the email after verifying the current password. No verification email is sent (#31).
     */
    @Transactional
    public UserResponse changeEmail(String currentUsername, String rawEmail, String currentPassword) {
        String clean = rawEmail == null ? "" : rawEmail.trim().toLowerCase();
        if (!EMAIL_PATTERN.matcher(clean).matches() || clean.length() > 100) {
            throw new IllegalArgumentException("Please provide a valid email address (e.g. name@domain.com)");
        }
        User user = lockUser(currentUsername);
        if (currentPassword == null || !passwordEncoder.matches(currentPassword, user.getPassword())) {
            throw new IllegalArgumentException("Current password is incorrect.");
        }
        if (!user.getEmail().equalsIgnoreCase(clean)) {
            boolean taken = userRepository.findByEmailIgnoreCase(clean).filter(o -> !o.getId().equals(user.getId())).isPresent()
                    // Legacy usernames may be emails; sign-in must stay unambiguous.
                    || userRepository.findByUsernameIgnoreCase(clean).filter(o -> !o.getId().equals(user.getId())).isPresent();
            if (taken) throw new IllegalArgumentException(EMAIL_TAKEN);
            user.setEmail(clean);
            userRepository.saveAndFlush(user);
        }
        return mapToUserResponse(user);
    }

    /**
     * Share or hide the watchlist and watched history with accepted friends (#33).
     */
    @Transactional
    public UserResponse updateSharing(String username, UpdateSharingRequest request) {
        User user = lockUser(username);
        if (request.sharesWatchlist() != null) user.setSharesWatchlist(request.sharesWatchlist());
        if (request.sharesWatched() != null) user.setSharesWatched(request.sharesWatched());
        userRepository.save(user);
        return mapToUserResponse(user);
    }

    private User lockUser(String username) {
        Long id = findUser(username).getId();
        return userRepository.lockById(id).orElseThrow(() -> new IllegalArgumentException("User not found"));
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
        if (cleanNewName.length() > 50) {
            throw new IllegalArgumentException("Display name must be between 1 and 50 characters");
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
        return UserLookup.byAccountName(userRepository, clean)
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
                .sharesWatchlist(user.isSharesWatchlist())
                .sharesWatched(user.isSharesWatched())
                .build();
    }
}
