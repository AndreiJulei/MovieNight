package com.movienight.backend.service;

import com.movienight.backend.dto.*;
import com.movienight.backend.model.User;
import com.movienight.backend.repository.UserRepository;
import com.movienight.backend.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtTokenProvider jwtTokenProvider;

    @InjectMocks
    private UserService userService;

    private User sampleUser;

    @BeforeEach
    void setUp() {
        sampleUser = User.builder()
                .id(1L)
                .username("john@example.com")
                .displayName("JohnWick")
                .password("hashed_password_123")
                .role("ROLE_USER")
                .createdAt(LocalDateTime.now())
                .build();
    }

    @Test
    void isDisplayNameAvailable_whenUnique_returnsTrue() {
        when(userRepository.existsByDisplayNameIgnoreCase("JohnWick")).thenReturn(false);

        CheckNameResponse response = userService.isDisplayNameAvailable("  JohnWick  ");

        assertTrue(response.isAvailable());
        assertEquals("JohnWick", response.getDisplayName());
    }

    @Test
    void isDisplayNameAvailable_whenAlreadyExists_returnsFalse() {
        when(userRepository.existsByDisplayNameIgnoreCase("johnwick")).thenReturn(true);

        CheckNameResponse response = userService.isDisplayNameAvailable("johnwick");

        assertFalse(response.isAvailable());
    }

    @Test
    void isDisplayNameAvailable_whenBlank_returnsFalse() {
        CheckNameResponse response = userService.isDisplayNameAvailable("   ");

        assertFalse(response.isAvailable());
    }

    @Test
    void signup_success() {
        SignupRequest request = SignupRequest.builder()
                .username("john@example.com")
                .password("secret123")
                .displayName("  JohnWick  ")
                .build();

        when(userRepository.existsByUsername("john@example.com")).thenReturn(false);
        when(userRepository.existsByDisplayNameIgnoreCase("JohnWick")).thenReturn(false);
        when(passwordEncoder.encode("secret123")).thenReturn("hashed_password_123");
        when(userRepository.save(any(User.class))).thenReturn(sampleUser);

        UserResponse response = userService.signup(request);

        assertNotNull(response);
        assertEquals("john@example.com", response.getUsername());
        assertEquals("JohnWick", response.getDisplayName());
        verify(passwordEncoder).encode("secret123");
        verify(userRepository).save(any(User.class));
    }

    @Test
    void signup_duplicateUsername_throwsException() {
        SignupRequest request = SignupRequest.builder()
                .username("john@example.com")
                .password("secret123")
                .displayName("JohnWick")
                .build();

        when(userRepository.existsByUsername("john@example.com")).thenReturn(true);

        assertThrows(IllegalArgumentException.class, () -> userService.signup(request));
        verify(userRepository, never()).save(any());
    }

    @Test
    void login_validCredentials_returnsTokenAndProfile() {
        LoginRequest request = LoginRequest.builder()
                .username("john@example.com")
                .password("secret123")
                .build();

        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(sampleUser));
        when(passwordEncoder.matches("secret123", "hashed_password_123")).thenReturn(true);
        when(jwtTokenProvider.generateToken(anyString(), anyLong(), anyString())).thenReturn("mock.jwt.token");

        LoginResponse response = userService.login(request);

        assertNotNull(response);
        assertEquals("mock.jwt.token", response.getToken());
        assertEquals("john@example.com", response.getUsername());
        assertEquals("JohnWick", response.getDisplayName());
    }

    @Test
    void login_wrongPassword_throwsException() {
        LoginRequest request = LoginRequest.builder()
                .username("john@example.com")
                .password("wrongpassword")
                .build();

        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(sampleUser));
        when(passwordEncoder.matches("wrongpassword", "hashed_password_123")).thenReturn(false);

        assertThrows(IllegalArgumentException.class, () -> userService.login(request));
        verify(jwtTokenProvider, never()).generateToken(anyString(), anyLong(), anyString());
    }
}
