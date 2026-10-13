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
  isPublic?: boolean;
  initialMovieIds?: number[];
}

export interface ApiUpdateCustomListRequest {
  title?: string;
  description?: string;
  isPublic?: boolean;
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

export const listsApi = {
  /**
   * Fetch all custom lists for authenticated user.
   */
  async getUserLists(): Promise<ApiCustomListSummaryResponse[]> {
    try {
      const res = await fetch(`${API_BASE}/api/lists`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn("Failed to fetch user lists from backend:", err);
      return [];
    }
  },

  /**
   * Fetch all public custom lists.
   */
  async getPublicLists(): Promise<ApiCustomListSummaryResponse[]> {
    try {
      const res = await fetch(`${API_BASE}/api/lists/public`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn("Failed to fetch public lists from backend:", err);
      return [];
    }
  },

  /**
   * Fetch list details by ID with full movie entries.
   */
  async getListById(id: number | string): Promise<ApiCustomListResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/lists/${id}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error(`Failed to fetch list ${id}:`, err);
      return null;
    }
  },

  /**
   * Create a new custom list.
   */
  async createList(req: ApiCreateCustomListRequest): Promise<ApiCustomListResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/lists`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(req),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error("Failed to create list:", err);
      return null;
    }
  },

  /**
   * Update list metadata.
   */
  async updateList(
    id: number | string,
    req: ApiUpdateCustomListRequest
  ): Promise<ApiCustomListResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/lists/${id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(req),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error(`Failed to update list ${id}:`, err);
      return null;
    }
  },

  /**
   * Delete custom list.
   */
  async deleteList(id: number | string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/api/lists/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      return res.ok;
    } catch (err) {
      console.error(`Failed to delete list ${id}:`, err);
      return false;
    }
  },

  /**
   * Add movie to custom list.
   */
  async addMovieToList(
    listId: number | string,
    movieId: number,
    position?: number
  ): Promise<ApiCustomListResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/lists/${listId}/movies`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ movieId, position }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error(`Failed to add movie ${movieId} to list ${listId}:`, err);
      return null;
    }
  },

  /**
   * Remove movie from custom list.
   */
  async removeMovieFromList(
    listId: number | string,
    movieId: number | string
  ): Promise<ApiCustomListResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/lists/${listId}/movies/${movieId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error(`Failed to remove movie ${movieId} from list ${listId}:`, err);
      return null;
    }
  },

  /**
   * Reorder movies in custom list.
   */
  async reorderMovies(
    listId: number | string,
    orderedMovieIds: number[]
  ): Promise<ApiCustomListResponse | null> {
    try {
      const res = await fetch(`${API_BASE}/api/lists/${listId}/reorder`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ orderedMovieIds }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error(`Failed to reorder movies in list ${listId}:`, err);
      return null;
    }
  },
};
