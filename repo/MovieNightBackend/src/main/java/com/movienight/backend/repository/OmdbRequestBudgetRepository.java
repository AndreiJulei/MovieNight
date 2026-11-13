package com.movienight.backend.repository;

import com.movienight.backend.model.OmdbRequestBudgetDay;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;

public interface OmdbRequestBudgetRepository extends JpaRepository<OmdbRequestBudgetDay, LocalDate> {

    /** Atomically spend one request if the day is below its limit; returns 1 when spent, else 0. */
    @Modifying
    @Query("update OmdbRequestBudgetDay b set b.recommendationRequests = b.recommendationRequests + 1 "
            + "where b.budgetDay = :day and b.recommendationRequests < :limit")
    int reserve(@Param("day") LocalDate day, @Param("limit") int limit);
}
