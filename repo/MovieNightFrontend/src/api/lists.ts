import { authApi } from "./auth";
import type { ApiMovieResponse } from "./movies";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export interface ApiCustomListEntryResponse {
  id: number;
  movie: ApiMovieResponse;
  position: number;
  addedAt: string;
}

export interface ApiCustomListResponse {
  id: number;
  userId: number;
  username: string;
  displayName: string;
  title: string;
  description?: string | null;
  isPublic: boolean;
  movieCount: number;
  entries: ApiCustomListEntryResponse[];
  createdAt: string;
  updatedAt?: string | null;
}

export interface ApiCustomListSummaryResponse {
  id: number;
  userId: number;
  username: string;
  displayName: string;
  title: string;
  description?: string | null;
  isPublic: boolean;
  movieCount: number;
  previewPosterUrls: string[];
  createdAt: string;
  updatedAt?: string | null;
}

export interface ApiCreateCustomListRequest {
  title: string;
  description?: string;
  initialMovieIds?: number[];
}

export interface ApiUpdateCustomListRequest {
  title?: string;
  description?: string;
}

// Failures must remain distinguishable from an empty list or confirmed write.
async function listRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authApi.getToken() ?? ""}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Your session could not be verified. Sign in again and retry.");
      }
      if (response.status === 404) throw new Error("This list or movie is unavailable. Reload your lists and try again.");
      if (response.status === 400) {
        if (path.startsWith("/api/movies/")) throw new Error("This movie could not be resolved safely. A conflicting TV identity may already be saved.");
        throw new Error("Could not save. Use a 1–150 character list title and a supported movie, then try again.");
      }
      throw new Error("The server could not confirm your lists. Please try again.");
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
      throw new Error("Confirmation timed out. Reload your lists before retrying; the change may have saved.");
    }
    if (error instanceof TypeError) throw new Error("Could not reach your lists. Check your connection and try again.");
    throw error;
  }
}

function confirmedList(list: ApiCustomListResponse) {
  if (!list?.id || !list.userId || !list.title || !Array.isArray(list.entries) ||
      list.entries.some((entry) => !entry.movie?.id || !entry.movie.title)) {
    throw new Error("Could not confirm this list. Reload your lists and try again.");
  }
  return list;
}

export const listsApi = {
  async getUserLists(): Promise<ApiCustomListSummaryResponse[]> {
    const lists = await listRequest<ApiCustomListSummaryResponse[]>("/api/lists");
    if (!Array.isArray(lists)) throw new Error("Could not read your lists. Please try again.");
    return lists;
  },
  async getListById(id: number | string): Promise<ApiCustomListResponse> {
    return confirmedList(await listRequest(`/api/lists/${id}`));
  },
  async createList(req: ApiCreateCustomListRequest): Promise<ApiCustomListResponse> {
    return confirmedList(await listRequest("/api/lists", { method: "POST", body: JSON.stringify(req) }));
  },
  async updateList(id: string, req: ApiUpdateCustomListRequest): Promise<ApiCustomListResponse> {
    return confirmedList(await listRequest(`/api/lists/${id}`, { method: "PUT", body: JSON.stringify(req) }));
  },
  async deleteList(id: string): Promise<void> {
    await listRequest(`/api/lists/${id}`, { method: "DELETE" });
  },
  async addMovieToList(listId: string, movieId: number): Promise<ApiCustomListResponse> {
    return confirmedList(await listRequest(`/api/lists/${listId}/movies`, {
      method: "POST", body: JSON.stringify({ movieId }),
    }));
  },
  async removeMovieFromList(listId: string, movieId: number): Promise<ApiCustomListResponse> {
    return confirmedList(await listRequest(`/api/lists/${listId}/movies/${movieId}`, { method: "DELETE" }));
  },
  async resolveCatalogMovie(tmdbId: number): Promise<number> {
    const movie = await listRequest<ApiMovieResponse>(`/api/movies/tmdb/${tmdbId}?mediaType=MOVIE`);
    if (!movie?.id || movie.tmdbId !== tmdbId || movie.mediaType !== "MOVIE") throw new Error("Could not find this movie in the catalog. Please try again.");
    return movie.id;
  },
};
