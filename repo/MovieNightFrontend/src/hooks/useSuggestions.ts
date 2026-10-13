import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/MovieStore";
import { moviesApi, type ApiSuggestionsResponse } from "../api/movies";
import type { Movie } from "../store/data";

export type SuggestionCategory =
  | "for-you"
  | "friends"
  | "movies"
  | "tv"
  | "anime"
  | "popular"
  | "recent"
  | "upcoming";

export interface SuggestionRow {
  id: string;
  title: string;
  movies: Movie[];
}

/**
 * Strictly category-aware personal recommendations hook for the Personal Recommendations page (/suggestions).
 * Maximum 3 rows:
 * 1. Movie Recommendations (only if user watched >= 1 movie)
 * 2. TV Series Recommendations (only if user watched >= 1 TV show)
 * 3. Anime Recommendations (only if user watched >= 1 anime)
 * Zero filler rows (no popular, recent, or upcoming rows).
 * No padding with random unrelated movies.
 */
export function usePersonalRecommendations(): SuggestionRow[] {
  const store = useStore();
  const [backendRecs, setBackendRecs] = useState<ApiSuggestionsResponse | null>(null);

  useEffect(() => {
    let active = true;
    moviesApi.getPersonalRecommendations().then((res) => {
      if (active && res) {
        setBackendRecs(res);
      }
    });
    return () => {
      active = false;
    };
  }, [store.currentUser]);

  return useMemo(() => {
    const user = store.currentUser;
    if (!user) return [];

    const watchedEntries = store.entriesFor(user.id, "watched");
    const hasWatchedMovie = watchedEntries.some((e) => {
      const item = store.movieById(e.movieId);
      const mediaType = (e.mediaType || item?.mediaType || "MOVIE").toUpperCase();
      return mediaType === "MOVIE";
    });
    const hasWatchedTv = watchedEntries.some((e) => {
      const item = store.movieById(e.movieId);
      const mediaType = (e.mediaType || item?.mediaType || "").toUpperCase();
      return mediaType === "TV";
    });
    const hasWatchedAnime = watchedEntries.some((e) => {
      const item = store.movieById(e.movieId);
      const mediaType = (e.mediaType || item?.mediaType || "").toUpperCase();
      return mediaType === "ANIME";
    });

    // If backend data is available and has populated categories, map it directly
    if (backendRecs && backendRecs.categories && backendRecs.categories.length > 0) {
      const mapped = backendRecs.categories
        .filter((cat) => {
          if (cat.id === "movies" && !hasWatchedMovie) return false;
          if (cat.id === "tv" && !hasWatchedTv) return false;
          if (cat.id === "anime" && !hasWatchedAnime) return false;
          return cat.movies && cat.movies.length > 0;
        })
        .map((cat) => ({
          id: cat.id,
          title: cat.title,
          movies: (cat.movies || []).map((m) => mapApiMovie(m, store)),
        }));

      if (mapped.length > 0) {
        return mapped;
      }
    }

    // Local fallback computation (category-aware, strictly no padding, works offline/without API keys)
    const myMovieIds = new Set<string>();
    for (const e of watchedEntries) myMovieIds.add(e.movieId);
    for (const e of store.entriesFor(user.id, "watchlist")) myMovieIds.add(e.movieId);

    const friends = store.friendsOf(user.id);
    const friendIds = new Set(friends.map((f) => f.id));
    const allEntries = store.allEntries();

    const result: SuggestionRow[] = [];

    // Helper to compute friend-favored items for a given category
    const computeCategoryRecs = (type: "MOVIE" | "TV" | "ANIME") => {
      const scoreMap = new Map<string, number>();
      for (const e of allEntries) {
        if (
          friendIds.has(e.userId) &&
          e.status === "watched" &&
          e.rating != null &&
          e.rating >= 7 &&
          !myMovieIds.has(e.movieId)
        ) {
          const item = store.movieById(e.movieId);
          const itemType = (e.mediaType || item?.mediaType || "MOVIE").toUpperCase();
          if (item && itemType === type) {
            scoreMap.set(e.movieId, Math.max(scoreMap.get(e.movieId) ?? 0, e.rating));
          }
        }
      }

      // If friend entries don't have enough, pick highest-rated unseen in catalog for this category
      if (scoreMap.size === 0) {
        const matching = store.movies.filter((m) => {
          const mType = (m.mediaType || "MOVIE").toUpperCase();
          return mType === type && !myMovieIds.has(m.id);
        });
        return [...matching].sort((a, b) => (b.imdb ?? 0) - (a.imdb ?? 0)).slice(0, 10);
      }

      return [...scoreMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => store.movieById(id))
        .filter((m): m is Movie => m != null);
    };

    if (hasWatchedMovie) {
      const movieRecs = computeCategoryRecs("MOVIE");
      if (movieRecs.length > 0) {
        result.push({
          id: "movies",
          title: "Movie Recommendations",
          movies: movieRecs,
        });
      }
    }

    if (hasWatchedTv) {
      const tvRecs = computeCategoryRecs("TV");
      if (tvRecs.length > 0) {
        result.push({
          id: "tv",
          title: "TV Series Recommendations",
          movies: tvRecs,
        });
      }
    }

    if (hasWatchedAnime) {
      const animeRecs = computeCategoryRecs("ANIME");
      if (animeRecs.length > 0) {
        result.push({
          id: "anime",
          title: "Anime Recommendations",
          movies: animeRecs,
        });
      }
    }

    return result;
  }, [backendRecs, store]);
}

