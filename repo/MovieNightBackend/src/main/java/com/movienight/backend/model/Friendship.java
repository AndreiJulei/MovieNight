package com.movienight.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Represents a social friendship link between two users.
 * Symmetrically stored (User A -> User B and User B -> User A)
 * for fast indexed queries from either user's perspective.
 */
@Entity
@Table(name = "friendships",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_user_friend", columnNames = {"user_id", "friend_id"})
    },
    indexes = {
        @Index(name = "idx_friendship_user", columnList = "user_id"),
        @Index(name = "idx_friendship_friend", columnList = "friend_id")
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Friendship {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * The user who has this friend.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /**
     * The friend user profile.
     */
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "friend_id", nullable = false)
    private User friend;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
