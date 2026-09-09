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
 * Service providing aggregated suggestion categories for the movie discovery page.
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
    private final TmdbClient tmdbClient;

    /**
     * Get all 5 discovery rows for the authenticated user.
     */
    @Transactional
    public SuggestionsResponse getSuggestions(String username) {
        User user = userRepository.findByUsername(username.trim().toLowerCase())
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + username));

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
                        .reason("Personalized for your taste")
                        .build())
                .collect(Collectors.toList());

        // 2. Friends' Suggestions ("friends")
        List<Long> friendIds = friendshipRepository.findAllFriendIdsForUser(userId);
        List<SuggestionMovieItem> friendsMovies = new ArrayList<>();

        if (!friendIds.isEmpty()) {
            // Consensus Query: (avgRating * friendsCount)
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

            // Also include unwatched movies on friends' watchlists
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
        List<SuggestionMovieItem> popularMovies = getCachedCategoryMovies(MovieListType.POPULAR, userLibraryTmdbIds);

        // 4. Most Recent ("recent")
        List<SuggestionMovieItem> recentMovies = getCachedCategoryMovies(MovieListType.RECENT, userLibraryTmdbIds);

        // 5. Upcoming & Releases ("upcoming")
        List<SuggestionMovieItem> upcomingMovies = getCachedCategoryMovies(MovieListType.UPCOMING, userLibraryTmdbIds);

        // If for-you has no movies yet (e.g. brand new user with 0 ratings), fallback to popular movies
        if (forYouMovies.isEmpty()) {
            forYouMovies = popularMovies.stream().limit(10).collect(Collectors.toList());
        }

        List<SuggestionCategoryResponse> categories = List.of(
                SuggestionCategoryResponse.builder()
                        .id("for-you")
                        .title("Suggestions for You")
                        .movies(forYouMovies)
                        .build(),
                SuggestionCategoryResponse.builder()
                        .id("friends")
                        .title("Friends' Suggestions")
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

    private List<SuggestionMovieItem> getCachedCategoryMovies(MovieListType listType, Set<Long> userLibraryTmdbIds) {
        List<CachedMovieList> cached = cachedMovieListRepository.findByListTypeOrderByRankOrderAsc(listType);
        return cached.stream()
                .filter(item -> !userLibraryTmdbIds.contains(item.getTmdbId()))
                .map(item -> SuggestionMovieItem.builder()
                        .tmdbId(item.getTmdbId())
                        .title(item.getTitle())
                        .posterUrl(item.getPosterPath() != null ? tmdbClient.buildPosterUrl(item.getPosterPath()) : null)
                        .voteAverage(item.getVoteAverage())
                        .releaseYear(parseYear(item.getReleaseDate()))
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
}
