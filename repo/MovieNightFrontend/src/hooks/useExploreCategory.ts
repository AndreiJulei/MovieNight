import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../store/MovieStore";
import { useRouter } from "../router";
import { moviesApi, type ApiExploreCategoryPageResponse } from "../api/movies";
import { mapApiMovie } from "./useSuggestions";
import type { Movie } from "../store/data";
import type { SortBy, MinRating } from "../components/TopBar";

export interface CategorySegment {
  id: string;
  generation: number;
  label?: string;
  movies: Movie[];
  updatedAt?: string;
  state?: string;
  openedAt?: number;
}

export function getTypedMovieKey(m: { tmdbId?: number; mediaType?: string }): string {
  const type = (m.mediaType || "MOVIE").toUpperCase();
  return `${type}:${m.tmdbId}`;
}

interface StoredCategorySession {
  userId?: string;
  sessionId: string | null;
  cursor: number;
  hasMore: boolean;
  totalEligibleInPool: number;
  title: string;
  subtitle: string;
  state: string;
  updatedAt?: string;
  terminalReason?: string | null;
  underlyingLimit?: string | null;
  movies: Movie[];
  segments?: CategorySegment[];
  confirmedSavedIds?: string[];
  scrollY: number;
  timestamp: number;
  sortBy: SortBy;
  minRating: MinRating;
  generation?: number;
}

interface SessionRefState {
  sessionId: string | null;
  cursor: number;
  hasMore: boolean;
  totalEligibleInPool: number;
  title: string;
  subtitle: string;
  state: string;
  updatedAt?: string;
  terminalReason?: string | null;
  underlyingLimit?: string | null;
  movies: Movie[];
  segments: CategorySegment[];
  openedAt?: number;
  isRenewal?: boolean;
  generation: number;
}

