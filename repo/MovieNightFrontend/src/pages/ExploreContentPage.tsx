import { useMemo, useState } from "react";
import { Link, matchPath, useRouter } from "../router";
import AppShell from "../components/AppShell";
import PosterShelf from "../components/PosterShelf";
import MovieGrid from "../components/MovieGrid";
import TopBar, { type Filters, type SortBy, type ViewMode, type MinRating } from "../components/TopBar";
import { useStore } from "../store/MovieStore";
import { useToast } from "../components/Toast";
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
  const { toast } = useToast();

  const backendRows = useExploreMedia(type);

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

    // Local fallback computation
    const targetType = config.mediaType;
    const allOfType = store.movies.filter((m) => {
      if (targetType === "MOVIE") return (m.mediaType || "MOVIE").toUpperCase() === "MOVIE" || m.id === "anime-demon-slayer-movie";
      return (m.mediaType || "").toUpperCase() === targetType;
    });

    const newest = [...allOfType].sort((a, b) => b.year - a.year || (b.imdb ?? 0) - (a.imdb ?? 0)).slice(0, 10);
    const newestIds = new Set(newest.map((m) => m.id));

    const topRated = [...allOfType].sort((a, b) => (b.imdb ?? 0) - (a.imdb ?? 0));
    const popular = [...allOfType]
      .filter((m) => !newestIds.has(m.id))
      .sort((a, b) => (b.imdb ?? 0) + (b.rt ? b.rt / 10 : 0) - ((a.imdb ?? 0) + (a.rt ? a.rt / 10 : 0)));

    const result: SuggestionRow[] = [];

    if (type === "movies") {
      if (newest.length > 0) {
        result.push({
          id: "newest",
          title: "Newest Releases",
          movies: newest,
          subtitle: "Released in the last 90 days",
        });
      }
      if (popular.length > 0) {
        result.push({
          id: "popular",
          title: "Most Popular",
          movies: popular,
          subtitle: "Trending global blockbusters",
        });
      }
      if (topRated.length > 0) {
        result.push({
          id: "top-rated",
          title: "Top Rated",
          movies: topRated,
          subtitle: "Acclaimed cinematic masterpieces",
        });
      }
      const upcoming = [...allOfType].filter((m) => m.year >= 2025);
      if (upcoming.length > 0) {
        result.push({
          id: "upcoming",
          title: "Upcoming & Most Anticipated",
          movies: upcoming,
          subtitle: "Anticipated releases of the year",
        });
      }
    } else if (type === "tv") {
      const airing = allOfType.filter((m) => m.isAiring);
      if (airing.length > 0) {
        result.push({
          id: "airing",
          title: "Currently Airing",
          movies: airing,
          subtitle: "Episodes broadcasting now",
        });
      }
      if (popular.length > 0) {
        result.push({
          id: "popular",
          title: "Most Popular",
          movies: popular,
          subtitle: "Trending television favorites",
        });
      }
      if (topRated.length > 0) {
        result.push({
          id: "top-rated",
          title: "Top Rated",
          movies: topRated,
          subtitle: "Critically acclaimed television",
        });
      }
    } else if (type === "anime") {
      const airing = allOfType.filter((m) => m.isAiring);
      if (airing.length > 0) {
        result.push({
          id: "current-season",
          title: "Current Season Hits",
          movies: airing,
          subtitle: "Seasonal broadcast favorites",
        });
      }
      if (popular.length > 0) {
        result.push({
          id: "popular",
          title: "Most Popular",
          movies: popular,
          subtitle: "Fan favorites worldwide",
        });
      }
      if (topRated.length > 0) {
        result.push({
          id: "top-rated",
          title: "All-Time Acclaimed",
          movies: topRated,
          subtitle: "Timeless anime masterworks",
        });
      }
    }

    return result;
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
      if (sortBy === "year") return b.year - a.year;
      if (sortBy === "rating") return (b.imdb ?? 0) - (a.imdb ?? 0);
      return 0;
    });

    const userHasMovie = (movieId: string) => {
      if (!store.currentUser) return false;
      return !!store.entryFor(store.currentUser.id, movieId);
    };

    return (
      <AppShell>
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
          onAddToWatchlist={(movieId) => {
            const movieObj = sortedMovies.find((sm) => sm.id === movieId);
            store.addToWatchlist(movieId, movieObj);
            const m = movieObj || store.movieById(movieId);
            toast({
              message: `"${m?.title ?? "Title"}" added to Watchlist`,
              type: "success",
              onUndo: () => store.removeFromWatchlist(movieId),
            });
          }}
          userHasMovie={userHasMovie}
        />
      </AppShell>
    );
  }

  // Shelf rows view
  return (
    <AppShell>
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
