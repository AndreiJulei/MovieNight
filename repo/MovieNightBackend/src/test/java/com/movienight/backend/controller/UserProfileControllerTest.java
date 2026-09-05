package com.movienight.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.movienight.backend.dto.ChangePasswordRequest;
import com.movienight.backend.dto.UpdateProfileRequest;
import com.movienight.backend.dto.UserResponse;
import com.movienight.backend.exception.GlobalExceptionHandler;
import com.movienight.backend.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.security.Principal;
import java.time.LocalDateTime;
import java.util.Collections;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class UserProfileControllerTest {

    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private UserService userService;

    @InjectMocks
    private UserProfileController userProfileController;

    private Principal mockPrincipal;
    private UserResponse sampleUserResponse;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(userProfileController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        mockPrincipal = new UsernamePasswordAuthenticationToken("john@example.com", null, Collections.emptyList());

        sampleUserResponse = UserResponse.builder()
                .id(1L)
                .username("john@example.com")
                .displayName("JohnWick")
                .role("ROLE_USER")
                .createdAt(LocalDateTime.now())
                .build();
    }

    @Test
    void getProfile_returnsOk() throws Exception {
        when(userService.getCurrentUserProfile("john@example.com")).thenReturn(sampleUserResponse);

        mockMvc.perform(get("/api/users/me")
                        .principal(mockPrincipal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("JohnWick"))
                .andExpect(jsonPath("$.username").value("john@example.com"));
    }

    @Test
    void updateProfile_validName_returnsOk() throws Exception {
        UpdateProfileRequest request = UpdateProfileRequest.builder()
                .displayName("JohnBabaYaga")
                .build();

        UserResponse updatedResponse = UserResponse.builder()
                .id(1L)
                .username("john@example.com")
                .displayName("JohnBabaYaga")
                .role("ROLE_USER")
                .createdAt(LocalDateTime.now())
                .build();

        when(userService.updateDisplayName(eq("john@example.com"), eq("JohnBabaYaga")))
                .thenReturn(updatedResponse);

        mockMvc.perform(put("/api/users/profile")
                        .principal(mockPrincipal)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("JohnBabaYaga"));
    }

    @Test
    void changePassword_validRequest_returnsOk() throws Exception {
        ChangePasswordRequest request = ChangePasswordRequest.builder()
                .oldPassword("oldPassword123")
                .newPassword("newPassword456")
                .build();

        mockMvc.perform(put("/api/users/password")
                        .principal(mockPrincipal)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Password changed successfully"));

        verify(userService).changePassword("john@example.com", "oldPassword123", "newPassword456");
    }
}
