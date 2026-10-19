import { useMemo, useState, type FormEvent } from "react";
import { Link, matchPath, useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import type { Movie } from "../store/data";
import AppShell from "../components/AppShell";
import MovieGrid from "../components/MovieGrid";
import TopBar, {
  type Filters,
  type SortBy,
  type ViewMode,
  type MediaTypeFilter,
} from "../components/TopBar";

const ANIME_MOVIE_IDS = new Set(["anime-demon-slayer-movie"]);

export default function CustomListDetailPage() {
  const { path } = useRouter();
  const store = useStore();
  const params = matchPath("/lists/:id", path);
  const listId = params?.id;

  const list = listId ? store.listById(listId) : undefined;

  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = store.listsLoading || store.listsSaving;
  const handleRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!list || busy || !title.trim()) return;
    setError(null);
    try {
      await store.renameList(list.id, title);
      setRenaming(false);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not rename this list. Please try again."); }
  };

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("app_view_mode") as ViewMode) || "grid";
    }
    return "grid";
  });
  const [sortBy, setSortBy] = useState<SortBy>("addedAt");
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>("ALL");

  const filters: Filters = {
    sortBy,
    minRating: 0,
    dateRange: "all",
    viewMode,
  };

  const handleFilterChange = (f: Filters) => {
    setSortBy(f.sortBy);
    setViewMode(f.viewMode);
    localStorage.setItem("app_view_mode", f.viewMode);
  };

  // Resolve movies belonging to this custom list
  const listMovies = useMemo<Movie[]>(() => {
    if (!list) return [];
    return list.movieIds
      .map((id) => store.movieById(id))
      .filter((m): m is Movie => m != null);
  }, [list, store]);

  // Apply media type filter
  const filteredMovies = useMemo(() => {
    if (mediaTypeFilter === "ALL") return listMovies;
    return listMovies.filter((m) => {
      if (mediaTypeFilter === "MOVIE") {
        return m.mediaType === "MOVIE" || ANIME_MOVIE_IDS.has(m.id);
      }
      if (mediaTypeFilter === "ANIME") {
        return m.mediaType === "ANIME";
      }
      return m.mediaType === mediaTypeFilter;
    });
  }, [listMovies, mediaTypeFilter]);

  // Apply sorting
  const sortedMovies = useMemo(() => {
    const arr = [...filteredMovies];
    switch (sortBy) {
      case "title":
        return arr.sort((a, b) => a.title.localeCompare(b.title));
      case "year":
        return arr.sort((a, b) => b.year - a.year);
      case "rating":
        return arr.sort((a, b) => (b.imdb ?? 0) - (a.imdb ?? 0));
      case "addedAt":
      default:
        // Respect the list ordering by default
        return arr;
    }
  }, [filteredMovies, sortBy]);

  if (!list || store.listsLoading || store.listsError) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl py-12 text-center">
          <p role={store.listsError ? "alert" : "status"} className="text-base text-text-muted">
            {store.listsLoading ? "Loading your lists…" : store.listsError || "List not found."}
          </p>
          {store.listsError && <button type="button" onClick={() => void store.refreshLists()} className="mt-4 text-sm text-accent underline">Reload lists</button>}
          <Link
            to="/lists"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
          >
            ← Back to Lists
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4">
        <Link
          to="/lists"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-white"
        >
          ← Back to Lists
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="break-all text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {list.title}
          </h1>
          <p className="mt-1 text-xs text-text-muted">
            Private custom list • Created{" "}
            {new Date(list.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      {renaming ? (
        <form onSubmit={handleRename} className="mb-4 flex flex-wrap items-center gap-2">
          <label htmlFor="rename-list" className="text-sm text-text-muted">List title</label>
          <input id="rename-list" autoFocus required maxLength={150} value={title} disabled={store.listsSaving}
            onChange={(event) => setTitle(event.target.value)}
            className="min-w-0 rounded-lg border border-white/10 bg-surface-raised px-3 py-2 text-base text-white focus:border-accent focus:outline-none" />
          <button type="submit" disabled={busy || !title.trim()} className="rounded-lg bg-accent px-3 py-2 text-sm text-white disabled:opacity-40">
            {store.listsSaving ? "Saving…" : "Save name"}
          </button>
          <button type="button" disabled={store.listsSaving} onClick={() => { setRenaming(false); setError(null); }} className="px-3 py-2 text-sm text-text-muted">Cancel</button>
        </form>
      ) : <button type="button" disabled={busy} onClick={() => { setTitle(list.title); setRenaming(true); setError(null); }}
        className="mb-4 rounded-lg border border-white/10 bg-surface-raised px-3 py-2 text-sm text-text-primary">Rename list</button>}
      {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}
      <button type="button" disabled={busy} onClick={() => { setError(null); void store.refreshLists(); }} className="mb-4 ml-3 text-sm text-accent underline underline-offset-4 disabled:opacity-40">Reload lists</button>

      {/* Peer filter cluster */}
      <TopBar
        count={sortedMovies.length}
        avg={null}
        filters={filters}
        onChange={handleFilterChange}
        showRating={false}
        mediaTypeFilter={mediaTypeFilter}
        onMediaTypeChange={setMediaTypeFilter}
        showAddButton={false}
      />

      {/* Reused MovieGrid */}
      <MovieGrid
        movies={sortedMovies}
        compact={viewMode === "compact"}
        empty="Nothing in this list yet. Add movies from their detail page."
        referrerOverride={`/lists/${list.id}`}
      />
    </AppShell>
  );
}
