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
  catalogMovieId?: number;
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
    const response = await libraryRequest<ApiMovieResponse[]>(`${API_BASE}/api/movies/search?query=${encodeURIComponent(query.trim())}`);
    if (!Array.isArray(response)) throw new Error("Invalid search response. Retry.");
    return response;
  },

  /**
   * Get or fetch full media details by TMDB ID (enriched with OMDb ratings).
   */
  async getByTmdbId(tmdbId: number, mediaType?: string): Promise<ApiMovieResponse | null> {
    if (!mediaType) throw new Error("Explicit title resource type is required.");
    return libraryRequest<ApiMovieResponse>(`${API_BASE}/api/movies/tmdb/${tmdbId}?mediaType=${encodeURIComponent(mediaType)}`);
  },

  /**
   * Get movie details by database primary key ID.
   */
  async getById(id: number): Promise<ApiMovieResponse | null> {
    return libraryRequest<ApiMovieResponse>(`${API_BASE}/api/movies/${id}`);
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
    return libraryRequest<ApiUserMovieEntryResponse>(`${API_BASE}/api/movies/library/${movieId}`, {
      method: "PUT", body: JSON.stringify(req),
    });
  },

  /**
   * Remove a movie from the user's library.
   */
  async removeMovie(movieId: number | string): Promise<boolean> {
    await libraryRequest(`${API_BASE}/api/movies/library/${movieId}`, { method: "DELETE" });
    return true;
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
   * Fetch watched-history personal movie recommendations.
   */
  async getPersonalRecommendations(): Promise<ApiSuggestionsResponse> {
    try {
      const res = await fetch(`${API_BASE}/api/suggestions/personal`, {
        headers: getAuthHeaders(), signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error("Personal movie request failed.");
      const data = await res.json() as ApiSuggestionsResponse;
      const states = ["READY", "NO_HISTORY", "INSUFFICIENT_COVERAGE", "LIBRARY_EXHAUSTED", "MISSING_METADATA"];
      const limitations = ["TMDB_UNCONFIGURED", "PARTIAL_COVERAGE", "LIBRARY_EXCLUDED", "METADATA_OMITTED"];
      if (!Array.isArray(data?.categories) || data.categories.length !== 1 ||
          data.categories.some((c) => c.id !== "movies" || !states.includes(c.state ?? "") ||
            !Array.isArray(c.limitations) || c.limitations.some((l) => !limitations.includes(l)) ||
            !Array.isArray(c.movies) || c.movies.length > 30 ||
            (c.state === "READY") !== (c.movies.length > 0) ||
            new Set(c.movies.map((m) => m.tmdbId)).size !== c.movies.length ||
            c.movies.some((m) => !Number.isSafeInteger(m.tmdbId) || m.tmdbId <= 0 ||
              typeof m.title !== "string" || !m.title.trim() || m.mediaType !== "MOVIE" ||
              typeof m.score !== "number" || !Number.isFinite(m.score) || m.score <= 0 ||
              (m.releaseYear != null && !Number.isInteger(m.releaseYear)) ||
              (m.voteAverage != null && (typeof m.voteAverage !== "number" || !Number.isFinite(m.voteAverage))) ||
              (m.posterUrl != null && typeof m.posterUrl !== "string")))) {
        throw new Error("Invalid personal movie response.");
      }
      return data;
    } catch {
      throw new Error("Could not load personal movies. Retry to refresh your recommendations.");
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
    const response = await libraryRequest<ApiSuggestionsResponse>(`${API_BASE}/api/movies/explore/${encodeURIComponent(mediaType)}`);
    if (!Array.isArray(response?.categories)) throw new Error("Invalid discovery response. Retry.");
    return response;
  },

  /**
   * Request immediate recalculation of personalized recommendations.
   */
  async refreshPersonalizedRecommendations(): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/api/suggestions/personalized/refresh`, {
        method: "POST", headers: getAuthHeaders(), signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error("Refresh failed.");
      const data = await res.json();
      if (typeof data?.message !== "string") throw new Error("Invalid refresh response.");
    } catch {
      throw new Error("Could not refresh personal movies. Retry to try again.");
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
  state?: string;
  limitations?: string[];
  id: string;
  title: string;
  movies: ApiSuggestionMovieItem[];
}

export interface ApiSuggestionsResponse {
  categories: ApiSuggestionCategory[];
}

