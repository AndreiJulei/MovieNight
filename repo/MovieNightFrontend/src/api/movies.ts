import { authApi } from "./auth";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export interface ApiCastMemberResponse {
  name: string;
  role: string;
  profileUrl?: string | null;
}

export interface ApiMovieResponse {
  id?: number;
  tmdbId?: number;
  imdbId?: string;
  title: string;
  releaseYear?: number;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  logoUrl?: string | null;
  genres?: string;
  runtimeMinutes?: number;
  trailerKey?: string;
  director?: string;
  castMembers?: string;
  cast?: ApiCastMemberResponse[];
  imdbRating?: number;
  rottenTomatoesRating?: number;
  tmdbVoteAverage?: number;
  tmdbVoteCount?: number;
  mediaType?: "MOVIE" | "TV" | "ANIME" | string;
  seasonsCount?: number;
  episodesCount?: number;
}

export interface ApiSearchPageResponse {
  query: string;
  type: string;
  page: number;
  totalPages: number;
  hasMore: boolean;
  results: ApiMovieResponse[];
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

import { fetchSimilarTitles } from "./similarMovies";
import { cachedRead, forgetCachedRead, invalidateReadCache, type CacheWindow } from "./readCache";

// Explore data changes slowly and every extra shelf costs a network round trip, so revisits reuse it.
// Windows stay well under the server's 30-minute Explore session so a cached session id is still usable.
const EXPLORE_OVERVIEW_CACHE: CacheWindow = { freshMs: 60_000, maxAgeMs: 10 * 60_000 };
const EXPLORE_PAGE_CACHE: CacheWindow = { freshMs: 60_000, maxAgeMs: 5 * 60_000 };
// Explore highlights (#26) are charts refreshed daily (spotlight) and every 4 hours (Top 10).
const EXPLORE_HIGHLIGHTS_CACHE: CacheWindow = { freshMs: 5 * 60_000, maxAgeMs: 30 * 60_000 };
// Search pages (#30) are cached briefly so back/forward and reload of loaded pages render at once.
const SEARCH_PAGE_CACHE: CacheWindow = { freshMs: 2 * 60_000, maxAgeMs: 10 * 60_000 };
// Title details (#29): a poster press prefetches them so the page renders as the transition ends.
// Short windows, because critic scores arrive moments after a first open.
const TITLE_DETAILS_CACHE: CacheWindow = { freshMs: 15_000, maxAgeMs: 5 * 60_000 };
import {
  boundedRead,
  type BoundedReadOptions,
  isAbortError,
  isTransientError,
  parseRetryAfter,
  RequestTimeoutError,
  setDefaultScopeResolver,
} from "./boundedRead";
import { configureServerWake } from "./serverWake";

configureServerWake(`${API_BASE}/api/health`);

setDefaultScopeResolver(() => authApi.getToken());

export {
  boundedRead,
  type BoundedReadOptions,
  isAbortError,
  isTransientError,
  parseRetryAfter,
  RequestTimeoutError,
  setDefaultScopeResolver,
};

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
      headers: {
        ...getAuthHeaders(),
        ...(init.headers || {}),
      },
      signal: init.signal ?? AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      let body: any = null;
      try {
        body = await res.json();
      } catch {
        /* ignore non-json error responses */
      }
      const retryAfter = res.headers.get("Retry-After");
      if (res.status === 410) {
        const message = body?.message || "Discovery session expired. Refresh discovery to continue.";
        const err = new Error(message);
        (err as any).status = 410;
        throw err;
      }
      if (res.status === 401 || res.status === 403) {
        const err = new Error("Your session could not be verified. Sign in again and retry.");
        (err as any).status = res.status;
        throw err;
      }
      const message = body?.message || `The server returned status ${res.status}. Please try again.`;
      const err = new Error(message);
      (err as any).status = res.status;
      if (retryAfter) {
        (err as any).retryAfter = retryAfter;
      }
      throw err;
    }
    // Any confirmed write (library, lists, ratings, discovery refresh) may change what pages show.
    if (init.method && init.method.toUpperCase() !== "GET") invalidateReadCache();
    return await res.json() as T;
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw err;
    }
    if (err instanceof TypeError) {
      throw err;
    }
    throw err;
  }
}

function confirmedWatchedEntry(entry: ApiUserMovieEntryResponse, rating: number | null) {
  if (!entry?.id || !entry.movie?.id || !entry.movie.title || entry.status !== "WATCHED" ||
      (entry.personalRating ?? null) !== rating) {
    throw new Error("Could not confirm watched history. Try again.");
  }
  return entry;
}

