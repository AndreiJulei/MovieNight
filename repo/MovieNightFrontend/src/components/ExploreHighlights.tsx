import { useCallback } from "react"
import HeroBanner from "./HeroBanner"
import PosterShelf from "./PosterShelf"
import RetryButton from "./RetryButton"
import ShelfSection from "./ShelfSection"
import { SHELF_TRACK_CLASS, WIDE_CONTENT_CLASS } from "./layout"
import { useStore } from "../store/MovieStore"
import { useExploreHighlights } from "../hooks/useExploreHighlights"
import type { Movie } from "../store/data"
import { EXPLORE_CATEGORIES, type ExploreCategory } from "./exploreCategories"
import { TOP_TEN_SIZE, type StaleSince } from "./exploreHighlightsLogic"

/** Same notice the shelves show when a chart is past its refresh interval. */
function StaleNotice({ since }: { since: StaleSince }) {
  if (since === null) return null
  return (
    <p role="status" className="mt-1 text-xs text-warning">
      Stale snapshot{since ? ` · updated ${since}` : ""}
    </p>
  )
}

type Highlights = ReturnType<typeof useExploreHighlights>

/**
 * Header of an Explore category page (#26 PD-10): a full-width spotlight hero
 * rotating the category's trending titles, then the "Top 10 today" row in the
 * wide content area. If a chart is unavailable its section is hidden behind a
 * retry; the shelves below load independently (EH04).
 */
export default function ExploreHighlights({
  type,
}: {
  type: ExploreCategory
}) {
  const highlights = useExploreHighlights(type)
  return (
    <>
      <Spotlight type={type} highlights={highlights} />
      <div className={`${WIDE_CONTENT_CLASS} pt-6 sm:pt-8`}>
        <StaleNotice since={highlights.spotlight.staleSince} />
        <TopTenRow type={type} highlights={highlights} />
      </div>
    </>
  )
}

function Spotlight({
  type,
  highlights,
}: {
  type: ExploreCategory
  highlights: Highlights
}) {
  const label = EXPLORE_CATEGORIES[type].title
  const { spotlight } = highlights

  if (spotlight.status === "unavailable") {
    // The page keeps its category heading when the hero is hidden.
    return (
      <div className={`${WIDE_CONTENT_CLASS} pt-4 lg:pt-6`}>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          {label}
        </h1>
        <div className="mt-1 flex items-center gap-3">
          <p role="status" className="text-sm text-text-muted">
            Trending titles are unavailable right now.
          </p>
          <RetryButton
            onRetry={highlights.retry}
            busy={highlights.retrying}
            label={`Retry trending ${label}`}
          />
        </div>
      </div>
    )
  }

  // The category stays the page heading (route focus and the tab title use the
  // first h1); the hero shows it as a small visible label.
  return (
    <>
      <h1 className="sr-only">{label}</h1>
      <HeroBanner
        slides={spotlight.slides}
        loading={spotlight.status === "loading"}
        variant="spotlight"
        label={label}
        ariaLabel={`Trending ${label} spotlight`}
      />
    </>
  )
}

function TopTenRow({
  type,
  highlights,
}: {
  type: ExploreCategory
  highlights: Highlights
}) {
  const store = useStore()
  const userId = store.currentUser?.id
  const isInLibrary = useCallback(
    (movie: Movie) => Boolean(userId && store.entryFor(userId, movie.id)),
    [store, userId],
  )
  const { topTen } = highlights
  const title = "Top 10 today"
  const subtitle = `${EXPLORE_CATEGORIES[type].title} trending on TMDB today`

  // When the whole request failed, the spotlight's notice already offers the retry.
  if (
    topTen.status === "unavailable" &&
    highlights.spotlight.status === "unavailable"
  )
    return null

  return (
    <ShelfSection title={title} subtitle={subtitle} ariaLabel={title}>
      <StaleNotice since={topTen.staleSince} />
      {topTen.status === "ready" ? (
        <PosterShelf
          movies={topTen.entries.map((entry) => entry.movie)}
          referrer={`/explore/${type}`}
          ranked
          isInLibrary={isInLibrary}
        />
      ) : topTen.status === "loading" ? (
        <div
          aria-hidden="true"
          className={`flex gap-3 overflow-hidden sm:gap-5 ${SHELF_TRACK_CLASS}`}
        >
          {Array.from({ length: Math.min(TOP_TEN_SIZE, 6) }, (_, i) => (
            <div
              key={i}
              className="h-[270px] w-[180px] shrink-0 animate-pulse rounded-xl bg-white/[0.06] sm:h-[312px] sm:w-[208px]"
            />
          ))}
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <p role="status" className="text-sm text-text-muted">
            Today's chart is unavailable right now.
          </p>
          <RetryButton
            onRetry={highlights.retry}
            busy={highlights.retrying}
            label="Retry Top 10 today"
          />
        </div>
      )}
    </ShelfSection>
  )
}
