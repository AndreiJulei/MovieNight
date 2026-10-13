package com.movienight.backend.repository;

import com.movienight.backend.model.CachedMovieList;
import com.movienight.backend.model.MovieListType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CachedMovieListRepository extends JpaRepository<CachedMovieList, Long> {

    List<CachedMovieList> findByListTypeOrderByRankOrderAsc(MovieListType listType);

    List<CachedMovieList> findByMediaTypeAndListTypeOrderByRankOrderAsc(String mediaType, MovieListType listType);

    List<CachedMovieList> findByMediaTypeOrderByRankOrderAsc(String mediaType);

    List<CachedMovieList> findByTmdbId(Long tmdbId);

    void deleteByListType(MovieListType listType);

    void deleteByMediaTypeAndListType(String mediaType, MovieListType listType);

    long countByListType(MovieListType listType);

    long countByMediaType(String mediaType);
}
