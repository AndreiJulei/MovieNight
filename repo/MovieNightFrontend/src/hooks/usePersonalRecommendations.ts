import { titleId } from "../store/titleIdentity";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { moviesApi, type ApiSuggestionMovieItem, type ApiSuggestionCategory } from "../api/movies";
import { useStore } from "../store/MovieStore";
import type { Movie } from "../store/data";
import { useToast } from "../components/Toast";
import {
  dismissedRecommendations, setRecommendationDismissed, useDismissedRecommendations,
  type DismissRecommendation,
} from "./recommendationDismissals";

/** How long the Undo toast stays (#40: about 5 s; it also stays while it holds focus). */
const UNDO_TOAST_MS = 5000;

/** Use only movie response metadata; the local catalog may hold TV at the same ID. */
export function mapPersonalMovie(item: ApiSuggestionMovieItem): Movie {
  return { id: titleId(item.tmdbId, "MOVIE"), tmdbId: item.tmdbId, title: item.title,
    mediaType: "MOVIE", year: item.releaseYear ?? null, imdb: item.imdbRating ?? null,
    tmdbRating: item.voteAverage ?? null, tmdbVotes: item.voteCount ?? null, reason: item.reason ?? null,
    posterSeed: null, posterUrl: item.posterUrl ?? null, rt: null, overview: "", genres: [] };
}

export default function usePersonalRecommendations() {
  const store = useStore();
  const userId = store.currentUser?.id;
  const libraryKey = userId ? store.allEntries().filter((e) => e.userId === userId)
    .map((e) => `${e.id}:${e.movieId}:${e.mediaType}:${e.status}:${e.rating}:${e.addedAt}`).sort().join(",") : "";
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; category: ApiSuggestionCategory | null; error: string | null } | null>(null);
  const inputKey = JSON.stringify([userId, libraryKey, revision]);
  const input = useRef({ key: inputKey, generation: 0 });
  if (input.current.key !== inputKey) input.current = { key: inputKey, generation: input.current.generation + 1 };
  // A→B→A must still start pending instead of briefly reusing an older A response.
  const key = JSON.stringify([inputKey, input.current.generation]);
  const latestKey = useRef(key);
  latestKey.current = key;
  const pending = useRef(false);
  const forceRefresh = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const refresh = forceRefresh.current;
    forceRefresh.current = false;
    pending.current = true;
    void (async () => {
      try {
        if (refresh) await moviesApi.refreshPersonalizedRecommendations();
        if (!active || latestKey.current !== key) return;
        const response = await moviesApi.getPersonalRecommendations();
        if (active && latestKey.current === key) setState({ key, category: response.categories[0], error: null });
      } catch (error: unknown) {
        if (active && latestKey.current === key) setState({ key, category: null,
          error: error instanceof Error ? error.message : "Could not load personal movies. Retry to try again." });
      } finally {
        if (active && latestKey.current === key) pending.current = false;
      }
    })();
    return () => { active = false; };
  }, [key, userId]);

  const current = state?.key === key ? state : null;
  const loading = !!userId && !current;
  const { toast } = useToast();
  const dismissed = useDismissedRecommendations(userId);
  const loaded = current?.category ?? null;
  // Dismissed titles leave at once; the following stored ones move up (RM02). Undo puts one back in place.
  const category = useMemo(() => loaded && dismissed.size > 0
    ? { ...loaded, movies: loaded.movies.filter((movie) => !dismissed.has(movie.tmdbId)) } : loaded, [loaded, dismissed]);

  const dismiss = useCallback<DismissRecommendation>((movie, focus) => {
    const tmdbId = movie.tmdbId;
    if (!userId || tmdbId == null || dismissedRecommendations(userId).has(tmdbId)) return;
    setRecommendationDismissed(userId, tmdbId, true);
    const saved = moviesApi.dismissPersonalRecommendation(tmdbId);
    const closeUndoToast = toast({
      type: "info", message: `${movie.title} removed from your recommendations`, duration: UNDO_TOAST_MS,
      focusUndo: focus.keyboard, onCloseWithFocus: focus.restoreFocus,
      onUndo: () => {
        setRecommendationDismissed(userId, tmdbId, false);
        // The undo waits for the dismissal, so it cannot reach the server first and be overtaken.
        saved.then(() => moviesApi.undoPersonalRecommendationDismissal(tmdbId).catch(() => {
          setRecommendationDismissed(userId, tmdbId, true);
          toast({ type: "error", message: `Could not bring back ${movie.title}. Try again.` });
        }), () => { /* the dismissal failed and was already reverted */ });
      },
    });
    saved.catch(() => {
      // Nothing is left to undo: the Undo toast goes, and the card comes back with an error.
      closeUndoToast();
      setRecommendationDismissed(userId, tmdbId, false);
      toast({ type: "error", message: `Could not remove ${movie.title}. Try again.` });
    });
  }, [userId, toast]);

  return { category, error: current?.error ?? null, loading, dismiss,
    reload: () => {
      if (loading || pending.current || !userId) return;
      pending.current = true;
      forceRefresh.current = true;
      setRevision((value) => value + 1);
    } };
}
