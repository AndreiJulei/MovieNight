package com.movienight.backend.repository;

import com.movienight.backend.model.CustomListEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CustomListEntryRepository extends JpaRepository<CustomListEntry, Long> {

    List<CustomListEntry> findByCustomListIdOrderByPositionAsc(Long customListId);

    Optional<CustomListEntry> findByCustomListIdAndMovieId(Long customListId, Long movieId);

    void deleteByCustomListIdAndMovieId(Long customListId, Long movieId);

    long countByCustomListId(Long customListId);
}
