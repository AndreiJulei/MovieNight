import useWatchlistSave from "../hooks/useWatchlistSave";
import { useEffect, useMemo, useState } from "react";
import { Link, matchPath, useRouter } from "../router";
import AppShell from "../components/AppShell";
import PosterShelf from "../components/PosterShelf";
import MovieGrid from "../components/MovieGrid";
import TopBar, { type Filters, type SortBy, type ViewMode, type MinRating } from "../components/TopBar";
import { useStore } from "../store/MovieStore";
import { useExploreMedia } from "../hooks/useSuggestions";
import { filterAndSortMovies } from "../components/movieFilterSort";
import type { Movie, MediaType } from "../store/data";

type ExploreMediaType = "movies" | "tv" | "anime";

const CONFIG: Record<
  ExploreMediaType,
  {
    mediaType: MediaType;
    title: string;
    subtitle: string;
  }
> = {
  movies: {
    mediaType: "MOVIE",
    title: "Movies",
    subtitle: "Explore acclaimed films, recent releases, and community favorites.",
  },
  tv: {
    mediaType: "TV",
    title: "TV Series",
    subtitle: "Acclaimed series, currently airing seasons, and top-rated dramas.",
  },
  anime: {
    mediaType: "ANIME",
    title: "Anime",
    subtitle: "Seasonal hits, timeless masterworks, and currently airing series.",
  },
};

interface SuggestionRow {
  id: string;
  title: string;
  movies: Movie[];
  subtitle?: string;
  state?: string;
  updatedAt?: string;
}

