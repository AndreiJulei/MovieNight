package com.movienight.backend.service;

import com.movienight.backend.client.OmdbClient;
import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.MovieResponse;
import com.movienight.backend.dto.SearchPageResponse;
import com.movienight.backend.dto.external.TmdbMovieDetailsResponse;
import com.movienight.backend.dto.external.TmdbSearchResponse;
import com.movienight.backend.model.Movie;
import com.movienight.backend.model.ResourceType;
import com.movienight.backend.repository.CachedMovieListRepository;
import com.movienight.backend.repository.MovieRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.stream.Collectors;

/**
 * Service that orchestrates the 3-Tier Movie Lookup:
 * Tier 1: Local Database Cache (MovieRepository)
 * Tier 2: The Movie Database (TMDB API - Posters, Cast, Trailers)
 * Tier 3: Open Movie Database (OMDb API - Rotten Tomatoes & IMDb critic scores). A title page waits up to
 * {@link #titlePageOmdbWait} for them, then loads without them while the lookup finishes in the background.
 */
@Service
@Slf4j
public class MovieCatalogLookupService {

    private final MovieRepository movieRepository;
    private final TmdbClient tmdbClient;
    private final OmdbClient omdbClient;
    private final CachedMovieListRepository cachedMovieListRepository;
    private final CatalogPersistenceService catalogPersistenceService;
    private final Executor catalogEnrichmentExecutor;
    private final OmdbRequestBudget omdbRequestBudget;

    /** How long a title page waits for OMDb before it loads without scores (SC04). */
    Duration titlePageOmdbWait = Duration.ofSeconds(2);
    /** OMDb checks a title page started, by catalog id, so pages opened meanwhile wait on the same request. */
    private final ConcurrentHashMap<Long, CompletableFuture<Optional<OmdbRatings>>> omdbChecksInFlight = new ConcurrentHashMap<>();

    /** How a details request treats missing OMDb scores. */
    private enum CriticScores {
        /** Title page: wait up to {@link #titlePageOmdbWait} for them. */
        WAIT,
        /** Entry-page hero slides: start the lookup and return at once; the scores show on a later read. */
        IN_BACKGROUND,
        /** Recommendation enrichment, which spends its own OMDb budget. */
        SKIP
    }

    /** What one OMDb answer gave: either value may be missing. */
    private record OmdbRatings(Double imdb, Integer rottenTomatoes) {}

    public MovieCatalogLookupService(
            MovieRepository movieRepository,
            TmdbClient tmdbClient,
            OmdbClient omdbClient,
            CachedMovieListRepository cachedMovieListRepository,
            CatalogPersistenceService catalogPersistenceService,
            @Qualifier("catalogEnrichmentExecutor") Executor catalogEnrichmentExecutor,
            OmdbRequestBudget omdbRequestBudget
    ) {
        this.movieRepository = movieRepository;
        this.tmdbClient = tmdbClient;
        this.omdbClient = omdbClient;
        this.cachedMovieListRepository = cachedMovieListRepository;
        this.catalogPersistenceService = catalogPersistenceService;
        this.catalogEnrichmentExecutor = catalogEnrichmentExecutor;
        this.omdbRequestBudget = omdbRequestBudget;
    }

