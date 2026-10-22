import { titleId } from "../store/titleIdentity";
import useWatchlistSave from "../hooks/useWatchlistSave"
import { useEffect, useRef, useState } from "react"
import { Link, matchPath, useRouter } from "../router"
import { useStore } from "../store/MovieStore"
import {
  friendsApi,
  type ApiFriendProfile,
  type ApiFriendLibraryEntry,
} from "../api/friends"
import type { Movie, Status } from "../store/data"
import AppShell from "../components/AppShell"
import MovieGrid from "../components/MovieGrid"
import SegmentedRadio from "../components/SegmentedRadio"
import { useEscapeKey, useBodyScrollLock } from "../hooks/useOverlay"
import { useToast } from "../components/Toast"

export default function FriendProfilePage() {
  const store = useStore()
  const { saveWatchlist } = useWatchlistSave()
  const { toast } = useToast()
  const { path, navigate } = useRouter()
  const params = matchPath("/friends/:id", path)
  const friendId = params?.id
  const viewGeneration = useRef(0)

  const [profile, setProfile] = useState<ApiFriendProfile | null>(null)
  const [backendMovies, setBackendMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [libraryEntries, setLibraryEntries] = useState<ApiFriendLibraryEntry[]>(
    [],
  )
  const [tab, setTab] = useState<Status>("watched")
  const [showConfirmRemove, setShowConfirmRemove] = useState(false)

  useEscapeKey(showConfirmRemove, () => setShowConfirmRemove(false))
  useBodyScrollLock(showConfirmRemove)

  // Fetch friend profile and their live library from backend
  useEffect(() => {
    if (!friendId) return

    let active = true
    viewGeneration.current += 1
    setLoading(true)

    setError(null)
    setProfile(null)
    setBackendMovies([])
    setLibraryEntries([])
    Promise.all([
      friendsApi.getFriendProfile(friendId),
      friendsApi.getFriendLibrary(
        friendId,
        tab === "watched" ? "WATCHED" : "WATCHLIST",
      ),
    ])
      .then(([friendProfile, entries]) => {
        if (!active) return
        setProfile(friendProfile)
        setLibraryEntries(entries)
        if (entries.length > 0) {
          const mapped: Movie[] = entries.map((item) => {
            const m = item.movie
            return {
              id: titleId(m.tmdbId, m.mediaType ?? "", m.id),
            catalogMovieId: m.id,
              tmdbId: m.tmdbId,
              title: m.title,
              year: m.releaseYear ?? null,
              posterSeed: null,
              posterUrl: m.posterUrl ?? null,
              imdb: m.imdbRating ?? null,
              rt: m.rottenTomatoesRating ?? null,
              overview: m.overview ?? "",
              genres: m.genres ? m.genres.split(",").map((g) => g.trim()) : [],
              director: m.director,
              trailerKey: m.trailerKey,
              mediaType: (m.mediaType ?? "MOVIE") as Movie["mediaType"],
            }
          })
          setBackendMovies(mapped)
        } else {
          setBackendMovies([])
        }
      })
      .catch((err) => {
        if (active) {
          setProfile(null)
          setBackendMovies([])
          setLibraryEntries([])
          setError(
            err instanceof Error
              ? err.message
              : "Could not load friend. Retry.",
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      viewGeneration.current += 1
    }
  }, [friendId, tab, store.currentUser?.id, retry])

  const displayName = profile?.displayName
  const username = profile?.username
  if (loading || error || !profile) {
    return (
      <AppShell>
        <Link to="/friends" className="text-sm text-text-muted">
          ← Back to Friends
        </Link>
        {loading ? (
          <p role="status" className="mt-8 text-text-muted">
            Loading friend library…
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
  const watchedCount = profile.watchedCount
  const watchlistCount = profile.watchlistCount
  const avgRating = profile.avgRating
  const displayMovies = backendMovies

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

  const referrerPath = `/friends/${friendId}`

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <Link
          to="/friends"
          className="text-sm text-text-muted transition-colors hover:text-white"
        >
          ← Back to Friends
        </Link>
        <div className="flex items-center gap-4">
          <span className="nums text-sm font-medium text-text-muted">
            {displayName}
            {avgRating != null && ` · avg ${avgRating.toFixed(1)}`}
          </span>

          {profile && (
            <button
              type="button"
              onClick={() => setShowConfirmRemove(true)}
              className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-danger/80 transition-colors hover:border-danger/30 hover:bg-danger/10 hover:text-danger"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Profile Header Card */}
      <div className="mt-6 flex items-center gap-4 rounded-xl border border-white/10 bg-surface/60 p-5 shadow-lg backdrop-blur-md">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/20 text-xl font-black text-accent shadow-inner">
          {displayName ? displayName.charAt(0).toUpperCase() : "?"}
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            {displayName}
          </h1>
          <p className="text-xs text-text-muted">@{username}</p>
        </div>
      </div>

      {/* Segmented Radio Tabs */}
      <div className="mt-6">
        <SegmentedRadio
          name="friend_tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: "watched", label: "Watched", count: watchedCount },
            { value: "watchlist", label: "Watchlist", count: watchlistCount },
          ]}
        />
      </div>

      <p className="mt-4 text-sm text-text-muted">
        Viewing status and ratings are shared. Notes stay private.
      </p>
      {tab === "watched" && libraryEntries.length > 0 && (
        <ul
          aria-label="Personal ratings"
          className="nums mt-4 space-y-2 text-sm text-text-primary"
        >
          {libraryEntries.map((entry) => (
            <li key={entry.id}>
              {entry.movie.title}:{" "}
              {entry.personalRating == null
                ? "Unrated"
                : entry.personalRating.toFixed(1)}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-8">
        {loading && displayMovies.length === 0 ? (
          <div className="flex min-h-[30vh] flex-col items-center justify-center text-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="mt-3 text-xs text-text-muted">
              Loading friend library...
            </p>
          </div>
        ) : (
          <MovieGrid
            movies={displayMovies}
            empty={`${displayName || "This user"} has nothing on their ${tab} list yet.`}
            referrerOverride={referrerPath}
            showAddToWatchlist
            onAddToWatchlist={saveWatchlist}
            userHasMovie={userHasMovie}
          />
        )}
      </div>

      {/* Remove Friend Confirmation Modal */}
      {showConfirmRemove && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Remove ${displayName}?`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-xl border border-white/15 bg-[#0e1320] p-6 shadow-2xl">
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
