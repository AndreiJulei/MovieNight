import { authApi } from "./auth";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export interface ApiMovieResponse {
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
  imdbRating?: number;
  rottenTomatoesRating?: number;
  tmdbVoteAverage?: number;
  tmdbVoteCount?: number;
}

export interface ApiUserMovieEntryResponse {
  id: number;
  movie: ApiMovieResponse;
  status: "WATCHLIST" | "WATCHED" | "DROPPED";
  personalRating?: number | null;
  notes?: string | null;
  watchedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiAddMovieRequest {
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
  imdbRating?: number;
  rottenTomatoesRating?: number;
  tmdbVoteAverage?: number;
  tmdbVoteCount?: number;
  status: "WATCHLIST" | "WATCHED" | "DROPPED";
  personalRating?: number | null;
  notes?: string | null;
  watchedAt?: string | null;
}

export interface ApiUpdateMovieEntryRequest {
  status?: "WATCHLIST" | "WATCHED" | "DROPPED";
  personalRating?: number | null;
  notes?: string | null;
  watchedAt?: string | null;
}

export interface ApiFriendRatingResponse {
  userId: number;
  username: string;
  displayName: string;
  status: "WATCHLIST" | "WATCHED" | "DROPPED";
  personalRating?: number;
  notes?: string;
  watchedAt?: string;
}

function getAuthHeaders(): HeadersInit {
  const token = authApi.getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export const moviesApi = {
  /**
   * Live movie search (searches local database first, then TMDB).
   */
  async search(query: string): Promise<ApiMovieResponse[]> {
    if (!query.trim()) return [];
    try {
      const res = await fetch(
        `${API_BASE}/api/movies/search?query=${encodeURIComponent(query.trim())}`,
        { headers: getAuthHeaders() },
      );
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn("Failed to search movies from backend:", err);
      return [];
    }
  },

  /**
   * Get or fetch full movie details by TMDB ID (enriched with OMDb ratings).
   */
  async getByTmdbId(tmdbId: number): Promise<ApiMovieResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/movies/tmdb/${tmdbId}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn(`Failed to fetch TMDB movie ${tmdbId}:`, err);
      return null;
    }
  },

  /**
   * Fetch authenticated user's movie library from the database.
   */
  async getLibrary(status?: "WATCHLIST" | "WATCHED"): Promise<ApiUserMovieEntryResponse[]> {
    try {
      const url = status
        ? `${API_BASE}/api/movies/library?status=${status}`
        : `${API_BASE}/api/movies/library`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn("Failed to fetch library from backend:", err);
      return [];
    }
  },

  /**
   * Add a movie to the authenticated user's library.
   */
  async addMovie(req: ApiAddMovieRequest): Promise<ApiUserMovieEntryResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/movies/library`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(req),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error("Failed to add movie to library:", err);
      return null;
    }
  },

  /**
   * Update a user's movie rating, review notes, or status.
   */
  async updateEntry(
    movieId: number | string,
    req: ApiUpdateMovieEntryRequest,
  ): Promise<ApiUserMovieEntryResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/movies/library/${movieId}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(req),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error(`Failed to update movie ${movieId}:`, err);
      return null;
    }
  },

  /**
   * Remove a movie from the user's library.
   */
  async removeMovie(movieId: number | string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/api/movies/library/${movieId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      return res.ok;
    } catch (err) {
      console.error(`Failed to remove movie ${movieId}:`, err);
      return false;
    }
  },

  /**
   * Fetch ratings for a movie from a list of friend IDs.
   */
  async getFriendsRatings(
    movieId: number | string,
    friendIds: (number | string)[],
  ): Promise<ApiFriendRatingResponse[]> {
    if (!friendIds || friendIds.length === 0) return [];
    try {
      const numericIds = friendIds.map((id) => Number(id)).filter((id) => !isNaN(id));
      if (numericIds.length === 0) return [];
      const res = await fetch(
        `${API_BASE}/api/movies/${movieId}/friends-ratings?friendIds=${numericIds.join(",")}`,
        { headers: getAuthHeaders() },
      );
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      return [];
    }
  },
};