    /**
     * Search movies across local catalog and TMDB.
     */
    @Transactional(readOnly = true)
    public List<MovieResponse> searchMovies(String query) {
        if (query == null || query.trim().isBlank()) {
            return Collections.emptyList();
        }

        String cleanQuery = query.trim();
        List<MovieResponse> results = new ArrayList<>();
        Set<String> seenTmdbIds = new HashSet<>();

        // Tier 1: Check Local DB first
        List<Movie> localMatches = movieRepository.findByTitleContainingIgnoreCase(cleanQuery);
        for (Movie movie : localMatches) {
            results.add(mapToResponse(movie));
            if (movie.getTmdbId() != null) {
                seenTmdbIds.add(movie.getResourceType() + ":" + movie.getTmdbId());
            }
        }

        // Tier 2: Search TMDB for fresh discoveries (Movies, TV Series, Anime)
        if (tmdbClient.isConfigured()) {
            List<TmdbSearchResponse.TmdbMovieSummary> tmdbResults = tmdbClient.searchMovies(cleanQuery);
            for (TmdbSearchResponse.TmdbMovieSummary item : tmdbResults) {
                if (item.getId() != null && !seenTmdbIds.contains(ResourceType.fromCategory(item.getResolvedMediaType()) + ":" + item.getId())) {
                    results.add(MovieResponse.builder()
                            .tmdbId(item.getId())
                            .title(item.getEffectiveTitle())
                            .releaseYear(parseYear(item.getEffectiveReleaseDate()))
                            .overview(item.getOverview())
                            .posterUrl(tmdbClient.buildPosterUrl(item.getPosterPath()))
                            .backdropUrl(tmdbClient.buildBackdropUrl(item.getBackdropPath()))
                            .mediaType(item.getResolvedMediaType())
                            .tmdbVoteAverage(item.getVoteAverage())
                            .tmdbVoteCount(item.getVoteCount())
                            .build());
                    seenTmdbIds.add(ResourceType.fromCategory(item.getResolvedMediaType()) + ":" + item.getId());
                }
            }
        }

        return results;
    }

    /** Provider pages one search request may read, so filtered tabs and people-only pages still fill. */
    private static final int SEARCH_READ_AHEAD_PAGES = 3;
    /** A results page stops reading ahead once it holds this many titles. */
    private static final int SEARCH_MIN_PAGE_RESULTS = 10;

    /**
     * One page of the full search results page (#30), from TMDB only so paging stays consistent.
     * {@code type} is ALL, MOVIE, TV or ANIME; anime is TV classified by the anime policy.
     */
    public SearchPageResponse searchPage(String query, int page, String type) {
        String cleanQuery = query == null ? "" : query.trim();
        String cleanType = type == null || type.isBlank() ? "ALL" : type.trim().toUpperCase(Locale.ROOT);
        TmdbClient.SearchScope scope = switch (cleanType) {
            case "ALL" -> TmdbClient.SearchScope.MULTI;
            case "MOVIE" -> TmdbClient.SearchScope.MOVIE;
            case "TV", "ANIME" -> TmdbClient.SearchScope.TV;
            default -> throw new IllegalArgumentException("Search type must be ALL, MOVIE, TV or ANIME");
        };
        int requestedPage = Math.max(1, page);
        if (cleanQuery.isEmpty() || !tmdbClient.isConfigured()) {
            return SearchPageResponse.builder().query(cleanQuery).type(cleanType)
                    .page(requestedPage).totalPages(0).hasMore(false).results(List.of()).build();
        }

        // TV and Anime share /search/tv, and multi-search pages lose their people, so one provider
        // page can hold few or no titles; read a few pages ahead so "Load more" adds a real page.
        boolean classified = "TV".equals(cleanType) || "ANIME".equals(cleanType);
        int maxPage = requestedPage + SEARCH_READ_AHEAD_PAGES - 1;
        List<MovieResponse> results = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int currentPage = requestedPage;
        int totalPages = requestedPage;
        while (true) {
            TmdbSearchResponse response = tmdbClient.searchPage(scope, cleanQuery, currentPage);
            totalPages = response.getTotalPages() == null ? currentPage : response.getTotalPages();
            for (TmdbSearchResponse.TmdbMovieSummary item : response.getResults()) {
                if (item.getId() == null || item.getEffectiveTitle() == null) continue;
                String mediaType = item.getResolvedMediaType();
                if (classified && !cleanType.equals(mediaType)) continue;
                if (seen.add(ResourceType.fromCategory(mediaType) + ":" + item.getId())) {
                    results.add(toSearchResult(item));
                }
            }
            if (results.size() >= SEARCH_MIN_PAGE_RESULTS || currentPage >= totalPages || currentPage >= maxPage) break;
            currentPage++;
        }
        return SearchPageResponse.builder().query(cleanQuery).type(cleanType)
                .page(currentPage).totalPages(totalPages).hasMore(currentPage < totalPages)
                .results(results).build();
    }

