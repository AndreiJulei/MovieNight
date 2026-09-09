import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/MovieStore";
import { moviesApi, type ApiSuggestionsResponse } from "../api/movies";
import type { Movie } from "../store/data";

export type SuggestionCategory =
  | "for-you"
  | "friends"
  | "popular"
  | "recent"
  | "upcoming";

export interface SuggestionRow {
  id: SuggestionCategory;
  title: string;
  movies: Movie[];
}

export function useSuggestions(): SuggestionRow[] {
  const store = useStore();
  const [backendSuggestions, setBackendSuggestions] = useState<ApiSuggestionsResponse | null>(null);

  // Fetch live suggestions from backend
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

    // If backend suggestions are available, map them directly
    if (backendSuggestions && backendSuggestions.categories && backendSuggestions.categories.length > 0) {
      return backendSuggestions.categories.map((cat) => ({
        id: cat.id,
        title: cat.title,
        movies: cat.movies.map((m) => {
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
            mediaType: existing?.mediaType ?? "MOVIE" as const,
          };
        }),
      }));
    }

    // Fallback: local memory computation
    const myMovieIds = new Set<string>();
    const watchedEntries = store.entriesFor(user.id, "watched");
    const watchlistEntries = store.entriesFor(user.id, "watchlist");
    for (const e of watchedEntries) myMovieIds.add(e.movieId);
    for (const e of watchlistEntries) myMovieIds.add(e.movieId);

    const friends = store.friendsOf(user.id);
    const friendIds = new Set(friends.map((f) => f.id));
    const allEntries = store.allEntries();

    // 1. Suggestions for you
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

    // 2. Friends' Suggestions
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

    // 3. Most Popular
    const popular = [...store.movies]
      .sort((a, b) => (b.imdb ?? 0) + (b.rt ? b.rt / 10 : 0) - ((a.imdb ?? 0) + (a.rt ? a.rt / 10 : 0)));

    // 4. Most Recent
    const recentMap = new Map<string, string>();
    for (const e of allEntries) {
      const existing = recentMap.get(e.movieId);
      if (!existing || e.addedAt > existing) {
        recentMap.set(e.movieId, e.addedAt);
      }
    }
    const recent = [...recentMap.entries()]
      .sort((a, b) => b[1].localeCompare(a[1]))
      .map(([id]) => store.movieById(id))
      .filter((m): m is Movie => m != null);

    // 5. Upcoming
    const upcoming = [...store.movies].sort((a, b) => b.year - a.year);

    const padWithMovies = (list: Movie[], minCount: number): Movie[] => {
      if (list.length >= minCount) return list;
      const existing = new Set(list.map((m) => m.id));
      const extras = store.movies.filter((m) => !existing.has(m.id));
      return [...list, ...extras].slice(0, Math.max(minCount, list.length + extras.length));
    };

    return [
      {
        id: "for-you",
        title: "Suggestions for You",
        movies: padWithMovies(forYouMovies, 4),
      },
      {
        id: "friends",
        title: "Friends' Suggestions",
        movies: padWithMovies(friendsSuggestions, 4),
      },
      {
        id: "popular",
        title: "Most Popular",
        movies: popular,
      },
      {
        id: "recent",
        title: "Most Recent",
        movies: padWithMovies(recent, 4),
      },
      {
        id: "upcoming",
        title: "Upcoming & Releases",
        movies: upcoming,
      },
    ];
  }, [backendSuggestions, store]);
}

export function useSuggestionsByCategory(category: SuggestionCategory): { title: string; movies: Movie[] } {
  const rows = useSuggestions();
  const row = rows.find((r) => r.id === category);
  return row ?? { title: "Suggestions", movies: [] };
}
