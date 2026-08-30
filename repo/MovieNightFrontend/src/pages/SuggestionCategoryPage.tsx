import { useMemo, useState } from "react";
import { Link, matchPath, useRouter } from "../router";
import AppShell from "../components/AppShell";
import MovieGrid from "../components/MovieGrid";
import { useSuggestionsByCategory, type SuggestionCategory } from "../hooks/useSuggestions";
import { useStore } from "../store/MovieStore";
import TopBar, { type Filters, type SortBy, type ViewMode } from "../components/TopBar";

export default function SuggestionCategoryPage() {
  const store = useStore();
  const { path } = useRouter();
  const params = matchPath("/suggestions/:category", path);
  const category = (params?.category || "for-you") as SuggestionCategory;

  const { title, movies: rawMovies } = useSuggestionsByCategory(category);

  // Initialize view mode from localStorage or grid
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("app_view_mode") as ViewMode) || "grid";
    }
    return "grid";
  });

  const [sortBy, setSortBy] = useState<SortBy>("addedAt");

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

  const sortedMovies = useMemo(() => {
    const list = [...rawMovies];
    if (sortBy === "title") {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "year") {
      list.sort((a, b) => b.year - a.year);
    } else if (sortBy === "rating") {
      list.sort((a, b) => (b.imdb ?? 0) - (a.imdb ?? 0));
    }
    return list;
  }, [rawMovies, sortBy]);

  // Check if current user already has a movie
  const userHasMovie = (movieId: string) => {
    if (!store.currentUser) return false;
    return !!store.entryFor(store.currentUser.id, movieId);
  };

  const referrerPath = `/suggestions/${category}`;

  return (
    <AppShell>
      <div className="mb-4">
        <Link
          to="/suggestions"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-white"
        >
          ← Back to Suggestions
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          {title}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Explore all suggested titles in this curated collection.
        </p>
      </div>

      <TopBar
        count={sortedMovies.length}
        avg={null}
        filters={filters}
        onChange={handleFilterChange}
        showRating={false}
      />

      <MovieGrid
        movies={sortedMovies}
        compact={viewMode === "compact"}
        empty="No movies found for this suggestion category."
        referrerOverride={referrerPath}
        showAddToWatchlist
        onAddToWatchlist={(movieId) => {
          store.addToWatchlist(movieId);
        }}
        userHasMovie={userHasMovie}
      />
    </AppShell>
  );
}
