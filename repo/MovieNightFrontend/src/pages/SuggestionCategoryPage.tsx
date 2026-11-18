import useWatchlistSave from "../hooks/useWatchlistSave"
import { useEffect, useMemo, useState } from "react"
import { matchPath, useQuery, useRouter } from "../router"
import { readStoredViewMode, resolveViewMode, viewModeSearch } from "../components/viewMode"
import AppShell from "../components/AppShell"
import BackLink from "../components/BackLink"
import MovieGrid from "../components/MovieGrid"
import usePersonalRecommendations, {
  mapPersonalMovie,
} from "../hooks/usePersonalRecommendations"
import PersonalRecommendationStatus from "../components/PersonalRecommendationStatus"
import { useStore } from "../store/MovieStore"
import TopBar, {
  type Filters,
  type SortBy,
  type ViewMode,
  type MinRating,
} from "../components/TopBar"
import { filterAndSortMovies } from "../components/movieFilterSort"
import ShelfEmptyCard from "../components/ShelfEmptyCard"

export default function SuggestionCategoryPage() {
  const store = useStore()
  const { saveWatchlist, error: saveError } = useWatchlistSave()
  const { path, navigate } = useRouter()
  const query = useQuery()
  const params = matchPath("/suggestions/:category", path)
  const category = params?.category || "for-you"

  const suggestions = usePersonalRecommendations()
  const title = "Personal movie recommendations"
  const rawMovies = useMemo(
    () => suggestions.category?.movies.map(mapPersonalMovie) ?? [],
    [suggestions.category],
  )

  // #42: ?view= first, then the remembered view, then Grid.
  const viewMode: ViewMode = resolveViewMode(query.get("view"), readStoredViewMode())

  const [sortBy, setSortBy] = useState<SortBy>("recommendation")
  const [minRating, setMinRating] = useState<MinRating>(0)
  useEffect(() => {
    setSortBy("recommendation")
    setMinRating(0)
  }, [category, store.currentUser?.id])

  const filters: Filters = {
    sortBy,
    minRating,
    dateRange: "all",
    viewMode,
  }

  const handleFilterChange = (f: Filters) => {
    setSortBy(f.sortBy)
    setMinRating(f.minRating)
    if (f.viewMode !== viewMode) {
      const qs = viewModeSearch(query, f.viewMode)
      navigate(`${path}${qs ? `?${qs}` : ""}`)
    }
  }

  const sortedMovies = useMemo(
    () => filterAndSortMovies(rawMovies, sortBy, minRating),
    [rawMovies, sortBy, minRating],
  )

  // Check if current user already has a movie
  const userHasMovie = (movieId: string) => {
    const userId = store.currentUser?.id
    if (!userId) return false
    return !!store.entryFor(userId, movieId)
  }

  const referrerPath = `/suggestions/${category}`

  return (
    <AppShell width="wide">
      <div className="mb-4">
        <BackLink fallback="/suggestions" label="Back to Personal Recommendations" />
      </div>

      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          {title}
        </h1>
      </div>

      <PersonalRecommendationStatus suggestions={suggestions} />
      {saveError && (
        <p role="alert" className="mb-4 text-danger">
          {saveError}
        </p>
      )}
      <TopBar
        recommendationOrder
        count={sortedMovies.length}
        avg={null}
        filters={filters}
        onChange={handleFilterChange}
        showRating={true}
        audienceControls
        showAddButton={false}
      />

      {sortedMovies.length > 0 ? (
        <MovieGrid
          movies={sortedMovies}
          view={viewMode}
          empty="No titles found for this recommendation category."
          referrerOverride={referrerPath}
          showAddToWatchlist
          onAddToWatchlist={saveWatchlist}
          userHasMovie={userHasMovie}
          onDismiss={suggestions.dismiss}
        />
      ) : (
        <div className="py-8">
          <ShelfEmptyCard type="personal" />
        </div>
      )}
    </AppShell>
  )
}
