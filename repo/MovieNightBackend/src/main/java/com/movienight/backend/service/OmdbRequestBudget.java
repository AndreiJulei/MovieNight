package com.movienight.backend.service;

import com.movienight.backend.model.OmdbRequestBudgetDay;
import com.movienight.backend.repository.OmdbRequestBudgetRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.ZoneOffset;

/**
 * Global daily OMDb allowance for recommendation recomputation (PD-08). The free OMDb key allows
 * 1,000 requests a day; recommendations may spend at most 300 of them, leaving the rest for title pages.
 * The count is persisted, so restarts do not reset it.
 */
@Service
public class OmdbRequestBudget {

    private final OmdbRequestBudgetRepository repository;
    private final TransactionTemplate separateTransaction;
    private final int dailyLimit;

    public OmdbRequestBudget(OmdbRequestBudgetRepository repository, PlatformTransactionManager transactionManager,
                             @Value("${app.omdb.recommendation-daily-budget:300}") int dailyLimit) {
        this.repository = repository;
        this.separateTransaction = new TransactionTemplate(transactionManager);
        this.separateTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.dailyLimit = dailyLimit;
    }

    /** Spend one request from today's (UTC) allowance; false when the allowance is used up. */
    public boolean tryReserve() {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        if (reserve(today)) return true;
        if (Boolean.TRUE.equals(separateTransaction.execute(status -> repository.existsById(today)))) return false;
        try {
            separateTransaction.executeWithoutResult(status ->
                    repository.saveAndFlush(new OmdbRequestBudgetDay(today, 0)));
        } catch (DataIntegrityViolationException concurrentlyCreated) {
            // Another recomputation opened the day first; reserve against its row.
        }
        return reserve(today);
    }

    private boolean reserve(LocalDate day) {
        Integer spent = separateTransaction.execute(status -> repository.reserve(day, dailyLimit));
        return spent != null && spent > 0;
    }
}
