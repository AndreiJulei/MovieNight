import { titleId } from "../store/titleIdentity";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  terminalReason?: string | null;
  underlyingLimit?: string | null;
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
      if (active && latest.current === key) setState({ key, data: recalculateFreshness(data), error: null, pending: false, failedCategory: null });
    }).catch(error => {
      if (active && latest.current === key) setState({ key, data: null,
        error: error instanceof Error ? error.message : "Could not load discovery. Retry.", pending: false, failedCategory: null });
    });
    return () => { active = false; };
  }, [key, mediaType]);

  // Window focus & visibility listener + expiration timer: sync latest library state from backend
  // and continuously enforce 7-day snapshot maximum age while mounted (DR04, Q9, Q12)
  useEffect(() => {
    const handleFocusOrExpiration = () => {
      if (store.currentUser) {
        void store.refreshLibrary();
      }
      setState((prev) => (prev ? { ...prev, data: recalculateFreshness(prev.data) } : null));
    };

    window.addEventListener("focus", handleFocusOrExpiration);
    document.addEventListener("visibilitychange", handleFocusOrExpiration);

    // Q12: Enforce 7-day maximum snapshot age continuously for mounted shelves via timer
    let timer: number | undefined;
    const categories = state?.data?.categories;
    if (categories && categories.length > 0) {
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      let nearestRemainingMs: number | null = null;

      for (const cat of categories) {
        if (!cat.updatedAt || cat.state === "UNAVAILABLE") continue;
        const updatedTime = Date.parse(cat.updatedAt);
        if (Number.isNaN(updatedTime)) continue;
        const remaining = SEVEN_DAYS_MS - (now - updatedTime);
        if (remaining <= 0) {
          nearestRemainingMs = 0;
          break;
        }
        if (nearestRemainingMs === null || remaining < nearestRemainingMs) {
          nearestRemainingMs = remaining;
        }
      }

      if (nearestRemainingMs !== null) {
        if (nearestRemainingMs <= 0) {
          handleFocusOrExpiration();
        } else if (nearestRemainingMs <= 2147483647) {
          timer = window.setTimeout(handleFocusOrExpiration, nearestRemainingMs + 50);
        }
      }
    }

    return () => {
      window.removeEventListener("focus", handleFocusOrExpiration);
      document.removeEventListener("visibilitychange", handleFocusOrExpiration);
      if (timer) window.clearTimeout(timer);
    };
  }, [store, state?.data]);

  const current = state?.key === key ? state : null;
  const readAgain = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    setState((prev) => ({ key, data: prev?.data ?? null, error: null, pending: true, failedCategory: null }));
    void moviesApi.getExploreMedia(mediaType).then(data => {
      if (latest.current === key) setState({ key, data: recalculateFreshness(data), error: null, pending: false, failedCategory: null });
    }).catch(error => {
      if (latest.current === key) setState((prev) => ({ key, data: recalculateFreshness(prev?.data ?? null),
        error: error instanceof Error ? error.message : "Could not load discovery. Retry.", pending: false, failedCategory: null }));
    }).finally(() => { if (latest.current === key) pending.current = false; });
  }, [key, mediaType]);
  const refresh = (category: string) => {
    if (pending.current || !current?.data) return;
    pending.current = true;
    setState({ ...current, error: null, pending: true, failedCategory: null });
    void moviesApi.refreshExploreCategory(mediaType, category).then(data => {
      if (latest.current === key) setState({ key, data: recalculateFreshness(data), error: null, pending: false, failedCategory: null });
    }).catch(error => {
      if (latest.current === key) setState({ key, data: recalculateFreshness(current.data),
        error: error instanceof Error ? error.message : "Could not refresh discovery. Retry.", pending: false, failedCategory: category });
    }).finally(() => { if (latest.current === key) pending.current = false; });
  };
  return {
    rows: useMemo(
      () =>
        current?.data?.categories.map((category) => {
          const mappedMovies = category.movies
            .map((item) => mapApiMovie(item, store))
            .filter((m) => {
              if (!store.currentUser?.id) return true;
              const entry = store.entryFor(store.currentUser.id, m.id);
              return !entry || (entry.status !== "watchlist" && entry.status !== "watched");
            });

          let terminalReason = category.terminalReason ?? null;
          const underlyingLimit = category.underlyingLimit ?? null;
          // Spec Finding 3 / Finding 2: An empty preview does not imply the entire pool is saved if hasMore is true.
          // Only set ALL_CANDIDATES_EXCLUDED_BY_LIBRARY when the entire pool has been exhausted (!category.hasMore).
          if (mappedMovies.length === 0 && category.movies.length > 0 && !category.hasMore) {
            terminalReason = "ALL_CANDIDATES_EXCLUDED_BY_LIBRARY";
          }

          return {
            ...category,
            hasMore: category.hasMore,
            totalEligibleInPool: category.totalEligibleInPool,
            terminalReason,
            underlyingLimit,
            movies: mappedMovies,
          };
        }) ?? [],
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
      // Spec Finding 5: Explicit UNAVAILABLE must never become READY, even if updatedAt is recent
      if (cat.state === "UNAVAILABLE") {
        return { ...cat, state: "UNAVAILABLE", movies: [] };
      }
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