/** POST dismisses, DELETE undoes (#40); both answer 204 with no body. */
async function sendDismissal(method: "POST" | "DELETE", tmdbId: number, failure: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/suggestions/personal/dismissals/${encodeURIComponent(tmdbId)}`, {
    method, headers: getAuthHeaders(), signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!res?.ok) throw new Error(failure);
}

export const moviesApi = {
  /**
   * Live movie search (searches local database first, then TMDB).
   */
  async search(query: string, options?: BoundedReadOptions): Promise<ApiMovieResponse[]> {
    const q = query.trim();
    if (!q) return [];
    const actionKey = `search:${q.toLowerCase()}`;
    return boundedRead(actionKey, async (signal) => {
      const response = await libraryRequest<ApiMovieResponse[]>(
        `${API_BASE}/api/movies/search?query=${encodeURIComponent(q)}`,
        { signal },
      );
      if (!Array.isArray(response)) throw new Error("Invalid search response. Retry.");
      return response;
    }, options);
  },

  /** One page of the full search results page (#30); `page` is the next provider page to read. */
  async searchPage(query: string, page: number, type: string, options?: BoundedReadOptions): Promise<ApiSearchPageResponse> {
    const q = query.trim();
    const actionKey = `searchPage:${type}:${page}:${q.toLowerCase()}`;
    const scope = options?.userScope ?? authApi.getToken() ?? "anon";
    return cachedRead(`${scope}:${actionKey}`, SEARCH_PAGE_CACHE, (background) =>
      boundedRead(actionKey, async (signal) => {
        const response = await libraryRequest<ApiSearchPageResponse>(
          `${API_BASE}/api/movies/search?query=${encodeURIComponent(q)}&page=${page}&type=${encodeURIComponent(type)}`,
          { signal },
        );
        if (!response || !Array.isArray(response.results) || typeof response.page !== "number") {
          throw new Error("Invalid search response. Retry.");
        }
        return response;
      }, background ? { ...options, signal: undefined } : options),
    );
  },

  /**
   * Get or fetch full media details by TMDB ID. When critic scores (OMDb) are missing the server waits up
   * to about 2 s for them; a slower answer arrives on a later read. `waitForScores: false` skips that wait
   * (entry-page hero slides) and is cached separately, so the title page never reuses a copy that did not wait.
   */
  async getByTmdbId(tmdbId: number, mediaType?: string, options?: BoundedReadOptions & { fresh?: boolean; waitForScores?: boolean }): Promise<ApiMovieResponse | null> {
    if (!mediaType) throw new Error("Explicit title resource type is required.");
    const waitForScores = options?.waitForScores ?? true;
    const actionKey = `getByTmdbId:${mediaType.toUpperCase()}:${tmdbId}${waitForScores ? "" : ":no-wait"}`;
    const read = (readOptions?: BoundedReadOptions) => boundedRead(actionKey, (signal) => {
      return libraryRequest<ApiMovieResponse>(
        `${API_BASE}/api/movies/tmdb/${tmdbId}?mediaType=${encodeURIComponent(mediaType)}${waitForScores ? "" : "&waitForScores=false"}`,
        { signal },
      );
    }, readOptions);
    const cacheKey = `${options?.userScope ?? authApi.getToken() ?? "anon"}:${actionKey}`;
    // The critic-score poll must see the server, not the prefetched copy.
    if (options?.fresh) forgetCachedRead(cacheKey);
    return cachedRead(cacheKey, TITLE_DETAILS_CACHE, (background) =>
      read(background ? { ...options, signal: undefined } : options));
  },

  /** Warm the details cache when a poster is pressed or hovered (#29). Errors are ignored. */
  prefetchByTmdbId(tmdbId: number, mediaType: string, userScope?: string): void {
    void this.getByTmdbId(tmdbId, mediaType, { userScope }).catch(() => { /* the page retries */ });
  },

  /**
   * Get movie details by database primary key ID.
   */
  async getById(id: number, options?: BoundedReadOptions): Promise<ApiMovieResponse | null> {
    const actionKey = `getById:${id}`;
    return boundedRead(actionKey, (signal) => {
      return libraryRequest<ApiMovieResponse>(`${API_BASE}/api/movies/${id}`, { signal });
    }, options);
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

  /** Save explicitly; a rejected request never becomes a successful null result. Never auto-retried. */
  async saveWatchlist(req: ApiAddMovieRequest): Promise<ApiUserMovieEntryResponse> {
    const entry = await libraryRequest<ApiUserMovieEntryResponse>(`${API_BASE}/api/movies/library`, {
      method: "POST",
      body: JSON.stringify({ ...req, status: "WATCHLIST" }),
    });
    if (!entry?.id || !entry.movie?.title ||
        (entry.movie.tmdbId == null && entry.movie.id == null) ||
        !["WATCHLIST", "WATCHED"].includes(entry.status)) {
      throw new Error("Could not confirm the saved entry. Try again.");
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
    options?: BoundedReadOptions,
  ): Promise<ApiFriendRatingResponse[]> {
    if (!friendIds || friendIds.length === 0) return [];
    const numericIds = friendIds.map((id) => Number(id)).filter((id) => Number.isSafeInteger(id) && id > 0);
    if (numericIds.length === 0) return [];
    const sortedIds = [...numericIds].sort((a, b) => a - b).join(",");
    const actionKey = `getFriendsRatings:${movieId}:${sortedIds}`;
    return boundedRead(actionKey, async (signal) => {
      const res = await fetch(
        `${API_BASE}/api/movies/${movieId}/friends-ratings?friendIds=${sortedIds}`,
        { headers: getAuthHeaders(), signal },
      );
      if (!res.ok) {
        const err = new Error("Could not load friend ratings. Retry or sign in again.");
        (err as any).status = res.status;
        throw err;
      }
      const ratings = await res.json();
      if (!Array.isArray(ratings)) throw new Error("Could not read friend ratings. Retry.");
      return ratings;
    }, options);
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
      const limitations = ["TMDB_UNCONFIGURED", "PARTIAL_COVERAGE", "LIBRARY_EXCLUDED", "METADATA_OMITTED", "DIRECTOR_SOURCE_UNAVAILABLE", "ACCLAIMED_SOURCE_UNAVAILABLE"];
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
  async getExploreMedia(mediaType: string, options?: BoundedReadOptions): Promise<ApiSuggestionsResponse | null> {
    const actionKey = `getExploreMedia:${mediaType.toLowerCase()}`;
    const effectiveOptions: BoundedReadOptions = {
      ...options,
      userScope: options?.userScope ?? authApi.getToken() ?? "anon",
    };
    return cachedRead(`${effectiveOptions.userScope}:${actionKey}`, EXPLORE_OVERVIEW_CACHE, (background) =>
      boundedRead(actionKey, async (signal) => {
        const response = await libraryRequest<ApiSuggestionsResponse>(
          `${API_BASE}/api/movies/explore/${encodeURIComponent(mediaType)}`,
          { signal },
        );
        if (!Array.isArray(response?.categories)) throw new Error("Invalid discovery response. Retry.");
        return response;
      }, background ? { ...effectiveOptions, signal: undefined } : effectiveOptions));
  },

  /**
   * Fetch an Explore category's highlights (#26): the spotlight hero's weekly trending titles
   * ("spotlight") and the "Top 10 today" chart ("top-10"). Not user-specific. A response with an
   * unavailable chart is not kept, so a retry asks the server again.
   */
  async getExploreHighlights(mediaType: string, options?: BoundedReadOptions): Promise<ApiSuggestionsResponse> {
    const actionKey = `getExploreHighlights:${mediaType.toLowerCase()}`;
    const cacheKey = `shared:${actionKey}`;
    const response = await cachedRead(cacheKey, EXPLORE_HIGHLIGHTS_CACHE, (background) =>
      boundedRead(actionKey, async (signal) => {
        const result = await libraryRequest<ApiSuggestionsResponse>(
          `${API_BASE}/api/movies/explore/${encodeURIComponent(mediaType)}/highlights`,
          { signal },
        );
        if (!Array.isArray(result?.categories)) throw new Error("Invalid highlights response. Retry.");
        return result;
      }, background ? { ...options, signal: undefined } : options));
    if (response.categories.some((c) => c.state === "UNAVAILABLE")) forgetCachedRead(cacheKey);
    return response;
  },

  /**
   * Fetch paginated Explore category items with pinned session and server sorting/filtering.
   */
  async getExploreCategoryPage(
    mediaType: string,
    category: string,
    params?: {
      sessionId?: string;
      cursor?: number;
      limit?: number;
      sortBy?: string;
      minRating?: number;
    },
    options?: BoundedReadOptions,
  ): Promise<ApiExploreCategoryPageResponse> {
    const query = new URLSearchParams();
    if (params?.sessionId) query.set("sessionId", params.sessionId);
    if (params?.cursor != null) query.set("cursor", String(params.cursor));
    if (params?.limit != null) query.set("limit", String(params.limit));
    if (params?.sortBy) query.set("sortBy", params.sortBy);
    if (params?.minRating != null) query.set("minRating", String(params.minRating));

    const qs = query.toString();
    const url = `${API_BASE}/api/movies/explore/${encodeURIComponent(mediaType)}/${encodeURIComponent(category)}${qs ? `?${qs}` : ""}`;
    const actionKey = `getExploreCategoryPage:${mediaType.toLowerCase()}:${category.toLowerCase()}:${qs}`;
    const effectiveOptions: BoundedReadOptions = {
      ...options,
      userScope: options?.userScope ?? authApi.getToken() ?? "anon",
    };
    return cachedRead(`${effectiveOptions.userScope}:${actionKey}`, EXPLORE_PAGE_CACHE, (background) =>
      boundedRead(actionKey, (signal) => libraryRequest<ApiExploreCategoryPageResponse>(url, { signal }),
        background ? { ...effectiveOptions, signal: undefined } : effectiveOptions));
  },

  async refreshExploreCategory(mediaType: string, category: string): Promise<ApiSuggestionsResponse> {
    const response = await libraryRequest<ApiSuggestionsResponse>(
      `${API_BASE}/api/suggestions/explore/${encodeURIComponent(mediaType)}/${encodeURIComponent(category)}/refresh`,
      { method: "POST" },
    );
    if (!Array.isArray(response?.categories)) throw new Error("Could not refresh discovery. Retry.");
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

  /** "Not interested" (#40): permanently removes a movie from personal recommendations. Idempotent. */
  dismissPersonalRecommendation(tmdbId: number): Promise<void> {
    return sendDismissal("POST", tmdbId, "Could not remove the title. Try again.");
  },

  /** Undo of {@link moviesApi.dismissPersonalRecommendation}. Idempotent. */
  undoPersonalRecommendationDismissal(tmdbId: number): Promise<void> {
    return sendDismissal("DELETE", tmdbId, "Could not restore the title. Try again.");
  },

  /**
   * Fetch similar titles for a given movie/show from precomputed cosine similarity
   * with graceful fallback to TMDB recommendations. Responses are cached in sessionStorage.
   */
  getSimilarTitles(
    tmdbId: number,
    mediaType?: string,
    limit: number = 10,
  ): Promise<ApiMovieResponse[]> {
    return fetchSimilarTitles(API_BASE, tmdbId, mediaType, limit, getAuthHeaders);
  },

  /**
   * Fetch credits (cast members with character names and profile photos).
   */
  async getCredits(
    tmdbId: number,
    mediaType?: string,
  ): Promise<ApiCastMemberResponse[]> {
    if (!tmdbId || tmdbId <= 0) return [];
    try {
      const qs = mediaType ? `?mediaType=${encodeURIComponent(mediaType)}` : "";
      const res = await fetch(`${API_BASE}/api/movies/${tmdbId}/credits${qs}`, {
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

};

export interface ApiSuggestionMovieItem {
  tmdbId: number;
  title: string;
  posterUrl?: string;
  backdropUrl?: string;
  logoUrl?: string | null;
  releaseYear?: number;
  voteAverage?: number;
  voteCount?: number;
  imdbRating?: number;
  rottenTomatoesRating?: number;
  score?: number;
  reason?: string;
  mediaType?: string;
  /** Explore spotlight titles only (#26). */
  genres?: string[];
}

export interface ApiSuggestionCategory {
  state?: string;
  updatedAt?: string;
  limitations?: string[];
  id: string;
  title: string;
  movies: ApiSuggestionMovieItem[];
  hasMore?: boolean;
  totalEligibleInPool?: number;
  terminalReason?: string | null;
  underlyingLimit?: string | null;
}

export interface ApiSuggestionsResponse {
  categories: ApiSuggestionCategory[];
}

export interface ApiExploreCategoryPageResponse {
  sessionId?: string;
  mediaType: string;
  category: string;
  title: string;
  subtitle: string;
  state: "READY" | "STALE" | "UNAVAILABLE" | "EMPTY" | string;
  updatedAt?: string;
  movies: ApiSuggestionMovieItem[];
  cursor?: number;
  hasMore: boolean;
  terminalReason?: string | null;
  underlyingLimit?: string | null;
  totalEligibleInPool?: number;
}
