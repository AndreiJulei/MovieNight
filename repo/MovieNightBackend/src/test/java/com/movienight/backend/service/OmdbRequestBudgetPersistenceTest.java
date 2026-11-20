package com.movienight.backend.service;

import com.movienight.backend.repository.OmdbRequestBudgetRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

/** SC07: title pages and recommendations each spend their own share of the daily OMDb allowance. */
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:omdb-budget-test;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop", "app.tmdb.api-key=", "app.omdb.api-key=",
    "app.omdb.recommendation-daily-budget=2", "app.omdb.title-page-daily-budget=3",
    "app.jwt.secret=omdb-budget-test-signing-key-at-least-32-bytes"
})
class OmdbRequestBudgetPersistenceTest {

    @Autowired OmdbRequestBudget budget;
    @Autowired OmdbRequestBudgetRepository days;

    @BeforeEach
    void setup() { days.deleteAll(); }

    @Test
    void titlePagesAndRecommendationsStopAtTheirOwnDailyLimits() {
        assertThat(budget.tryReserveForTitlePage()).isTrue();
        assertThat(budget.tryReserve()).isTrue();
        assertThat(budget.tryReserve()).isTrue();
        assertThat(budget.tryReserve()).isFalse();
        // The recommendation share being spent leaves the title-page share untouched.
        assertThat(budget.tryReserveForTitlePage()).isTrue();
        assertThat(budget.tryReserveForTitlePage()).isTrue();
        assertThat(budget.tryReserveForTitlePage()).isFalse();
    }
}