    private MovieResponse toSearchResult(TmdbSearchResponse.TmdbMovieSummary item) {
        return MovieResponse.builder()
                .tmdbId(item.getId())
                .title(item.getEffectiveTitle())
                .releaseYear(parseYear(item.getEffectiveReleaseDate()))
                .overview(item.getOverview())
                .posterUrl(tmdbClient.buildPosterUrl(item.getPosterPath()))
                .backdropUrl(tmdbClient.buildBackdropUrl(item.getBackdropPath()))
                .mediaType(item.getResolvedMediaType())
                .tmdbVoteAverage(item.getVoteAverage())
                .tmdbVoteCount(item.getVoteCount())
                .build();
    }

    private final ConcurrentHashMap<String, Long> lastBackfillAttempt = new ConcurrentHashMap<>();
    private static final long BACKFILL_COOLDOWN_MS = 24 * 60 * 60 * 1000L; // 24 hours cooldown for backfill attempts

    record ExtractedMetadata(
            String title,
            String overview,
            String director,
            String castMembers,
            String trailerKey,
            String genres,
            Integer runtimeMinutes,
            String posterUrl,
            String backdropUrl,
            String logoUrl,
            Integer seasonsCount,
            Integer episodesCount,
            String imdbId,
            Double voteAverage,
            Integer voteCount,
            Integer releaseYear
    ) {}

    private ExtractedMetadata extractMetadata(TmdbMovieDetailsResponse tmdb, ResourceType resourceType) {
        String effectiveTitle = tmdb.getEffectiveTitle();
        String safeTitle = effectiveTitle != null && effectiveTitle.length() > 300
                ? effectiveTitle.substring(0, 300) : effectiveTitle;

        String director = tmdb.getEffectiveDirectorOrCreator();
        String safeDirector = director != null && director.length() > 300
                ? director.substring(0, 300) : director;

        String castMembers = tmdb.getCredits() != null && tmdb.getCredits().getCast() != null
                ? tmdb.getCredits().getCast().stream()
                .filter(c -> c.getOrder() != null && c.getOrder() <= 4)
                .map(TmdbMovieDetailsResponse.CastMember::getName)
                .collect(Collectors.joining(", "))
                : null;
        String safeCast = castMembers != null && castMembers.length() > 500
                ? castMembers.substring(0, 500) : castMembers;

        String trailerKey = tmdb.getVideos() != null && tmdb.getVideos().getResults() != null
                ? tmdb.getVideos().getResults().stream()
                .filter(v -> "YouTube".equalsIgnoreCase(v.getSite()) && "Trailer".equalsIgnoreCase(v.getType()))
                .map(TmdbMovieDetailsResponse.VideoResult::getKey)
                .findFirst()
                .orElse(null)
                : null;
        String safeTrailer = trailerKey != null && trailerKey.length() > 100
                ? trailerKey.substring(0, 100) : trailerKey;

        String genres = tmdb.getGenres() != null
                ? tmdb.getGenres().stream()
                .map(TmdbMovieDetailsResponse.Genre::getName)
                .collect(Collectors.joining(", "))
                : null;
        String safeGenres = genres != null && genres.length() > 200
                ? genres.substring(0, 200) : genres;

        String safePosterUrl = tmdbClient.buildPosterUrl(tmdb.getPosterPath());
        if (safePosterUrl != null && safePosterUrl.length() > 1000) safePosterUrl = safePosterUrl.substring(0, 1000);

        String safeBackdropUrl = tmdbClient.buildBackdropUrl(tmdb.getBackdropPath());
        if (safeBackdropUrl != null && safeBackdropUrl.length() > 1000) safeBackdropUrl = safeBackdropUrl.substring(0, 1000);

        String safeLogoUrl = tmdbClient.extractLogoUrl(tmdb);
        if (safeLogoUrl != null && safeLogoUrl.length() > 1000) safeLogoUrl = safeLogoUrl.substring(0, 1000);

        return new ExtractedMetadata(
                safeTitle,
                tmdb.getOverview(),
                safeDirector,
                safeCast,
                safeTrailer,
                safeGenres,
                tmdb.getEffectiveRuntimeMinutes(),
                safePosterUrl,
                safeBackdropUrl,
                safeLogoUrl,
                tmdb.getNumberOfSeasons(),
                tmdb.getNumberOfEpisodes(),
                tmdb.getImdbId(),
                tmdb.getVoteAverage(),
                tmdb.getVoteCount(),
                parseYear(tmdb.getEffectiveReleaseDate())
        );
    }

