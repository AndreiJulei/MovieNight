import { useCallback, useEffect, useState } from "react"
import AppShell from "../components/AppShell"
import ProfileView, { type ProfileTabContent } from "../components/ProfileView"
import { libraryCardCaption } from "../components/libraryCard"
import { loadCustomListTab } from "../components/profileMovies"
import type { ProfileTab } from "../components/profileLogic"
import { useToast } from "../components/Toast"
import { authApi } from "../api/auth"
import { listsApi, type ApiCustomListSummaryResponse } from "../api/lists"
import { profileApi, type ApiProgress } from "../api/profile"
import type { Movie, Status } from "../store/data"
import { useStore } from "../store/MovieStore"
import { setMyAvatar } from "../hooks/useMyAvatar"

/** The signed-in user's profile (#33): avatar, rank, XP bar and the lists they share. */
export default function ProfilePage() {
  const store = useStore()
  const { toast } = useToast()
  const user = store.currentUser
  const [progress, setProgress] = useState<ApiProgress | null>(null)
  const [lists, setLists] = useState<ApiCustomListSummaryResponse[]>([])
  const [flags, setFlags] = useState<{ sharesWatchlist: boolean; sharesWatched: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    setError(null)
    Promise.all([profileApi.getProgress(), listsApi.getUserLists(), authApi.currentProfile()])
      .then(([nextProgress, nextLists, me]) => {
        if (!active) return
        if (!me) throw new Error("Your session expired. Sign in again, then retry.")
        setProgress(nextProgress)
        if (user) setMyAvatar(user.id, nextProgress.avatar)
        setLists(nextLists)
        setFlags({ sharesWatchlist: me.sharesWatchlist ?? true, sharesWatched: me.sharesWatched ?? true })
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load your profile. Retry.") })
    return () => { active = false }
  }, [retry, user?.id])

  const { entriesFor, movieById } = store
  const loadTab = useCallback(async (tab: ProfileTab): Promise<ProfileTabContent> => {
    if (tab.kind === "custom") return loadCustomListTab(tab.listId!)
    if (!user) return { movies: [] }
    const status: Status = tab.kind
    const entries = entriesFor(user.id, status)
    const ratings = new Map(entries.map((entry) => [entry.movieId, entry.rating]))
    const movies = entries.map((entry) => movieById(entry.movieId)).filter((movie): movie is Movie => Boolean(movie))
    return {
      movies,
      captionFor: (movie) => libraryCardCaption(status, { rating: ratings.get(movie.id), year: movie.year }),
    }
  }, [user, entriesFor, movieById])

  const setShared = async (tab: ProfileTab, shared: boolean) => {
    setBusy(true)
    try {
      if (tab.kind === "custom") {
        const updated = await listsApi.setShared(tab.listId!, shared)
        setLists((previous) => previous.map((list) => (list.id === updated.id ? { ...list, shared: updated.shared } : list)))
      } else {
        const key = tab.kind === "watched" ? "sharesWatched" : "sharesWatchlist"
        const result = await store.updateSharing({ [key]: shared })
        if (!result.ok) throw new Error(result.error || "Could not update sharing. Retry.")
        setFlags((previous) => (previous ? { ...previous, [key]: shared } : previous))
      }
      toast({ message: shared ? `${tab.label} is now shared with friends` : `${tab.label} is hidden from friends`, type: "success" })
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Could not update sharing. Retry.", type: "error" })
    } finally {
      setBusy(false)
    }
  }

  if (!user) return null
  if (error || !progress || !flags) {
    return (
      <AppShell width="wide">
        {error ? (
          <div className="py-10">
            <h1 className="text-2xl font-bold text-white">Profile</h1>
            <p role="alert" className="mt-3 text-danger">{error}</p>
            <button type="button" onClick={() => setRetry((r) => r + 1)} className="mt-4 rounded-md border border-white/15 px-4 py-2 text-white">
              Retry loading
            </button>
          </div>
        ) : (
          <p role="status" className="py-16 text-center text-text-muted">Loading your profile…</p>
        )}
      </AppShell>
    )
  }

  return (
    <AppShell width="wide">
      <ProfileView
        owner
        displayName={user.displayName}
        username={user.username}
        avatar={progress.avatar}
        rank={progress.rank}
        progress={progress}
        sharing={{ ...flags, lists: lists.map((list) => ({ id: list.id, title: list.title, shared: list.shared })) }}
        loadTab={loadTab}
        onShare={(tab) => void setShared(tab, true)}
        onStopSharing={(tab) => void setShared(tab, false)}
        sharingBusy={busy}
        gridProps={{ referrerOverride: "/profile" }}
        reloadKey={store.allEntries().length}
      />
    </AppShell>
  )
}
