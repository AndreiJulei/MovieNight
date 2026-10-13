import { useEffect, useState } from "react";
import { Link, matchPath, useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import { friendsApi, type ApiFriendProfile } from "../api/friends";
import type { ApiUserMovieEntryResponse } from "../api/movies";
import type { Movie, Status } from "../store/data";
import AppShell from "../components/AppShell";
import MovieGrid from "../components/MovieGrid";
import SegmentedRadio from "../components/SegmentedRadio";
import { useEscapeKey, useBodyScrollLock } from "../hooks/useOverlay";
import { useToast } from "../components/Toast";

export default function FriendProfilePage() {
  const store = useStore();
  const { toast } = useToast();
  const { path, navigate } = useRouter();
  const params = matchPath("/friends/:id", path);
  const friendId = params?.id;

  const localFriend = friendId ? store.users.find((u) => u.id === friendId) : undefined;
  const [profile, setProfile] = useState<ApiFriendProfile | null>(null);
  const [backendMovies, setBackendMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Status>("watched");
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);

  useEscapeKey(showConfirmRemove, () => setShowConfirmRemove(false));
  useBodyScrollLock(showConfirmRemove);

  // Fetch friend profile and their live library from backend
  useEffect(() => {
    if (!friendId) return;

    let active = true;
    setLoading(true);

    // 1. Fetch friend profile stats
    friendsApi.getFriendProfile(friendId).then((res) => {
      if (active && res) {
        setProfile(res);
      }
    });

    // 2. Fetch friend's library for current tab
    friendsApi
      .getFriendLibrary(friendId, tab === "watched" ? "WATCHED" : "WATCHLIST")
      .then((entries: ApiUserMovieEntryResponse[]) => {
        if (!active) return;
        if (entries && entries.length > 0) {
          const mapped: Movie[] = entries.map((item) => {
            const m = item.movie;
            return {
              id: String(m.id ?? m.tmdbId),
              tmdbId: m.tmdbId,
              title: m.title,
              year: m.releaseYear ?? 2020,
              posterSeed: null,
              posterUrl: m.posterUrl ?? null,
              imdb: m.imdbRating ?? null,
              rt: m.rottenTomatoesRating ?? null,
              overview: m.overview ?? "",
              genres: m.genres ? m.genres.split(",").map((g) => g.trim()) : [],
              director: m.director,
              trailerKey: m.trailerKey,
              mediaType: "MOVIE" as const,
            };
          });
          setBackendMovies(mapped);
        } else {
          setBackendMovies([]);
        }
      })
      .catch((err) => console.warn("Failed to fetch friend library:", err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [friendId, tab]);

  const displayName = profile?.displayName || localFriend?.displayName;
  const username = profile?.username || localFriend?.username;

  if (!localFriend && !profile && !loading) {
    return (
      <AppShell>
        <Link to="/friends" className="text-sm text-text-muted hover:text-text-primary">
          ← Back to Friends
        </Link>
        <p className="mt-8 text-text-muted">That friend couldn&apos;t be found.</p>
      </AppShell>
    );
  }

  const isFriend = store.currentUser && friendId
    ? store.friendsOf(store.currentUser.id).some((f) => f.id === friendId)
    : false;

  // Compute stats from backend profile or local store
  const watchedCount = profile?.watchedCount ?? (localFriend ? store.stats(localFriend.id, "watched").count : 0);
  const watchlistCount = profile?.watchlistCount ?? (localFriend ? store.stats(localFriend.id, "watchlist").count : 0);
  const avgRating = profile?.avgRating ?? (localFriend ? store.stats(localFriend.id, "watched").avg : null);

  // Compute movies: use backend movies if available, else local store entries
  const localFriendEntries = localFriend ? store.entriesFor(localFriend.id, tab) : [];
  const localMovies: Movie[] = localFriendEntries
    .map((e) => store.movieById(e.movieId)!)
    .filter(Boolean);

  const displayMovies = backendMovies.length > 0 ? backendMovies : localMovies;

  // Check if current user already has a movie in any list
  const userHasMovie = (movieId: string) => {
    if (!store.currentUser) return false;
    return !!store.entryFor(store.currentUser.id, movieId);
  };

  const handleRemoveFriend = () => {
    if (friendId) {
      store.removeFriend(friendId);
      setShowConfirmRemove(false);
      toast({ message: `Removed ${displayName ?? "friend"} from friends`, type: "info" });
      navigate("/friends");
    }
  };

  const referrerPath = `/friends/${friendId}`;

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

          {isFriend && (
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
          <h1 className="text-xl font-bold tracking-tight text-white">{displayName}</h1>
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

      <div className="mt-8">
        {loading && displayMovies.length === 0 ? (
          <div className="flex min-h-[30vh] flex-col items-center justify-center text-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="mt-3 text-xs text-text-muted">Loading friend library...</p>
          </div>
        ) : (
          <MovieGrid
            movies={displayMovies}
            empty={`${displayName || "This user"} has nothing on their ${tab} list yet.`}
            referrerOverride={referrerPath}
            showAddToWatchlist
            onAddToWatchlist={(movieId) => {
              const movieObj = displayMovies.find((dm) => dm.id === movieId);
              store.addToWatchlist(movieId, movieObj);
              const m = movieObj || store.movieById(movieId);
              toast({
                message: `"${m?.title ?? "Title"}" added to Watchlist`,
                type: "success",
                onUndo: () => store.removeFromWatchlist(movieId),
              });
            }}
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
              Are you sure you want to remove {displayName} from your friends list? You can always add them back later.
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
                onClick={handleRemoveFriend}
                className="rounded-lg border border-danger/40 bg-danger/20 px-3.5 py-1.5 text-xs font-semibold text-danger transition-all hover:bg-danger/30 hover:shadow-[0_0_12px_rgba(239,68,68,0.4)]"
              >
                Remove Friend
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
