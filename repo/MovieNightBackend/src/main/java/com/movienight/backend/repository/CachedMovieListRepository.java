package com.movienight.backend.repository;

import com.movienight.backend.model.CachedMovieList;
import com.movienight.backend.model.MovieListType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CachedMovieListRepository extends JpaRepository<CachedMovieList, Long> {

    List<CachedMovieList> findByListTypeOrderByRankOrderAsc(MovieListType listType);

    void deleteByListType(MovieListType listType);

    long countByListType(MovieListType listType);
}
