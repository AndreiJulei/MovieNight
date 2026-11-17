package com.movienight.backend.repository;

import com.movienight.backend.model.RecommendationDismissal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RecommendationDismissalRepository extends JpaRepository<RecommendationDismissal, Long> {

    @Query("SELECT d.tmdbId FROM RecommendationDismissal d WHERE d.user.id = :userId AND d.mediaType = :mediaType")
    List<Long> findTmdbIdsByUserIdAndMediaType(@Param("userId") Long userId, @Param("mediaType") String mediaType);

    boolean existsByUserIdAndMediaTypeAndTmdbId(Long userId, String mediaType, Long tmdbId);

    @Modifying
    @Query("DELETE FROM RecommendationDismissal d WHERE d.user.id = :userId AND d.mediaType = :mediaType AND d.tmdbId = :tmdbId")
    int deleteDismissal(@Param("userId") Long userId, @Param("mediaType") String mediaType, @Param("tmdbId") Long tmdbId);
}
