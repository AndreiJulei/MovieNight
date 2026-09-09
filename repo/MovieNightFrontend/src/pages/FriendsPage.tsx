import { useState } from "react";
import { Link } from "../router";
import { useStore } from "../store/MovieStore";
import { friendsApi } from "../api/friends";
import AppShell from "../components/AppShell";
import AnimatedSearchInput from "../components/AnimatedSearchInput";

export default function FriendsPage() {
  const store = useStore();
  const user = store.currentUser!;
  const [query, setQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const friends = store.friendsOf(user.id);
  const friendIds = new Set(friends.map((f) => f.id));

  const handleAddFriend = async (identifierToAdd: string) => {
    const target = identifierToAdd.trim();
    if (!target) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await friendsApi.addFriend(target);
      if (res.ok && res.friend) {
        store.addFriend(String(res.friend.id));
        setFeedback({
          type: "success",
          message: `Added ${res.friend.displayName} (@${res.friend.username}) to your friends!`,
        });
        setQuery("");
      } else {
        // Check if matching in local store for seed friends
        const localMatch = store.users.find(
          (u) =>
            u.id !== user.id &&
            !friendIds.has(u.id) &&
            (u.displayName.toLowerCase() === target.toLowerCase() ||
              u.username.toLowerCase() === target.toLowerCase()),
        );

        if (localMatch) {
          store.addFriend(localMatch.id);
          setFeedback({
            type: "success",
            message: `Added ${localMatch.displayName} to your friends!`,
          });
          setQuery("");
        } else {
          setFeedback({
            type: "error",
            message: res.error || "User not found with that display name or username.",
          });
        }
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Network error while connecting with friend.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-[620px]">
        <h1 className="text-2xl font-bold tracking-tight text-white">Friends</h1>
        <p className="mt-1 text-sm text-text-muted">
          Connect with movie lovers to share reviews, ratings, and watchlists.
        </p>

        <div className="mt-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddFriend(query);
            }}
            className="flex gap-2.5 items-center"
          >
            <div className="flex-1">
              <AnimatedSearchInput
                label="Add a friend by display name or @username…"
                value={query}
                onChange={(v) => {
                  setQuery(v);
                  if (feedback) setFeedback(null);
                }}
              />
            </div>
            {query.trim().length > 0 && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-[46px] rounded-xl bg-accent px-4 text-xs font-bold text-white shadow-sm transition-all hover:bg-accent/90 active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? "Adding..." : "+ Add"}
              </button>
            )}
          </form>

          {feedback && (
            <div
              className={`mt-3 rounded-xl border p-3.5 text-xs font-medium ${
                feedback.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-red-500/30 bg-red-500/10 text-red-300"
              }`}
            >
              {feedback.type === "success" ? "✓ " : "✕ "}
              {feedback.message}
            </div>
          )}

          <div className="mt-8">
            {friends.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/25 p-8 text-center">
                <p className="text-sm text-text-muted">
                  No friends connected yet. Search a username or display name above to get started.
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
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                            {f.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-text-primary transition-colors group-hover:text-accent">
                              {f.displayName}
                            </span>
                            <span className="ml-2 text-xs text-text-muted">@{f.username}</span>
                          </div>
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
            Tip: Try searching <span className="font-semibold text-white">marcus</span> or <span className="font-semibold text-white">priya</span>.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
