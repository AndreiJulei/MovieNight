import { titleId } from "../store/titleIdentity";
import { useEffect, useRef, useState } from "react";
import { moviesApi, type ApiSuggestionMovieItem, type ApiSuggestionCategory } from "../api/movies";
import { useStore } from "../store/MovieStore";
import type { Movie } from "../store/data";

/** Use only movie response metadata; the local catalog may hold TV at the same ID. */
export function mapPersonalMovie(item: ApiSuggestionMovieItem): Movie {
  return { id: titleId(item.tmdbId, "MOVIE"), tmdbId: item.tmdbId, title: item.title,
    mediaType: "MOVIE", year: item.releaseYear ?? null, imdb: item.voteAverage ?? null,
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
  return { category: current?.category ?? null, error: current?.error ?? null, loading,
    reload: () => {
      if (loading || pending.current || !userId) return;
      pending.current = true;
      forceRefresh.current = true;
      setRevision((value) => value + 1);
    } };
}
