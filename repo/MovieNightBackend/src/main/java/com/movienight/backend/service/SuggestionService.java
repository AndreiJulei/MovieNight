package com.movienight.backend.service;

import com.movienight.backend.client.TmdbClient;
import com.movienight.backend.dto.*;
import com.movienight.backend.model.*;
import com.movienight.backend.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Service providing aggregated suggestion and discovery categories across
 * Movies, TV Series, and Anime.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SuggestionService {

    private final UserRepository userRepository;
    private final UserMovieEntryRepository userMovieEntryRepository;
    private final FriendshipRepository friendshipRepository;
    private final CachedMovieListRepository cachedMovieListRepository;
    private final PersonalizedRecommendationRepository personalizedRecommendationRepository;
    private final PersonalizedRecommendationService personalizedRecommendationService;
    private final MovieRepository movieRepository;
    private final TmdbClient tmdbClient;
    private final SuggestionScheduler suggestionScheduler;

    /**
     * Get legacy aggregated discovery rows for the authenticated user.
     */
    @Transactional
    public SuggestionsResponse getSuggestions(String username) {
        User user = findUser(username);

        Long userId = user.getId();
        Set<Long> userLibraryTmdbIds = userMovieEntryRepository.findTmdbIdsByUserId(userId);

        // 1. Personalized Recommendations ("for-you")
        if (user.isNeedsRecommendationRefresh()) {
            personalizedRecommendationService.recomputeRecommendationsForUser(user);
        }

        List<PersonalizedRecommendation> personalRecs = personalizedRecommendationRepository.findByUserIdOrderByRankOrderAsc(userId);
        List<SuggestionMovieItem> forYouMovies = personalRecs.stream()
                .filter(rec -> !userLibraryTmdbIds.contains(rec.getTmdbId()))
                .map(rec -> SuggestionMovieItem.builder()
                        .tmdbId(rec.getTmdbId())
                        .title(rec.getTitle())
                        .posterUrl(rec.getPosterPath())
                        .voteAverage(rec.getVoteAverage())
                        .score(rec.getScore())
                        .mediaType(rec.getMediaType())
                        .reason("Personalized for your taste")
                        .build())
                .collect(Collectors.toList());

        // 2. Friends' Recommendations ("friends")
        List<Long> friendIds = friendshipRepository.findAllFriendIdsForUser(userId);
        List<SuggestionMovieItem> friendsMovies = new ArrayList<>();

        if (!friendIds.isEmpty()) {
            List<FriendsConsensusProjection> consensusList = userMovieEntryRepository.findFriendsConsensusWatched(friendIds, userId);
            for (FriendsConsensusProjection p : consensusList) {
                if (p.getTmdbId() != null && !userLibraryTmdbIds.contains(p.getTmdbId())) {
                    friendsMovies.add(SuggestionMovieItem.builder()
                            .tmdbId(p.getTmdbId())
                            .title(p.getTitle())
                            .posterUrl(p.getPosterUrl())
                            .releaseYear(p.getReleaseYear())
                            .imdbRating(p.getImdbRating())
                            .rottenTomatoesRating(p.getRottenTomatoesRating())
                            .score(p.getAvgRating())
                            .reason(String.format("Rated %.1f★ by %d friend%s", p.getAvgRating(), p.getFriendsCount(), p.getFriendsCount() > 1 ? "s" : ""))
                            .build());
                }
            }

            List<FriendsWatchlistProjection> watchlistList = userMovieEntryRepository.findFriendsWatchlistMovies(friendIds, userId);
            Set<Long> alreadyAdded = friendsMovies.stream().map(SuggestionMovieItem::getTmdbId).collect(Collectors.toSet());
            for (FriendsWatchlistProjection w : watchlistList) {
                if (w.getTmdbId() != null && !userLibraryTmdbIds.contains(w.getTmdbId()) && !alreadyAdded.contains(w.getTmdbId())) {
                    friendsMovies.add(SuggestionMovieItem.builder()
                            .tmdbId(w.getTmdbId())
                            .title(w.getTitle())
                            .posterUrl(w.getPosterUrl())
                            .releaseYear(w.getReleaseYear())
                            .imdbRating(w.getImdbRating())
                            .rottenTomatoesRating(w.getRottenTomatoesRating())
                            .reason(String.format("On %d friend%s watchlist", w.getFriendsCount(), w.getFriendsCount() > 1 ? "s'" : "'s"))
                            .build());
                }
            }
        }

        // 3. Most Popular ("popular")
        List<SuggestionMovieItem> popularMovies = getCachedCategoryMovies("MOVIE", MovieListType.POPULAR, userLibraryTmdbIds);

        // 4. Most Recent ("recent")
        List<SuggestionMovieItem> recentMovies = getCachedCategoryMovies("MOVIE", MovieListType.RECENT, userLibraryTmdbIds);

        // 5. Upcoming & Releases ("upcoming")
        List<SuggestionMovieItem> upcomingMovies = getCachedCategoryMovies("MOVIE", MovieListType.UPCOMING, userLibraryTmdbIds);

        if (forYouMovies.isEmpty()) {
            forYouMovies = popularMovies.stream().limit(10).collect(Collectors.toList());
        }

        List<SuggestionCategoryResponse> categories = List.of(
                SuggestionCategoryResponse.builder()
                        .id("for-you")
                        .title("Personal Recommendations")
                        .movies(forYouMovies)
                        .build(),
                SuggestionCategoryResponse.builder()
                        .id("friends")
                        .title("Friends' Recommendations")
                        .movies(friendsMovies)
                        .build(),
                SuggestionCategoryResponse.builder()
                        .id("popular")
                        .title("Most Popular")
                        .movies(popularMovies)
                        .build(),
                SuggestionCategoryResponse.builder()
                        .id("recent")
                        .title("Most Recent")
                        .movies(recentMovies)
                        .build(),
                SuggestionCategoryResponse.builder()
                        .id("upcoming")
                        .title("Upcoming & Releases")
                        .movies(upcomingMovies)
                        .build()
        );

        return SuggestionsResponse.builder()
                .categories(categories)
                .build();
    }

    /**
     * Strictly category-aware Personal Recommendations (max 3 rows: Movie, TV Series, Anime).
     * Only categories where the user has watched >= 1 title are included.
     */
    @Transactional
    public SuggestionsResponse getPersonalRecommendations(String username) {
        User user = findUser(username);

        Long userId = user.getId();
        Set<Long> userLibraryTmdbIds = userMovieEntryRepository.findTmdbIdsByUserId(userId);

        if (user.isNeedsRecommendationRefresh()) {
            personalizedRecommendationService.recomputeRecommendationsForUser(user);
        }

        List<UserMovieEntry> userEntries = userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(userId);
        List<UserMovieEntry> watchedEntries = userEntries.stream()
                .filter(e -> e.getStatus() == MovieStatus.WATCHED || e.getPersonalRating() != null)
                .toList();

        boolean hasWatchedMovie = watchedEntries.stream()
                .anyMatch(e -> e.getMovie() != null && (e.getMovie().getMediaType() == null || "MOVIE".equalsIgnoreCase(e.getMovie().getMediaType())));
        boolean hasWatchedTv = watchedEntries.stream()
                .anyMatch(e -> e.getMovie() != null && "TV".equalsIgnoreCase(e.getMovie().getMediaType()));
        boolean hasWatchedAnime = watchedEntries.stream()
                .anyMatch(e -> e.getMovie() != null && "ANIME".equalsIgnoreCase(e.getMovie().getMediaType()));

        List<PersonalizedRecommendation> allRecs = personalizedRecommendationRepository.findByUserIdOrderByRankOrderAsc(userId);
        List<SuggestionCategoryResponse> categories = new ArrayList<>();

        // 1. Movie Recommendations row (strictly only if user has watched >= 1 movie)
        if (hasWatchedMovie) {
            List<SuggestionMovieItem> movieItems = allRecs.stream()
                    .filter(r -> "MOVIE".equalsIgnoreCase(r.getMediaType()) && !userLibraryTmdbIds.contains(r.getTmdbId()))
                    .map(this::mapPersonalRecToItem)
                    .toList();
            if (!movieItems.isEmpty()) {
                categories.add(SuggestionCategoryResponse.builder()
                        .id("movies")
                        .title("Movie Recommendations")
                        .movies(movieItems)
                        .build());
            }
        }

        // 2. TV Series Recommendations row (strictly only if user has watched >= 1 TV show)
        if (hasWatchedTv) {
            List<SuggestionMovieItem> tvItems = allRecs.stream()
                    .filter(r -> "TV".equalsIgnoreCase(r.getMediaType()) && !userLibraryTmdbIds.contains(r.getTmdbId()))
                    .map(this::mapPersonalRecToItem)
                    .toList();
            if (!tvItems.isEmpty()) {
                categories.add(SuggestionCategoryResponse.builder()
                        .id("tv")
                        .title("TV Series Recommendations")
                        .movies(tvItems)
                        .build());
            }
        }

        // 3. Anime Recommendations row (strictly only if user has watched >= 1 anime)
        if (hasWatchedAnime) {
            List<SuggestionMovieItem> animeItems = allRecs.stream()
                    .filter(r -> "ANIME".equalsIgnoreCase(r.getMediaType()) && !userLibraryTmdbIds.contains(r.getTmdbId()))
                    .map(this::mapPersonalRecToItem)
                    .toList();
            if (!animeItems.isEmpty()) {
                categories.add(SuggestionCategoryResponse.builder()
                        .id("anime")
                        .title("Anime Recommendations")
                        .movies(animeItems)
                        .build());
            }
        }

        return SuggestionsResponse.builder().categories(categories).build();
    }

    /**
     * Dedicated Friends' Recommendations row.
     */
    @Transactional
    public SuggestionsResponse getFriendsRecommendations(String username) {
        User user = findUser(username);

        Long userId = user.getId();
        Set<Long> userLibraryTmdbIds = userMovieEntryRepository.findTmdbIdsByUserId(userId);
        List<Long> friendIds = friendshipRepository.findAllFriendIdsForUser(userId);
        List<SuggestionMovieItem> friendsMovies = new ArrayList<>();

        if (!friendIds.isEmpty()) {
            List<FriendsConsensusProjection> consensusList = userMovieEntryRepository.findFriendsConsensusWatched(friendIds, userId);
            for (FriendsConsensusProjection p : consensusList) {
                if (p.getTmdbId() != null && !userLibraryTmdbIds.contains(p.getTmdbId())) {
                    friendsMovies.add(SuggestionMovieItem.builder()
                            .tmdbId(p.getTmdbId())
                            .title(p.getTitle())
                            .posterUrl(p.getPosterUrl())
                            .releaseYear(p.getReleaseYear())
                            .imdbRating(p.getImdbRating())
                            .rottenTomatoesRating(p.getRottenTomatoesRating())
                            .score(p.getAvgRating())
                            .reason(String.format("Rated %.1f★ by %d friend%s", p.getAvgRating(), p.getFriendsCount(), p.getFriendsCount() > 1 ? "s" : ""))
                            .build());
                }
            }

            List<FriendsWatchlistProjection> watchlistList = userMovieEntryRepository.findFriendsWatchlistMovies(friendIds, userId);
            Set<Long> alreadyAdded = friendsMovies.stream().map(SuggestionMovieItem::getTmdbId).collect(Collectors.toSet());
            for (FriendsWatchlistProjection w : watchlistList) {
                if (w.getTmdbId() != null && !userLibraryTmdbIds.contains(w.getTmdbId()) && !alreadyAdded.contains(w.getTmdbId())) {
                    friendsMovies.add(SuggestionMovieItem.builder()
                            .tmdbId(w.getTmdbId())
                            .title(w.getTitle())
                            .posterUrl(w.getPosterUrl())
                            .releaseYear(w.getReleaseYear())
                            .imdbRating(w.getImdbRating())
                            .rottenTomatoesRating(w.getRottenTomatoesRating())
                            .reason(String.format("On %d friend%s watchlist", w.getFriendsCount(), w.getFriendsCount() > 1 ? "s'" : "'s"))
                            .build());
                }
            }
        }

        return SuggestionsResponse.builder()
                .categories(List.of(
                        SuggestionCategoryResponse.builder()
                                .id("friends")
                                .title("Friends' Recommendations")
                                .movies(friendsMovies)
                                .build()
                ))
                .build();
    }

    /**
     * Get explore shelves for a specific media type (Movies, TV Series, or Anime).
     */
    public SuggestionsResponse getExploreMedia(String mediaType) {
        String normalizedType = normalizeMediaType(mediaType);
        List<CachedMovieList> allCached = cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc(normalizedType);

        if (allCached.isEmpty() && tmdbClient.isConfigured()) {
            suggestionScheduler.refreshMediaType(normalizedType);
            allCached = cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc(normalizedType);
        }

        List<SuggestionCategoryResponse> categories = new ArrayList<>();
        Set<Long> newestOrAiringTmdbIds = new HashSet<>();

        if ("MOVIE".equals(normalizedType)) {
            // Row 1: Newest Releases
            List<SuggestionMovieItem> newest = mapCachedItems(
                    allCached.stream().filter(c -> c.getListType() == MovieListType.RECENT).toList(),
                    normalizedType
            );
            if (!newest.isEmpty()) {
                newest.forEach(m -> newestOrAiringTmdbIds.add(m.getTmdbId()));
                categories.add(SuggestionCategoryResponse.builder()
                        .id("newest")
                        .title("Newest Releases")
                        .movies(newest)
                        .build());
            }

            // Row 2: Most Popular (deduped from Newest)
            List<SuggestionMovieItem> popular = mapCachedItems(
                    allCached.stream().filter(c -> c.getListType() == MovieListType.POPULAR && !newestOrAiringTmdbIds.contains(c.getTmdbId())).toList(),
                    normalizedType
            );
            if (!popular.isEmpty()) {
                categories.add(SuggestionCategoryResponse.builder()
                        .id("popular")
                        .title("Most Popular")
                        .movies(popular)
                        .build());
            }

            // Row 3: Top Rated
            List<SuggestionMovieItem> topRated = mapCachedItems(
                    allCached.stream().filter(c -> c.getListType() == MovieListType.TOP_RATED).toList(),
                    normalizedType
            );
            if (!topRated.isEmpty()) {
                categories.add(SuggestionCategoryResponse.builder()
                        .id("top-rated")
                        .title("Top Rated")
                        .movies(topRated)
                        .build());
            }

            // Row 4: Upcoming & Most Anticipated
            List<SuggestionMovieItem> upcoming = mapCachedItems(
                    allCached.stream().filter(c -> c.getListType() == MovieListType.UPCOMING).toList(),
                    normalizedType
            );
            if (!upcoming.isEmpty()) {
                categories.add(SuggestionCategoryResponse.builder()
                        .id("upcoming")
                        .title("Upcoming & Most Anticipated")
                        .movies(upcoming)
                        .build());
            }
        } else if ("TV".equals(normalizedType)) {
            // Row 1: Currently Airing
            List<SuggestionMovieItem> airing = mapCachedItems(
                    allCached.stream().filter(c -> c.getListType() == MovieListType.CURRENTLY_AIRING).toList(),
                    normalizedType
            );
            if (!airing.isEmpty()) {
                airing.forEach(m -> newestOrAiringTmdbIds.add(m.getTmdbId()));
                categories.add(SuggestionCategoryResponse.builder()
                        .id("airing")
                        .title("Currently Airing")
                        .movies(airing)
                        .build());
            }

            // Row 2: Most Popular
            List<SuggestionMovieItem> popular = mapCachedItems(
                    allCached.stream().filter(c -> c.getListType() == MovieListType.POPULAR && !newestOrAiringTmdbIds.contains(c.getTmdbId())).toList(),
                    normalizedType
            );
            if (!popular.isEmpty()) {
                categories.add(SuggestionCategoryResponse.builder()
                        .id("popular")
                        .title("Most Popular")
                        .movies(popular)
                        .build());
            }

            // Row 3: Top Rated
            List<SuggestionMovieItem> topRated = mapCachedItems(
                    allCached.stream().filter(c -> c.getListType() == MovieListType.TOP_RATED).toList(),
                    normalizedType
            );
            if (!topRated.isEmpty()) {
                categories.add(SuggestionCategoryResponse.builder()
                        .id("top-rated")
                        .title("Top Rated")
                        .movies(topRated)
                        .build());
            }

            // Row 4: Upcoming Seasons
            List<SuggestionMovieItem> upcoming = mapCachedItems(
                    allCached.stream().filter(c -> c.getListType() == MovieListType.UPCOMING).toList(),
                    normalizedType
            );
            if (!upcoming.isEmpty()) {
                categories.add(SuggestionCategoryResponse.builder()
                        .id("upcoming")
                        .title("Upcoming Seasons")
                        .movies(upcoming)
                        .build());
            }
        } else if ("ANIME".equals(normalizedType)) {
            // Row 1: Current Season Hits
            List<SuggestionMovieItem> hits = mapCachedItems(
                    allCached.stream().filter(c -> c.getListType() == MovieListType.CURRENTLY_AIRING).toList(),
                    normalizedType
            );
            if (!hits.isEmpty()) {
                hits.forEach(m -> newestOrAiringTmdbIds.add(m.getTmdbId()));
                categories.add(SuggestionCategoryResponse.builder()
                        .id("current-season")
                        .title("Current Season Hits")
                        .movies(hits)
                        .build());
            }

            // Row 2: Most Popular
            List<SuggestionMovieItem> popular = mapCachedItems(
                    allCached.stream().filter(c -> c.getListType() == MovieListType.POPULAR && !newestOrAiringTmdbIds.contains(c.getTmdbId())).toList(),
                    normalizedType
            );
            if (!popular.isEmpty()) {
                categories.add(SuggestionCategoryResponse.builder()
                        .id("popular")
                        .title("Most Popular")
                        .movies(popular)
                        .build());
            }

            // Row 3: All-Time Acclaimed
            List<SuggestionMovieItem> topRated = mapCachedItems(
                    allCached.stream().filter(c -> c.getListType() == MovieListType.TOP_RATED).toList(),
                    normalizedType
            );
            if (!topRated.isEmpty()) {
                categories.add(SuggestionCategoryResponse.builder()
                        .id("top-rated")
                        .title("All-Time Acclaimed")
                        .movies(topRated)
                        .build());
            }

            // Row 4: Upcoming Next Season
            List<SuggestionMovieItem> upcoming = mapCachedItems(
                    allCached.stream().filter(c -> c.getListType() == MovieListType.UPCOMING).toList(),
                    normalizedType
            );
            if (!upcoming.isEmpty()) {
                categories.add(SuggestionCategoryResponse.builder()
                        .id("upcoming")
                        .title("Upcoming Next Season")
                        .movies(upcoming)
                        .build());
            }
        }

        return SuggestionsResponse.builder().categories(categories).build();
    }

    private List<SuggestionMovieItem> mapCachedItems(List<CachedMovieList> list, String mediaType) {
        return list.stream()
                .map(item -> SuggestionMovieItem.builder()
                        .tmdbId(item.getTmdbId())
                        .title(item.getTitle())
                        .posterUrl(item.getPosterPath() != null ? tmdbClient.buildPosterUrl(item.getPosterPath()) : null)
                        .voteAverage(item.getVoteAverage())
                        .releaseYear(parseYear(item.getReleaseDate()))
                        .mediaType(mediaType)
                        .build())
                .collect(Collectors.toList());
    }

    private SuggestionMovieItem mapPersonalRecToItem(PersonalizedRecommendation rec) {
        return SuggestionMovieItem.builder()
                .tmdbId(rec.getTmdbId())
                .title(rec.getTitle())
                .posterUrl(rec.getPosterPath())
                .voteAverage(rec.getVoteAverage())
                .score(rec.getScore())
                .mediaType(rec.getMediaType())
                .reason("Personalized for your taste")
                .build();
    }

    private List<SuggestionMovieItem> getCachedCategoryMovies(String mediaType, MovieListType listType, Set<Long> userLibraryTmdbIds) {
        List<CachedMovieList> cached = cachedMovieListRepository.findByMediaTypeAndListTypeOrderByRankOrderAsc(mediaType, listType);
        if (cached.isEmpty()) {
            cached = cachedMovieListRepository.findByListTypeOrderByRankOrderAsc(listType);
        }
        return cached.stream()
                .filter(item -> !userLibraryTmdbIds.contains(item.getTmdbId()))
                .map(item -> SuggestionMovieItem.builder()
                        .tmdbId(item.getTmdbId())
                        .title(item.getTitle())
                        .posterUrl(item.getPosterPath() != null ? tmdbClient.buildPosterUrl(item.getPosterPath()) : null)
                        .voteAverage(item.getVoteAverage())
                        .releaseYear(parseYear(item.getReleaseDate()))
                        .mediaType(mediaType)
                        .build())
                .collect(Collectors.toList());
    }

    private String normalizeMediaType(String type) {
        if (type == null) return "MOVIE";
        String s = type.trim().toUpperCase();
        if (s.contains("TV") || s.contains("SERIES")) return "TV";
        if (s.contains("ANIME")) return "ANIME";
        return "MOVIE";
    }

    private Integer parseYear(String releaseDate) {
        if (releaseDate == null || releaseDate.length() < 4) return null;
        try {
            return Integer.parseInt(releaseDate.substring(0, 4));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private User findUser(String username) {
        String clean = username != null ? username.trim() : "";
        return userRepository.findByUsername(clean)
                .or(() -> userRepository.findByUsernameIgnoreCase(clean))
                .or(() -> userRepository.findByEmailIgnoreCase(clean))
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + clean));
    }
}
