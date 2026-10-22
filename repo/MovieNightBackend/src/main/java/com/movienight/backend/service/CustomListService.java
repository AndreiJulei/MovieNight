package com.movienight.backend.service;

import com.movienight.backend.dto.*;
import com.movienight.backend.event.MovieNightDomainEvent;
import com.movienight.backend.exception.ResourceNotFoundException;
import com.movienight.backend.model.CustomList;
import com.movienight.backend.model.CustomListEntry;
import com.movienight.backend.model.Movie;
import com.movienight.backend.model.User;
import com.movienight.backend.repository.CustomListEntryRepository;
import com.movienight.backend.repository.CustomListRepository;
import com.movienight.backend.repository.MovieRepository;
import com.movienight.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class CustomListService {

    private final CustomListRepository customListRepository;
    private final CustomListEntryRepository customListEntryRepository;
    private final UserRepository userRepository;
    private final MovieRepository movieRepository;
    private final MovieCatalogLookupService movieCatalogLookupService;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * Create a new custom list.
     */
    @Transactional
    public CustomListResponse createList(String username, CreateCustomListRequest req) {
        User user = findUserByUsername(username);

        CustomList customList = CustomList.builder()
                .user(user)
                .title(req.getTitle().trim())
                .description(req.getDescription() != null ? req.getDescription().trim() : null)
                .isPublic(false)
                .build();

        customList = customListRepository.save(customList);

        if (req.getInitialMovieIds() != null && !req.getInitialMovieIds().isEmpty()) {
            int pos = 0;
            for (Long movieId : new LinkedHashSet<>(req.getInitialMovieIds())) {
                if (movieId == null) throw new IllegalArgumentException("Initial movie IDs cannot be null");
                Movie movie = movieRepository.findById(movieId)
                        .orElseThrow(() -> new ResourceNotFoundException("Movie not found with ID: " + movieId));
                requireSupportedTitle(movie);
                CustomListEntry entry = CustomListEntry.builder()
                        .customList(customList)
                        .movie(movie)
                        .position(pos++)
                        .build();
                customListEntryRepository.save(entry);
                customList.getEntries().add(entry);
            }
        }

        CustomListResponse response = mapToResponse(customList);

        eventPublisher.publishEvent(MovieNightDomainEvent.of(
                "list.created",
                user.getId(),
                user.getUsername(),
                Map.of(
                        "listId", customList.getId(),
                        "title", customList.getTitle(),
                        "isPublic", customList.isPublic(),
                        "movieCount", customList.getEntries().size()
                )
        ));

        log.info("Created custom list '{}' (ID: {}) for user {}", customList.getTitle(), customList.getId(), username);
        return response;
    }

    /**
     * Retrieve all custom lists owned by the user.
     */
    @Transactional(readOnly = true)
    public List<CustomListSummaryResponse> getUserLists(String username) {
        User user = findUserByUsername(username);
        return customListRepository.findByUserIdOrderByCreatedAtDesc(user.getId()).stream()
                .map(this::mapToSummaryResponse)
                .collect(Collectors.toList());
    }

    /**
     * Compatibility endpoint: custom lists are owner-only, including legacy public rows.
     */
    @Transactional(readOnly = true)
    public List<CustomListSummaryResponse> getPublicLists() {
        return Collections.emptyList();
    }

    /**
     * Retrieve a custom list with full movie details by list ID.
     */
    @Transactional(readOnly = true)
    public CustomListResponse getListById(Long listId, String currentUsername) {
        CustomList list = customListRepository.findById(listId)
                .orElseThrow(() -> new ResourceNotFoundException("Custom list not found with ID: " + listId));

        if (currentUsername == null || !list.getUser().getUsername().equalsIgnoreCase(currentUsername.trim())) {
            throw new AccessDeniedException("You do not have permission to view this private list.");
        }

        return mapToResponse(list);
    }

    /**
     * Update list metadata (title, description, isPublic).
     */
    @Transactional
    public CustomListResponse updateList(String username, Long listId, UpdateCustomListRequest req) {
        User user = findUserByUsername(username);
        CustomList list = findOwnedList(listId, user.getId());

        if (req.getTitle() != null && !req.getTitle().isBlank()) {
            list.setTitle(req.getTitle().trim());
        }
        if (req.getDescription() != null) {
            list.setDescription(req.getDescription().trim());
        }
        list.setPublic(false);

        list = customListRepository.save(list);

        eventPublisher.publishEvent(MovieNightDomainEvent.of(
                "list.updated",
                user.getId(),
                user.getUsername(),
                Map.of(
                        "listId", list.getId(),
                        "title", list.getTitle(),
                        "isPublic", list.isPublic()
                )
        ));

        return mapToResponse(list);
    }

    /**
     * Delete a custom list.
     */
    @Transactional
    public void deleteList(String username, Long listId) {
        User user = findUserByUsername(username);
        CustomList list = findOwnedList(listId, user.getId());

        String listTitle = list.getTitle();
        customListRepository.delete(list);

        eventPublisher.publishEvent(MovieNightDomainEvent.of(
                "list.deleted",
                user.getId(),
                user.getUsername(),
                Map.of("listId", listId, "title", listTitle)
        ));

        log.info("Deleted custom list ID {} for user {}", listId, username);
    }

    /**
     * Add a movie to an existing custom list.
     */
    @Transactional
    public CustomListResponse addMovieToList(String username, Long listId, AddMovieToListRequest req) {
        User user = findUserByUsername(username);
        CustomList list = findOwnedList(listId, user.getId());

        Movie movie = movieRepository.findById(req.getMovieId())
                .orElseThrow(() -> new ResourceNotFoundException("Movie not found with ID: " + req.getMovieId()));

        requireSupportedTitle(movie);

        Optional<CustomListEntry> existing = customListEntryRepository.findByCustomListIdAndMovieId(listId, movie.getId());
        if (existing.isPresent()) {
            return mapToResponse(list);
        }

        int position = (req.getPosition() != null) ? req.getPosition() : list.getEntries().size();

        CustomListEntry entry = CustomListEntry.builder()
                .customList(list)
                .movie(movie)
                .position(position)
                .build();

        customListEntryRepository.save(entry);
        list.getEntries().add(entry);

        eventPublisher.publishEvent(MovieNightDomainEvent.of(
                "list.movie_added",
                user.getId(),
                user.getUsername(),
                Map.of(
                        "listId", list.getId(),
                        "movieId", movie.getId(),
                        "title", movie.getTitle()
                )
        ));

        return mapToResponse(list);
    }

    /**
     * Remove a movie from a custom list.
     */
    @Transactional
    public CustomListResponse removeMovieFromList(String username, Long listId, Long movieId) {
        User user = findUserByUsername(username);
        CustomList list = findOwnedList(listId, user.getId());

        customListEntryRepository.deleteByCustomListIdAndMovieId(listId, movieId);
        list.getEntries().removeIf(e -> e.getMovie().getId().equals(movieId));

        // Re-index remaining entries
        int pos = 0;
        for (CustomListEntry e : list.getEntries()) {
            e.setPosition(pos++);
            customListEntryRepository.save(e);
        }

        eventPublisher.publishEvent(MovieNightDomainEvent.of(
                "list.movie_removed",
                user.getId(),
                user.getUsername(),
                Map.of("listId", list.getId(), "movieId", movieId)
        ));

        return mapToResponse(list);
    }

    /**
     * Reorder movies in a custom list according to a provided ID order.
     */
    @Transactional
    public CustomListResponse reorderMovies(String username, Long listId, ReorderCustomListRequest req) {
        User user = findUserByUsername(username);
        CustomList list = findOwnedList(listId, user.getId());

        Map<Long, CustomListEntry> entryMap = list.getEntries().stream()
                .collect(Collectors.toMap(e -> e.getMovie().getId(), e -> e, (e1, e2) -> e1));

        int pos = 0;
        for (Long movieId : req.getOrderedMovieIds()) {
            CustomListEntry entry = entryMap.get(movieId);
            if (entry != null) {
                entry.setPosition(pos++);
                customListEntryRepository.save(entry);
            }
        }

        list.getEntries().sort(Comparator.comparingInt(CustomListEntry::getPosition));

        eventPublisher.publishEvent(MovieNightDomainEvent.of(
                "list.updated",
                user.getId(),
                user.getUsername(),
                Map.of("listId", list.getId(), "action", "reorder")
        ));

        return mapToResponse(list);
    }

    // --- Helper Methods ---

    private void requireSupportedTitle(Movie movie) {
        com.movienight.backend.model.ResourceType.fromCategory(movie.getMediaType());
    }

    private User findUserByUsername(String username) {
        String clean = username != null ? username.trim() : "";
        return userRepository.findByUsername(clean)
                .or(() -> userRepository.findByUsernameIgnoreCase(clean))
                .or(() -> userRepository.findByEmailIgnoreCase(clean))
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + clean));
    }

    private CustomList findOwnedList(Long listId, Long userId) {
        return customListRepository.findByIdAndUserId(listId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Custom list not found or access denied for ID: " + listId));
    }

    public CustomListResponse mapToResponse(CustomList list) {
        List<CustomListEntryResponse> entryResponses = (list.getEntries() == null) ? Collections.emptyList() :
                list.getEntries().stream()
                        .sorted(Comparator.comparingInt(CustomListEntry::getPosition))
                        .map(e -> CustomListEntryResponse.builder()
                                .id(e.getId())
                                .movie(movieCatalogLookupService.mapToResponse(e.getMovie()))
                                .position(e.getPosition())
                                .addedAt(e.getAddedAt())
                                .build())
                        .collect(Collectors.toList());

        return CustomListResponse.builder()
                .id(list.getId())
                .userId(list.getUser().getId())
                .username(list.getUser().getUsername())
                .displayName(list.getUser().getDisplayName())
                .title(list.getTitle())
                .description(list.getDescription())
                .isPublic(false)
                .movieCount(entryResponses.size())
                .entries(entryResponses)
                .createdAt(list.getCreatedAt())
                .updatedAt(list.getUpdatedAt())
                .build();
    }

    public CustomListSummaryResponse mapToSummaryResponse(CustomList list) {
        List<String> previewPosters = (list.getEntries() == null) ? Collections.emptyList() :
                list.getEntries().stream()
                        .sorted(Comparator.comparingInt(CustomListEntry::getPosition))
                        .map(e -> e.getMovie().getPosterUrl())
                        .filter(Objects::nonNull)
                        .limit(4)
                        .collect(Collectors.toList());

        int count = (list.getEntries() == null) ? 0 : list.getEntries().size();

        return CustomListSummaryResponse.builder()
                .id(list.getId())
                .userId(list.getUser().getId())
                .username(list.getUser().getUsername())
                .displayName(list.getUser().getDisplayName())
                .title(list.getTitle())
                .description(list.getDescription())
                .isPublic(false)
                .movieCount(count)
                .previewPosterUrls(previewPosters)
                .createdAt(list.getCreatedAt())
                .updatedAt(list.getUpdatedAt())
                .build();
    }
}
