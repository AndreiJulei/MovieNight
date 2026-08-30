import { useMemo, useState } from "react";
import { Link } from "../router";
import { useStore } from "../store/MovieStore";
import AppShell from "../components/AppShell";
import AnimatedSearchInput from "../components/AnimatedSearchInput";

export default function FriendsPage() {
  const store = useStore();
  const user = store.currentUser!;
  const [query, setQuery] = useState("");

  const friends = store.friendsOf(user.id);
  const friendIds = new Set(friends.map((f) => f.id));

  const match = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return (
      store.users.find(
        (u) =>
          u.id !== user.id &&
          !friendIds.has(u.id) &&
          u.displayName.toLowerCase() === q,
      ) ?? "none"
    );
  }, [query, store.users, user.id, friendIds]);

  return (
    <AppShell>
      <div className="mx-auto max-w-[620px]">
        <h1 className="text-2xl font-bold tracking-tight text-white">Friends</h1>
        <p className="mt-1 text-sm text-text-muted">
          Connect with movie lovers to share reels and ratings.
        </p>

        <div className="mt-6">
          <AnimatedSearchInput
            label="Add a friend by display name…"
            value={query}
            onChange={setQuery}
          />

          {query.trim() && match === "none" && (
            <p className="mt-2 text-sm text-text-muted">No one found with that display name.</p>
          )}

          {match && match !== "none" && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
              <div>
                <span className="font-bold text-white">{match.displayName}</span>
                <p className="text-xs text-text-muted">@{match.username}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  store.addFriend(match.id);
                  setQuery("");
                }}
                className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-accent/90 active:scale-95"
              >
                + Add Friend
              </button>
            </div>
          )}

          <div className="mt-8">
            {friends.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/25 p-8 text-center">
                <p className="text-sm text-text-muted">
                  No friends yet. Search a display name above to connect.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-surface/60 backdrop-blur-md">
                {friends.map((f) => {
                  const watched = store.stats(f.id, "watched");
                  const towatch = store.stats(f.id, "watchlist").count;
                  return (
                    <li key={f.id}>
                      <Link
                        to={`/friends/${f.id}`}
                        className="group flex items-center justify-between px-5 py-4 transition-all hover:bg-white/[0.04]"
                      >
                        <div>
                          <span className="font-semibold text-text-primary transition-colors group-hover:text-accent">
                            {f.displayName}
                          </span>
                          <span className="ml-2 text-xs text-text-muted">@{f.username}</span>
                        </div>
                        <span className="nums text-xs font-medium text-text-muted">
                          {watched.count} watched · {towatch} to watch
                          {watched.avg != null && ` · avg ${watched.avg.toFixed(1)}`}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="mt-6 text-xs text-text-muted">
            Try adding <span className="font-semibold text-white">Marcus</span>.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
