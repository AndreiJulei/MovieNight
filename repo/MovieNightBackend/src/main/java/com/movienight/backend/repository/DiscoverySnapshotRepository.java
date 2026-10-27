package com.movienight.backend.repository;

import com.movienight.backend.model.DiscoverySnapshot;
import com.movienight.backend.model.MovieListType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DiscoverySnapshotRepository extends JpaRepository<DiscoverySnapshot, Long> {
    List<DiscoverySnapshot> findByMediaType(String mediaType);
    Optional<DiscoverySnapshot> findByMediaTypeAndListType(String mediaType, MovieListType listType);
}
