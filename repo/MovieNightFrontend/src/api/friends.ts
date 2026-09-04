import { authApi } from "./auth";
import type { ApiUserMovieEntryResponse } from "./movies";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export interface ApiFriendProfile {
  id: number;
  username: string;
  displayName: string;
  watchedCount: number;
  watchlistCount: number;
  avgRating: number | null;
  createdAt?: string;
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

export const friendsApi = {
  /**
   * Get all friends of the current authenticated user with their movie stats.
   */
  async getFriends(): Promise<ApiFriendProfile[]> {
    try {
      const res = await fetch(`${API_BASE}/api/friends`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn("Failed to fetch friends from backend:", err);
      return [];
    }
  },

  /**
   * Add a friend by username or display name.
   */
  async addFriend(
    identifier: string,
  ): Promise<{ ok: boolean; friend?: ApiFriendProfile; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/api/friends/add`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.message || "Could not add friend." };
      }
      return { ok: true, friend: data };
    } catch {
      return { ok: false, error: "Network error. Is the backend running?" };
    }
  },

  /**
   * Remove a friend.
   */
  async removeFriend(friendId: number | string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/api/friends/${friendId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      return res.ok;
    } catch (err) {
      console.error(`Failed to remove friend ${friendId}:`, err);
      return false;
    }
  },

  /**
   * Fetch a friend's movie library (optionally filtered by WATCHED or WATCHLIST).
   */
  async getFriendLibrary(
    friendId: number | string,
    status?: "WATCHED" | "WATCHLIST",
  ): Promise<ApiUserMovieEntryResponse[]> {
    try {
      const url = status
        ? `${API_BASE}/api/friends/${friendId}/library?status=${status}`
        : `${API_BASE}/api/friends/${friendId}/library`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn(`Failed to fetch library for friend ${friendId}:`, err);
      return [];
    }
  },

  /**
   * Fetch a specific friend's profile with stats.
   */
  async getFriendProfile(friendId: number | string): Promise<ApiFriendProfile | null> {
    try {
      const res = await fetch(`${API_BASE}/api/friends/${friendId}/profile`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },
};
