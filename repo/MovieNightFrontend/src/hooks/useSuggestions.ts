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

export function mapApiMovie(m: { tmdbId: number; title: string; posterUrl?: string; releaseYear?: number; imdbRating?: number; rottenTomatoesRating?: number; voteAverage?: number; mediaType?: string }, store: { movieById: (id: string) => Movie | undefined }): Movie {
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
