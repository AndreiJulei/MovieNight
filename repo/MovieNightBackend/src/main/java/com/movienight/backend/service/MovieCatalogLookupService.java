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
        Set<Long> seenTmdbIds = new HashSet<>();

        // Tier 1: Check Local DB first
        List<Movie> localMatches = movieRepository.findByTitleContainingIgnoreCase(cleanQuery);
        for (Movie movie : localMatches) {
            results.add(mapToResponse(movie));
            if (movie.getTmdbId() != null) {
                seenTmdbIds.add(movie.getTmdbId());
            }
        }

        // Tier 2: Search TMDB for fresh discoveries (Movies, TV Series, Anime)
        if (tmdbClient.isConfigured()) {
            List<TmdbSearchResponse.TmdbMovieSummary> tmdbResults = tmdbClient.searchMovies(cleanQuery);
            for (TmdbSearchResponse.TmdbMovieSummary item : tmdbResults) {
                if (item.getId() != null && !seenTmdbIds.contains(item.getId())) {
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
                    seenTmdbIds.add(item.getId());
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
        if (tmdbId == null) {
            throw new IllegalArgumentException("TMDB ID cannot be null");
        }

        // If mediaTypeHint is not provided, infer from cached explore/suggestions list
        String resolvedHint = mediaTypeHint;
        if (resolvedHint == null || resolvedHint.isBlank()) {
            List<com.movienight.backend.model.CachedMovieList> cached = cachedMovieListRepository.findByTmdbId(tmdbId);
            if (!cached.isEmpty()) {
                resolvedHint = cached.get(0).getMediaType();
            }
        }

        // Tier 1: Return from local database if already cached
        Optional<Movie> existingMovie = movieRepository.findByTmdbId(tmdbId);
        if (existingMovie.isPresent()) {
            Movie existing = existingMovie.get();
            // A provider ID alone cannot turn an existing series into a movie.
            // TV and ANIME describe the same provider resource; MOVIE is distinct.
            if (resolvedHint != null && !resolvedHint.isBlank()
                    && "MOVIE".equalsIgnoreCase(resolvedHint) != "MOVIE".equalsIgnoreCase(existing.getMediaType())) {
                throw new IllegalArgumentException("This provider ID belongs to another media type. Separate movie/TV catalog identities are not available yet.");
            }
            return existing;
        }

        // Tier 2: Fetch full details from TMDB (supporting Movies, TV series, Anime)
        Optional<TmdbMovieDetailsResponse> detailsOpt;
        if (resolvedHint != null && (resolvedHint.equalsIgnoreCase("TV") || resolvedHint.equalsIgnoreCase("ANIME"))) {
            detailsOpt = tmdbClient.getTvDetails(tmdbId);
            if (detailsOpt.isEmpty()) {
                detailsOpt = tmdbClient.getMovieDetails(tmdbId);
            }
        } else {
            detailsOpt = tmdbClient.getMovieDetails(tmdbId);
            if (detailsOpt.isEmpty()) {
                detailsOpt = tmdbClient.getTvDetails(tmdbId);
            }
        }

        if (detailsOpt.isEmpty()) {
            if (existingMovie.isPresent()) {
                return existingMovie.get();
            }
            Optional<Movie> byId = movieRepository.findById(tmdbId);
            if (byId.isPresent()) {
                return byId.get();
            }
            List<com.movienight.backend.model.CachedMovieList> cachedList = cachedMovieListRepository.findByTmdbId(tmdbId);
            if (!cachedList.isEmpty()) {
                com.movienight.backend.model.CachedMovieList c = cachedList.get(0);
                Movie fallback = Movie.builder()
                        .tmdbId(c.getTmdbId())
                        .title(c.getTitle())
                        .posterUrl(tmdbClient.buildPosterUrl(c.getPosterPath()))
                        .releaseYear(parseYear(c.getReleaseDate()))
                        .mediaType(c.getMediaType())
                        .tmdbVoteAverage(c.getVoteAverage())
                        .build();
                log.info("Serving fallback movie from cached_movie_list for TMDB ID: {} - {}", tmdbId, fallback.getTitle());
                return movieRepository.save(fallback);
            }
            throw new com.movienight.backend.exception.ResourceNotFoundException("Media not found on TMDB or local cache for ID: " + tmdbId);
        }

        TmdbMovieDetailsResponse tmdbDetails = detailsOpt.get();

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
                .mediaType(tmdbDetails.getResolvedMediaType())
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
            return movieRepository.findByTmdbId(tmdbDetails.getId()).orElse(movie);
        }
    }

    /**
     * Retrieve movie directly by local database ID.
     */
    @Transactional
    public Movie getMovieById(Long id) {
        Optional<Movie> found = movieRepository.findById(id);
        if (found.isPresent()) {
            return found.get();
        }
        Optional<Movie> byTmdb = movieRepository.findByTmdbId(id);
        if (byTmdb.isPresent()) {
            return byTmdb.get();
        }
        List<com.movienight.backend.model.CachedMovieList> cached = cachedMovieListRepository.findByTmdbId(id);
        if (!cached.isEmpty()) {
            com.movienight.backend.model.CachedMovieList c = cached.get(0);
            Movie fallback = Movie.builder()
                    .tmdbId(c.getTmdbId())
                    .title(c.getTitle())
                    .posterUrl(tmdbClient.buildPosterUrl(c.getPosterPath()))
                    .releaseYear(parseYear(c.getReleaseDate()))
                    .mediaType(c.getMediaType())
                    .tmdbVoteAverage(c.getVoteAverage())
                    .build();
            return movieRepository.save(fallback);
        }
        throw new com.movienight.backend.exception.ResourceNotFoundException("Movie not found with ID: " + id);
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
