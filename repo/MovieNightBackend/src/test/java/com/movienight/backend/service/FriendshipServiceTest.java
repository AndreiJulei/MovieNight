package com.movienight.backend.service;

import com.movienight.backend.dto.FriendProfileResponse;
import com.movienight.backend.dto.UserMovieEntryResponse;
import com.movienight.backend.model.Friendship;
import com.movienight.backend.model.Movie;
import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.model.User;
import com.movienight.backend.model.UserMovieEntry;
import com.movienight.backend.repository.FriendshipRepository;
import com.movienight.backend.repository.UserMovieEntryRepository;
import com.movienight.backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FriendshipServiceTest {

    @Mock
    private FriendshipRepository friendshipRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private UserMovieEntryRepository userMovieEntryRepository;

    @Mock
    private UserMovieService userMovieService;

    @InjectMocks
    private FriendshipService friendshipService;

    private User currentUser;
    private User friendUser;
    private Friendship sampleFriendship;

    @BeforeEach
    void setUp() {
        currentUser = User.builder()
                .id(1L)
                .username("john@example.com")
                .displayName("JohnWick")
                .role("ROLE_USER")
                .build();

        friendUser = User.builder()
                .id(2L)
                .username("sarah@example.com")
                .displayName("SarahConnor")
                .role("ROLE_USER")
                .build();

        sampleFriendship = Friendship.builder()
                .id(10L)
                .user(currentUser)
                .friend(friendUser)
                .createdAt(LocalDateTime.now())
                .build();
    }

    @Test
    void getFriends_returnsFriendsWithStats() {
        UserMovieEntry watchedEntry = UserMovieEntry.builder()
                .id(101L)
                .user(friendUser)
                .movie(Movie.builder().id(50L).title("Terminator").build())
                .status(MovieStatus.WATCHED)
                .personalRating(9)
                .build();

        UserMovieEntry watchlistEntry = UserMovieEntry.builder()
                .id(102L)
                .user(friendUser)
                .movie(Movie.builder().id(51L).title("Aliens").build())
                .status(MovieStatus.WATCHLIST)
                .build();

        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(currentUser));
        when(friendshipRepository.findByUserId(1L)).thenReturn(List.of(sampleFriendship));
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(2L)).thenReturn(List.of(watchedEntry, watchlistEntry));

        List<FriendProfileResponse> friends = friendshipService.getFriends("john@example.com");

        assertEquals(1, friends.size());
        assertEquals("SarahConnor", friends.get(0).getDisplayName());
        assertEquals(1, friends.get(0).getWatchedCount());
        assertEquals(1, friends.get(0).getWatchlistCount());
        assertEquals(9.0, friends.get(0).getAvgRating());
    }

    @Test
    void addFriend_success() {
        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(currentUser));
        when(userRepository.findByUsername("sarah@example.com")).thenReturn(Optional.of(friendUser));
        when(friendshipRepository.existsByUserIdAndFriendId(1L, 2L)).thenReturn(false);
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(2L)).thenReturn(List.of());

        FriendProfileResponse response = friendshipService.addFriend("john@example.com", "sarah@example.com");

        assertNotNull(response);
        assertEquals("SarahConnor", response.getDisplayName());
        verify(friendshipRepository).saveAll(any());
    }

    @Test
    void addFriend_cannotAddSelf() {
        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(currentUser));
        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(currentUser));

        assertThrows(IllegalArgumentException.class, () ->
                friendshipService.addFriend("john@example.com", "john@example.com")
        );
        verify(friendshipRepository, never()).saveAll(any());
    }

    @Test
    void addFriend_alreadyFriends_throwsException() {
        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(currentUser));
        when(userRepository.findByUsername("sarah@example.com")).thenReturn(Optional.of(friendUser));
        when(friendshipRepository.existsByUserIdAndFriendId(1L, 2L)).thenReturn(true);

        assertThrows(IllegalArgumentException.class, () ->
                friendshipService.addFriend("john@example.com", "sarah@example.com")
        );
        verify(friendshipRepository, never()).saveAll(any());
    }

    @Test
    void removeFriend_deletesBothDirections() {
        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(currentUser));

        friendshipService.removeFriend("john@example.com", 2L);

        verify(friendshipRepository).deleteByUserIdAndFriendId(1L, 2L);
        verify(friendshipRepository).deleteByUserIdAndFriendId(2L, 1L);
    }

    @Test
    void getFriendLibrary_whenFriends_returnsLibrary() {
        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(currentUser));
        when(friendshipRepository.existsByUserIdAndFriendId(1L, 2L)).thenReturn(true);
        when(userRepository.findById(2L)).thenReturn(Optional.of(friendUser));
        when(userMovieService.getUserLibrary("sarah@example.com", MovieStatus.WATCHED)).thenReturn(List.of(new UserMovieEntryResponse()));

        List<UserMovieEntryResponse> library = friendshipService.getFriendLibrary("john@example.com", 2L, MovieStatus.WATCHED);

        assertNotNull(library);
        assertEquals(1, library.size());
    }

    @Test
    void getFriendLibrary_whenNotFriends_throwsException() {
        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(currentUser));
        when(friendshipRepository.existsByUserIdAndFriendId(1L, 2L)).thenReturn(false);

        assertThrows(IllegalArgumentException.class, () ->
                friendshipService.getFriendLibrary("john@example.com", 2L, null)
        );
    }
}
