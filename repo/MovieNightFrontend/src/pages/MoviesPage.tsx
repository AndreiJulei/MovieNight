import { useEffect, useMemo } from "react";
import { useQuery, useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import type { Entry, Movie, Status, MediaType } from "../store/data";
import AppShell from "../components/AppShell";
import MovieGrid from "../components/MovieGrid";
import TopBar, { type Filters, type SortBy, type MinRating, type DateRange, type ViewMode, type MediaTypeFilter } from "../components/TopBar";

const VALID_SORTS: SortBy[] = ["addedAt", "title", "year", "rating"];
const VALID_DATES: DateRange[] = ["all", "month", "year"];
const VALID_VIEWS: ViewMode[] = ["grid", "compact"];
const VALID_MEDIA_TYPES: MediaTypeFilter[] = ["ALL", "MOVIE", "TV", "ANIME"];

/** Anime movies show in BOTH Movies and Anime filters */
const ANIME_MOVIE_IDS = new Set(["anime-demon-slayer-movie"]);

export default function MoviesPage() {
  const { currentUser, entriesFor, movieById, refreshLibrary, libraryLoading, libraryError } = useStore();
  const { navigate } = useRouter();
  const query = useQuery();

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  // Read all filter & view state from URL query params so it persists across navigation
  const status: Status = query.get("status") === "watchlist" ? "watchlist" : "watched";
  const sortBy: SortBy = VALID_SORTS.includes(query.get("sort") as SortBy)
    ? (query.get("sort") as SortBy)
    : "addedAt";
  const dateRange: DateRange = VALID_DATES.includes(query.get("dateRange") as DateRange)
    ? (query.get("dateRange") as DateRange)
    : "all";
  const storedView = typeof window !== "undefined" ? (localStorage.getItem("app_view_mode") as ViewMode) : null;
  const viewMode: ViewMode = VALID_VIEWS.includes(query.get("view") as ViewMode)
    ? (query.get("view") as ViewMode)
    : storedView && VALID_VIEWS.includes(storedView)
      ? storedView
      : "grid";

  const mediaType: MediaTypeFilter = VALID_MEDIA_TYPES.includes(query.get("type") as MediaTypeFilter)
    ? (query.get("type") as MediaTypeFilter)
    : "ALL";

  const filters: Filters = { sortBy, minRating: 0, dateRange, viewMode };

  // Build the URL with current filter & view state
  const buildUrl = (newFilters?: Filters, newMediaType?: MediaTypeFilter) => {
    const f = newFilters ?? filters;
    const mt = newMediaType ?? mediaType;
    const params = new URLSearchParams();
    if (status === "watchlist") params.set("status", "watchlist");
    if (f.sortBy !== "addedAt") params.set("sort", f.sortBy);
    if (f.dateRange !== "all") params.set("dateRange", f.dateRange);
    if (f.viewMode !== "grid") params.set("view", f.viewMode);
    if (mt !== "ALL") params.set("type", mt);
    const qs = params.toString();
    return `/movies${qs ? `?${qs}` : ""}`;
  };

  const rows = useMemo(() => {
    if (!currentUser) return [];
    let list = entriesFor(currentUser.id, status)
      .map((e) => {
        const found = movieById(e.movieId);
        const resolvedMediaType = ((found?.mediaType || e.mediaType || "MOVIE").toUpperCase()) as MediaType;
        const movie: Movie = found
          ? { ...found, mediaType: resolvedMediaType }
          : {
              id: e.movieId,
              title: "Loading...",
              year: new Date().getFullYear(),
              posterUrl: null,
              mediaType: resolvedMediaType,
            };
        return { entry: e, movie };
      });

    // Media type filter
    if (mediaType !== "ALL") {
      list = list.filter((r) => {
        const itemType = (r.movie.mediaType || r.entry.mediaType || "MOVIE").toUpperCase();
        if (mediaType === "MOVIE") {
          // Movies filter: show MOVIE type + anime movies
          return itemType === "MOVIE" || ANIME_MOVIE_IDS.has(r.movie.id);
        }
        if (mediaType === "ANIME") {
          return itemType === "ANIME";
        }
        return itemType === mediaType;
      });
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
  }, [currentUser, entriesFor, movieById, status, filters, mediaType]);

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
        showRating={false}
        mediaTypeFilter={mediaType}
        onMediaTypeChange={(mt) => navigate(buildUrl(filters, mt))}
      />

      {libraryLoading && <p role="status" className="py-4 text-sm text-text-muted">Loading your library…</p>}
      {libraryError && (
        <div role="alert" className="my-4 flex flex-wrap items-center gap-3 text-sm">
          <p className="text-danger">Could not load your library. {libraryError}</p>
          <button type="button" disabled={libraryLoading} onClick={() => refreshLibrary()}
            className="rounded-md border border-white/15 px-3 py-2 text-text-primary hover:bg-surface-raised disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-accent">
            Retry loading
          </button>
        </div>
      )}
      {(!libraryLoading && !libraryError || movies.length > 0) && <MovieGrid
        movies={movies}
        compact={filters.viewMode === "compact"}
        empty={
          status === "watchlist"
            ? "Nothing on your watchlist yet. Add a movie to get started."
            : "Nothing here yet. Add a movie to get started."
        }
      />}
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
