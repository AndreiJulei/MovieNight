package com.movienight.backend.repository;

import com.movienight.backend.model.WebhookSubscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WebhookSubscriptionRepository extends JpaRepository<WebhookSubscription, Long> {

    List<WebhookSubscription> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<WebhookSubscription> findByUserIdAndIsActiveTrue(Long userId);

    List<WebhookSubscription> findAllByIsActiveTrue();

    Optional<WebhookSubscription> findByIdAndUserId(Long id, Long userId);
}