export default function ExploreContentPage() {
  const { path } = useRouter();
  const matchDetailed = matchPath("/explore/:type/:rowId", path);
  const matchBase = matchPath("/explore/:type", path);

  const type = ((matchDetailed?.type || matchBase?.type || "movies") as ExploreMediaType);
  const rowId = matchDetailed?.rowId;
  const config = CONFIG[type] ?? CONFIG.movies;
  const store = useStore();
  const { saveWatchlist, error: saveError } = useWatchlistSave();

  const explore = useExploreMedia(type);
  const backendRows = explore.rows;

  // Filters for /explore/:type/:rowId grid view
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("app_view_mode") as ViewMode) || "grid";
    }
    return "grid";
  });
  const [sortBy, setSortBy] = useState<SortBy>("recommendation");
  const [minRating, setMinRating] = useState<MinRating>(0);
  useEffect(() => { setSortBy("recommendation"); setMinRating(0); }, [type, rowId, store.currentUser?.id]);

  const filters: Filters = {
    sortBy,
    minRating,
    dateRange: "all",
    viewMode,
  };

  const handleFilterChange = (f: Filters) => {
    setSortBy(f.sortBy);
    setMinRating(f.minRating);
    setViewMode(f.viewMode);
    localStorage.setItem("app_view_mode", f.viewMode);
  };

  // Determine shelves with metadata
  const rows = useMemo<SuggestionRow[]>(() => {
    if (backendRows && backendRows.length > 0) {
      return backendRows.map((r) => {
        let subtitle: string | undefined;

        if (r.id === "newest") {
          subtitle = "Movies released in the last 90 days";
        } else if (r.id === "popular") {
          subtitle = "Popular among TMDB viewers, with at least 7/10 audience rating and enough votes";
        } else if (r.id === "top-rated") {
          subtitle = "Ranked by TMDB audience rating adjusted for vote volume within a bounded candidate pool";
        } else if (r.id === "upcoming") {
          subtitle = type === "anime"
            ? "Anime series premiering within the next 12 months"
            : type === "tv"
            ? "Series premiering within the next 12 months"
            : "Movies with release dates in the next 12 months";
        } else if (r.id === "airing" || r.id === "current-season") {
          subtitle = type === "anime"
            ? "Anime in the current quarter whose series have premiered"
            : "Series in TMDB's airing feed that have premiered";
        }

        return {
          ...r,
          subtitle,
        };
      });
    }

    return [];
  }, [backendRows, config.mediaType, store.movies, type]);

  // If a rowId was requested, render full grid view for that row
  if (rowId) {
    const matchedRow = rows.find((r) => r.id === rowId);
    const rawMovies = matchedRow ? matchedRow.movies : [];
    const sortedMovies = filterAndSortMovies(rawMovies, sortBy, minRating);

    const userHasMovie = (movieId: string) => {
      if (!store.currentUser) return false;
      return !!store.entryFor(store.currentUser.id, movieId);
    };

    return (
      <AppShell>
        {(explore.loading || explore.pending) && <p role="status" className="mb-4 text-text-muted">{explore.pending ? "Refreshing discovery…" : "Loading discovery…"}</p>}
        {explore.error && <p role="alert" className="mb-4 text-danger">{explore.error}</p>}
        {saveError && <p role="alert" className="mb-4 text-danger">{saveError}</p>}
        <button type="button" disabled={explore.loading || explore.pending} onClick={() => matchedRow ? explore.refresh(matchedRow.id) : explore.reload()} className="mb-4 text-sm text-accent underline disabled:opacity-50">{explore.error ? "Retry discovery" : "Refresh discovery"}</button>
        {matchedRow?.state === "STALE" && <p role="status" className="mb-3 text-warning">Last successful discovery snapshot is stale (updated {matchedRow.updatedAt}).</p>}
        {explore.failedCategory === matchedRow?.id && matchedRow?.state !== "UNAVAILABLE" &&
          <p role="status" className="mb-3 text-warning">Refresh failed. Showing the last successful snapshot from {matchedRow?.updatedAt}.</p>}
        {matchedRow?.state === "UNAVAILABLE" && <p role="alert" className="mb-3 text-danger">Discovery is unavailable. Retry this category.</p>}
        <div className="mb-4">
          <Link
            to={`/explore/${type}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-white"
          >
            ← Back to {config.title}
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            {matchedRow?.title || "Explore"} · {config.title}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {matchedRow?.subtitle || "All titles in this curated shelf."}
          </p>
        </div>

        <TopBar
          count={sortedMovies.length}
          avg={null}
          filters={filters}
          onChange={handleFilterChange}
          showRating={true}
          recommendationOrder audienceControls
          showAddButton={false}
        />

        <MovieGrid
          movies={sortedMovies}
          compact={viewMode === "compact"}
          empty="No titles found in this category."
          referrerOverride={`/explore/${type}/${rowId}`}
          showAddToWatchlist
          onAddToWatchlist={saveWatchlist}
          userHasMovie={userHasMovie}
        />
      </AppShell>
    );
  }

  // Shelf rows view
  return (
    <AppShell>
        {(explore.loading || explore.pending) && <p role="status" className="mb-4 text-text-muted">{explore.pending ? "Refreshing discovery…" : "Loading discovery…"}</p>}
        {explore.error && <p role="alert" className="mb-4 text-danger">{explore.error}</p>}
        {saveError && <p role="alert" className="mb-4 text-danger">{saveError}</p>}
        {explore.error && <button type="button" disabled={explore.loading || explore.pending} onClick={explore.reload} className="mb-4 text-sm text-accent underline disabled:opacity-50">Retry discovery</button>}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          {config.title}
        </h1>
        <p className="mt-1 text-sm text-text-muted">{config.subtitle}</p>
      </div>

      <div className="space-y-12 pb-16">
        {rows.map((row) => (
          <section key={row.id} className="relative">
            <div className="mb-3 flex items-start justify-between px-1">
              <div>
                <h2 className="text-base font-semibold tracking-wide text-text-primary">
                  {row.title}
                </h2>
                {row.subtitle && (
                  <p className="mt-0.5 text-xs text-text-muted">
                    {row.subtitle}
                  </p>
                )}
                {row.state === "STALE" && <p role="status" className="mt-1 text-xs text-warning">Stale snapshot · updated {row.updatedAt}</p>}
                {explore.failedCategory === row.id && row.state !== "UNAVAILABLE" &&
                  <p role="status" className="mt-1 text-xs text-warning">Refresh failed · showing last successful snapshot from {row.updatedAt}</p>}
                {row.state === "UNAVAILABLE" && <p role="alert" className="mt-1 text-xs text-danger">Unavailable · try refreshing</p>}
                {row.state === "EMPTY" && <p className="mt-1 text-xs text-text-muted">No titles met this shelf's criteria.</p>}
              </div>
              <button type="button" disabled={explore.loading || explore.pending} onClick={() => explore.refresh(row.id)} className="text-xs font-semibold text-accent underline disabled:opacity-50">Refresh</button>
              {row.movies.length > 4 && (
                <Link
                  to={`/explore/${type}/${row.id}`}
                  className="group mt-0.5 flex items-center gap-1 text-xs font-semibold text-accent transition-colors hover:text-white"
                >
                  <span>View all</span>
                  <span className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              )}
            </div>
            {row.movies.length > 0 && <PosterShelf
              movies={row.movies.slice(0, 20)}
              referrer={`/explore/${type}`}
            />}
          </section>
        ))}

        {rows.length === 0 && (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-text-muted">
              Loading catalog or no titles found.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