/**
 * Dedicated Friends' Recommendations hook for /suggestions/friends.
 */
export function useFriendsRecommendations(): SuggestionRow {
  const store = useStore();
  const [backendFriends, setBackendFriends] = useState<ApiSuggestionsResponse | null>(null);

  useEffect(() => {
    let active = true;
    moviesApi.getFriendsRecommendations().then((res) => {
      if (active && res) {
        setBackendFriends(res);
      }
    });
    return () => {
      active = false;
    };
  }, [store.currentUser]);

  return useMemo(() => {
    const user = store.currentUser;
    if (!user) {
      return { id: "friends", title: "Friends' Recommendations", movies: [] };
    }

    if (backendFriends && backendFriends.categories && backendFriends.categories.length > 0) {
      const friendsCat = backendFriends.categories.find((c) => c.id === "friends") || backendFriends.categories[0];
      if (friendsCat && friendsCat.movies && friendsCat.movies.length > 0) {
        return {
          id: "friends",
          title: "Friends' Recommendations",
          movies: friendsCat.movies.map((m) => mapApiMovie(m, store)),
        };
      }
    }

    // Local fallback: friends' high ratings (>= 7) and watchlists
    const myMovieIds = new Set<string>();
    for (const e of store.entriesFor(user.id, "watched")) myMovieIds.add(e.movieId);
    for (const e of store.entriesFor(user.id, "watchlist")) myMovieIds.add(e.movieId);

    const friends = store.friendsOf(user.id);
    const friendIds = new Set(friends.map((f) => f.id));
    const allEntries = store.allEntries();

    const scoreMap = new Map<string, number>();

    for (const e of allEntries) {
      if (friendIds.has(e.userId) && !myMovieIds.has(e.movieId)) {
        if (e.status === "watched" && e.rating != null && e.rating >= 7) {
          scoreMap.set(e.movieId, Math.max(scoreMap.get(e.movieId) ?? 0, e.rating));
        } else if (e.status === "watchlist" && !scoreMap.has(e.movieId)) {
          scoreMap.set(e.movieId, 6.5);
        }
      }
    }

    const movies = [...scoreMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => store.movieById(id))
      .filter((m): m is Movie => m != null);

    return {
      id: "friends",
      title: "Friends' Recommendations",
      movies,
    };
  }, [backendFriends, store]);
}

/**
 * Explore catalog hook for /explore/:type pages.
 */
export function useExploreMedia(mediaType: "movies" | "tv" | "anime"): SuggestionRow[] {
  const store = useStore();
  const [backendExplore, setBackendExplore] = useState<ApiSuggestionsResponse | null>(null);

  useEffect(() => {
    let active = true;
    moviesApi.getExploreMedia(mediaType).then((res) => {
      if (active && res) {
        setBackendExplore(res);
      }
    });
    return () => {
      active = false;
    };
  }, [mediaType]);

  return useMemo(() => {
    if (backendExplore && backendExplore.categories && backendExplore.categories.length > 0) {
      return backendExplore.categories.map((cat) => ({
        id: cat.id,
        title: cat.title,
        movies: cat.movies.map((m) => mapApiMovie(m, store)),
      }));
    }

    return [];
  }, [backendExplore, store]);
}

/**
 * Aggregated discovery rows hook (used for friends recommendations, general categories).
 */