    private boolean isIncomplete(Movie movie) {
        boolean missingOverview = movie.getOverview() == null || movie.getOverview().isBlank();
        boolean missingCredits = (movie.getCastMembers() == null || movie.getCastMembers().isBlank())
                && (movie.getDirector() == null || movie.getDirector().isBlank());
        boolean missingTrailer = movie.getTrailerKey() == null || movie.getTrailerKey().isBlank();
        return missingOverview || missingCredits || missingTrailer;
    }

    /**
     * Get or fetch full media details by TMDB ID.
     */
    public Movie getOrFetchMovie(Long tmdbId) {
        return getOrFetchMovie(tmdbId, null);
    }

    /**
     * Get or fetch full media details by TMDB ID with media type hint (MOVIE, TV, ANIME).
     * Waits briefly for missing OMDb scores (SC04); other optional enrichment runs in the background.
     */
    public Movie getOrFetchMovie(Long tmdbId, String mediaTypeHint) {
        return getOrFetchMovie(tmdbId, mediaTypeHint, true);
    }

    /**
     * {@link #getOrFetchMovie(Long, String)}; with {@code waitForScores} false the OMDb lookup still starts but
     * the details return without waiting for it (entry-page hero slides).
     */
    public Movie getOrFetchMovie(Long tmdbId, String mediaTypeHint, boolean waitForScores) {
        return lookup(tmdbId, mediaTypeHint, waitForScores ? CriticScores.WAIT : CriticScores.IN_BACKGROUND);
    }

    /**
     * Get or fetch a movie's catalog row for recommendation enrichment. Unlike a title open, this
     * never starts background OMDb enrichment: the caller spends its own bounded OMDb budget (PD-08).
     */
    public Movie getOrFetchMovieWithoutOmdb(Long tmdbId) {
        return lookup(tmdbId, "MOVIE", CriticScores.SKIP);
    }

    private Movie lookup(Long tmdbId, String mediaTypeHint, CriticScores criticScores) {
        boolean enrichCritics = criticScores != CriticScores.SKIP;
        if (tmdbId == null || tmdbId <= 0) {
            throw new IllegalArgumentException("Provider ID must be positive");
        }

        var resourceType = ResourceType.fromCategory(mediaTypeHint);
        Optional<Movie> existingMovie = movieRepository.findByResourceTypeAndTmdbId(resourceType, tmdbId);
        if (existingMovie.isPresent()) {
            Movie movie = existingMovie.get();
            // Backfill can also reach OMDb, so recommendation enrichment skips it.
            if (enrichCritics && isIncomplete(movie) && tmdbClient.isConfigured()) {
                triggerBackgroundBackfill(movie.getId(), resourceType, tmdbId);
            }
            return withCriticScores(movie, criticScores);
        }

        return withCriticScores(fetchIntoCatalog(tmdbId, resourceType), criticScores);
    }

