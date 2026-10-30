import { titleId } from "../store/titleIdentity";
import { useEffect, useMemo, useRef, useState } from "react";
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
  subtitle?: string;
  state?: string;
  updatedAt?: string;
  hasMore?: boolean;
  totalEligibleInPool?: number;
}

/**
 * Explore catalog hook for /explore/:type pages.
 */
export function useExploreMedia(mediaType: "movies" | "tv" | "anime") {
  const store = useStore();
  const inputKey = JSON.stringify([mediaType, store.currentUser?.id]);
  const input = useRef({ key: inputKey, generation: 0 });
  if (input.current.key !== inputKey) input.current = { key: inputKey, generation: input.current.generation + 1 };
  const key = JSON.stringify([inputKey, input.current.generation]);
  const latest = useRef(key);
  latest.current = key;
  const pending = useRef(false);
  const [state, setState] = useState<{ key: string; data: ApiSuggestionsResponse | null;
    error: string | null; pending: boolean; failedCategory: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    pending.current = false;
    void moviesApi.getExploreMedia(mediaType).then(data => {
      if (active && latest.current === key) setState({ key, data, error: null, pending: false, failedCategory: null });
    }).catch(error => {
      if (active && latest.current === key) setState({ key, data: null,
        error: error instanceof Error ? error.message : "Could not load discovery. Retry.", pending: false, failedCategory: null });
    });
    return () => { active = false; };
  }, [key, mediaType]);

  // Window focus listener: sync latest library state from backend to update shelf exclusions (DR04, Q9)
  useEffect(() => {
    const handleFocus = () => {
      if (store.currentUser) {
        void store.refreshLibrary();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [store]);

  const current = state?.key === key ? state : null;
  const readAgain = () => {
    if (pending.current) return;
    pending.current = true;
    setState({ key, data: current?.data ?? null, error: null, pending: true, failedCategory: null });
    void moviesApi.getExploreMedia(mediaType).then(data => {
      if (latest.current === key) setState({ key, data, error: null, pending: false, failedCategory: null });
    }).catch(error => {
      if (latest.current === key) setState({ key, data: recalculateFreshness(current?.data ?? null),
        error: error instanceof Error ? error.message : "Could not load discovery. Retry.", pending: false, failedCategory: null });
    }).finally(() => { if (latest.current === key) pending.current = false; });
  };
  const refresh = (category: string) => {
    if (pending.current || !current?.data) return;
    pending.current = true;
    setState({ ...current, error: null, pending: true, failedCategory: null });
    void moviesApi.refreshExploreCategory(mediaType, category).then(data => {
      if (latest.current === key) setState({ key, data, error: null, pending: false, failedCategory: null });
    }).catch(error => {
      if (latest.current === key) setState({ key, data: recalculateFreshness(current.data),
        error: error instanceof Error ? error.message : "Could not refresh discovery. Retry.", pending: false, failedCategory: category });
    }).finally(() => { if (latest.current === key) pending.current = false; });
  };
  return {
    rows: useMemo(
      () =>
        current?.data?.categories.map((category) => ({
          ...category,
          hasMore: category.hasMore,
          totalEligibleInPool: category.totalEligibleInPool,
          movies: category.movies
            .map((item) => mapApiMovie(item, store))
            .filter((m) => {
              if (!store.currentUser?.id) return true;
              const entry = store.entryFor(store.currentUser.id, m.id);
              return !entry || (entry.status !== "watchlist" && entry.status !== "watched");
            }),
        })) ?? [],
      [current, store],
    ),
    error: current?.error ?? null,
    loading: !current,
    pending: current?.pending ?? false,
    failedCategory: current?.failedCategory ?? null,
    reload: readAgain,
    refresh,
  };
}

export function mapApiMovie(m: { tmdbId: number; title: string; posterUrl?: string; releaseYear?: number; imdbRating?: number; rottenTomatoesRating?: number; voteAverage?: number; voteCount?: number; reason?: string; mediaType?: string }, store: { movieById: (id: string) => Movie | undefined }): Movie {
  const id = titleId(m.tmdbId, m.mediaType ?? "");
  const existing = store.movieById(id);
  return {
    id,
    tmdbId: m.tmdbId,
    title: m.title,
    year: m.releaseYear ?? existing?.year ?? null,
    posterSeed: null,
    posterUrl: m.posterUrl ?? existing?.posterUrl ?? null,
    imdb: m.imdbRating ?? existing?.imdb ?? null,
    tmdbRating: m.voteAverage ?? existing?.tmdbRating ?? null,
    tmdbVotes: m.voteCount ?? existing?.tmdbVotes ?? null,
    reason: m.reason ?? existing?.reason ?? null,
    rt: m.rottenTomatoesRating ?? existing?.rt ?? null,
    overview: existing?.overview ?? "",
    genres: existing?.genres ?? [],
    trailerKey: existing?.trailerKey,
    director: existing?.director,
    mediaType: ((m.mediaType || existing?.mediaType || "MOVIE").toUpperCase()) as any,
  };
}

/**
 * Recalculate category freshness based on snapshot updatedAt and current time.
 *
 * Implements DQ09:
 * - Fallback to last successful snapshot only when it is at most 7 days old.
 * - Older than 7 days becomes UNAVAILABLE and empties results.
 * - Older than 24 hours becomes STALE.
 */
export function recalculateFreshness(data: ApiSuggestionsResponse | null): ApiSuggestionsResponse | null {
  if (!data) return null;
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

  return {
    ...data,
    categories: data.categories.map((cat) => {
      if (!cat.updatedAt) {
        return { ...cat, state: "UNAVAILABLE", movies: [] };
      }
      const updatedTime = Date.parse(cat.updatedAt);
      if (Number.isNaN(updatedTime)) {
        return { ...cat, state: "UNAVAILABLE", movies: [] };
      }
      const ageMs = now - updatedTime;
      if (ageMs > SEVEN_DAYS_MS) {
        return { ...cat, state: "UNAVAILABLE", movies: [] };
      }
      if (ageMs > ONE_DAY_MS) {
        return { ...cat, state: "STALE" };
      }
      return { ...cat, state: cat.movies.length === 0 ? "EMPTY" : "READY" };
    }),
  };
}
