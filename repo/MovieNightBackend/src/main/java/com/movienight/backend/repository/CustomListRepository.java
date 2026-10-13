package com.movienight.backend.repository;

import com.movienight.backend.model.CustomList;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CustomListRepository extends JpaRepository<CustomList, Long> {

    List<CustomList> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<CustomList> findByIsPublicTrueOrderByCreatedAtDesc();

    Optional<CustomList> findByIdAndUserId(Long id, Long userId);

    @Query("SELECT DISTINCT cl FROM CustomList cl JOIN cl.entries e WHERE cl.user.id = :userId AND e.movie.id = :movieId")
    List<CustomList> findListsContainingMovie(@Param("userId") Long userId, @Param("movieId") Long movieId);
}
