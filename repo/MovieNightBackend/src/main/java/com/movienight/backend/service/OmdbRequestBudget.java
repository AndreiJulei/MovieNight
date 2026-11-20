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
import java.util.function.ToIntFunction;

/**
 * Global daily OMDb allowance (PD-08). The free OMDb key allows 1,000 requests a day; recommendation
 * recomputation may spend at most 300 of them and title pages at most 650, leaving headroom for requests
 * OMDb counted without answering. The counts are persisted, so restarts do not reset them.
 */
@Service
public class OmdbRequestBudget {

    private final OmdbRequestBudgetRepository repository;
    private final TransactionTemplate separateTransaction;
    private final int dailyLimit;
    private final int titlePageDailyLimit;

    public OmdbRequestBudget(OmdbRequestBudgetRepository repository, PlatformTransactionManager transactionManager,
                             @Value("${app.omdb.recommendation-daily-budget:300}") int dailyLimit,
                             @Value("${app.omdb.title-page-daily-budget:650}") int titlePageDailyLimit) {
        this.repository = repository;
        this.separateTransaction = new TransactionTemplate(transactionManager);
        this.separateTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.dailyLimit = dailyLimit;
        this.titlePageDailyLimit = titlePageDailyLimit;
    }

    /** Spend one recommendation request from today's (UTC) allowance; false when that share is used up. */
    public boolean tryReserve() {
        return tryReserve(day -> repository.reserve(day, dailyLimit));
    }

    /** Spend one title-page request from today's (UTC) allowance; false when that share is used up (SC07). */
    public boolean tryReserveForTitlePage() {
        return tryReserve(day -> repository.reserveTitlePage(day, titlePageDailyLimit));
    }

    /** {@code reserveOne} spends one request of a day's share and returns 1, or 0 when that share is used up. */
    private boolean tryReserve(ToIntFunction<LocalDate> reserveOne) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        if (reserve(reserveOne, today)) return true;
        if (Boolean.TRUE.equals(separateTransaction.execute(status -> repository.existsById(today)))) return false;
        try {
            separateTransaction.executeWithoutResult(status ->
                    repository.saveAndFlush(new OmdbRequestBudgetDay(today, 0, 0)));
        } catch (DataIntegrityViolationException concurrentlyCreated) {
            // Another recomputation opened the day first; reserve against its row.
        }
        return reserve(reserveOne, today);
    }

    private boolean reserve(ToIntFunction<LocalDate> reserveOne, LocalDate day) {
        Integer spent = separateTransaction.execute(status -> reserveOne.applyAsInt(day));
        return spent != null && spent > 0;
    }
}
