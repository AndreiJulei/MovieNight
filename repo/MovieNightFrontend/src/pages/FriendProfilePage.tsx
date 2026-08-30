import { useState } from "react";
import { Link, matchPath, useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import type { Movie, Status } from "../store/data";
import AppShell from "../components/AppShell";
import MovieGrid from "../components/MovieGrid";
import SegmentedRadio from "../components/SegmentedRadio";

export default function FriendProfilePage() {
  const store = useStore();
  const { path, navigate } = useRouter();
  const params = matchPath("/friends/:id", path);
  const friend = params ? store.users.find((u) => u.id === params.id) : undefined;
  const [tab, setTab] = useState<Status>("watched");
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);

  if (!friend) {
    return (
      <AppShell>
        <Link to="/friends" className="text-sm text-text-muted hover:text-text-primary">
          ← Back to Friends
        </Link>
        <p className="mt-8 text-text-muted">That friend couldn&apos;t be found.</p>
      </AppShell>
    );
  }

  const isFriend = store.currentUser
    ? store.friendsOf(store.currentUser.id).some((f) => f.id === friend.id)
    : false;

  const watchedStats = store.stats(friend.id, "watched");
  const watchlistCount = store.stats(friend.id, "watchlist").count;

  const friendEntries = store.entriesFor(friend.id, tab);
  const movies: Movie[] = friendEntries
    .map((e) => store.movieById(e.movieId)!)
    .filter(Boolean);

  // Check if current user already has a movie in any list
  const userHasMovie = (movieId: string) => {
    if (!store.currentUser) return false;
    return !!store.entryFor(store.currentUser.id, movieId);
  };

  const handleRemoveFriend = () => {
    store.removeFriend(friend.id);
    setShowConfirmRemove(false);
    navigate("/friends");
  };

  // The referrer path for this friend's profile so back-nav works correctly
  const referrerPath = `/friends/${friend.id}`;

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
            {friend.displayName}
            {watchedStats.avg != null && ` · avg ${watchedStats.avg.toFixed(1)}`}
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

      {/* Segmented Radio Tabs */}
      <div className="mt-6">
        <SegmentedRadio
          name="friend_tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: "watched", label: "Watched", count: watchedStats.count },
            { value: "watchlist", label: "Watchlist", count: watchlistCount },
          ]}
        />
      </div>

      <div className="mt-8">
        <MovieGrid
          movies={movies}
          empty={`${friend.displayName} has nothing on this list yet.`}
          referrerOverride={referrerPath}
          showAddToWatchlist
          onAddToWatchlist={(movieId) => {
            store.addToWatchlist(movieId);
          }}
          userHasMovie={userHasMovie}
        />
      </div>

      {/* Remove Friend Confirmation Modal */}
      {showConfirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-white/15 bg-[#0e1320] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-text-primary">
              Remove {friend.displayName}?
            </h3>
            <p className="mt-2 text-xs text-text-muted leading-relaxed">
              Are you sure you want to remove {friend.displayName} from your friends list? You can always add them back later.
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
