package com.movienight.backend.service;

import com.movienight.backend.client.OmdbClient;
import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.model.Movie;
import com.movienight.backend.model.ResourceType;
import com.movienight.backend.repository.MovieRepository;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Bounded OMDb enrichment of personal recommendation candidates (PD-08, #24).
 * <p>
 * Walks candidates in relevance order and asks OMDb for the IMDb audience rating and Rotten Tomatoes
 * critic approval of the highest-ranked ones that clear the audience floor and that
 * {@link OmdbRecheckPolicy} allows to be checked: at most {@value #MAX_REQUESTS_PER_RUN} per run, within the global {@link OmdbRequestBudget}.
 * A candidate missing from the catalog is first fetched from TMDB (which also supplies its audience
 * rating). Results persist in the shared catalog, so the cost amortises across users.
 * <p>
 * A title is marked as checked only when OMDb answers. When OMDb gives no answer (down, erroring or
 * out of daily requests) the run stops and the title stays eligible for the next run.
 */
@Service
@Slf4j
public class RecommendationRatingEnricher {

    static final int MAX_REQUESTS_PER_RUN = 30;
    /** Bounds TMDB detail lookups and how deep a run looks for uncached candidates. */
    static final int MAX_CATALOG_FETCHES_PER_RUN = 60;
    static final int MAX_CANDIDATES_CONSIDERED = 500;
    private static final int PARALLELISM = 4;

    private final MovieRepository movieRepository;
    private final MovieCatalogLookupService catalogLookup;
    private final CatalogPersistenceService catalogPersistence;
    private final OmdbClient omdbClient;
    private final TmdbClient tmdbClient;
    private final OmdbRequestBudget dailyBudget;
    private final TransactionTemplate separateRead;
    private final ExecutorService workers = Executors.newFixedThreadPool(PARALLELISM, task -> {
        Thread thread = new Thread(task, "recommendation-rating-enrich");
        thread.setDaemon(true);
        return thread;
    });

    public RecommendationRatingEnricher(MovieRepository movieRepository, MovieCatalogLookupService catalogLookup,
                                        CatalogPersistenceService catalogPersistence, OmdbClient omdbClient,
                                        TmdbClient tmdbClient, OmdbRequestBudget dailyBudget,
                                        PlatformTransactionManager transactionManager) {
        this.movieRepository = movieRepository;
        this.catalogLookup = catalogLookup;
        this.catalogPersistence = catalogPersistence;
        this.omdbClient = omdbClient;
        this.tmdbClient = tmdbClient;
        this.dailyBudget = dailyBudget;
        this.separateRead = new TransactionTemplate(transactionManager);
        // Read in a separate persistence context so the caller's context never holds pre-enrichment rows.
        this.separateRead.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.separateRead.setReadOnly(true);
    }

    @PreDestroy
    void shutdown() { workers.shutdownNow(); }

    /**
     * Enrich the highest-ranked uncached eligible candidates.
     *
     * @param candidatesByRelevance movie TMDB ids, most relevant first
     * @return the number of OMDb requests made
     */
    public int enrich(List<Long> candidatesByRelevance) {
        if (!omdbClient.isConfigured() || candidatesByRelevance == null || candidatesByRelevance.isEmpty()) return 0;
        List<Long> considered = candidatesByRelevance.stream().filter(Objects::nonNull).filter(id -> id > 0)
                .distinct().limit(MAX_CANDIDATES_CONSIDERED).toList();
        Map<Long, Movie> rows = separateRead.execute(status -> movieRepository
                .findByResourceTypeAndTmdbIdIn(ResourceType.MOVIE, considered).stream()
                .collect(Collectors.toMap(Movie::getTmdbId, Function.identity(), (a, b) -> a)));

        Run run = new Run();
        int catalogFetches = 0;
        Iterator<Long> remaining = considered.iterator();
        while (!run.stopped.get() && run.requests.get() < MAX_REQUESTS_PER_RUN && remaining.hasNext()) {
            // A wave never holds more candidates than the run has requests left, so the cap is never crossed.
            int room = Math.min(PARALLELISM, MAX_REQUESTS_PER_RUN - run.requests.get());
            List<CompletableFuture<Void>> wave = new ArrayList<>();
            while (wave.size() < room && remaining.hasNext()) {
                Long id = remaining.next();
                Movie row = rows == null ? null : rows.get(id);
                if (row != null) {
                    if (needsExternalRatings(row)) wave.add(submit(() -> askOmdb(row, run)));
                } else if (tmdbClient.isConfigured() && catalogFetches < MAX_CATALOG_FETCHES_PER_RUN) {
                    catalogFetches++;
                    wave.add(submit(() -> fetchThenAskOmdb(id, run)));
                }
            }
            if (wave.isEmpty()) break;
            CompletableFuture.allOf(wave.toArray(CompletableFuture[]::new)).join();
        }
        if (run.requests.get() > 0) log.info("Recommendation enrichment spent {} OMDb requests", run.requests.get());
        return run.requests.get();
    }

    /** One enrichment run: OMDb requests spent, and whether the run must stop (budget spent or OMDb silent). */
    private static final class Run {
        final AtomicInteger requests = new AtomicInteger();
        final AtomicBoolean stopped = new AtomicBoolean();
    }

    private CompletableFuture<Void> submit(Runnable work) {
        return CompletableFuture.runAsync(() -> {
            try { work.run(); }
            catch (RuntimeException failure) {
                // Enrichment is optional: a provider failure leaves the candidate neutral.
                log.debug("Recommendation enrichment skipped a candidate: {}", failure.getMessage());
            }
        }, workers);
    }

    private void fetchThenAskOmdb(Long tmdbId, Run run) {
        if (run.stopped.get()) return;
        Movie fetched = catalogLookup.getOrFetchMovieWithoutOmdb(tmdbId);
        if (fetched != null && needsExternalRatings(fetched)) askOmdb(fetched, run);
    }

    private void askOmdb(Movie movie, Run run) {
        if (run.stopped.get()) return;
        if (run.requests.incrementAndGet() > MAX_REQUESTS_PER_RUN) { run.requests.decrementAndGet(); return; }
        if (!dailyBudget.tryReserve()) {
            run.requests.decrementAndGet();
            run.stopped.set(true);
            return;
        }
        // The reserved request stays spent even without an answer: OMDb may still have counted it.
        OmdbClient.RatingsLookup lookup = omdbClient.lookupRatings(movie.getImdbId());
        if (lookup.outcome() == OmdbClient.RatingsLookup.Outcome.NO_ANSWER) {
            run.stopped.set(true);
            return;
        }
        Double imdb = lookup.ratings().map(omdbClient::extractImdbRating).orElse(null);
        Integer rottenTomatoes = lookup.ratings().map(omdbClient::extractRottenTomatoesScore).orElse(null);
        catalogPersistence.recordOmdbCheck(movie.getId(), imdb, rottenTomatoes, LocalDateTime.now(ZoneOffset.UTC));
    }

    /** Eligible for recommendation and for an OMDb check under the shared {@link OmdbRecheckPolicy}. */
    private boolean needsExternalRatings(Movie movie) {
        return OmdbRecheckPolicy.eligible(movie, LocalDateTime.now(ZoneOffset.UTC))
                && RecommendationQualityPolicy.eligible(movie.getTmdbVoteAverage(), movie.getTmdbVoteCount());
    }
}
