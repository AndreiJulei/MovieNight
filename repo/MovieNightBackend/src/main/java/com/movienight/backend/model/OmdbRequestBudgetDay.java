package com.movienight.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/** OMDb requests spent by recommendation recomputation on one UTC day (PD-08). No user data. */
@Entity
@Table(name = "omdb_request_budget")
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class OmdbRequestBudgetDay {

    @Id
    @Column(name = "budget_day")
    private LocalDate budgetDay;

    @Column(name = "recommendation_requests", nullable = false)
    private int recommendationRequests;
}
