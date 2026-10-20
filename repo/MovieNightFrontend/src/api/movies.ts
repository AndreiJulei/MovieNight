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
  mediaType?: "MOVIE" | "TV" | "ANIME" | string;
  seasonsCount?: number;
  episodesCount?: number;
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
  mediaType?: "MOVIE" | "TV" | "ANIME" | string;
  seasonsCount?: number;
  episodesCount?: number;
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

// Library requests must distinguish rejection from an empty or confirmed result.
async function libraryRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error("Your session could not be verified. Sign in again and retry.");
      }
      throw new Error("The server could not confirm the request. Please try again.");
    }
    return await res.json() as T;
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error("Confirmation timed out. Reload your library or try again.");
    }
    if (err instanceof TypeError) {
      throw new Error("Could not confirm the request. Check your connection and try again.");
    }
    throw err;
  }
}

function confirmedWatchedEntry(entry: ApiUserMovieEntryResponse, rating: number | null) {
  if (!entry?.id || !entry.movie?.id || !entry.movie.title || entry.status !== "WATCHED" ||
      (entry.personalRating ?? null) !== rating) {
    throw new Error("Could not confirm watched history. Reload your library or try again.");
  }
  return entry;
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
   * Get or fetch full media details by TMDB ID (enriched with OMDb ratings).
   */
  async getByTmdbId(tmdbId: number, mediaType?: string): Promise<ApiMovieResponse | null> {
    try {
      const url = mediaType
        ? `${API_BASE}/api/movies/tmdb/${tmdbId}?mediaType=${encodeURIComponent(mediaType)}`
        : `${API_BASE}/api/movies/tmdb/${tmdbId}`;
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn(`Failed to fetch TMDB media ${tmdbId}:`, err);
      return null;
    }
  },

  /**
   * Get movie details by database primary key ID.
   */
  async getById(id: number): Promise<ApiMovieResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/movies/${id}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn(`Failed to fetch movie by database ID ${id}:`, err);
      return null;
    }
  },

  /**
   * Fetch authenticated user's movie library from the database.
   */
  async getLibrary(status?: "WATCHLIST" | "WATCHED"): Promise<ApiUserMovieEntryResponse[]> {
    const url = status
      ? `${API_BASE}/api/movies/library?status=${status}`
      : `${API_BASE}/api/movies/library`;
    const entries = await libraryRequest<ApiUserMovieEntryResponse[]>(url);
    if (!Array.isArray(entries)) throw new Error("Could not read your library. Please try again.");
    return entries;
  },

  /** Save explicitly; a rejected request never becomes a successful null result. */
  async saveWatchlist(req: ApiAddMovieRequest): Promise<ApiUserMovieEntryResponse> {
    const entry = await libraryRequest<ApiUserMovieEntryResponse>(`${API_BASE}/api/movies/library`, {
      method: "POST",
      body: JSON.stringify({ ...req, status: "WATCHLIST" }),
    });
    if (!entry?.id || !entry.movie?.title ||
        (entry.movie.tmdbId == null && entry.movie.id == null) ||
        !["WATCHLIST", "WATCHED"].includes(entry.status)) {
      throw new Error("Could not confirm the saved entry. Reload your library or try again.");
    }
    return entry;
  },

  /**
   * Add a movie to the authenticated user's library.
   */
  async addMovie(req: ApiAddMovieRequest): Promise<ApiUserMovieEntryResponse> {
    const entry = await libraryRequest<ApiUserMovieEntryResponse>(`${API_BASE}/api/movies/library`, {
      method: "POST", body: JSON.stringify(req),
    });
    return confirmedWatchedEntry(entry, req.personalRating ?? null);
  },

  async saveWatchedRating(movieId: number, rating: number | null, notes?: string): Promise<ApiUserMovieEntryResponse> {
    const entry = await libraryRequest<ApiUserMovieEntryResponse>(`${API_BASE}/api/movies/library/${movieId}`, {
      method: "PUT", body: JSON.stringify({ status: "WATCHED", personalRating: rating, notes }),
    });
    return confirmedWatchedEntry(entry, rating);
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
      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        console.error(`Failed to update movie ${movieId} (${res.status}):`, errorText);
        return null;
      }
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
    const numericIds = friendIds.map((id) => Number(id)).filter((id) => Number.isSafeInteger(id) && id > 0);
    if (numericIds.length === 0) return [];
    const res = await fetch(
      `${API_BASE}/api/movies/${movieId}/friends-ratings?friendIds=${numericIds.join(",")}`,
      { headers: getAuthHeaders(), signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) throw new Error("Could not load friend ratings. Retry or sign in again.");
    const ratings = await res.json();
    if (!Array.isArray(ratings)) throw new Error("Could not read friend ratings. Retry.");
    return ratings;
  },

  /**
   * Fetch all suggestion category rows (for-you ML, friends consensus, popular, recent, upcoming).
   */
  async getSuggestions(): Promise<ApiSuggestionsResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/suggestions`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn("Failed to fetch suggestions from backend:", err);
      return null;
    }
  },

  /**
   * Fetch category-aware personal recommendations (Movie, TV, Anime).
   */
  async getPersonalRecommendations(): Promise<ApiSuggestionsResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/suggestions/personal`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn("Failed to fetch personal recommendations:", err);
      return null;
    }
  },

  /**
   * Fetch friends' recommendations.
   */
  async getFriendsRecommendations(): Promise<ApiSuggestionsResponse> {
    try {
      const res = await fetch(`${API_BASE}/api/suggestions/friends`, {
        headers: getAuthHeaders(), signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error("Friend suggestions request failed.");
      const data = await res.json() as ApiSuggestionsResponse;
      const ids = ["friends", "friends-watchlist"];
      if (!Array.isArray(data?.categories) || data.categories.length !== 2 ||
          !ids.every((id) => data.categories.filter((c) => c.id === id).length === 1) ||
          data.categories.some((c) => !Array.isArray(c.movies) || c.movies.some((m) =>
            !Number.isSafeInteger(m.tmdbId) || m.tmdbId <= 0 || typeof m.title !== "string" ||
            !m.title.trim() || m.mediaType !== "MOVIE" || typeof m.reason !== "string" ||
            (c.id === "friends" && (typeof m.score !== "number" || !Number.isFinite(m.score)))))) {
        throw new Error("Invalid friend suggestions response.");
      }
      return data;
    } catch {
      throw new Error("Could not load friend suggestions. Reload to try again.");
    }
  },

  /**
   * Fetch discover catalog shelves for a specific media type (movies, tv, anime).
   */
  async getExploreMedia(mediaType: string): Promise<ApiSuggestionsResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/movies/explore/${encodeURIComponent(mediaType)}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn(`Failed to fetch explore media for ${mediaType}:`, err);
      return null;
    }
  },

  /**
   * Request immediate recalculation of personalized recommendations.
   */
  async refreshPersonalizedRecommendations(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/api/suggestions/personalized/refresh`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};

export interface ApiSuggestionMovieItem {
  tmdbId: number;
  title: string;
  posterUrl?: string;
  releaseYear?: number;
  voteAverage?: number;
  imdbRating?: number;
  rottenTomatoesRating?: number;
  score?: number;
  reason?: string;
  mediaType?: string;
}

export interface ApiSuggestionCategory {
  id: string;
  title: string;
  movies: ApiSuggestionMovieItem[];
}

export interface ApiSuggestionsResponse {
  categories: ApiSuggestionCategory[];
}