    /** First open of a title: fetch it from TMDB and store it in the shared catalog. */
    private Movie fetchIntoCatalog(Long tmdbId, ResourceType resourceType) {
        Optional<Movie> existingMovie;
        // Lock to serialize concurrent first-open fetches for the same typed title
        String lockKey = (resourceType + ":" + tmdbId).intern();
        synchronized (lockKey) {
            existingMovie = movieRepository.findByResourceTypeAndTmdbId(resourceType, tmdbId);
            if (existingMovie.isPresent()) {
                return existingMovie.get();
            }

            Optional<TmdbMovieDetailsResponse> detailsOpt = resourceType == ResourceType.TV
                    ? tmdbClient.getTvDetails(tmdbId) : tmdbClient.getMovieDetails(tmdbId);

            if (detailsOpt.isEmpty()) {
                // An unconfigured provider can still serve an explicitly typed cached summary.
                if (!tmdbClient.isConfigured()) {
                    var cached = cachedMovieListRepository.findByTmdbId(tmdbId).stream()
                            .filter(c -> resourceType == ResourceType.fromCategory(c.getMediaType()))
                            .filter(c -> c.getTitle() != null && !c.getTitle().isBlank()).findFirst();
                    if (cached.isPresent()) {
                        var c = cached.get();
                        Movie summary = Movie.builder().tmdbId(tmdbId).title(c.getTitle())
                                .mediaType(c.getMediaType()).posterUrl(tmdbClient.buildPosterUrl(c.getPosterPath()))
                                .releaseYear(parseYear(c.getReleaseDate())).tmdbVoteAverage(c.getVoteAverage())
                                .tmdbVoteCount(c.getVoteCount()).build();
                        return catalogPersistenceService.saveIfAbsent(summary, resourceType, tmdbId);
                    }
                }
                throw new com.movienight.backend.exception.ResourceNotFoundException("Title not found for " + resourceType + ":" + tmdbId);
            }

            TmdbMovieDetailsResponse tmdbDetails = detailsOpt.get();

            if (!tmdbId.equals(tmdbDetails.getId()) || tmdbDetails.getEffectiveTitle() == null
                    || tmdbDetails.getEffectiveTitle().isBlank()) {
                throw new IllegalStateException("Provider returned invalid title details");
            }

            ExtractedMetadata meta = extractMetadata(tmdbDetails, resourceType);

            // Construct core entity
            Movie movie = Movie.builder()
                    .tmdbId(tmdbDetails.getId())
                    .imdbId(meta.imdbId())
                    .title(meta.title())
                    .releaseYear(meta.releaseYear())
                    .overview(meta.overview())
                    .posterUrl(meta.posterUrl())
                    .backdropUrl(meta.backdropUrl())
                    .logoUrl(meta.logoUrl())
                    .genres(meta.genres())
                    .runtimeMinutes(meta.runtimeMinutes())
                    .trailerKey(meta.trailerKey())
                    .director(meta.director())
                    .castMembers(meta.castMembers())
                    .mediaType(tmdbDetails.getResolvedMediaType(resourceType))
                    .seasonsCount(meta.seasonsCount())
                    .episodesCount(meta.episodesCount())
                    .tmdbVoteAverage(meta.voteAverage())
                    .tmdbVoteCount(meta.voteCount())
                    .build();

            Movie saved = catalogPersistenceService.saveIfAbsent(movie, resourceType, tmdbId);
            log.info("Cached new {} into shared catalog: {} (TMDB: {})", saved.getMediaType(), saved.getTitle(), tmdbId);
            return saved;
        }
    }

