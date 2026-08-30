package com.movienight.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.movienight.backend.dto.*;
import com.movienight.backend.exception.GlobalExceptionHandler;
import com.movienight.backend.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDateTime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class UserControllerTest {

    private MockMvc mockMvc;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private UserService userService;

    @InjectMocks
    private UserController userController;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(userController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void checkName_returnsOkAndAvailability() throws Exception {
        when(userService.isDisplayNameAvailable("Neo")).thenReturn(
                CheckNameResponse.builder()
                        .displayName("Neo")
                        .available(true)
                        .message("Display name is available")
                        .build()
        );

        mockMvc.perform(get("/api/auth/check-name")
                        .param("displayName", "Neo"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Neo"))
                .andExpect(jsonPath("$.available").value(true));
    }

    @Test
    void signup_validRequest_returnsCreated() throws Exception {
        SignupRequest request = SignupRequest.builder()
                .username("neo@matrix.com")
                .password("theone123")
                .displayName("TheOne")
                .build();

        UserResponse response = UserResponse.builder()
                .id(1L)
                .username("neo@matrix.com")
                .displayName("TheOne")
                .role("ROLE_USER")
                .createdAt(LocalDateTime.now())
                .build();

        when(userService.signup(any(SignupRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("neo@matrix.com"))
                .andExpect(jsonPath("$.displayName").value("TheOne"));
    }

    @Test
    void signup_invalidPassword_returnsBadRequest() throws Exception {
        SignupRequest request = SignupRequest.builder()
                .username("neo@matrix.com")
                .password("123") // too short (< 6)
                .displayName("TheOne")
                .build();

        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void login_validCredentials_returnsOkAndToken() throws Exception {
        LoginRequest request = LoginRequest.builder()
                .username("neo@matrix.com")
                .password("theone123")
                .build();

        LoginResponse response = LoginResponse.builder()
                .token("mock.jwt.token")
                .tokenType("Bearer")
                .id(1L)
                .username("neo@matrix.com")
                .displayName("TheOne")
                .role("ROLE_USER")
                .createdAt(LocalDateTime.now())
                .build();

        when(userService.login(any(LoginRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("mock.jwt.token"))
                .andExpect(jsonPath("$.username").value("neo@matrix.com"));
    }
}
