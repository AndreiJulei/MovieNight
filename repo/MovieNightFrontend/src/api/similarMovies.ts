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

  // Key by similar_movies_${tmdbId} for movies/default to honor spec AC SIM04,
  // or distinguish by mediaType (e.g. similar_movies_tv_${tmdbId}) to avoid ID collisions
  const isTv = mediaType && mediaType.toLowerCase() === "tv";
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
