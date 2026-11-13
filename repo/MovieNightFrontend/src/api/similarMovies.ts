import type { MediaType, Movie } from "../store/data";
import { resourceType, titleId } from "../store/titleIdentity.ts";

export interface SimilarMovieItem {
  id?: number;
  tmdbId?: number;
  imdbId?: string;
  title: string;
  releaseYear?: number;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  genres?: string;
  runtimeMinutes?: number;
  trailerKey?: string;
  director?: string;
  castMembers?: string;
  mediaType?: "MOVIE" | "TV" | "ANIME" | string;
  seasonsCount?: number;
  episodesCount?: number;
  imdbRating?: number;
  rottenTomatoesRating?: number;
  tmdbVoteAverage?: number;
  tmdbVoteCount?: number;
}

/**
 * Map one similar-title response to a displayable title. Its identity comes from the provider
 * (TMDB) ID like every other shelf; the catalog database ID is kept only as catalogMovieId.
 */
export function toSimilarTitle(item: SimilarMovieItem, sourceMediaType: string): Movie | null {
  const mediaType = (item.mediaType || sourceMediaType) as MediaType;
  let id: string;
  try {
    if (resourceType(mediaType) !== resourceType(sourceMediaType)) return null;
    id = titleId(item.tmdbId, mediaType, item.id);
  } catch {
    return null;
  }
  return {
    id,
    catalogMovieId: item.id,
    tmdbId: item.tmdbId,
    title: item.title,
    year: item.releaseYear ?? null,
    posterUrl: item.posterUrl ?? null,
    backdropUrl: item.backdropUrl ?? null,
    runtimeMinutes: item.runtimeMinutes ?? null,
    imdb: item.imdbRating ?? null,
    rt: item.rottenTomatoesRating ?? null,
    tmdbRating: item.tmdbVoteAverage ?? null,
    tmdbVotes: item.tmdbVoteCount ?? null,
    overview: item.overview ?? "",
    genres: item.genres?.split(",").map((g) => g.trim()).filter(Boolean) ?? [],
    director: item.director,
    trailerKey: item.trailerKey,
    mediaType,
    seasonsCount: item.seasonsCount,
    episodesCount: item.episodesCount,
  };
}

/**
 * Fetch similar titles for a given movie/show from precomputed cosine similarity
 * with graceful fallback to TMDB recommendations. Responses are cached in sessionStorage.
 */
export async function fetchSimilarTitles<T extends SimilarMovieItem = SimilarMovieItem>(
  apiBase: string,
  tmdbId: number,
  mediaType?: string,
  limit: number = 10,
  getHeaders: () => HeadersInit = () => ({}),
): Promise<T[]> {
  if (!tmdbId || tmdbId <= 0) return [];

  // Key by provider resource: movies keep similar_movies_${tmdbId} (SIM04); TV and anime TV share
  // similar_movies_tv_${tmdbId}, because a TMDB TV ID can equal an unrelated TMDB movie ID.
  const category = mediaType?.toUpperCase();
  const isTv = category === "TV" || category === "ANIME";
  const cacheKey = isTv ? `similar_movies_tv_${tmdbId}` : `similar_movies_${tmdbId}`;

  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          return parsed as T[];
        }
      }
    } catch {
      // Ignore JSON or storage errors and proceed to fetch
    }
  }

  try {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (mediaType) params.set("mediaType", mediaType);

    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${apiBase}/api/movies/${tmdbId}/similar${qs}`, {
      headers: getHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    if (Array.isArray(data)) {
      if (typeof window !== "undefined" && window.sessionStorage) {
        try {
          window.sessionStorage.setItem(cacheKey, JSON.stringify(data));
        } catch {
          // Ignore quota errors
        }
      }
      return data as T[];
    }
    return [];
  } catch {
    return [];
  }
}
