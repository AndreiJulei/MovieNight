import { authApi } from "./auth"
import type { ApiUserMovieEntryResponse } from "./movies"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080"
export interface ApiFriendProfile {
  id: number
  username: string
  displayName: string
  watchedCount: number
  watchlistCount: number
  avgRating: number | null
  createdAt?: string
}
export interface ApiFriendInvitation {
  senderId: number
  senderUsername: string
  senderDisplayName: string
  recipientId: number
  recipientUsername: string
  recipientDisplayName: string
}
// The server's friend DTO intentionally omits private notes.
export type ApiFriendLibraryEntry = Omit<ApiUserMovieEntryResponse, "notes">

async function friendRequest<T>(
  path: string,
  method = "GET",
  body?: object,
): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}/api/friends${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authApi.getToken() ?? ""}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      if (res.status === 401) throw new Error("Sign in again, then retry.")
      if (res.status === 403)
        throw new Error(
          "Access unavailable. Only accepted friends can share libraries. Reload and try again.",
        )
      if (res.status === 400) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          data.message || "Check the account identifier and try again.",
        )
      }
      throw new Error(
        "Could not confirm the change or load friends. Please retry.",
      )
    }
    return (await res.json()) as T
  } catch (error) {
    if (
      error instanceof Error &&
      ["AbortError", "TimeoutError"].includes(error.name)
    ) {
      throw new Error(
        "Confirmation timed out. Reload before retrying; the change may have saved.",
      )
    }
    if (error instanceof TypeError)
      throw new Error(
        "Could not reach friends. Check your connection and retry.",
      )
    throw error
  }
}
export const friendsApi = {
  getFriends: () => friendRequest<ApiFriendProfile[]>(""),
  getInvitations: () => friendRequest<ApiFriendInvitation[]>("/invitations"),
  async addFriend(identifier: string): Promise<ApiFriendInvitation> {
    const invitation = await friendRequest<ApiFriendInvitation>(
      "/add",
      "POST",
      { identifier },
    )
    if (!invitation?.senderId || !invitation.recipientId)
      throw new Error(
        "Could not confirm invitation. Reload friends before retrying.",
      )
    return invitation
  },
  async acceptFriend(senderId: string | number): Promise<ApiFriendProfile> {
    const profile = await friendRequest<ApiFriendProfile>(
      `/${senderId}/accept`,
      "POST",
    )
    if (!profile?.id || !profile.username)
      throw new Error(
        "Could not confirm acceptance. Reload friends before retrying.",
      )
    return profile
  },
  removeFriend: (id: string | number) =>
    friendRequest<{ message: string }>(`/${id}`, "DELETE"),
  getFriendProfile: (id: string | number) =>
    friendRequest<ApiFriendProfile>(`/${id}/profile`),
  getFriendLibrary: (id: string | number, status?: "WATCHED" | "WATCHLIST") =>
    friendRequest<ApiFriendLibraryEntry[]>(
      `/${id}/library${status ? `?status=${status}` : ""}`,
    ),
}
