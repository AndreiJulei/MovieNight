import useWatchlistSave from "../hooks/useWatchlistSave";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, matchPath, useRouter, useQuery } from "../router";
import AppShell from "../components/AppShell";
import PosterShelf from "../components/PosterShelf";
import MovieGrid from "../components/MovieGrid";
import TopBar, { type Filters, type SortBy, type ViewMode, type MinRating } from "../components/TopBar";
import { useStore } from "../store/MovieStore";
import { useExploreMedia, type SuggestionRow } from "../hooks/useSuggestions";
import {
  useExploreCategory,
} from "../hooks/useExploreCategory";
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

function ExploreCategoryGridView({
  type,
  rowId,
  configTitle,
}: {
  type: ExploreMediaType;
  rowId: string;
  configTitle: string;
}) {
  const store = useStore();
  const { saveWatchlist, error: saveError } = useWatchlistSave();

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("app_view_mode") as ViewMode) || "grid";
    }
    return "grid";
  });
  const { navigate } = useRouter();
  const query = useQuery();
  const requestedSort = query.get("sort");
  const sortBy: SortBy = requestedSort === "addedAt" || requestedSort === "title" ||
    requestedSort === "year" || requestedSort === "rating" ? requestedSort : "recommendation";
  const minRating: MinRating = query.get("minRating") === "6" ? 6 : 0;

  const category = useExploreCategory(type, rowId, sortBy, minRating);

  const filters: Filters = {
    sortBy,
    minRating,
    dateRange: "all",
    viewMode,
  };

  const handleFilterChange = (f: Filters) => {
    setViewMode(f.viewMode);
    localStorage.setItem("app_view_mode", f.viewMode);
    if (f.sortBy !== sortBy || f.minRating !== minRating) {
      const next = new URLSearchParams(query);
      if (f.sortBy === "recommendation") next.delete("sort");
      else next.set("sort", f.sortBy);
      if (f.minRating === 0) next.delete("minRating");
      else next.set("minRating", String(f.minRating));
      navigate(`/explore/${type}/${rowId}${next.size ? `?${next}` : ""}`);
    }
  };

  const handleAddToWatchlist = async (movieId: string, movie?: Movie) => {
    const ok = await saveWatchlist(movieId, movie);
    if (ok) {
      category.removeMovie(movieId);
    }
  };

  const userHasMovie = (movieId: string) => {
    if (!store.currentUser) return false;
    return !!store.entryFor(store.currentUser.id, movieId);
  };

  const displayTitle = category.title || "Explore";
  const displaySubtitle = category.subtitle || "All titles in this curated shelf.";

  return (
    <AppShell>
      {(category.loading || category.refreshing) && (
        <p role="status" className="mb-4 text-text-muted">
          {category.refreshing ? "Refreshing discovery…" : "Loading discovery…"}
        </p>
      )}
      {category.error && (
        <div className="mb-4 flex items-center gap-3">
          <p role="alert" className="text-sm text-danger">{category.error}</p>
          <button
            type="button"
            disabled={category.loadingMore || category.refreshing || category.loading}
            onClick={category.retry}
            className="quiet-action inline-flex min-h-8 items-center text-sm text-link disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}

      {category.state === "STALE" && (
        <p role="status" className="mb-3 text-warning">
          Last successful discovery snapshot is stale (updated {category.updatedAt}).
        </p>
      )}

      {store.libraryError && (
        <div className="mb-4 flex items-center gap-3">
          <p role="alert" className="text-sm text-danger">{store.libraryError}</p>
          <button
            type="button"
            onClick={() => void store.refreshLibrary()}
            className="quiet-action inline-flex min-h-8 items-center text-sm text-link"
          >
            Retry library sync
          </button>
        </div>
      )}

      <div className="mb-4">
        <Link
          to={`/explore/${type}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-white"
        >
          ← Back to {configTitle}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          {displayTitle} · {configTitle}
        </h1>
        <p className="mt-1 text-sm text-text-muted">{displaySubtitle}</p>
      </div>

      {category.state === "UNAVAILABLE" ? (
        <div className="my-8 rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
          <p role="alert" className="text-sm font-medium text-danger">
            Discovery is unavailable. Retry this category.
          </p>
          <button
            type="button"
            disabled={category.loading || category.refreshing}
            onClick={category.refresh}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {category.refreshing ? "Refreshing discovery…" : "Retry discovery"}
          </button>
        </div>
      ) : (
        <>
          <TopBar
            count={category.movies.length}
            avg={null}
            filters={filters}
            onChange={handleFilterChange}
            showRating={true}
            recommendationOrder
            audienceControls
            showAddButton={false}
          />

          {category.segments.length > 1 ? (
            <div className="space-y-8">
              {category.segments.map((segment) => (
                <div key={segment.id} className="space-y-3">
                  {segment.label && (
                    <div className="flex items-center gap-3 pt-4 pb-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-accent">{segment.label}</span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                  )}
                  <MovieGrid
                    movies={segment.movies}
                    compact={viewMode === "compact"}
                    explorePresentation
                    empty="No titles found in this segment."
                    referrerOverride={`/explore/${type}/${rowId}`}
                    showAddToWatchlist
                    onAddToWatchlist={handleAddToWatchlist}
                    userHasMovie={userHasMovie}
                  />
                </div>
              ))}
            </div>
          ) : (
            <MovieGrid
              movies={category.movies}
              compact={viewMode === "compact"}
              explorePresentation
              empty={
                category.terminalReason === "ALL_CANDIDATES_EXCLUDED_BY_LIBRARY"
                  ? "All titles in this category are already in your watchlist or watched history."
                  : category.terminalReason === "NO_MATCHING_UNSAVED_TITLES"
                  ? "No matching unsaved titles."
                  : "No titles found in this category."
              }
              referrerOverride={`/explore/${type}/${rowId}`}
              showAddToWatchlist
              onAddToWatchlist={handleAddToWatchlist}
              userHasMovie={userHasMovie}
            />
          )}

          {/* DR01: Load more action */}
          {category.hasMore && (
            <div className="mt-8 flex justify-center pb-8">
              <button
                type="button"
                disabled={category.loadingMore || category.refreshing || category.loading || category.lastFailedAction === "initial" || Boolean(store.libraryError)}
                onClick={category.loadMore}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1a2234] border border-white/10 px-6 py-2.5 text-sm font-semibold text-text-primary transition-all hover:bg-[#222d44] hover:border-white/20 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
                aria-label="Load more discovery titles"
              >
                {category.loadingMore ? "Loading more titles…" : "Load more"}
              </button>
            </div>
          )}

          {/* DR05 / Q10: Terminal states */}
          {!category.hasMore && !category.loading && (
            <div className="mt-8 pb-12 text-center">
              {category.terminalReason === "SELECTION_LIMIT_REACHED" && (
                <p role="status" className="text-xs text-text-muted">
                  Selection limit reached · At least one provider stream reached its 10-page bound.
                </p>
              )}
              {category.terminalReason === "PROVIDER_EXHAUSTED" && (
                <p role="status" className="text-xs text-text-muted">
                  No more results from the provider feeds.
                </p>
              )}
              {category.terminalReason === "ALL_CANDIDATES_EXCLUDED_BY_LIBRARY" && (
                <p role="status" className="text-xs text-text-muted">
                  All candidate titles are already in your library.
                  {category.underlyingLimit === "SELECTION_LIMIT_REACHED" && " (Provider selection limit reached)"}
                  {category.underlyingLimit === "PROVIDER_EXHAUSTED" && " (Provider feeds exhausted)"}
                </p>
              )}
              {category.terminalReason === "NO_MATCHING_UNSAVED_TITLES" && (
                <p role="status" className="text-xs text-text-muted">
                  No matching unsaved titles.
                  {category.underlyingLimit === "SELECTION_LIMIT_REACHED" && " (Provider selection limit reached)"}
                  {category.underlyingLimit === "PROVIDER_EXHAUSTED" && " (Provider feeds exhausted)"}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

export default function ExploreContentPage() {
  const store = useStore();
  const { path } = useRouter();
  const matchDetailed = matchPath("/explore/:type/:rowId", path);
  const matchBase = matchPath("/explore/:type", path);

  const type = ((matchDetailed?.type || matchBase?.type || "movies") as ExploreMediaType);
  const rowId = matchDetailed?.rowId;
  const config = CONFIG[type] ?? CONFIG.movies;
  const { saveWatchlist, error: saveError } = useWatchlistSave();

  const explore = useExploreMedia(type);
  const prevRowIdRef = useRef(rowId);
  const reloadExplore = explore.reload;
  useEffect(() => {
    if (prevRowIdRef.current && !rowId) {
      reloadExplore();
    }
    prevRowIdRef.current = rowId;
  }, [rowId, reloadExplore]);
  const backendRows = explore.rows;

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
  }, [backendRows, type]);

  // If a rowId was requested, render full grid view for that row
  if (rowId) {
    return (
      <ExploreCategoryGridView
        key={`${type}-${rowId}`}
        type={type}
        rowId={rowId}
        configTitle={config.title}
      />
    );
  }

  // Shelf rows view
  return (
    <AppShell>
      {(explore.loading || explore.pending) && (
        <p role="status" className="mb-4 text-text-muted">
          {explore.pending ? "Refreshing discovery…" : "Loading discovery…"}
        </p>
      )}
      {explore.error && <p role="alert" className="mb-4 text-danger">{explore.error}</p>}
      {saveError && <p role="alert" className="mb-4 text-danger">{saveError}</p>}
      {store.libraryError && (
        <div className="mb-4 flex items-center gap-3">
          <p role="alert" className="text-sm text-danger">{store.libraryError}</p>
          <button
            type="button"
            onClick={() => void store.refreshLibrary()}
            className="quiet-action inline-flex min-h-8 items-center text-sm text-link"
          >
            Retry library sync
          </button>
        </div>
      )}
      {explore.error && (
        <button
          type="button"
          disabled={explore.loading || explore.pending}
          onClick={explore.reload}
          className="quiet-action mb-4 inline-flex min-h-8 items-center text-sm text-link disabled:opacity-50"
        >
          Retry discovery
        </button>
      )}
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
              {explore.failedCategory === row.id && (
                <button
                  type="button"
                  disabled={explore.loading || explore.pending}
                  onClick={() => explore.refresh(row.id)}
                  className="quiet-action inline-flex min-h-8 items-center text-xs text-link disabled:opacity-50"
                >
                  Retry shelf
                </button>
              )}
              {(row.movies.length > 4 || row.hasMore) && (
                <Link
                  to={`/explore/${type}/${row.id}`}
                  className="prose-link text-link group mt-0.5 flex items-center gap-1 text-xs font-semibold transition-colors hover:text-white"
                >
                  <span>View all</span>
                  <span className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              )}
            </div>
            {row.movies.length > 0 ? (
              <PosterShelf
                movies={row.movies.slice(0, 20)}
                referrer={`/explore/${type}`}
              />
            ) : row.state !== "UNAVAILABLE" ? (
              <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-white/10 px-4 text-center">
                <p className="text-xs text-text-muted">
                  {row.terminalReason === "ALL_CANDIDATES_EXCLUDED_BY_LIBRARY"
                    ? "All candidate titles in this shelf are already in your library."
                    : row.terminalReason === "NO_MATCHING_UNSAVED_TITLES"
                    ? "No matching unsaved titles."
                    : row.hasMore
                    ? "Preview titles are in your library. Explore category to see more."
                    : "No titles met this shelf's criteria."}
                  {row.underlyingLimit === "SELECTION_LIMIT_REACHED" && " (Provider selection limit reached)"}
                  {row.underlyingLimit === "PROVIDER_EXHAUSTED" && " (Provider feeds exhausted)"}
                </p>
              </div>
            ) : null}
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