    /**
     * Ask OMDb for a title's missing scores when {@link OmdbRecheckPolicy} allows it. {@link CriticScores#WAIT}
     * waits up to {@link #titlePageOmdbWait} for the answer, which is set on the returned title (SC04); a slower
     * lookup, or one started {@link CriticScores#IN_BACKGROUND}, stores its answer for the next read.
     */
    private Movie withCriticScores(Movie movie, CriticScores criticScores) {
        if (criticScores == CriticScores.SKIP || movie == null || movie.getId() == null || !omdbClient.isConfigured()
                || !OmdbRecheckPolicy.eligible(movie, LocalDateTime.now(ZoneOffset.UTC))) {
            return movie;
        }
        Long movieId = movie.getId();
        String imdbId = movie.getImdbId();
        CompletableFuture<Optional<OmdbRatings>> started = new CompletableFuture<>();
        CompletableFuture<Optional<OmdbRatings>> check = omdbChecksInFlight.putIfAbsent(movieId, started);
        if (check == null) {
            check = started;
            try {
                catalogEnrichmentExecutor.execute(() -> {
                    try {
                        started.complete(checkOmdb(movieId, imdbId));
                    } catch (RuntimeException failure) {
                        log.warn("OMDb lookup failed for IMDb ID '{}': {}", imdbId, failure.getMessage());
                        started.complete(Optional.empty());
                    } finally {
                        omdbChecksInFlight.remove(movieId, started);
                    }
                });
            } catch (RuntimeException rejected) {
                omdbChecksInFlight.remove(movieId, started);
                return movie;
            }
        }
        if (criticScores == CriticScores.IN_BACKGROUND) return movie;
        try {
            check.get(titlePageOmdbWait.toMillis(), TimeUnit.MILLISECONDS).ifPresent(ratings -> {
                if (ratings.imdb() != null) movie.setImdbRating(ratings.imdb());
                if (ratings.rottenTomatoes() != null) movie.setRottenTomatoesRating(ratings.rottenTomatoes());
            });
        } catch (TimeoutException slow) {
            // The lookup carries on and removes itself when it ends; OmdbClient's own timeouts bound it to a few
            // seconds. A visit meanwhile joins it instead of sending a second OMDb request (SC07).
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (ExecutionException failed) {
            log.warn("OMDb lookup failed for IMDb ID '{}'", imdbId);
        }
        return movie;
    }

    /**
     * One budgeted OMDb request for a title. An answer is recorded with {@code omdbCheckedAt}, even without
     * scores; no answer, or a spent title-page budget (SC07), records nothing.
     */
    private Optional<OmdbRatings> checkOmdb(Long movieId, String imdbId) {
        if (!omdbRequestBudget.tryReserveForTitlePage()) return Optional.empty();
        OmdbClient.RatingsLookup lookup = omdbClient.lookupRatings(imdbId);
        if (lookup.outcome() == OmdbClient.RatingsLookup.Outcome.NO_ANSWER) return Optional.empty();
        Double imdb = lookup.ratings().map(omdbClient::extractImdbRating).orElse(null);
        Integer rottenTomatoes = lookup.ratings().map(omdbClient::extractRottenTomatoesScore).orElse(null);
        catalogPersistenceService.recordOmdbCheck(movieId, imdb, rottenTomatoes, LocalDateTime.now(ZoneOffset.UTC));
        return Optional.of(new OmdbRatings(imdb, rottenTomatoes));
    }

    private void triggerBackgroundBackfill(Long movieId, ResourceType resourceType, Long tmdbId) {
        String key = resourceType + ":" + tmdbId;
        long now = System.currentTimeMillis();
        Long last = lastBackfillAttempt.get(key);
        if (last != null && (now - last) < BACKFILL_COOLDOWN_MS) {
            return;
        }
        lastBackfillAttempt.put(key, now);

        catalogEnrichmentExecutor.execute(() -> {
            try {
                Optional<TmdbMovieDetailsResponse> detailsOpt = resourceType == ResourceType.TV
                        ? tmdbClient.getTvDetails(tmdbId) : tmdbClient.getMovieDetails(tmdbId);
                if (detailsOpt.isPresent()) {
                    ExtractedMetadata meta = extractMetadata(detailsOpt.get(), resourceType);
                    Movie backfilled = catalogPersistenceService.backfillCoreDetails(movieId, new CatalogPersistenceService.CoreDetails(
                            meta.overview(), meta.genres(), meta.director(),
                            meta.castMembers(), meta.trailerKey(), meta.runtimeMinutes(),
                            meta.logoUrl()));
                    // A stored title without an IMDb id is checked with the provider's; one with an id is
                    // already checked by the title page itself.
                    if (backfilled != null && backfilled.getImdbId() == null && meta.imdbId() != null && omdbClient.isConfigured()
                            && OmdbRecheckPolicy.eligible(meta.imdbId(), backfilled.getImdbRating(),
                                    backfilled.getRottenTomatoesRating(), backfilled.getOmdbCheckedAt(),
                                    LocalDateTime.now(ZoneOffset.UTC))) {
                        checkOmdb(movieId, meta.imdbId());
                    }
                }
            } catch (Exception e) {
                log.debug("Background backfill failed for {}:{}: {}", resourceType, tmdbId, e.getMessage());
            }
        });
    }

    /**
     * Retrieve movie directly by local database ID.
     */
    @Transactional(readOnly = true)
    public Movie getMovieById(Long id) {
        return movieRepository.findById(id).orElseThrow(() ->
                new com.movienight.backend.exception.ResourceNotFoundException("Catalog title not found: " + id));
    }

    /**
     * Parse stored comma-separated castMembers string (e.g., "Ewan McGregor as Mark Renton, Ewen Bremner as Spud")
     * into structured CastMemberDto list, extracting actor names and roles.
     */
    public List<MovieResponse.CastMemberDto> parseStoredCastMembers(String castMembers) {
        if (castMembers == null || castMembers.isBlank()) {
            return Collections.emptyList();
        }
        return Arrays.stream(castMembers.split(","))
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .map(item -> {
                    String name = item;
                    String role = "Cast";
                    if (item.contains(" as ")) {
                        String[] parts = item.split(" as ", 2);
                        name = parts[0].trim();
                        role = parts[1].trim().isBlank() ? "Cast" : parts[1].trim();
                    } else if (item.matches("^.+?\\s*\\(.+?\\)$")) {
                        int open = item.lastIndexOf('(');
                        int close = item.lastIndexOf(')');
                        name = item.substring(0, open).trim();
                        String r = item.substring(open + 1, close).trim();
                        role = r.isBlank() ? "Cast" : r;
                    }
                    return MovieResponse.CastMemberDto.builder()
                            .name(name)
                            .role(role)
                            .profileUrl(null)
                            .build();
                })
                .toList();
    }

    /**
     * Helper to map Movie entity to response DTO.
     */
    public MovieResponse mapToResponse(Movie movie) {
        List<MovieResponse.CastMemberDto> castList = parseStoredCastMembers(movie.getCastMembers());
        if (castList.isEmpty()) {
            castList = null;
        }

        return MovieResponse.builder()
                .id(movie.getId())
                .tmdbId(movie.getTmdbId())
                .imdbId(movie.getImdbId())
                .title(movie.getTitle())
                .releaseYear(movie.getReleaseYear())
                .overview(movie.getOverview())
                .posterUrl(movie.getPosterUrl())
                .backdropUrl(movie.getBackdropUrl())
                .logoUrl(movie.getLogoUrl())
                .genres(movie.getGenres())
                .runtimeMinutes(movie.getRuntimeMinutes())
                .trailerKey(movie.getTrailerKey())
                .director(movie.getDirector())
                .castMembers(movie.getCastMembers())
                .cast(castList)
                .mediaType(movie.getMediaType())
                .seasonsCount(movie.getSeasonsCount())
                .episodesCount(movie.getEpisodesCount())
                .imdbRating(movie.getImdbRating())
                .rottenTomatoesRating(movie.getRottenTomatoesRating())
                .tmdbVoteAverage(movie.getTmdbVoteAverage())
                .tmdbVoteCount(movie.getTmdbVoteCount())
                .build();
    }

    /**
     * Get credits (cast with profile photos and character names) for a TMDB title.
     */
    public List<MovieResponse.CastMemberDto> getCredits(Long tmdbId, String mediaType) {
        if (tmdbId == null) {
            return Collections.emptyList();
        }
        ResourceType resourceType = ResourceType.fromCategory(mediaType);
        if (tmdbClient.isConfigured()) {
            try {
                Optional<TmdbMovieDetailsResponse> details = resourceType == ResourceType.TV
                        ? tmdbClient.getTvDetails(tmdbId)
                        : tmdbClient.getMovieDetails(tmdbId);
                if (details.isPresent() && details.get().getCredits() != null && details.get().getCredits().getCast() != null) {
                    return details.get().getCredits().getCast().stream()
                            .filter(c -> c.getName() != null && !c.getName().isBlank())
                            .limit(15)
                            .map(c -> MovieResponse.CastMemberDto.builder()
                                    .name(c.getName())
                                    .role(c.getCharacter() != null && !c.getCharacter().isBlank() ? c.getCharacter() : "Cast")
                                    .profileUrl(tmdbClient.buildProfileUrl(c.getProfilePath()))
                                    .build())
                            .toList();
                }
            } catch (Exception e) {
                log.warn("Failed to fetch live credits for tmdbId {}: {}", tmdbId, e.getMessage());
            }
        }

        // Fallback: Check local movie repository for saved castMembers string
        Optional<Movie> local = movieRepository.findByResourceTypeAndTmdbId(resourceType, tmdbId);
        if (local.isPresent() && local.get().getCastMembers() != null && !local.get().getCastMembers().isBlank()) {
            return parseStoredCastMembers(local.get().getCastMembers());
        }

        return Collections.emptyList();
    }

    private Integer parseYear(String releaseDate) {
        if (releaseDate == null || releaseDate.length() < 4) {
            return null;
        }
        try {
            return Integer.parseInt(releaseDate.substring(0, 4));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
