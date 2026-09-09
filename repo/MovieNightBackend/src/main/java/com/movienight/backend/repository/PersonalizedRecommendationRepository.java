package com.movienight.backend.repository;

import com.movienight.backend.model.PersonalizedRecommendation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PersonalizedRecommendationRepository extends JpaRepository<PersonalizedRecommendation, Long> {

    List<PersonalizedRecommendation> findByUserIdOrderByRankOrderAsc(Long userId);

    void deleteByUserId(Long userId);
}
