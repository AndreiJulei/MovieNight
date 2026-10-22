package com.movienight.backend.service;

import com.movienight.backend.client.OmdbClient;
import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.MovieResponse;
import com.movienight.backend.dto.external.OmdbResponse;
import com.movienight.backend.dto.external.TmdbMovieDetailsResponse;
import com.movienight.backend.dto.external.TmdbSearchResponse;
import com.movienight.backend.model.Movie;
import com.movienight.backend.repository.MovieRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Service that orchestrates the 3-Tier Movie Lookup:
 * Tier 1: Local Database Cache (MovieRepository)
 * Tier 2: The Movie Database (TMDB API - Posters, Cast, Trailers)
 * Tier 3: Open Movie Database (OMDb API - Rotten Tomatoes & IMDb critic scores)
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MovieCatalogLookupService {

    private final MovieRepository movieRepository;
    private final TmdbClient tmdbClient;
    private final OmdbClient omdbClient;
    private final com.movienight.backend.repository.CachedMovieListRepository cachedMovieListRepository;

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
                if (item.getId() != null && !seenTmdbIds.contains(com.movienight.backend.model.ResourceType.fromCategory(item.getResolvedMediaType()) + ":" + item.getId())) {
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
                    seenTmdbIds.add(com.movienight.backend.model.ResourceType.fromCategory(item.getResolvedMediaType()) + ":" + item.getId());
                }
            }
        }

        return results;
    }

    /**
     * Get or fetch full media details by TMDB ID, enriching with OMDb and caching into local DB.
     */
    @Transactional
    public Movie getOrFetchMovie(Long tmdbId) {
        return getOrFetchMovie(tmdbId, null);
    }

    /**
     * Get or fetch full media details by TMDB ID with media type hint (MOVIE, TV, ANIME).
     */
    @Transactional
    public Movie getOrFetchMovie(Long tmdbId, String mediaTypeHint) {
        if (tmdbId == null || tmdbId <= 0) {
            throw new IllegalArgumentException("Provider ID must be positive");
        }

        var resourceType = com.movienight.backend.model.ResourceType.fromCategory(mediaTypeHint);
        Optional<Movie> existingMovie = movieRepository.findByResourceTypeAndTmdbId(resourceType, tmdbId);
        if (existingMovie.isPresent()) return existingMovie.get();
        Optional<TmdbMovieDetailsResponse> detailsOpt = resourceType == com.movienight.backend.model.ResourceType.TV
                ? tmdbClient.getTvDetails(tmdbId) : tmdbClient.getMovieDetails(tmdbId);
        if (detailsOpt.isEmpty()) {
            // An unconfigured provider can still serve an explicitly typed cached summary.
            if (!tmdbClient.isConfigured()) {
                var cached = cachedMovieListRepository.findByTmdbId(tmdbId).stream()
                        .filter(c -> resourceType == com.movienight.backend.model.ResourceType.fromCategory(c.getMediaType()))
                        .filter(c -> c.getTitle() != null && !c.getTitle().isBlank()).findFirst();
                if (cached.isPresent()) {
                    var c = cached.get();
                    return movieRepository.save(Movie.builder().tmdbId(tmdbId).title(c.getTitle())
                            .mediaType(c.getMediaType()).posterUrl(tmdbClient.buildPosterUrl(c.getPosterPath()))
                            .releaseYear(parseYear(c.getReleaseDate())).tmdbVoteAverage(c.getVoteAverage()).build());
                }
            }
            throw new com.movienight.backend.exception.ResourceNotFoundException("Title not found for " + resourceType + ":" + tmdbId);
        }

        TmdbMovieDetailsResponse tmdbDetails = detailsOpt.get();

        if (!tmdbId.equals(tmdbDetails.getId()) || tmdbDetails.getEffectiveTitle() == null
                || tmdbDetails.getEffectiveTitle().isBlank()) {
            throw new IllegalStateException("Provider returned invalid title details");
        }
        // Extract Cast (top 5) & Director/Creator
        String director = tmdbDetails.getEffectiveDirectorOrCreator();

        String castMembers = tmdbDetails.getCredits() != null && tmdbDetails.getCredits().getCast() != null
                ? tmdbDetails.getCredits().getCast().stream()
                .filter(c -> c.getOrder() != null && c.getOrder() <= 4)
                .map(TmdbMovieDetailsResponse.CastMember::getName)
                .collect(Collectors.joining(", "))
                : null;

        // Extract Official YouTube Trailer Key
        String trailerKey = tmdbDetails.getVideos() != null && tmdbDetails.getVideos().getResults() != null
                ? tmdbDetails.getVideos().getResults().stream()
                .filter(v -> "YouTube".equalsIgnoreCase(v.getSite()) && "Trailer".equalsIgnoreCase(v.getType()))
                .map(TmdbMovieDetailsResponse.VideoResult::getKey)
                .findFirst()
                .orElse(null)
                : null;

        // Genres
        String genres = tmdbDetails.getGenres() != null
                ? tmdbDetails.getGenres().stream()
                .map(TmdbMovieDetailsResponse.Genre::getName)
                .collect(Collectors.joining(", "))
                : null;

        // Tier 3: Enrich with OMDb (Rotten Tomatoes & IMDb score) if IMDb ID is available
        Double imdbRating = null;
        Integer rottenTomatoes = null;
        if (tmdbDetails.getImdbId() != null && omdbClient.isConfigured()) {
            Optional<OmdbResponse> omdb = omdbClient.getMovieRatings(tmdbDetails.getImdbId());
            if (omdb.isPresent()) {
                imdbRating = omdbClient.extractImdbRating(omdb.get());
                rottenTomatoes = omdbClient.extractRottenTomatoesScore(omdb.get());
            }
        }

        String safeTitle = tmdbDetails.getEffectiveTitle() != null && tmdbDetails.getEffectiveTitle().length() > 300
                ? tmdbDetails.getEffectiveTitle().substring(0, 300) : tmdbDetails.getEffectiveTitle();
        String safeDirector = director != null && director.length() > 300
                ? director.substring(0, 300) : director;
        String safeGenres = genres != null && genres.length() > 500
                ? genres.substring(0, 500) : genres;
        String safeTrailer = trailerKey != null && trailerKey.length() > 100
                ? trailerKey.substring(0, 100) : trailerKey;
        String safePosterUrl = tmdbClient.buildPosterUrl(tmdbDetails.getPosterPath());
        if (safePosterUrl != null && safePosterUrl.length() > 1000) safePosterUrl = safePosterUrl.substring(0, 1000);
        String safeBackdropUrl = tmdbClient.buildBackdropUrl(tmdbDetails.getBackdropPath());
        if (safeBackdropUrl != null && safeBackdropUrl.length() > 1000) safeBackdropUrl = safeBackdropUrl.substring(0, 1000);

        // Save into our permanent shared catalog
        Movie movie = Movie.builder()
                .tmdbId(tmdbDetails.getId())
                .imdbId(tmdbDetails.getImdbId())
                .title(safeTitle)
                .releaseYear(parseYear(tmdbDetails.getEffectiveReleaseDate()))
                .overview(tmdbDetails.getOverview())
                .posterUrl(safePosterUrl)
                .backdropUrl(safeBackdropUrl)
                .genres(safeGenres)
                .runtimeMinutes(tmdbDetails.getEffectiveRuntimeMinutes())
                .trailerKey(safeTrailer)
                .director(safeDirector)
                .castMembers(castMembers)
                .mediaType(tmdbDetails.getResolvedMediaType(resourceType))
                .seasonsCount(tmdbDetails.getNumberOfSeasons())
                .episodesCount(tmdbDetails.getNumberOfEpisodes())
                .imdbRating(imdbRating)
                .rottenTomatoesRating(rottenTomatoes)
                .tmdbVoteAverage(tmdbDetails.getVoteAverage())
                .tmdbVoteCount(tmdbDetails.getVoteCount())
                .build();

        log.info("Cached new {} into shared catalog: {} (TMDB: {})", movie.getMediaType(), movie.getTitle(), tmdbId);
        try {
            return movieRepository.save(movie);
        } catch (org.springframework.dao.DataIntegrityViolationException dive) {
            return movieRepository.findByResourceTypeAndTmdbId(resourceType, tmdbDetails.getId()).orElse(movie);
        }
    }

    /**
     * Retrieve movie directly by local database ID.
     */
    @Transactional
    public Movie getMovieById(Long id) {
        return movieRepository.findById(id).orElseThrow(() ->
                new com.movienight.backend.exception.ResourceNotFoundException("Catalog title not found: " + id));
    }

    /**
     * Helper to map Movie entity to response DTO.
     */
    public MovieResponse mapToResponse(Movie movie) {
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
                .mediaType(movie.getMediaType())
                .seasonsCount(movie.getSeasonsCount())
                .episodesCount(movie.getEpisodesCount())
                .imdbRating(movie.getImdbRating())
                .rottenTomatoesRating(movie.getRottenTomatoesRating())
                .tmdbVoteAverage(movie.getTmdbVoteAverage())
                .tmdbVoteCount(movie.getTmdbVoteCount())
                .build();
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
