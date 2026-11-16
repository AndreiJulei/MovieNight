import useWatchlistSave from "../hooks/useWatchlistSave"
import { useCallback, useEffect, useRef, useState } from "react"
import { Link, matchPath, useRouter } from "../router"
import { useStore } from "../store/MovieStore"
import { friendsApi, type ApiFriendProfile } from "../api/friends"
import type { ApiCustomListSummaryResponse } from "../api/lists"
import AppShell from "../components/AppShell"
import ProfileView, { type ProfileTabContent } from "../components/ProfileView"
import { friendLibraryCardCaption } from "../components/libraryCard"
import { loadCustomListTab, movieFromApi } from "../components/profileMovies"
import type { ProfileTab } from "../components/profileLogic"
import { useEscapeKey, useBodyScrollLock, useOverlayFocus } from "../hooks/useOverlay"
import { useToast } from "../components/Toast"

/**
 * A friend's profile (#33): avatar, highlighted rank badge, username and the lists they share.
 * Friends never see the XP bar, Settings or list sharing controls (PF01).
 */
export default function FriendProfilePage() {
  const store = useStore()
  const { saveWatchlist } = useWatchlistSave()
  const { toast } = useToast()
  const { path, navigate } = useRouter()
  const params = matchPath("/friends/:id", path)
  const friendId = params?.id
  const viewGeneration = useRef(0)

  const [profile, setProfile] = useState<ApiFriendProfile | null>(null)
  const [lists, setLists] = useState<ApiCustomListSummaryResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [showConfirmRemove, setShowConfirmRemove] = useState(false)

  const removeDialogRef = useRef<HTMLDivElement>(null)
  useOverlayFocus(showConfirmRemove, removeDialogRef, true)

  useEscapeKey(showConfirmRemove, () => setShowConfirmRemove(false))
  useBodyScrollLock(showConfirmRemove)

  useEffect(() => {
    if (!friendId) return
    let active = true
    viewGeneration.current += 1
    setLoading(true)
    setError(null)
    setProfile(null)
    setLists([])
    Promise.all([friendsApi.getFriendProfile(friendId), friendsApi.getFriendLists(friendId)])
      .then(([friendProfile, sharedLists]) => {
        if (!active) return
        setProfile(friendProfile)
        setLists(sharedLists)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load friend. Retry.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      viewGeneration.current += 1
    }
  }, [friendId, store.currentUser?.id, retry])

  const loadTab = useCallback(async (tab: ProfileTab): Promise<ProfileTabContent> => {
    if (!friendId) return { movies: [] }
    if (tab.kind === "custom") return loadCustomListTab(tab.listId!)
    const status = tab.kind
    const entries = await friendsApi.getFriendLibrary(friendId, status === "watched" ? "WATCHED" : "WATCHLIST")
    const movies = entries.map((entry) => movieFromApi(entry.movie))
    const ratings = new Map(movies.map((movie, i) => [movie.id, entries[i].personalRating ?? null]))
    return {
      movies,
      captionFor: (movie) =>
        friendLibraryCardCaption(status, { year: movie.year, friendRating: ratings.get(movie.id), tmdbRating: movie.tmdbRating }),
    }
  }, [friendId])

  const displayName = profile?.displayName
  if (loading || error || !profile) {
    return (
      <AppShell width="wide">
        <Link to="/friends" className="prose-link text-sm text-text-muted">
          ← Back to Friends
        </Link>
        {loading ? (
          <p role="status" className="mt-8 text-text-muted">
            Loading friend profile…
          </p>
        ) : (
          <div className="mt-8">
            <p role="alert" className="text-danger">
              {error || "This friend is unavailable."}
            </p>
            <button
              className="mt-4 rounded-md border border-white/15 px-4 py-2 text-white"
              onClick={() => setRetry((r) => r + 1)}
            >
              Retry loading
            </button>
          </div>
        )}
      </AppShell>
    )
  }

  // Check if current user already has a movie in any list
  const userHasMovie = (movieId: string) => {
    if (!store.currentUser) return false
    return !!store.entryFor(store.currentUser.id, movieId)
  }

  const handleRemoveFriend = async () => {
    if (!friendId) return
    const generation = viewGeneration.current
    const result = await store.removeFriend(friendId)
    if (viewGeneration.current !== generation) return
    if (!result.ok) {
      toast({
        message: result.error || "Could not remove friend. Retry.",
        type: "error",
      })
      return
    }
    setShowConfirmRemove(false)
    toast({
      message: result.warning || `Removed ${displayName ?? "friend"} from friends`,
      type: "info",
    })
    navigate("/friends")
  }

  return (
    <AppShell width="wide">
      <Link
        to="/friends"
        className="prose-link mb-4 inline-block text-sm text-text-muted transition-colors hover:text-white"
      >
        ← Back to Friends
      </Link>
      <ProfileView
        owner={false}
        displayName={profile.displayName}
        username={profile.username}
        avatar={profile.avatar}
        rank={profile.rank}
        sharing={{
          sharesWatchlist: profile.sharesWatchlist ?? true,
          sharesWatched: profile.sharesWatched ?? true,
          lists: lists.map((list) => ({ id: list.id, title: list.title, shared: true })),
        }}
        loadTab={loadTab}
        headerAction={
          <button
            type="button"
            onClick={() => setShowConfirmRemove(true)}
            className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-danger/80 transition-colors hover:border-danger/30 hover:bg-danger/10 hover:text-danger"
          >
            Remove
          </button>
        }
        gridProps={{
          referrerOverride: `/friends/${friendId}`,
          showAddToWatchlist: true,
          onAddToWatchlist: saveWatchlist,
          userHasMovie,
        }}
      />

      {/* Remove Friend Confirmation Modal */}
      {showConfirmRemove && (
        <div
          ref={removeDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`Remove ${displayName}?`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-xl border border-white/15 bg-[#0e1320] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-text-primary">
              Remove {displayName}?
            </h3>
            <p className="mt-2 text-xs text-text-muted leading-relaxed">
              Are you sure you want to remove {displayName} from your friends
              list? You can send a new invitation later; they will need to
              accept it.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmRemove(false)}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-white/[0.08] hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={store.friendsSaving}
                onClick={() => void handleRemoveFriend()}
                className="rounded-lg border border-danger/40 bg-danger/20 px-3.5 py-1.5 text-xs font-semibold text-danger transition-all hover:bg-danger/30 hover:shadow-[0_0_12px_rgba(239,68,68,0.4)]"
              >
                {store.friendsSaving ? "Removing…" : "Remove Friend"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
