import { titleId } from "../store/titleIdentity";
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
 * Explore catalog hook for /explore/:type pages.
 */
export function useExploreMedia(mediaType: "movies" | "tv" | "anime") {
  const store = useStore();
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([mediaType, store.currentUser?.id, revision]);
  const [state, setState] = useState<{ key: string; data: ApiSuggestionsResponse | null; error: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    void moviesApi.getExploreMedia(mediaType).then(data => {
      if (active) setState({ key, data, error: null });
    }).catch(error => {
      if (active) setState({ key, data: null, error: error instanceof Error ? error.message : "Could not load discovery. Retry." });
    });
    return () => { active = false; };
  }, [key, mediaType]);
  const current = state?.key === key ? state : null;
  return { rows: useMemo(() => current?.data?.categories.map(category => ({ ...category,
      movies: category.movies.map(item => mapApiMovie(item, store)) })) ?? [], [current, store]),
    error: current?.error ?? null, loading: !current,
    reload: () => { if (current) setRevision(value => value + 1); } };
}

export function mapApiMovie(m: { tmdbId: number; title: string; posterUrl?: string; releaseYear?: number; imdbRating?: number; rottenTomatoesRating?: number; voteAverage?: number; mediaType?: string }, store: { movieById: (id: string) => Movie | undefined }): Movie {
  const id = titleId(m.tmdbId, m.mediaType ?? "");
  const existing = store.movieById(id);
  return {
    id,
    tmdbId: m.tmdbId,
    title: m.title,
    year: m.releaseYear ?? existing?.year ?? null,
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
