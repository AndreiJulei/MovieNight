package com.movienight.backend.repository;

import com.movienight.backend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    Optional<User> findByDisplayNameIgnoreCase(String displayName);

    boolean existsByUsername(String username);

    boolean existsByDisplayNameIgnoreCase(String displayName);
    
}