export function purgeExploreSessions(): void {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (
        key &&
        (key.startsWith("explore_session_") ||
          key === "details_return_target" ||
          key === "last_movie_referrer")
      ) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

function isSnapshotUnavailable(
  state: string | null | undefined,
  updatedAt: string | null | undefined,
): boolean {
  if (state === "UNAVAILABLE") return true;
  if (!updatedAt) return false;
  const time = Date.parse(updatedAt);
  if (Number.isNaN(time)) return true;
  return Date.now() - time > 7 * 24 * 60 * 60 * 1000;
}

export function useExploreCategory(
  mediaType: "movies" | "tv" | "anime",
  category: string,
  sortBy: SortBy,
  minRating: MinRating,
) {
  const store = useStore();
  const { entryKey, action } = useRouter();
  const activeEntryKey = useRef(entryKey);
  activeEntryKey.current = entryKey;
  const currentUserId = store.currentUser?.id;

  const storageKey = `explore_session_${entryKey}_${mediaType}_${category}`;

  // Purge explore sessions from sessionStorage when auth switches or logs out
  const prevUserIdRef = useRef(currentUserId);
  useEffect(() => {
    if (prevUserIdRef.current !== currentUserId) {
      purgeExploreSessions();
      prevUserIdRef.current = currentUserId;
    }
  }, [currentUserId]);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [totalEligibleInPool, setTotalEligibleInPool] = useState<number>(0);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [segments, setSegments] = useState<CategorySegment[]>([]);
  const [title, setTitle] = useState<string>("");
  const [subtitle, setSubtitle] = useState<string>("");
  const [state, setState] = useState<string>("READY");
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);
  const [terminalReason, setTerminalReason] = useState<string | null>(null);
  const [underlyingLimit, setUnderlyingLimit] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [lastFailedAction, setLastFailedAction] = useState<"initial" | "loadMore" | "refresh" | null>(null);

  // DR06 / Spec Finding 1: Generation counter and active request tracking
  const pendingRef = useRef(false);
  const activeReqId = useRef(0);

  // DR04 / Spec Finding 10: Track confirmed saved title IDs in current hook session
  const confirmedSavedIdsRef = useRef<Set<string>>(new Set());

  // Ref tracking current session data to avoid stale closures in callbacks
  const sessionRef = useRef<SessionRefState>({
    sessionId: null,
    cursor: 0,
    hasMore: true,
    totalEligibleInPool: 0,
    title: "",
    subtitle: "",
    state: "READY",
    updatedAt: undefined,
    terminalReason: null,
    underlyingLimit: null,
    movies: [],
    segments: [],
    openedAt: undefined,
    generation: 0,
  });

  // Check if a title is in confirmed library state or was confirmed saved in this session
  const isMovieSaved = useCallback(
    (movieId: string) => {
      if (!currentUserId) return false;
      const entry = store.entryFor(currentUserId, movieId);
      const isSavedInStore = Boolean(entry && (entry.status === "watchlist" || entry.status === "watched"));
      if (confirmedSavedIdsRef.current.has(movieId)) {
        if (!isSavedInStore) {
          // DR04: Library removal restores eligibility on next read/reset
          confirmedSavedIdsRef.current.delete(movieId);
          return false;
        }
        return true;
      }
      return isSavedInStore;
    },
    [currentUserId, store],
  );

  // Re-check and remove library items
  const filterLibraryMovies = useCallback(
    (movieList: Movie[]) => {
      return movieList.filter((m) => !isMovieSaved(m.id));
    },
    [isMovieSaved],
  );

  const filterLibraryMoviesRef = useRef(filterLibraryMovies);
  filterLibraryMoviesRef.current = filterLibraryMovies;

  // Standards Finding: Deduplicated session persistence helper
  const persistSessionSnapshot = useCallback(
    (overrides?: Partial<StoredCategorySession>) => {
      if (typeof window === "undefined") return;
      if (!currentUserId) return;
      const current = sessionRef.current;
      // Spec Finding 4 / Finding 1: Storage purge strictly for UNAVAILABLE or >7-day snapshots.
      // Expired sessions (sessionId: null) retain their loaded cards across details visits.
      if (
        current.state === "UNAVAILABLE" ||
        isSnapshotUnavailable(current.state, current.updatedAt)
      ) {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* ignore */
        }
        return;
      }
      try {
        const payload: StoredCategorySession = {
          userId: currentUserId,
          sessionId: current.sessionId,
          cursor: current.cursor,
          hasMore: current.hasMore,
          totalEligibleInPool: current.totalEligibleInPool,
          title: current.title,
          subtitle: current.subtitle,
          state: current.state,
          updatedAt: current.updatedAt,
          terminalReason: current.terminalReason,
          underlyingLimit: current.underlyingLimit,
          movies: current.movies,
          segments: current.segments,
          confirmedSavedIds: Array.from(confirmedSavedIdsRef.current),
          scrollY: window.scrollY,
          timestamp: current.openedAt || Date.now(),
          sortBy,
          minRating,
          generation: current.generation,
          ...overrides,
        };
        sessionStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        /* ignore storage quota errors */
      }
    },
    [currentUserId, storageKey, sortBy, minRating],
  );

  const persistSessionSnapshotRef = useRef(persistSessionSnapshot);
  persistSessionSnapshotRef.current = persistSessionSnapshot;

  // Q12 / Finding 3: Centralized transition to UNAVAILABLE when snapshot exceeds 7 days
  const transitionToUnavailable = useCallback(() => {
    sessionRef.current.movies = [];
    sessionRef.current.state = "UNAVAILABLE";
    sessionRef.current.terminalReason = "UNAVAILABLE";
    sessionRef.current.underlyingLimit = null;
    setMovies([]);
    setState("UNAVAILABLE");
    setTerminalReason("UNAVAILABLE");
    setUnderlyingLimit(null);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    }
  }, [storageKey]);

  // Q12 / Finding 3: Enforce maximum 7-day age throughout the session
  const checkFreshness = useCallback(() => {
    if (
      sessionRef.current.state === "UNAVAILABLE" ||
      isSnapshotUnavailable(sessionRef.current.state, sessionRef.current.updatedAt)
    ) {
      transitionToUnavailable();
      return false;
    }
    return true;
  }, [transitionToUnavailable]);

  // Standards Finding: Deduplicated API error handler (DR05: 410 session expiration)
  const handleApiError = useCallback((err: unknown, fallbackMessage: string) => {
    const msg = err instanceof Error ? err.message : fallbackMessage;
    const is410 =
      (err as any)?.status === 410 ||
      msg.includes("410") ||
      msg.toLowerCase().includes("session expired") ||
      msg.toLowerCase().includes("session lost") ||
      msg.includes("Refresh discovery");
    if (is410) {
      setSessionExpired(true);
      setError("Discovery session expired. Refresh discovery to continue.");
      sessionRef.current.sessionId = null;
      setSessionId(null);
    } else {
      setError(msg);
    }
  }, []);

  const handleApiErrorRef = useRef(handleApiError);
  handleApiErrorRef.current = handleApiError;

  // Standards Finding: Unified helper to apply session state and avoid data clump duplication
  const applySessionState = useCallback(
    (nextState: SessionRefState, persist: boolean = false) => {
      sessionRef.current = nextState;
      setSessionId(nextState.sessionId);
      setCursor(nextState.cursor);
      setHasMore(nextState.hasMore);
      setTotalEligibleInPool(nextState.totalEligibleInPool);
      setTitle(nextState.title);
      setSubtitle(nextState.subtitle);
      setState(nextState.state);
      setUpdatedAt(nextState.updatedAt);
      setTerminalReason(nextState.terminalReason ?? null);
      setUnderlyingLimit(nextState.underlyingLimit ?? null);
      setMovies(nextState.movies);
      setSegments(nextState.segments ?? (nextState.movies.length > 0 ? [{ id: "initial", generation: 0, movies: nextState.movies }] : []));

      // Spec Finding 4: Storage purge requirement — remove from sessionStorage on UNAVAILABLE
      if (
        nextState.state === "UNAVAILABLE" ||
        isSnapshotUnavailable(nextState.state, nextState.updatedAt)
      ) {
        if (typeof window !== "undefined") {
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            /* ignore */
          }
        }
      } else if (persist) {
        persistSessionSnapshotRef.current();
      }
    },
    [storageKey],
  );

  // Standards Finding: Deduplicated helper for library pruning and terminal provenance transitions
  const pruneAndTransitionLibraryMovies = useCallback((prevMovies: Movie[], targetMovies: Movie[]) => {
    if (targetMovies.length === prevMovies.length) {
      return prevMovies;
    }
    const targetSet = new Set(targetMovies.map((m) => m.id));
    const nextSegments = (sessionRef.current.segments || [])
      .map((seg) => ({
        ...seg,
        movies: seg.movies.filter((m) => targetSet.has(m.id)),
      }))
      .filter((seg) => seg.movies.length > 0);

    const removedCount = prevMovies.length - targetMovies.length;
    const newTotal = Math.max(0, sessionRef.current.totalEligibleInPool - removedCount);
    sessionRef.current.movies = targetMovies;
    sessionRef.current.segments = nextSegments;
    sessionRef.current.totalEligibleInPool = newTotal;
    setTotalEligibleInPool(newTotal);
    setSegments(nextSegments);

    if (!sessionRef.current.hasMore && targetMovies.length === 0) {
      let currentLimit = sessionRef.current.underlyingLimit ?? null;
      const currentTerminal = sessionRef.current.terminalReason;
      if (
        currentTerminal &&
        currentTerminal !== "NO_MATCHING_UNSAVED_TITLES" &&
        currentTerminal !== "ALL_CANDIDATES_EXCLUDED_BY_LIBRARY"
      ) {
        currentLimit = currentLimit || currentTerminal;
      }
      sessionRef.current.terminalReason = "ALL_CANDIDATES_EXCLUDED_BY_LIBRARY";
      sessionRef.current.underlyingLimit = currentLimit;
      setTerminalReason("ALL_CANDIDATES_EXCLUDED_BY_LIBRARY");
      setUnderlyingLimit(currentLimit);
    }

    persistSessionSnapshotRef.current({
      movies: targetMovies,
      segments: nextSegments,
      totalEligibleInPool: newTotal,
      terminalReason: sessionRef.current.terminalReason,
      underlyingLimit: sessionRef.current.underlyingLimit,
    });
    return targetMovies;
  }, []);

  // Standards Finding: Deduplicated response processing for initial, loadMore, and refresh
  const applyPageResponse = useCallback(
    (res: ApiExploreCategoryPageResponse, mode: "replace" | "append") => {
      const mapped = (res.movies ?? []).map((m) => mapApiMovie(m, store));
      const filtered = filterLibraryMoviesRef.current(mapped);

      const unavailable =
        res.state === "UNAVAILABLE" || isSnapshotUnavailable(res.state, res.updatedAt);
      let newMovies: Movie[];
      let newSegments: CategorySegment[];

      if (unavailable) {
        newMovies = [];
        newSegments = [];
        if (typeof window !== "undefined") {
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            /* ignore */
          }
        }
      } else if (mode === "append") {
        const seen = new Set(sessionRef.current.movies.map((m) => getTypedMovieKey(m)));
        const added = filtered.filter((m) => !seen.has(getTypedMovieKey(m)));
        newMovies = [...sessionRef.current.movies, ...added];
        const existingSegments = sessionRef.current.segments.length > 0
          ? sessionRef.current.segments
          : (sessionRef.current.movies.length > 0
              ? [{ id: "initial", generation: 0, movies: sessionRef.current.movies, updatedAt: sessionRef.current.updatedAt, state: sessionRef.current.state, openedAt: sessionRef.current.openedAt }]
              : []);

        const currentGen = sessionRef.current.generation || 0;
        if (added.length > 0) {
          const lastSeg = existingSegments[existingSegments.length - 1];
          if (currentGen > 0 && (!lastSeg || lastSeg.generation !== currentGen)) {
            // Spec 5: Start a new labelled segment for results from renewed generation
            const renewalSeg: CategorySegment = {
              id: `renewed-gen-${currentGen}-${Date.now()}`,
              generation: currentGen,
              label: "Renewed Results",
              movies: added,
              updatedAt: res.updatedAt,
              state: res.state,
              openedAt: Date.now(),
            };
            newSegments = [...existingSegments, renewalSeg];
          } else if (existingSegments.length > 0) {
            const lastIdx = existingSegments.length - 1;
            const updatedLast: CategorySegment = {
              ...existingSegments[lastIdx],
              movies: [...existingSegments[lastIdx].movies, ...added],
            };
            newSegments = [...existingSegments.slice(0, lastIdx), updatedLast];
          } else {
            newSegments = [{ id: "initial", generation: 0, movies: added, updatedAt: res.updatedAt, state: res.state, openedAt: Date.now() }];
          }
        } else {
          newSegments = existingSegments;
        }
      } else {
        newMovies = filtered;
        newSegments = filtered.length > 0
          ? [{ id: "initial", generation: 0, movies: filtered, updatedAt: res.updatedAt, state: res.state, openedAt: sessionRef.current.openedAt || Date.now() }]
          : [];
      }

      // Spec 2: Recompute freshness across all retained generations/segments
      let aggregateState: string;
      let aggregateUpdatedAt: string | undefined;

      if (unavailable) {
        aggregateState = "UNAVAILABLE";
        aggregateUpdatedAt = res.updatedAt;
      } else {
        const isAnyStale = newSegments.some(
          (s) => s.state === "STALE" || (s.updatedAt && (Date.now() - Date.parse(s.updatedAt) > 24 * 3600 * 1000))
        );
        aggregateState = isAnyStale ? "STALE" : (res.state ?? sessionRef.current.state);
        aggregateUpdatedAt = newSegments
          .map((s) => s.updatedAt)
          .filter((u): u is string => Boolean(u))
          .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? (res.updatedAt ?? sessionRef.current.updatedAt);
      }

      const newSessionId = unavailable ? null : (res.sessionId ?? sessionRef.current.sessionId);
      const newCursor = unavailable ? 0 : (res.cursor ?? (mode === "append" ? sessionRef.current.cursor : 0));
      const newHasMore = unavailable ? false : res.hasMore;
      const newTotal = unavailable
        ? 0
        : (res.totalEligibleInPool ??
          (mode === "append"
            ? Math.max(sessionRef.current.totalEligibleInPool, newMovies.length)
            : filtered.length));
      const newTitle = res.title ?? sessionRef.current.title;
      const newSubtitle = res.subtitle ?? sessionRef.current.subtitle;
      const newTerminal = unavailable ? "UNAVAILABLE" : (res.terminalReason ?? null);
      const newLimit = unavailable ? null : (res.underlyingLimit ?? null);

      applySessionState(
        {
          sessionId: newSessionId,
          cursor: newCursor,
          hasMore: newHasMore,
          totalEligibleInPool: newTotal,
          title: newTitle,
          subtitle: newSubtitle,
          state: aggregateState,
          updatedAt: aggregateUpdatedAt,
          terminalReason: newTerminal,
          underlyingLimit: newLimit,
          movies: newMovies,
          segments: newSegments,
          openedAt: sessionRef.current.openedAt || Date.now(),
          generation: sessionRef.current.generation || 0,
        },
        Boolean(newSessionId) && !unavailable,
      );
    },
    [store, storageKey, applySessionState],
  );

  const applyPageResponseRef = useRef(applyPageResponse);
  applyPageResponseRef.current = applyPageResponse;

  const fetchInitialPage = useCallback(async () => {
    const reqId = ++activeReqId.current;
    setLoading(true);
    setError(null);
    setSessionExpired(false);
    pendingRef.current = true;

    // When controls change within the same category, preserve the active sessionId to keep same 30-min pool
    const existingSessionId = sessionRef.current.sessionId || undefined;
    if (!existingSessionId || !sessionRef.current.openedAt) {
      sessionRef.current.openedAt = Date.now();
      sessionRef.current.generation = 0;
    }

    try {
      const res = await moviesApi.getExploreCategoryPage(
        mediaType,
        category,
        {
          sessionId: existingSessionId,
          cursor: 0,
          limit: 20,
          sortBy,
          minRating,
        },
        { userScope: currentUserId ?? undefined },
      );
      if (reqId !== activeReqId.current) return;
      applyPageResponseRef.current(res, "replace");
      setLoading(false);
      setError(null);
      setLastFailedAction(null);
    } catch (err: unknown) {
      if (reqId !== activeReqId.current) return;
      setLoading(false);
      setLastFailedAction("initial");
      checkFreshness();
      handleApiErrorRef.current(err, "Could not load discovery. Retry.");
    } finally {
      if (reqId === activeReqId.current) {
        pendingRef.current = false;
        setLoading(false);
      }
    }
  }, [mediaType, category, sortBy, minRating]);

  // Initial load or sort/filter change
  useEffect(() => {
    // Reset pending flags when changing context (DR06 / P1)
    setLoadingMore(false);
    setRefreshing(false);
    pendingRef.current = false;

    if (!currentUserId) {
      setLoading(false);
      return;
    }

    // A loaded grid belongs to one browser history entry. Direct loads start a new
    // bounded pagination session even if a previous tab saved the same URL.
    const isDetailsReturn = action === "pop";

    let restored = false;
    let cancelled = false;
    let rafId: number | undefined;
    let timeoutId: number | undefined;

    if (isDetailsReturn && typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as StoredCategorySession;
          const isFresh = Date.now() - parsed.timestamp < 30 * 60 * 1000;
          const sameUser = parsed.userId === currentUserId;
          const sameControls = parsed.sortBy === sortBy && parsed.minRating === minRating;

          if (sameUser && sameControls && (parsed.sessionId !== undefined || Boolean(parsed.timestamp))) {
            restored = true;
            if (parsed.confirmedSavedIds) {
              parsed.confirmedSavedIds.forEach((id) => confirmedSavedIdsRef.current.add(id));
            }
            let filteredMovies = filterLibraryMoviesRef.current(parsed.movies);
            const unavailable =
              parsed.state === "UNAVAILABLE" || isSnapshotUnavailable(parsed.state, parsed.updatedAt);
            if (unavailable) {
              filteredMovies = [];
            }

            sessionRef.current.openedAt = parsed.timestamp;

            // LR06: Filter segment contents using the same eligible identities as the flat movie array
            const eligibleMovieIds = new Set(filteredMovies.map((m) => m.id));
            let restoredSegments: CategorySegment[] = [];
            if (!unavailable) {
              if (parsed.segments && parsed.segments.length > 0) {
                restoredSegments = parsed.segments
                  .map((s) => ({
                    ...s,
                    generation: s.generation ?? 0,
                    movies: filterLibraryMoviesRef.current(s.movies).filter((m) => eligibleMovieIds.has(m.id)),
                  }))
                  .filter((s) => s.movies.length > 0);
              }
              if (restoredSegments.length === 0 && filteredMovies.length > 0) {
                restoredSegments = [{ id: "initial", generation: 0, movies: filteredMovies }];
              }
            }

            const removedCount = parsed.movies.length - filteredMovies.length;
            const adjustedTotal = Math.max(0, parsed.totalEligibleInPool - removedCount);
            let restoredTerminal = parsed.terminalReason ?? null;
            let restoredLimit = parsed.underlyingLimit ?? null;
            if (!parsed.hasMore && filteredMovies.length === 0) {
              restoredTerminal = "ALL_CANDIDATES_EXCLUDED_BY_LIBRARY";
            }

            const restoredGen = parsed.generation ?? Math.max(0, ...restoredSegments.map((s) => s.generation));
            sessionRef.current.generation = restoredGen;

            if (isFresh) {
              applySessionState(
                {
                  sessionId: parsed.sessionId,
                  cursor: parsed.cursor,
                  hasMore: parsed.hasMore,
                  totalEligibleInPool: adjustedTotal,
                  title: parsed.title,
                  subtitle: parsed.subtitle,
                  state: unavailable ? "UNAVAILABLE" : parsed.state,
                  updatedAt: parsed.updatedAt,
                  terminalReason: restoredTerminal,
                  underlyingLimit: restoredLimit,
                  movies: filteredMovies,
                  segments: restoredSegments,
                  openedAt: parsed.timestamp,
                  generation: restoredGen,
                },
                false,
              );

              setLoading(false);
              setError(null);
              setSessionExpired(false);
              setLastFailedAction(null);
            } else {
              // LR05 / Q6: Restored session past 30 minutes retains visible cards.
              // SessionId is cleared to trigger automatic renewal on next Load more.
              applySessionState(
                {
                  sessionId: null, // Pinned session expired on server (30 min lifetime)
                  cursor: parsed.cursor,
                  hasMore: parsed.hasMore, // Retain hasMore so Load more is not stranded!
                  totalEligibleInPool: adjustedTotal,
                  title: parsed.title,
                  subtitle: parsed.subtitle,
                  state: unavailable ? "UNAVAILABLE" : parsed.state,
                  updatedAt: parsed.updatedAt,
                  terminalReason: restoredTerminal,
                  underlyingLimit: restoredLimit,
                  movies: filteredMovies,
                  segments: restoredSegments,
                  openedAt: parsed.timestamp,
                  generation: restoredGen,
                },
                false,
              );

              setLoading(false);
              setSessionExpired(false);
              setError(null);
              setLastFailedAction(null);
            }

            // Wait for the restored cards, then restore only while this entry is active.
            if (parsed.scrollY > 0) {
              const targetY = parsed.scrollY;
              const targetKey = entryKey;
              rafId = requestAnimationFrame(() => {
                if (!cancelled && activeEntryKey.current === targetKey) window.scrollTo(0, targetY);
              });
              timeoutId = window.setTimeout(() => {
                if (!cancelled && activeEntryKey.current === targetKey) window.scrollTo(0, targetY);
              }, 50);
            }
          }
        }
      } catch {
        /* ignore parse error */
      }
    } else {
      // Ordinary reload or category navigation starts again (Q6)
      confirmedSavedIdsRef.current.clear();
      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* ignore */
        }
      }
    }

    if (!restored) {
      confirmedSavedIdsRef.current.clear();
      void fetchInitialPage();
    }

    return () => {
      cancelled = true;
      activeEntryKey.current = "";
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      // Invalidate any in-flight requests and reset flags when context changes or unmounts
      activeReqId.current++;
      setLoadingMore(false);
      setRefreshing(false);
      pendingRef.current = false;
    };
  }, [mediaType, category, sortBy, minRating, currentUserId, storageKey, action, entryKey, applySessionState, fetchInitialPage]);

  // Window focus & visibility listener: recheck 7-day snapshot age throughout mounted session (Q12)
  // and sync latest library state from backend to prune saved cards (DR04, Q9)
  useEffect(() => {
    const handleFocusOrSync = () => {
      if (!checkFreshness()) return;
      if (store.currentUser) {
        void store.refreshLibrary();
      }
      setMovies((prev) => pruneAndTransitionLibraryMovies(prev, filterLibraryMoviesRef.current(prev)));
    };
    window.addEventListener("focus", handleFocusOrSync);
    document.addEventListener("visibilitychange", handleFocusOrSync);

    // Q12: Enforce 7-day maximum age throughout the mounted session via timer
    let timer: number | undefined;
    if (updatedAt) {
      const parsedTime = Date.parse(updatedAt);
      if (!Number.isNaN(parsedTime)) {
        const remaining = 7 * 24 * 60 * 60 * 1000 - (Date.now() - parsedTime);
        if (remaining > 0 && remaining <= 2147483647) {
          timer = window.setTimeout(handleFocusOrSync, remaining + 50);
        } else if (remaining <= 0) {
          handleFocusOrSync();
        }
      }
    }

    return () => {
      window.removeEventListener("focus", handleFocusOrSync);
      document.removeEventListener("visibilitychange", handleFocusOrSync);
      if (timer) window.clearTimeout(timer);
    };
  }, [store, pruneAndTransitionLibraryMovies, updatedAt, checkFreshness]);

  // Immediately prune visible cards whenever confirmed library entries update in store (e.g. cross-tab/refresh)
  useEffect(() => {
    if (!checkFreshness()) return;
    setMovies((prev) => pruneAndTransitionLibraryMovies(prev, filterLibraryMovies(prev)));
  }, [filterLibraryMovies, pruneAndTransitionLibraryMovies, checkFreshness]);

  // Save scroll position into sessionStorage on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!currentUserId) return;
      try {
        const stored = sessionStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as StoredCategorySession;
          parsed.scrollY = window.scrollY;
          sessionStorage.setItem(storageKey, JSON.stringify(parsed));
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [storageKey, currentUserId]);

  // LR05: Automatic session renewal loop on 410 or expired session
  const renewSession = useCallback(async (reqId: number) => {
    let consecutiveDuplicates = 0;
    let renewalSessionId: string | null = null;
    let renewalCursor = 0;
    let renewalHasMore = true;
    const newDistinctMovies: Movie[] = [];
    let lastResponse: ApiExploreCategoryPageResponse | null = null;

    const nextGen = (sessionRef.current.generation || 0) + 1;
    sessionRef.current.generation = nextGen;

    const existingKeys = new Set(
      sessionRef.current.movies.map((m) => getTypedMovieKey(m)),
    );

    while (consecutiveDuplicates < 3 && renewalHasMore) {
      const res = await moviesApi.getExploreCategoryPage(
        mediaType,
        category,
        {
          sessionId: renewalSessionId || undefined,
          cursor: renewalCursor,
          limit: 20,
          sortBy,
          minRating,
        },
        { userScope: currentUserId ?? undefined },
      );

      if (reqId !== activeReqId.current) return;
      lastResponse = res;
      renewalSessionId = res.sessionId ?? null;
      renewalCursor = res.cursor ?? (renewalCursor + 20);
      renewalHasMore = res.hasMore;

      const mapped = (res.movies ?? []).map((m) => mapApiMovie(m, store));
      const filtered = filterLibraryMoviesRef.current(mapped);

      const distinct = filtered.filter((m) => {
        const key = getTypedMovieKey(m);
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });

      if (distinct.length > 0) {
        newDistinctMovies.push(...distinct);
        consecutiveDuplicates = 0;
        break;
      } else {
        consecutiveDuplicates++;
      }
    }

    if (reqId !== activeReqId.current) return;

    const prevMovies = sessionRef.current.movies;
    const prevSegments = sessionRef.current.segments.length > 0
      ? sessionRef.current.segments
      : (prevMovies.length > 0
          ? [{ id: "initial", generation: 0, movies: prevMovies, updatedAt: sessionRef.current.updatedAt, state: sessionRef.current.state, openedAt: sessionRef.current.openedAt }]
          : []);

    let nextSegments = prevSegments;
    let nextMovies = prevMovies;

    if (newDistinctMovies.length > 0) {
      const renewalSegment: CategorySegment = {
        id: `renewed-gen-${nextGen}-${Date.now()}`,
        generation: nextGen,
        label: "Renewed Results",
        movies: newDistinctMovies,
        updatedAt: lastResponse?.updatedAt,
        state: lastResponse?.state,
        openedAt: Date.now(),
      };
      nextSegments = [...prevSegments, renewalSegment];
      nextMovies = [...prevMovies, ...newDistinctMovies];
    }

    // Spec 5: Retain freshness bounds per generation.
    // Retained segments preserve their own updatedAt and state.
    // Top-level state reflects STALE if any segment is stale.
    const isAnyStale = nextSegments.some(
      (s) => s.state === "STALE" || (s.updatedAt && (Date.now() - Date.parse(s.updatedAt) > 24 * 3600 * 1000))
    );
    const topState = isAnyStale ? "STALE" : (lastResponse?.state ?? sessionRef.current.state);
    const oldestUpdatedAt = nextSegments
      .map((s) => s.updatedAt)
      .filter((u): u is string => Boolean(u))
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? (lastResponse?.updatedAt ?? sessionRef.current.updatedAt);

    applySessionState(
      {
        sessionId: renewalSessionId,
        cursor: renewalCursor,
        hasMore: renewalHasMore,
        totalEligibleInPool: Math.max(sessionRef.current.totalEligibleInPool, nextMovies.length),
        title: lastResponse?.title ?? sessionRef.current.title,
        subtitle: lastResponse?.subtitle ?? sessionRef.current.subtitle,
        state: topState,
        updatedAt: oldestUpdatedAt,
        terminalReason: renewalHasMore ? null : (lastResponse?.terminalReason ?? sessionRef.current.terminalReason),
        underlyingLimit: lastResponse?.underlyingLimit ?? sessionRef.current.underlyingLimit,
        movies: nextMovies,
        segments: nextSegments,
        openedAt: sessionRef.current.openedAt || Date.now(),
        isRenewal: true,
        generation: nextGen,
      },
      Boolean(renewalSessionId),
    );
  }, [mediaType, category, sortBy, minRating, store, applySessionState, currentUserId]);

  // Load more action with active generation checking (DR06) and automatic session renewal (LR05)
  const loadMore = useCallback(async () => {
    if (pendingRef.current || !sessionRef.current.hasMore) return;

    // Q11: Must retry failed replacement first before appending
    if (lastFailedAction === "initial") return;

    // Q9: If current library state cannot be checked, retain cards and do not append
    if (store.libraryError) return;

    const reqId = ++activeReqId.current;
    pendingRef.current = true;
    setLoadingMore(true);
    setError(null);

    const sid = sessionRef.current.sessionId;
    if (!sid) {
      try {
        await renewSession(reqId);
        setLastFailedAction(null);
      } catch (err: unknown) {
        if (reqId === activeReqId.current) {
          setLastFailedAction("loadMore");
          checkFreshness();
          handleApiErrorRef.current(err, "Could not renew discovery results. Retry.");
        }
      } finally {
        setLoadingMore(false);
        if (reqId === activeReqId.current) {
          pendingRef.current = false;
        }
      }
      return;
    }

    try {
      const res = await moviesApi.getExploreCategoryPage(
        mediaType,
        category,
        {
          sessionId: sid,
          cursor: sessionRef.current.cursor,
          limit: 20,
          sortBy,
          minRating,
        },
        { userScope: currentUserId ?? undefined },
      );

      if (reqId !== activeReqId.current) return;
      applyPageResponseRef.current(res, "append");
      setLastFailedAction(null);
    } catch (err: unknown) {
      if (reqId !== activeReqId.current) return;
      const is410 =
        (err as any)?.status === 410 ||
        (err instanceof Error && (err.message.includes("410") || err.message.toLowerCase().includes("session expired")));
      if (is410) {
        // LR05: Automatic renewal on 410 without stranding or routine Refresh
        try {
          await renewSession(reqId);
          setLastFailedAction(null);
          return;
        } catch (renewErr: unknown) {
          if (reqId !== activeReqId.current) return;
          setLastFailedAction("loadMore");
          checkFreshness();
          handleApiErrorRef.current(renewErr, "Could not renew discovery results. Retry.");
          return;
        }
      }
      setLastFailedAction("loadMore");
      checkFreshness();
      handleApiErrorRef.current(err, "Could not load more items. Retry.");
    } finally {
      setLoadingMore(false);
      if (reqId === activeReqId.current) {
        pendingRef.current = false;
      }
    }
  }, [mediaType, category, sortBy, minRating, lastFailedAction, store.libraryError, checkFreshness, renewSession, currentUserId]);

  // Refresh discovery action with active generation checking (DR06)
  const refresh = useCallback(async () => {
    if (pendingRef.current) return;

    const reqId = ++activeReqId.current;
    pendingRef.current = true;
    setRefreshing(true);
    setError(null);
    setSessionExpired(false);

    try {
      await moviesApi.refreshExploreCategory(mediaType, category);
      if (reqId !== activeReqId.current) return;

      sessionRef.current.generation = 0;
      // Start new pool session
      const res = await moviesApi.getExploreCategoryPage(
        mediaType,
        category,
        {
          cursor: 0,
          limit: 20,
          sortBy,
          minRating,
        },
        { userScope: currentUserId ?? undefined },
      );

      if (reqId !== activeReqId.current) return;
      sessionRef.current.openedAt = Date.now();
      confirmedSavedIdsRef.current.clear();
      applyPageResponseRef.current(res, "replace");
      setLastFailedAction(null);
    } catch (err: unknown) {
      if (reqId !== activeReqId.current) return;
      setLastFailedAction("refresh");
      checkFreshness();
      handleApiErrorRef.current(err, "Could not refresh discovery. Retry.");
    } finally {
      setRefreshing(false);
      if (reqId === activeReqId.current) {
        pendingRef.current = false;
      }
    }
  }, [mediaType, category, sortBy, minRating, currentUserId]);

  // Retry failed action without skipping or duplicating items (DR05, Q11, Spec 7)
  // Strictly read-only GET; never calls refresh() or POSTs provider rebuild
  const retry = useCallback(async () => {
    if (lastFailedAction === "loadMore") {
      await loadMore();
    } else {
      await fetchInitialPage();
    }
  }, [lastFailedAction, loadMore, fetchInitialPage]);

  // Explicit single card removal after confirmed save (DR04, Spec Finding 10, Standards Finding)
  const removeMovie = useCallback(
    (movieId: string) => {
      if (!checkFreshness()) return;
      confirmedSavedIdsRef.current.add(movieId);
      setMovies((prev) => pruneAndTransitionLibraryMovies(prev, prev.filter((m) => m.id !== movieId)));
    },
    [pruneAndTransitionLibraryMovies, checkFreshness],
  );

  return {
    movies,
    segments: (segments.length > 0 ? segments : (movies.length > 0 ? [{ id: "initial", generation: 0, movies }] : [])) as CategorySegment[],
    sessionId,
    cursor,
    hasMore,
    totalEligibleInPool,
    title,
    subtitle,
    state,
    updatedAt,
    terminalReason,
    underlyingLimit,
    loading,
    loadingMore,
    refreshing,
    error,
    sessionExpired,
    libraryError: store.libraryError,
    lastFailedAction,
    loadMore,
    refresh,
    retry,
    removeMovie,
  };
}
