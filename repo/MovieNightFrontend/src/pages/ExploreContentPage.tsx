import useWatchlistSave from "../hooks/useWatchlistSave";
import { useMemo, useState } from "react";
import { Link, matchPath, useRouter } from "../router";
import AppShell from "../components/AppShell";
import PosterShelf from "../components/PosterShelf";
import MovieGrid from "../components/MovieGrid";
import TopBar, { type Filters, type SortBy, type ViewMode, type MinRating } from "../components/TopBar";
import { useStore } from "../store/MovieStore";
import { useExploreMedia } from "../hooks/useSuggestions";
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
  const [sortBy, setSortBy] = useState<SortBy>("rating");
  const [minRating, setMinRating] = useState<MinRating>(0);

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
          subtitle = "Released in theaters & digital in the last 90 days";
        } else if (r.id === "popular") {
          subtitle = "Trending global favorites and community hits";
        } else if (r.id === "top-rated") {
          subtitle = "Highest rated masterworks with established acclaim";
        } else if (r.id === "upcoming") {
          subtitle = type === "anime"
            ? "Most anticipated anime premiering next calendar season"
            : type === "tv"
            ? "Upcoming new seasons and series premiering this year"
            : "Most anticipated theatrical & streaming releases of the year";
        } else if (r.id === "airing" || r.id === "current-season") {
          subtitle = type === "anime"
            ? "Currently airing animation hits this season"
            : "Active broadcast and streaming episodes airing right now";
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
    let rawMovies = matchedRow ? matchedRow.movies : [];

    if (minRating > 0) {
      rawMovies = rawMovies.filter((m) => (m.imdb ?? 0) >= minRating);
    }

    const sortedMovies = [...rawMovies].sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "year") return (b.year ?? 0) - (a.year ?? 0);
      if (sortBy === "rating") return (b.imdb ?? 0) - (a.imdb ?? 0);
      return 0;
    });

    const userHasMovie = (movieId: string) => {
      if (!store.currentUser) return false;
      return !!store.entryFor(store.currentUser.id, movieId);
    };

    return (
      <AppShell>
        {explore.loading && <p role="status" className="mb-4 text-text-muted">Loading discovery…</p>}
        {explore.error && <p role="alert" className="mb-4 text-danger">{explore.error}</p>}
        {saveError && <p role="alert" className="mb-4 text-danger">{saveError}</p>}
        <button type="button" disabled={explore.loading} onClick={explore.reload} className="mb-4 text-sm text-accent underline disabled:opacity-50">{explore.error ? "Retry discovery" : "Reload discovery"}</button>
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
        {explore.loading && <p role="status" className="mb-4 text-text-muted">Loading discovery…</p>}
        {explore.error && <p role="alert" className="mb-4 text-danger">{explore.error}</p>}
        {saveError && <p role="alert" className="mb-4 text-danger">{saveError}</p>}
        <button type="button" disabled={explore.loading} onClick={explore.reload} className="mb-4 text-sm text-accent underline disabled:opacity-50">{explore.error ? "Retry discovery" : "Reload discovery"}</button>
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
              </div>
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
            <PosterShelf
              movies={row.movies.slice(0, 20)}
              referrer={`/explore/${type}`}
            />
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
