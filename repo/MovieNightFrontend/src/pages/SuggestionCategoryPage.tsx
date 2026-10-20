import useWatchlistSave from "../hooks/useWatchlistSave";
import { useMemo, useState } from "react";
import { Link, matchPath, useRouter } from "../router";
import AppShell from "../components/AppShell";
import MovieGrid from "../components/MovieGrid";
import { usePersonalRecommendations, useSuggestionsByCategory } from "../hooks/useSuggestions";
import { useStore } from "../store/MovieStore";
import TopBar, { type Filters, type SortBy, type ViewMode, type MinRating } from "../components/TopBar";

export default function SuggestionCategoryPage() {
  const store = useStore();
  const { saveWatchlist } = useWatchlistSave();
  const { path } = useRouter();
  const params = matchPath("/suggestions/:category", path);
  const category = (params?.category || "for-you");

  const personalRows = usePersonalRecommendations();
  const fallbackData = useSuggestionsByCategory(category);

  const { title, subtitle, movies: rawMovies } = useMemo(() => {
    const personalMatch = personalRows.find((r) => r.id === category);
    if (personalMatch) {
      return {
        title: personalMatch.title,
        subtitle: `Curated ${personalMatch.title.toLowerCase()} based on your viewing history and ratings.`,
        movies: personalMatch.movies || [],
      };
    }
    return {
      title: fallbackData.title === "Suggestions" ? "Personal Recommendations" : fallbackData.title,
      subtitle: "Explore all titles in this curated collection.",
      movies: fallbackData.movies || [],
    };
  }, [category, fallbackData, personalRows]);

  // Initialize view mode from localStorage or grid
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

  const [mediaTypeFilter, setMediaTypeFilter] = useState<"ALL" | "MOVIE" | "TV" | "ANIME">("ALL");

  const filteredMovies = useMemo(() => {
    let list = (rawMovies || []).filter(Boolean);
    if (minRating > 0) {
      list = list.filter((m) => (m.imdb ?? 0) >= minRating);
    }
    if (mediaTypeFilter === "ALL") return list;
    return list.filter((m) => {
      if (m.mediaType === mediaTypeFilter) return true;
      if (mediaTypeFilter === "MOVIE" && m.id === "anime-demon-slayer-movie") return true;
      return false;
    });
  }, [rawMovies, mediaTypeFilter, minRating]);

  const sortedMovies = useMemo(() => {
    const list = [...filteredMovies];
    if (sortBy === "title") {
      list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (sortBy === "year") {
      list.sort((a, b) => (b.year || 0) - (a.year || 0));
    } else if (sortBy === "rating") {
      list.sort((a, b) => (b.imdb ?? 0) - (a.imdb ?? 0));
    }
    return list;
  }, [filteredMovies, sortBy]);

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
          ← Back to Personal Recommendations
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          {title}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {subtitle}
        </p>
      </div>

      <TopBar
        count={sortedMovies.length}
        avg={null}
        filters={filters}
        onChange={handleFilterChange}
        showRating={true}
        mediaTypeFilter={mediaTypeFilter}
        onMediaTypeChange={setMediaTypeFilter}
        showAddButton={false}
      />

      <MovieGrid
        movies={sortedMovies}
        compact={viewMode === "compact"}
        empty="No titles found for this recommendation category."
        referrerOverride={referrerPath}
        showAddToWatchlist
        onAddToWatchlist={saveWatchlist}
        userHasMovie={userHasMovie}
      />
    </AppShell>
  );
}
