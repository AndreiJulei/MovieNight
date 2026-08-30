import { useMemo } from "react";
import { useStore } from "../store/MovieStore";
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

  return useMemo(() => {
    const user = store.currentUser;
    if (!user) return [];

    // Set of movie IDs the current user already has on any list
    const myMovieIds = new Set<string>();
    const watchedEntries = store.entriesFor(user.id, "watched");
    const watchlistEntries = store.entriesFor(user.id, "watchlist");
    for (const e of watchedEntries) myMovieIds.add(e.movieId);
    for (const e of watchlistEntries) myMovieIds.add(e.movieId);

    const friends = store.friendsOf(user.id);
    const friendIds = new Set(friends.map((f) => f.id));
    const allEntries = store.allEntries();

    // 1. Suggestions for you: movies friends rated highly (≥7) that user doesn't have
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
      .filter(Boolean) as Movie[];

    // 2. Friends' Suggestions: movies on friends' watchlists that user doesn't have
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
      .filter(Boolean) as Movie[];

    // 3. Most Popular: all movies sorted by highest IMDB score
    const popular = [...store.movies]
      .sort((a, b) => (b.imdb ?? 0) - (a.imdb ?? 0));

    // 4. Most Recent: all movies sorted by most recently added across all users
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
      .filter(Boolean) as Movie[];

    // 5. Upcoming: simulate with available movies (placeholder until real TMDB API)
    // Show all movies sorted by year desc as "upcoming" placeholder
    const upcoming = [...store.movies]
      .sort((a, b) => b.year - a.year);

    // For rows with too few movies, pad with available movies to make shelves look full
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
        movies: recent,
      },
      {
        id: "upcoming",
        title: "Upcoming",
        movies: upcoming,
      },
    ];
  }, [store]);
}

export function useSuggestionsByCategory(category: SuggestionCategory): { title: string; movies: Movie[] } {
  const rows = useSuggestions();
  const row = rows.find((r) => r.id === category);
  return row ?? { title: "Suggestions", movies: [] };
}
