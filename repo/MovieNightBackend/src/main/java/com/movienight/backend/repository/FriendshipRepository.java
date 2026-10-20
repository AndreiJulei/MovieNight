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
    @org.springframework.data.jpa.repository.Query("SELECT f FROM Friendship f WHERE f.user.id = :userId AND f.accepted = true")
    List<Friendship> findAcceptedByUserId(@org.springframework.data.repository.query.Param("userId") Long userId);

    /**
     * Check if a friendship exists between two users.
     */
    @org.springframework.data.jpa.repository.Query("SELECT COUNT(f) > 0 FROM Friendship f WHERE f.user.id = :userId AND f.friend.id = :friendId AND f.accepted = true")
    boolean existsAcceptedByUserIdAndFriendId(@org.springframework.data.repository.query.Param("userId") Long userId, @org.springframework.data.repository.query.Param("friendId") Long friendId);

    @org.springframework.data.jpa.repository.Query("SELECT f FROM Friendship f WHERE f.accepted = false AND (f.user.id = :userId OR f.friend.id = :userId)")
    List<Friendship> findPendingForUser(@org.springframework.data.repository.query.Param("userId") Long userId);

    /**
     * Find a specific friendship link.
     */
    Optional<Friendship> findByUserIdAndFriendId(Long userId, Long friendId);

    /**
     * Delete a friendship link between two users.
     */
    void deleteByUserIdAndFriendId(Long userId, Long friendId);

    @org.springframework.data.jpa.repository.Query("SELECT f.friend.id FROM Friendship f WHERE f.user.id = :userId AND f.accepted = true")
    List<Long> findAcceptedFriendIdsForUser(@org.springframework.data.repository.query.Param("userId") Long userId);
}