export function useSuggestions(): SuggestionRow[] {
  const store = useStore();
  const [backendSuggestions, setBackendSuggestions] = useState<ApiSuggestionsResponse | null>(null);

  useEffect(() => {
    let active = true;
    moviesApi.getSuggestions().then((res) => {
      if (active && res) {
        setBackendSuggestions(res);
      }
    });
    return () => {
      active = false;
    };
  }, [store.currentUser]);

  return useMemo(() => {
    const user = store.currentUser;
    if (!user) return [];

    if (backendSuggestions && backendSuggestions.categories && backendSuggestions.categories.length > 0) {
      return backendSuggestions.categories.map((cat) => ({
        id: cat.id,
        title: cat.title,
        movies: cat.movies.map((m) => mapApiMovie(m, store)),
      }));
    }

    // Local fallback
    const myMovieIds = new Set<string>();
    const watchedEntries = store.entriesFor(user.id, "watched");
    const watchlistEntries = store.entriesFor(user.id, "watchlist");
    for (const e of watchedEntries) myMovieIds.add(e.movieId);
    for (const e of watchlistEntries) myMovieIds.add(e.movieId);

    const friends = store.friendsOf(user.id);
    const friendIds = new Set(friends.map((f) => f.id));
    const allEntries = store.allEntries();

    // 1. Personal Recommendations
    const forYouMap = new Map<string, number>();
    for (const e of allEntries) {
      if (
        friendIds.has(e.userId) &&
        e.status === "watched" &&
        e.rating != null &&
        e.rating >= 7 &&
        !myMovieIds.has(e.movieId)
      ) {
        const current = forYouMap.get(e.movieId) ?? 0;
        forYouMap.set(e.movieId, Math.max(current, e.rating));
      }
    }
    const forYouMovies = [...forYouMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => store.movieById(id))
      .filter((m): m is Movie => m != null);

    // 2. Friends' Recommendations
    const friendWatchlistIds = new Set<string>();
    for (const e of allEntries) {
      if (
        friendIds.has(e.userId) &&
        e.status === "watchlist" &&
        !myMovieIds.has(e.movieId)
      ) {
        friendWatchlistIds.add(e.movieId);
      }
    }
    const friendsSuggestions = [...friendWatchlistIds]
      .map((id) => store.movieById(id))
      .filter((m): m is Movie => m != null);

    return [
      {
        id: "for-you",
        title: "Personal Recommendations",
        movies: forYouMovies,
      },
      {
        id: "friends",
        title: "Friends' Recommendations",
        movies: friendsSuggestions,
      },
      {
        id: "popular",
        title: "Most Popular",
        movies: [...store.movies].sort((a, b) => (b.imdb ?? 0) - (a.imdb ?? 0)),
      },
      {
        id: "recent",
        title: "Most Recent",
        movies: [...store.movies].sort((a, b) => b.year - a.year),
      },
      {
        id: "upcoming",
        title: "Upcoming & Releases",
        movies: [...store.movies].sort((a, b) => b.year - a.year),
      },
    ];
  }, [backendSuggestions, store]);
}

export function useSuggestionsByCategory(category: string): { title: string; movies: Movie[] } {
  const rows = useSuggestions();
  const row = rows.find((r) => r.id === category);
  if (row) return row;

  if (category === "friends") {
    return { title: "Friends' Recommendations", movies: [] };
  }
  if (category === "for-you") {
    return { title: "Personal Recommendations", movies: [] };
  }
  return { title: "Recommendations", movies: [] };
}

function mapApiMovie(m: { tmdbId: number; title: string; posterUrl?: string; releaseYear?: number; imdbRating?: number; rottenTomatoesRating?: number; voteAverage?: number; mediaType?: string }, store: { movieById: (id: string) => Movie | undefined }): Movie {
  const existing = store.movieById(String(m.tmdbId));
  return {
    id: String(m.tmdbId),
    tmdbId: m.tmdbId,
    title: m.title,
    year: m.releaseYear ?? existing?.year ?? 2024,
    posterSeed: null,
    posterUrl: m.posterUrl ?? existing?.posterUrl ?? null,
    imdb: m.imdbRating ?? m.voteAverage ?? existing?.imdb ?? null,
    rt: m.rottenTomatoesRating ?? existing?.rt ?? null,
    overview: existing?.overview ?? "",
    genres: existing?.genres ?? [],
    trailerKey: existing?.trailerKey,
    director: existing?.director,
    mediaType: ((m.mediaType || existing?.mediaType || "MOVIE").toUpperCase()) as any,
  };
}
