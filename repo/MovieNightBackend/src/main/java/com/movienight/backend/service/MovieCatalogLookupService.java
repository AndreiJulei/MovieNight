package com.movienight.backend.service;

import com.movienight.backend.client.OmdbClient;
import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.MovieResponse;
import com.movienight.backend.dto.external.OmdbResponse;
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

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.stream.Collectors;

/**
 * Service that orchestrates the 3-Tier Movie Lookup:
 * Tier 1: Local Database Cache (MovieRepository)
 * Tier 2: The Movie Database (TMDB API - Posters, Cast, Trailers)
 * Tier 3: Open Movie Database (OMDb API - Rotten Tomatoes & IMDb critic scores, non-blocking)
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

    public MovieCatalogLookupService(
            MovieRepository movieRepository,
            TmdbClient tmdbClient,
            OmdbClient omdbClient,
            CachedMovieListRepository cachedMovieListRepository,
            CatalogPersistenceService catalogPersistenceService,
            @Qualifier("catalogEnrichmentExecutor") Executor catalogEnrichmentExecutor
    ) {
        this.movieRepository = movieRepository;
        this.tmdbClient = tmdbClient;
        this.omdbClient = omdbClient;
        this.cachedMovieListRepository = cachedMovieListRepository;
        this.catalogPersistenceService = catalogPersistenceService;
        this.catalogEnrichmentExecutor = catalogEnrichmentExecutor;
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
     * Returns core details promptly without waiting for optional external enrichment.
     */
    public Movie getOrFetchMovie(Long tmdbId, String mediaTypeHint) {
        if (tmdbId == null || tmdbId <= 0) {
            throw new IllegalArgumentException("Provider ID must be positive");
        }

        var resourceType = ResourceType.fromCategory(mediaTypeHint);
        Optional<Movie> existingMovie = movieRepository.findByResourceTypeAndTmdbId(resourceType, tmdbId);
        if (existingMovie.isPresent()) {
            Movie movie = existingMovie.get();
            if (isIncomplete(movie) && tmdbClient.isConfigured()) {
                triggerBackgroundBackfill(movie.getId(), resourceType, tmdbId);
            }
            if (movie.getImdbId() != null && movie.getImdbRating() == null && omdbClient.isConfigured()) {
                triggerBackgroundEnrichment(movie.getId(), movie.getImdbId());
            }
            return movie;
        }

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

            // Trigger non-blocking background enrichment for critic scores
            if (saved.getImdbId() != null && omdbClient.isConfigured()) {
                triggerBackgroundEnrichment(saved.getId(), saved.getImdbId());
            }

            return saved;
        }
    }

    private void triggerBackgroundEnrichment(Long movieId, String imdbId) {
        if (movieId == null || imdbId == null || imdbId.isBlank() || !omdbClient.isConfigured()) {
            return;
        }
        catalogEnrichmentExecutor.execute(() -> {
            try {
                Optional<OmdbResponse> omdb = omdbClient.getMovieRatings(imdbId);
                if (omdb.isPresent()) {
                    Double imdbRating = omdbClient.extractImdbRating(omdb.get());
                    Integer rtScore = omdbClient.extractRottenTomatoesScore(omdb.get());
                    if (imdbRating != null || rtScore != null) {
                        catalogPersistenceService.updateRatings(movieId, imdbRating, rtScore);
                    }
                }
            } catch (Exception e) {
                log.warn("Background OMDb enrichment failed for IMDb ID '{}': {}", imdbId, e.getMessage());
            }
        });
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
                    catalogPersistenceService.backfillCoreDetails(movieId,
                            meta.overview(), meta.genres(), meta.director(),
                            meta.castMembers(), meta.trailerKey(), meta.runtimeMinutes());
                    if (meta.imdbId() != null && omdbClient.isConfigured()) {
                        triggerBackgroundEnrichment(movieId, meta.imdbId());
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
