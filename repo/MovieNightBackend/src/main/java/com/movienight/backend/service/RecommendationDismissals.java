package com.movienight.backend.service;

import com.movienight.backend.model.RecommendationDismissal;
import com.movienight.backend.model.User;
import com.movienight.backend.repository.RecommendationDismissalRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.HashSet;
import java.util.Set;

/**
 * Titles a user removed from their personal recommendations ("Not interested", #40). Permanent until undone.
 * {@link #dismissedMovieIds} is the exclusion every personal recommendation source applies: the read excludes
 * dismissed rows and each recomputation skips them (the acclaimed source, #39, reuses it).
 */
@Service
public class RecommendationDismissals {
    /** Personal recommendations are movie-only; the column keeps room for other media types. */
    private static final String MEDIA_TYPE = "MOVIE";

    private final RecommendationDismissalRepository repository;
    private final TransactionTemplate separateTransaction;

    public RecommendationDismissals(RecommendationDismissalRepository repository,
                                    PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.separateTransaction = new TransactionTemplate(transactionManager);
        this.separateTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** TMDB ids of the movies this user dismissed. */
    public Set<Long> dismissedMovieIds(User user) {
        return new HashSet<>(repository.findTmdbIdsByUserIdAndMediaType(user.getId(), MEDIA_TYPE));
    }

    /**
     * Idempotent: repeating a dismissal, including two concurrent requests from a double tap (RM04),
     * leaves one row. The insert runs in its own transaction so a lost race does not poison the caller's.
     */
    public void dismiss(User user, long tmdbId) {
        if (tmdbId <= 0) throw new IllegalArgumentException("Invalid title id");
        if (repository.existsByUserIdAndMediaTypeAndTmdbId(user.getId(), MEDIA_TYPE, tmdbId)) return;
        try {
            separateTransaction.executeWithoutResult(status -> repository.saveAndFlush(
                    RecommendationDismissal.builder().user(user).tmdbId(tmdbId).mediaType(MEDIA_TYPE).build()));
        } catch (DataIntegrityViolationException concurrentlyDismissed) {
            // The other request stored the same dismissal first.
        }
    }

    /**
     * Undo of {@link #dismiss}; a title that was not dismissed is left as it is.
     * Returns whether a dismissal was removed. What the recommendations do next is
     * {@link PersonalizedRecommendationService#undoDismissal}'s decision.
     */
    @Transactional
    public boolean undo(User user, long tmdbId) {
        return repository.deleteDismissal(user.getId(), MEDIA_TYPE, tmdbId) > 0;
    }
}
