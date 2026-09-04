package com.movienight.backend.repository;

import com.movienight.backend.model.Friendship;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FriendshipRepository extends JpaRepository<Friendship, Long> {

    /**
     * Fetch all friends for a given user ID.
     */
    List<Friendship> findByUserId(Long userId);

    /**
     * Check if a friendship exists between two users.
     */
    boolean existsByUserIdAndFriendId(Long userId, Long friendId);

    /**
     * Find a specific friendship link.
     */
    Optional<Friendship> findByUserIdAndFriendId(Long userId, Long friendId);

    /**
     * Delete a friendship link between two users.
     */
    void deleteByUserIdAndFriendId(Long userId, Long friendId);
}
