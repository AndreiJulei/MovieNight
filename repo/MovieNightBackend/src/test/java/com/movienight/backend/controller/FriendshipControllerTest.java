package com.movienight.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.movienight.backend.dto.AddFriendRequest;
import com.movienight.backend.dto.FriendProfileResponse;
import com.movienight.backend.dto.UserMovieEntryResponse;
import com.movienight.backend.exception.GlobalExceptionHandler;
import com.movienight.backend.service.FriendshipService;
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
import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class FriendshipControllerTest {

    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private FriendshipService friendshipService;

    @InjectMocks
    private FriendshipController friendshipController;

    private Principal mockPrincipal;
    private FriendProfileResponse sampleFriendResponse;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(friendshipController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        mockPrincipal = new UsernamePasswordAuthenticationToken("john@example.com", null, Collections.emptyList());

        sampleFriendResponse = FriendProfileResponse.builder()
                .id(2L)
                .username("sarah@example.com")
                .displayName("SarahConnor")
                .watchedCount(12)
                .watchlistCount(5)
                .avgRating(8.5)
                .createdAt(LocalDateTime.now())
                .build();
    }

    @Test
    void getFriends_returnsOkAndList() throws Exception {
        when(friendshipService.getFriends("john@example.com")).thenReturn(List.of(sampleFriendResponse));

        mockMvc.perform(get("/api/friends")
                        .principal(mockPrincipal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].displayName").value("SarahConnor"))
                .andExpect(jsonPath("$[0].watchedCount").value(12))
                .andExpect(jsonPath("$[0].avgRating").value(8.5));
    }

    @Test
    void addFriend_validRequest_returnsCreated() throws Exception {
        AddFriendRequest request = AddFriendRequest.builder()
                .identifier("sarah@example.com")
                .build();

        when(friendshipService.addFriend("john@example.com", "sarah@example.com"))
                .thenReturn(sampleFriendResponse);

        mockMvc.perform(post("/api/friends/add")
                        .principal(mockPrincipal)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.displayName").value("SarahConnor"));
    }

    @Test
    void removeFriend_returnsOk() throws Exception {
        mockMvc.perform(delete("/api/friends/2")
                        .principal(mockPrincipal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Friend removed successfully"));

        verify(friendshipService).removeFriend("john@example.com", 2L);
    }

    @Test
    void getFriendLibrary_returnsOk() throws Exception {
        when(friendshipService.getFriendLibrary(eq("john@example.com"), eq(2L), eq(null)))
                .thenReturn(List.of(new UserMovieEntryResponse()));

        mockMvc.perform(get("/api/friends/2/library")
                        .principal(mockPrincipal))
                .andExpect(status().isOk());
    }
}
