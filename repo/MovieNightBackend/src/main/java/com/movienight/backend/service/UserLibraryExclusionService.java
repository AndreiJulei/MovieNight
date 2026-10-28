package com.movienight.backend.service;

import com.movienight.backend.model.MovieStatus;
import com.movienight.backend.model.User;
import com.movienight.backend.model.UserMovieEntry;
import com.movienight.backend.repository.UserMovieEntryRepository;
import com.movienight.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Centralized service for determining owner-library exclusions across Explore shelves
 * and paginated discovery sessions (DR04).
 */
@Service
@RequiredArgsConstructor
public class UserLibraryExclusionService {

    private final UserRepository userRepository;
    private final UserMovieEntryRepository userMovieEntryRepository;

    @Transactional(readOnly = true)
    public Set<Long> getExcludedTmdbIds(String username, String mediaType) {
        if (username == null || username.isBlank()) {
            return Collections.emptySet();
        }
        String clean = username.trim();
        User user = userRepository.findByUsername(clean)
                .or(() -> userRepository.findByUsernameIgnoreCase(clean))
                .or(() -> userRepository.findByEmailIgnoreCase(clean))
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + clean));

        String normalizedType = normalizeMediaType(mediaType);
        List<UserMovieEntry> entries = userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(user.getId());
        return entries.stream()
                .filter(e -> e.getStatus() == MovieStatus.WATCHLIST || e.getStatus() == MovieStatus.WATCHED)
                .filter(e -> isMatchingMediaType(e.getMovie().getMediaType(), normalizedType))
                .map(e -> e.getMovie().getTmdbId())
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
    }

    public boolean isMatchingMediaType(String itemMediaType, String categoryMediaType) {
        if (itemMediaType == null) return false;
        if ("MOVIE".equals(categoryMediaType)) {
            return "MOVIE".equalsIgnoreCase(itemMediaType);
        }
        return "TV".equalsIgnoreCase(itemMediaType) || "ANIME".equalsIgnoreCase(itemMediaType);
    }

    public String normalizeMediaType(String type) {
        if (type == null) return "MOVIE";
        String s = type.trim().toUpperCase();
        if (s.contains("TV") || s.contains("SERIES")) return "TV";
        if (s.contains("ANIME")) return "ANIME";
        return "MOVIE";
    }
}
