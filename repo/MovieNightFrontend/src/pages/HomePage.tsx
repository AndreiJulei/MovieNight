import usePersonalRecommendations, {
  mapPersonalMovie,
} from "../hooks/usePersonalRecommendations"
import useFriendSuggestions from "../hooks/useFriendSuggestions"
import { mapApiMovie, useExploreMedia } from "../hooks/useSuggestions"
import HeroBanner from "../components/HeroBanner"
import CharacterLogoBanner from "../components/CharacterLogoBanner"
import PosterShelf from "../components/PosterShelf"
import ShelfReloadButton from "../components/ShelfReloadButton"
import { Link } from "../router"
import AppShell from "../components/AppShell"
import { useStore } from "../store/MovieStore"
import {
  determineHomeShelfOrdering,
  filterAndDeduplicatePopular,
  SHELF_SPACING_CLASS,
  type HomeShelfType,
} from "../components/homeShelfLogic"
import type { Movie } from "../store/data"

interface ShelfConfig {
  id: HomeShelfType
  ariaLabel: string
  title: string
  subtitle: string
  reloadLabel: string
  onReload: () => void
  isReloadDisabled: boolean
  viewAllTo: string
  movies: Movie[]
  emptyType: "personal" | "friends" | "generic"
}

function HomeShelfSection({ config }: { config: ShelfConfig }) {
  return (
    <section key={config.id} aria-label={config.ariaLabel} className="relative">
      <div className="mb-3 flex items-start justify-between px-1">
        <div>
          <h2 className="text-base font-semibold tracking-wide text-text-primary">
            {config.title}
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">{config.subtitle}</p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <ShelfReloadButton
            onReload={config.onReload}
            disabled={config.isReloadDisabled}
            label={config.reloadLabel}
          />
          <Link
            to={config.viewAllTo}
            className="prose-link text-link group mt-0.5 flex items-center gap-1 text-xs font-semibold transition-colors hover:text-white"
          >
            <span>View all</span>
            <span className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      </div>
      <PosterShelf
        movies={config.movies.slice(0, 20)}
        referrer="/"
        emptyType={config.emptyType}
      />
    </section>
  )
}

export default function HomePage() {
  const store = useStore()
  const currentUser = store.currentUser

  const personalSuggestions = usePersonalRecommendations()
  const personalizedMovies =
    personalSuggestions.category?.movies.map(mapPersonalMovie) ?? []

  // Friend choices come only from the accepted-friend API, in its source order.
  const friendSuggestions = useFriendSuggestions()
  const friendItems =
    friendSuggestions.data?.categories.flatMap((category) => category.movies) ??
    []
  const friendsMovies = friendItems.map((item) => mapApiMovie(item, store))

  // Catalog discovery feeds for fallback shelves (Top Rated and Popular)
  const explore = useExploreMedia("movies")
  const topRatedCategory = explore.rows.find((r) => r.id === "top-rated")
  const popularCategory = explore.rows.find((r) => r.id === "popular")
  const topRatedMovies = topRatedCategory?.movies ?? []
  const popularMoviesRaw = popularCategory?.movies ?? []
  const popularWellRatedMovies = filterAndDeduplicatePopular(
    popularMoviesRaw,
    topRatedMovies,
  )

  // RW01: Adaptive row ordering workflow
  const { shelves } = determineHomeShelfOrdering({
    personalMovies: personalizedMovies,
    friendMovies: friendsMovies,
    topRatedMovies,
    popularMovies: popularWellRatedMovies,
  })

  if (!currentUser) return null

  const shelfConfigs: Record<HomeShelfType, ShelfConfig> = {
    personal: {
      id: "personal",
      ariaLabel: "Personal Recommendations",
      title: "Personal Recommendations",
      subtitle: "Tuned to your watched history and personal ratings",
      reloadLabel: "Reload Personal Recommendations list",
      onReload: () => personalSuggestions.reload(),
      isReloadDisabled: personalSuggestions.loading,
      viewAllTo: "/suggestions/for-you",
      movies: personalizedMovies,
      emptyType: "personal",
    },
    friends: {
      id: "friends",
      ariaLabel: "Friend suggestions",
      title: "Friend suggestions",
      subtitle: "What people in your accepted friend circle are enjoying",
      reloadLabel: "Reload Friend suggestions list",
      onReload: () => friendSuggestions.reload(),
      isReloadDisabled: friendSuggestions.loading,
      viewAllTo: "/suggestions/friends",
      movies: friendsMovies,
      emptyType: "friends",
    },
    "top-rated": {
      id: "top-rated",
      ariaLabel: "Top Rated",
      title: "Top Rated",
      subtitle: "Highest audience rated films across the catalog",
      reloadLabel: "Reload Top Rated list",
      onReload: () => explore.refresh("top-rated"),
      isReloadDisabled: explore.loading || explore.pending,
      viewAllTo: "/explore/movies/top-rated",
      movies: topRatedMovies,
      emptyType: "generic",
    },
    popular: {
      id: "popular",
      ariaLabel: "Popular & Well-Rated",
      title: "Popular & Well-Rated",
      subtitle:
        "Popular films rated 7.0 and above, deduplicated from Top Rated",
      reloadLabel: "Reload Popular & Well-Rated list",
      onReload: () => explore.refresh("popular"),
      isReloadDisabled: explore.loading || explore.pending,
      viewAllTo: "/explore/movies/popular",
      movies: popularWellRatedMovies,
      emptyType: "generic",
    },
  }

  return (
    <AppShell fullBleed>
      {/* ── 1. Curated Spotlight Hero Banner ── */}
      <HeroBanner />

      {/* ── 2. Recommendations & Fallback Shelves ── */}
      <div
        id="recommendations"
        className={`mx-auto max-w-[1400px] px-4 sm:px-8 lg:px-12 pt-8 sm:pt-12 pb-16 sm:pb-20 ${SHELF_SPACING_CLASS}`}
      >
        {shelves.map((shelfId) => (
          <HomeShelfSection key={shelfId} config={shelfConfigs[shelfId]} />
        ))}
      </div>

      {/* ── Rotating Decorative Character Logo Banner ── */}
      <CharacterLogoBanner />

      {/* ── 3. Editorial Narrative / App Description ── */}
      <section
        id="editorial-narrative"
        className="relative mx-auto max-w-4xl px-6 pt-10 pb-20 sm:pt-14 sm:pb-28 text-center"
      >
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
          A single, deliberate space for everything you watch.
        </h2>
        <p className="mt-10 sm:mt-12 text-base sm:text-lg leading-relaxed text-text-muted max-w-2xl mx-auto">
          Here you can track almost anything — from contemporary cinema and
          prestige television to anime and classic gems. Never run out of great
          stories with recommendations tuned to what you actually love, rather
          than an algorithm's guess. Check what your friends have been watching,
          compare ratings, and browse their personal watchlists to discover
          what's worth your evening.
        </p>

        {/* Three quiet editorial pillars */}
        <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-3 text-left border-t border-white/[0.08] pt-10">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Track without boundaries
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
              Log watched titles, assign 10-point ratings, and maintain a
              unified watchlist across Movies, TV Series, and Anime.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Curated by your circle
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
              Explore what your friends have been enjoying, tap into their
              consensus picks, and filter out titles you've already seen.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Group your way
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
              Build private lists for weekend marathons, ongoing seasonals, or
              comfort rewatches without cluttering your watchlist.
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  )
}
