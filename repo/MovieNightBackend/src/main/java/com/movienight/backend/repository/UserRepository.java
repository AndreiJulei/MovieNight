package com.movienight.backend.repository;

import com.movienight.backend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmailIgnoreCase(String email);

    Optional<User> findByUsername(String username);

    Optional<User> findByUsernameIgnoreCase(String username);

    Optional<User> findByDisplayNameIgnoreCase(String displayName);

    boolean existsByEmailIgnoreCase(String email);

    boolean existsByUsername(String username);

    boolean existsByUsernameIgnoreCase(String username);

    boolean existsByDisplayNameIgnoreCase(String displayName);

    java.util.List<User> findByNeedsRecommendationRefreshTrue();

    default Optional<User> findByIdentifier(String identifier) {
        if (identifier == null || identifier.isBlank()) return Optional.empty();
        String clean = identifier.trim();
        return findByUsernameIgnoreCase(clean)
                .or(() -> findByEmailIgnoreCase(clean))
                .or(() -> findByUsername(clean));
    }
}
