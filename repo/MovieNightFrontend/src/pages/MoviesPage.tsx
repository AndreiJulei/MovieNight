import { useMemo } from "react";
import { useQuery, useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import type { Entry, Movie, Status } from "../store/data";
import AppShell from "../components/AppShell";
import MovieGrid from "../components/MovieGrid";
import TopBar, { type Filters, type SortBy, type MinRating, type DateRange, type ViewMode } from "../components/TopBar";

const VALID_SORTS: SortBy[] = ["addedAt", "title", "year", "rating"];
const VALID_RATINGS: MinRating[] = [0, 6, 8];
const VALID_DATES: DateRange[] = ["all", "month", "year"];
const VALID_VIEWS: ViewMode[] = ["grid", "compact"];

export default function MoviesPage() {
  const { currentUser, entriesFor, movieById } = useStore();
  const { navigate } = useRouter();
  const query = useQuery();

  // Read all filter & view state from URL query params so it persists across navigation
  const status: Status = query.get("status") === "watchlist" ? "watchlist" : "watched";
  const sortBy: SortBy = VALID_SORTS.includes(query.get("sort") as SortBy)
    ? (query.get("sort") as SortBy)
    : "addedAt";
  const minRating: MinRating = VALID_RATINGS.includes(Number(query.get("minRating")) as MinRating)
    ? (Number(query.get("minRating")) as MinRating)
    : 0;
  const dateRange: DateRange = VALID_DATES.includes(query.get("dateRange") as DateRange)
    ? (query.get("dateRange") as DateRange)
    : "all";
  const storedView = typeof window !== "undefined" ? (localStorage.getItem("app_view_mode") as ViewMode) : null;
  const viewMode: ViewMode = VALID_VIEWS.includes(query.get("view") as ViewMode)
    ? (query.get("view") as ViewMode)
    : storedView && VALID_VIEWS.includes(storedView)
      ? storedView
      : "grid";

  const filters: Filters = { sortBy, minRating, dateRange, viewMode };

  // Build the URL with current filter & view state
  const buildUrl = (newFilters?: Filters) => {
    const f = newFilters ?? filters;
    const params = new URLSearchParams();
    if (status === "watchlist") params.set("status", "watchlist");
    if (f.sortBy !== "addedAt") params.set("sort", f.sortBy);
    if (f.minRating > 0) params.set("minRating", String(f.minRating));
    if (f.dateRange !== "all") params.set("dateRange", f.dateRange);
    if (f.viewMode !== "grid") params.set("view", f.viewMode);
    const qs = params.toString();
    return `/movies${qs ? `?${qs}` : ""}`;
  };

  const rows = useMemo(() => {
    if (!currentUser) return [];
    let list = entriesFor(currentUser.id, status)
      .map((e) => ({ entry: e, movie: movieById(e.movieId)! }))
      .filter((r) => r.movie);

    if (status === "watched" && filters.minRating > 0) {
      list = list.filter((r) => (r.entry.rating ?? 0) >= filters.minRating);
    }
    if (filters.dateRange !== "all") {
      const now = new Date();
      list = list.filter((r) => {
        const d = new Date(r.entry.addedAt);
        if (filters.dateRange === "month")
          return (
            d.getFullYear() === now.getFullYear() &&
            d.getMonth() === now.getMonth()
          );
        return d.getFullYear() === now.getFullYear();
      });
    }

    list.sort((a, b) => sortCmp(a, b, filters));
    return list;
  }, [currentUser, entriesFor, movieById, status, filters]);

  const movies: Movie[] = rows.map((r) => r.movie);

  const avg = useMemo(() => {
    const rated = rows.filter((r) => r.entry.rating != null);
    if (rated.length === 0) return null;
    return rated.reduce((s, r) => s + (r.entry.rating as number), 0) / rated.length;
  }, [rows]);

  const handleFilterChange = (newFilters: Filters) => {
    navigate(buildUrl(newFilters));
  };

  return (
    <AppShell>
      <TopBar
        count={movies.length}
        avg={status === "watched" ? avg : null}
        filters={filters}
        onChange={handleFilterChange}
        showRating={status === "watched"}
      />

      <MovieGrid
        movies={movies}
        compact={filters.viewMode === "compact"}
        empty={
          status === "watchlist"
            ? "Nothing on your watchlist yet. Add a movie to get started."
            : "Nothing here yet. Add a movie to get started."
        }
      />
    </AppShell>
  );
}

function sortCmp(
  a: { entry: Entry; movie: Movie },
  b: { entry: Entry; movie: Movie },
  filters: Filters,
): number {
  switch (filters.sortBy) {
    case "title":
      return a.movie.title.localeCompare(b.movie.title);
    case "year":
      return b.movie.year - a.movie.year;
    case "rating":
      return (b.entry.rating ?? -1) - (a.entry.rating ?? -1);
    case "addedAt":
    default:
      return +new Date(b.entry.addedAt) - +new Date(a.entry.addedAt);
  }
}
