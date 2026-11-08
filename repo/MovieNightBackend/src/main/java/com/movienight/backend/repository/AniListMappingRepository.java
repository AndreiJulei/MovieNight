package com.movienight.backend.repository;

import com.movienight.backend.model.AniListMapping;
import com.movienight.backend.model.ResourceType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AniListMappingRepository extends JpaRepository<AniListMapping, Long> {
    Optional<AniListMapping> findByResourceTypeAndTmdbId(ResourceType resourceType, Long tmdbId);
}
