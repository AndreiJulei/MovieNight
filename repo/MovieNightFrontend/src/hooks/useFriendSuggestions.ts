import { useEffect, useState } from "react";
import { moviesApi, type ApiSuggestionsResponse } from "../api/movies";
import { useStore } from "../store/MovieStore";

/** Server-owned sources; the input key prevents old account/library results rendering. */
export default function useFriendSuggestions() {
  const store = useStore();
  const userId = store.currentUser?.id;
  const libraryKey = userId ? store.allEntries()
    .filter((e) => e.userId === userId && (e.status === "watchlist" || e.status === "watched"))
    .map((e) => `${e.movieId}:${e.status}`).sort().join(",") : "";
  const friendKey = userId ? store.friendsOf(userId).map((f) => f.id).sort().join(",") : "";
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([userId, libraryKey, friendKey, revision]);
  const [state, setState] = useState<{
    key: string; data: ApiSuggestionsResponse | null; error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    moviesApi.getFriendsRecommendations().then(
      (data) => { if (active) setState({ key, data, error: null }); },
      (error: unknown) => { if (active) setState({ key, data: null, error: error instanceof Error ? error.message : "Could not load friend suggestions. Reload to try again." }); },
    );
    return () => { active = false; };
  }, [key, userId]);

  const current = state?.key === key ? state : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: !!userId && !current,
    reload: () => setRevision((value) => value + 1),
  };
}
