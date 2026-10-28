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
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
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
    private final DiscoverySnapshotRepository discoverySnapshotRepository;
    private final PersonalizedRecommendationService personalizedRecommendationService;
    private final TmdbClient tmdbClient;
    private final SuggestionScheduler suggestionScheduler;
    private final MovieRepository movieRepository;
    private final UserLibraryExclusionService userLibraryExclusionService;

    /**
     * Get legacy aggregated discovery rows for the authenticated user.
     */
    @Transactional
    public SuggestionsResponse getSuggestions(String username) {
        User user = findUser(username);

        Long userId = user.getId();
        Set<Long> userLibraryTmdbIds = userMovieEntryRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .filter(e -> "MOVIE".equals(e.getMovie().getMediaType()))
                .map(e -> e.getMovie().getTmdbId()).filter(Objects::nonNull).collect(Collectors.toSet());

        SuggestionCategoryResponse personal = personalizedRecommendationService.movieCategory(user);
        personal.setId("for-you");

        // 2. Use the same accepted-friend sources as the dedicated endpoint.
        List<SuggestionCategoryResponse> friendCategories = friendCategories(userId);

        // 3. Most Popular ("popular")
        List<SuggestionMovieItem> popularMovies = getCachedCategoryMovies("MOVIE", MovieListType.POPULAR, userLibraryTmdbIds);

        // 4. Most Recent ("recent")
        List<SuggestionMovieItem> recentMovies = getCachedCategoryMovies("MOVIE", MovieListType.RECENT, userLibraryTmdbIds);

        // 5. Upcoming & Releases ("upcoming")
        List<SuggestionMovieItem> upcomingMovies = getCachedCategoryMovies("MOVIE", MovieListType.UPCOMING, userLibraryTmdbIds);

        List<SuggestionCategoryResponse> categories = new ArrayList<>();
        categories.add(personal);
        categories.addAll(friendCategories);
        categories.add(SuggestionCategoryResponse.builder().id("popular")
                .title("Popular & well rated").movies(popularMovies).build());
        categories.add(SuggestionCategoryResponse.builder().id("recent")
                .title("Most Recent").movies(recentMovies).build());
        categories.add(SuggestionCategoryResponse.builder().id("upcoming")
                .title("Upcoming & Releases").movies(upcomingMovies).build());

        return SuggestionsResponse.builder()
                .categories(categories)
                .build();
    }

    /**
     * Movie-only personal recommendations, including explicit coverage diagnostics.
     */
    @Transactional
    public SuggestionsResponse getPersonalRecommendations(String username) {
        User user = findUser(username);

        return SuggestionsResponse.builder()
                .categories(List.of(personalizedRecommendationService.movieCategory(user))).build();
    }

    /**
     * Dedicated Friends' Recommendations row.
     */
    @Transactional
    public SuggestionsResponse getFriendsRecommendations(String username) {
        return SuggestionsResponse.builder().categories(friendCategories(findUser(username).getId())).build();
    }

    private List<SuggestionCategoryResponse> friendCategories(Long userId) {
        List<Long> friendIds = friendshipRepository.findAcceptedFriendIdsForUser(userId);
        List<SuggestionMovieItem> rated = new ArrayList<>();
        List<SuggestionMovieItem> watchlist = new ArrayList<>();
        if (!friendIds.isEmpty()) {
            for (FriendsConsensusProjection p : userMovieEntryRepository.findFriendsConsensusWatched(friendIds, userId)) {
                rated.add(SuggestionMovieItem.builder()
                        .tmdbId(p.getTmdbId()).title(p.getTitle()).posterUrl(p.getPosterUrl())
                        .releaseYear(p.getReleaseYear()).imdbRating(p.getImdbRating())
                        .rottenTomatoesRating(p.getRottenTomatoesRating()).mediaType("MOVIE")
                        .score(p.getConsensusScore())
                        .reason(String.format(Locale.ROOT, "Average %.1f/10 × %d friend%s", p.getAvgRating(), p.getFriendsCount(), p.getFriendsCount() == 1 ? "" : "s"))
                        .build());
            }
            Set<Long> ratedIds = rated.stream().map(SuggestionMovieItem::getTmdbId).collect(Collectors.toSet());
            for (FriendsWatchlistProjection w : userMovieEntryRepository.findFriendsWatchlistMovies(friendIds, userId)) {
                if (!ratedIds.contains(w.getTmdbId())) {
                    watchlist.add(SuggestionMovieItem.builder()
                            .tmdbId(w.getTmdbId()).title(w.getTitle()).posterUrl(w.getPosterUrl())
                            .releaseYear(w.getReleaseYear()).imdbRating(w.getImdbRating())
                            .rottenTomatoesRating(w.getRottenTomatoesRating()).mediaType("MOVIE")
                            .reason(String.format(Locale.ROOT, "On %d friend%s watchlist%s", w.getFriendsCount(), w.getFriendsCount() == 1 ? "’s" : "s’", w.getFriendsCount() == 1 ? "" : "s"))
                            .build());
                }
            }
        }
        return List.of(
                SuggestionCategoryResponse.builder().id("friends").title("Rated by friends").movies(rated).build(),
                SuggestionCategoryResponse.builder().id("friends-watchlist").title("On friends’ watchlists").movies(watchlist).build());
    }

    /**
     * Get explore shelves for a specific media type (Movies, TV Series, or Anime).
     */
    public SuggestionsResponse getExploreMedia(String mediaType) {
        return getExploreMedia(mediaType, null);
    }

    public SuggestionsResponse getExploreMedia(String mediaType, String username) {
        String type = userLibraryExclusionService.normalizeMediaType(mediaType);
        Set<Long> excludedTmdbIds = userLibraryExclusionService.getExcludedTmdbIds(username, type);
        List<DiscoverySnapshot> snapshots = discoverySnapshotRepository.findByMediaType(type);
        if (snapshots.size() < 4 && tmdbClient.isConfigured()) {
            try { suggestionScheduler.refreshMediaType(type); }
            catch (RuntimeException failure) { log.warn("Discovery refresh unavailable for {}", type); }
            snapshots = discoverySnapshotRepository.findByMediaType(type);
        }
        Map<MovieListType, DiscoverySnapshot> published = snapshots.stream()
                .collect(Collectors.toMap(DiscoverySnapshot::getListType, snapshot -> snapshot));
        List<CachedMovieList> cached = cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc(type);
        if ("TV".equals(type)) {
            Set<Long> animeIds = cachedMovieListRepository.findByMediaTypeOrderByRankOrderAsc("ANIME")
                    .stream().map(CachedMovieList::getTmdbId).collect(Collectors.toSet());
            movieRepository.findByMediaType("ANIME").stream().map(Movie::getTmdbId)
                    .filter(Objects::nonNull).forEach(animeIds::add);
            cached = cached.stream().filter(item -> !animeIds.contains(item.getTmdbId())).toList();
        }
        List<SuggestionCategoryResponse> categories = new ArrayList<>();
        if ("MOVIE".equals(type)) {
            categories.add(exploreShelf(type, "newest", "Newest Releases", MovieListType.RECENT, cached, published, excludedTmdbIds));
            categories.add(exploreShelf(type, "popular", "Popular & well rated", MovieListType.POPULAR, cached, published, excludedTmdbIds));
            categories.add(exploreShelf(type, "top-rated", "Top Rated", MovieListType.TOP_RATED, cached, published, excludedTmdbIds));
            categories.add(exploreShelf(type, "upcoming", "Upcoming Movies", MovieListType.UPCOMING, cached, published, excludedTmdbIds));
        } else if ("TV".equals(type)) {
            categories.add(exploreShelf(type, "airing", "Currently Airing", MovieListType.CURRENTLY_AIRING, cached, published, excludedTmdbIds));
            categories.add(exploreShelf(type, "popular", "Popular & well rated", MovieListType.POPULAR, cached, published, excludedTmdbIds));
            categories.add(exploreShelf(type, "top-rated", "Top Rated", MovieListType.TOP_RATED, cached, published, excludedTmdbIds));
            categories.add(exploreShelf(type, "upcoming", "Upcoming Series", MovieListType.UPCOMING, cached, published, excludedTmdbIds));
        } else {
            categories.add(exploreShelf(type, "current-season", "Current Season Hits", MovieListType.CURRENTLY_AIRING, cached, published, excludedTmdbIds));
            categories.add(exploreShelf(type, "popular", "Popular & well rated", MovieListType.POPULAR, cached, published, excludedTmdbIds));
            categories.add(exploreShelf(type, "top-rated", "Top Rated", MovieListType.TOP_RATED, cached, published, excludedTmdbIds));
            categories.add(exploreShelf(type, "upcoming", "Upcoming Anime Series", MovieListType.UPCOMING, cached, published, excludedTmdbIds));
        }
        return SuggestionsResponse.builder().categories(categories).build();
    }

    private SuggestionCategoryResponse exploreShelf(String mediaType, String id, String title,
            MovieListType listType, List<CachedMovieList> cached,
            Map<MovieListType, DiscoverySnapshot> published, Set<Long> excludedTmdbIds) {
        DiscoverySnapshot snapshot = published.get(listType);
        if (snapshot == null) return SuggestionCategoryResponse.builder().id(id).title(title)
                .state("UNAVAILABLE").movies(List.of()).hasMore(false).totalEligibleInPool(0).build();
        Duration age = Duration.between(snapshot.getUpdatedAt(), LocalDateTime.now(ZoneOffset.UTC));
        if (age.compareTo(Duration.ofDays(7)) > 0) return SuggestionCategoryResponse.builder()
                .id(id).title(title).state("UNAVAILABLE").updatedAt(snapshot.getUpdatedAt() + "Z")
                .movies(List.of()).hasMore(false).totalEligibleInPool(0).build();
        List<CachedMovieList> filtered = cached.stream()
                .filter(item -> item.getListType() == listType)
                .filter(item -> !excludedTmdbIds.contains(item.getTmdbId()))
                .toList();
        List<SuggestionMovieItem> items = mapCachedItems(filtered, mediaType);
        List<SuggestionMovieItem> previewItems = items.stream().limit(20).toList();
        boolean hasMore = items.size() > 20;
        return SuggestionCategoryResponse.builder().id(id).title(title)
                .state(age.compareTo(Duration.ofHours(24)) > 0 ? "STALE" : previewItems.isEmpty() ? "EMPTY" : "READY")
                .updatedAt(snapshot.getUpdatedAt() + "Z").movies(previewItems)
                .hasMore(hasMore)
                .totalEligibleInPool(items.size())
                .build();
    }



    private List<SuggestionMovieItem> mapCachedItems(List<CachedMovieList> list, String mediaType) {
        Set<Long> seen = new HashSet<>();
        return list.stream().filter(item -> seen.add(item.getTmdbId()))
                .map(item -> SuggestionMovieItem.builder()
                        .tmdbId(item.getTmdbId())
                        .title(item.getTitle())
                        .posterUrl(item.getPosterPath() != null ? tmdbClient.buildPosterUrl(item.getPosterPath()) : null)
                        .voteAverage(item.getVoteAverage())
                        .voteCount(item.getVoteCount())
                        .releaseYear(parseYear(item.getReleaseDate()))
                        .mediaType(mediaType)
                        .build())
                .collect(Collectors.toList());
    }

    private List<SuggestionMovieItem> getCachedCategoryMovies(String mediaType, MovieListType listType, Set<Long> userLibraryTmdbIds) {
        Optional<DiscoverySnapshot> snapshot = discoverySnapshotRepository
                .findByMediaTypeAndListType(mediaType, listType);
        if (snapshot.isEmpty() || Duration.between(snapshot.get().getUpdatedAt(),
                LocalDateTime.now(ZoneOffset.UTC)).compareTo(Duration.ofDays(7)) > 0) return List.of();
        List<CachedMovieList> cached = cachedMovieListRepository.findByMediaTypeAndListTypeOrderByRankOrderAsc(mediaType, listType);
        return cached.stream()
                .filter(item -> !userLibraryTmdbIds.contains(item.getTmdbId()))
                .map(item -> SuggestionMovieItem.builder()
                        .tmdbId(item.getTmdbId())
                        .title(item.getTitle())
                        .posterUrl(item.getPosterPath() != null ? tmdbClient.buildPosterUrl(item.getPosterPath()) : null)
                        .voteAverage(item.getVoteAverage())
                        .voteCount(item.getVoteCount())
                        .releaseYear(parseYear(item.getReleaseDate()))
                        .mediaType(mediaType)
                        .build())
                .collect(Collectors.toList());
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
