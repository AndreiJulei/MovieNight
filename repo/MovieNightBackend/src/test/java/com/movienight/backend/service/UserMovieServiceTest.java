package com.movienight.backend.service;

import com.movienight.backend.dto.*;
import com.movienight.backend.model.Movie;
import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.model.User;
import com.movienight.backend.model.UserMovieEntry;
import com.movienight.backend.repository.MovieRepository;
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
class UserMovieServiceTest {

    @Mock
    private MovieRepository movieRepository;

    @Mock
    private UserMovieEntryRepository userMovieEntryRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserMovieService userMovieService;

    private User sampleUser;
    private Movie sampleMovie;
    private UserMovieEntry sampleEntry;

    @BeforeEach
    void setUp() {
        sampleUser = User.builder()
                .id(1L)
                .username("john@example.com")
                .displayName("JohnWick")
                .role("ROLE_USER")
                .build();

        sampleMovie = Movie.builder()
                .id(100L)
                .tmdbId(27205L)
                .title("Inception")
                .releaseYear(2010)
                .overview("A thief who steals corporate secrets through dream-sharing tech.")
                .director("Christopher Nolan")
                .build();

        sampleEntry = UserMovieEntry.builder()
                .id(500L)
                .user(sampleUser)
                .movie(sampleMovie)
                .status(MovieStatus.WATCHED)
                .personalRating(9)
                .notes("Masterpiece ending")
                .watchedAt(LocalDateTime.now())
                .build();
    }

    @Test
    void getUserLibrary_returnsAllEntries() {
        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(sampleUser));
        when(userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(sampleEntry));

        List<UserMovieEntryResponse> library = userMovieService.getUserLibrary("john@example.com", null);

        assertEquals(1, library.size());
        assertEquals("Inception", library.get(0).getMovie().getTitle());
        assertEquals(9, library.get(0).getPersonalRating());
        assertEquals(MovieStatus.WATCHED, library.get(0).getStatus());
    }

    @Test
    void getUserLibrary_withStatusFilter_returnsFilteredEntries() {
        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(sampleUser));
        when(userMovieEntryRepository.findByUserIdAndStatusOrderByCreatedAtDesc(1L, MovieStatus.WATCHED))
                .thenReturn(List.of(sampleEntry));

        List<UserMovieEntryResponse> library = userMovieService.getUserLibrary("john@example.com", MovieStatus.WATCHED);

        assertEquals(1, library.size());
        assertEquals(MovieStatus.WATCHED, library.get(0).getStatus());
        verify(userMovieEntryRepository).findByUserIdAndStatusOrderByCreatedAtDesc(1L, MovieStatus.WATCHED);
    }

    @Test
    void addMovieToLibrary_whenMovieNotInCatalog_persistsMovieAndEntry() {
        AddMovieRequest request = AddMovieRequest.builder()
                .tmdbId(27205L)
                .title("Inception")
                .releaseYear(2010)
                .status(MovieStatus.WATCHLIST)
                .build();

        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(sampleUser));
        when(movieRepository.findByTmdbId(27205L)).thenReturn(Optional.empty());
        when(movieRepository.save(any(Movie.class))).thenReturn(sampleMovie);
        when(userMovieEntryRepository.findByUserIdAndMovieId(1L, 100L)).thenReturn(Optional.empty());
        when(userMovieEntryRepository.save(any(UserMovieEntry.class))).thenReturn(sampleEntry);

        UserMovieEntryResponse response = userMovieService.addMovieToLibrary("john@example.com", request);

        assertNotNull(response);
        assertEquals("Inception", response.getMovie().getTitle());
        verify(movieRepository).save(any(Movie.class));
        verify(userMovieEntryRepository).save(any(UserMovieEntry.class));
    }

    @Test
    void addMovieToLibrary_whenMovieAlreadyInCatalog_reusesMovie() {
        AddMovieRequest request = AddMovieRequest.builder()
                .tmdbId(27205L)
                .title("Inception")
                .releaseYear(2010)
                .status(MovieStatus.WATCHLIST)
                .build();

        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(sampleUser));
        when(movieRepository.findByTmdbId(27205L)).thenReturn(Optional.of(sampleMovie));
        when(userMovieEntryRepository.findByUserIdAndMovieId(1L, 100L)).thenReturn(Optional.empty());
        when(userMovieEntryRepository.save(any(UserMovieEntry.class))).thenReturn(sampleEntry);

        UserMovieEntryResponse response = userMovieService.addMovieToLibrary("john@example.com", request);

        assertNotNull(response);
        verify(movieRepository, never()).save(any(Movie.class)); // Reused existing!
        verify(userMovieEntryRepository).save(any(UserMovieEntry.class));
    }

    @Test
    void updateMovieEntry_success() {
        UpdateMovieEntryRequest request = UpdateMovieEntryRequest.builder()
                .status(MovieStatus.WATCHED)
                .personalRating(10)
                .notes("Rewatched and loved even more")
                .build();

        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(sampleUser));
        when(userMovieEntryRepository.findByUserIdAndMovieId(1L, 100L)).thenReturn(Optional.of(sampleEntry));
        when(userMovieEntryRepository.save(any(UserMovieEntry.class))).thenAnswer(i -> i.getArgument(0));

        UserMovieEntryResponse response = userMovieService.updateMovieEntry("john@example.com", 100L, request);

        assertEquals(10, response.getPersonalRating());
        assertEquals("Rewatched and loved even more", response.getNotes());
        verify(userMovieEntryRepository).save(sampleEntry);
    }

    @Test
    void removeMovieFromLibrary_success() {
        when(userRepository.findByUsername("john@example.com")).thenReturn(Optional.of(sampleUser));

        userMovieService.removeMovieFromLibrary("john@example.com", 100L);

        verify(userMovieEntryRepository).deleteByUserIdAndMovieId(1L, 100L);
    }

    @Test
    void getFriendsRatings_returnsFriendData() {
        User friendUser = User.builder()
                .id(2L)
                .username("sarah@example.com")
                .displayName("SarahConnor")
                .build();

        UserMovieEntry friendEntry = UserMovieEntry.builder()
                .id(501L)
                .user(friendUser)
                .movie(sampleMovie)
                .status(MovieStatus.WATCHED)
                .personalRating(8)
                .notes("Great sci-fi concept!")
                .build();

        when(userMovieEntryRepository.findByMovieIdAndUserIdIn(100L, List.of(2L))).thenReturn(List.of(friendEntry));

        List<FriendRatingResponse> ratings = userMovieService.getFriendsRatings(100L, List.of(2L));

        assertEquals(1, ratings.size());
        assertEquals("SarahConnor", ratings.get(0).getDisplayName());
        assertEquals(8, ratings.get(0).getPersonalRating());
        assertEquals("Great sci-fi concept!", ratings.get(0).getNotes());
    }
}
