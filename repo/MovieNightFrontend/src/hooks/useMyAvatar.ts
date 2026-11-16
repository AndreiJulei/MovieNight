import { useEffect, useSyncExternalStore } from "react"
import { profileApi, type ApiAvatar } from "../api/profile"

// One cached avatar for the signed-in user, shared by the nav, Profile and Settings (#33).
let cache: { userId: string; avatar: ApiAvatar | null } | null = null
let pending: string | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/** Record a server-confirmed avatar (after loading progress or choosing one). */
export function setMyAvatar(userId: string, avatar: ApiAvatar | null) {
  cache = { userId, avatar }
  notify()
}

export default function useMyAvatar(userId: string | undefined): ApiAvatar | null {
  const snapshot = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    () => cache,
  )
  useEffect(() => {
    if (!userId || cache?.userId === userId || pending === userId) return
    pending = userId
    // The default initial shows until (or if) this read succeeds.
    profileApi.getProgress()
      .then((progress) => { if (pending === userId) setMyAvatar(userId, progress.avatar) })
      .catch(() => {})
      .finally(() => { if (pending === userId) pending = null })
  }, [userId])
  return snapshot && snapshot.userId === userId ? snapshot.avatar : null
}
