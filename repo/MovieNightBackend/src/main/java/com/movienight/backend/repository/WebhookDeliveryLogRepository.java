package com.movienight.backend.repository;

import com.movienight.backend.model.WebhookDeliveryLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WebhookDeliveryLogRepository extends JpaRepository<WebhookDeliveryLog, Long> {

    List<WebhookDeliveryLog> findBySubscriptionIdOrderByCreatedAtDesc(Long subscriptionId, Pageable pageable);

    List<WebhookDeliveryLog> findTop50BySubscriptionIdOrderByCreatedAtDesc(Long subscriptionId);

    List<WebhookDeliveryLog> findTop50BySubscriptionUserIdOrderByCreatedAtDesc(Long userId);
}
