package com.movienight.backend.repository;

import com.movienight.backend.model.MovieSimilarity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface MovieSimilarityRepository extends JpaRepository<MovieSimilarity, Long> {

    List<MovieSimilarity> findByTmdbIdIn(Collection<Long> tmdbIds);

    List<MovieSimilarity> findByTmdbId(Long tmdbId);
}
