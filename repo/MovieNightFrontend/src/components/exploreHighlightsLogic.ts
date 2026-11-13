import type { Movie, MediaType } from "../store/data"
import type {
  ApiSuggestionCategory,
  ApiSuggestionMovieItem,
  ApiSuggestionsResponse,
} from "../api/movies"
import { titleId } from "../store/titleIdentity.ts"
import { createHeroSlide, type HeroSlide } from "./heroBannerLogic.ts"
import { EXPLORE_CATEGORIES, type ExploreCategory } from "./exploreCategories.ts"

/**
 * Explore highlights (#26 PD-10): the category's spotlight hero (TMDB
 * trending this week) and its "Top 10 today" row (TMDB trending today).
 */
export const SPOTLIGHT_MAX_SLIDES = 5
export const TOP_TEN_SIZE = 10

/** "loading" until the first answer; "unavailable" hides the section and offers a retry (EH04). */
export type HighlightStatus = "loading" | "ready" | "unavailable"

/** The highlights request as the page holds it: the last answer, the last failure, and whether a load runs. */
export interface HighlightsRequest {
  loading: boolean
  error: string | null
  data: ApiSuggestionsResponse | null
}

/**
 * When a shown chart is past its refresh interval (the server reports STALE),
 * the time it was last refreshed; null otherwise.
 */
export type StaleSince = string | null

export interface RankedTitle {
  rank: number
  movie: Movie
}

export interface HighlightsView {
  spotlight: {
    status: HighlightStatus
    slides: HeroSlide[]
    staleSince: StaleSince
  }
  topTen: {
    status: HighlightStatus
    entries: RankedTitle[]
    staleSince: StaleSince
  }
}

/** Maps a chart title; null when it has no usable identity. */
function chartTitle(
  item: ApiSuggestionMovieItem,
  type: ExploreCategory,
): Movie | null {
  const mediaType = (
    item.mediaType
      ? item.mediaType.toUpperCase()
      : EXPLORE_CATEGORIES[type].mediaType
  ) as MediaType
  let id: string
  try {
    id = titleId(item.tmdbId, mediaType)
  } catch {
    return null
  }
  return {
    id,
    tmdbId: item.tmdbId,
    title: item.title,
    year: item.releaseYear ?? null,
    posterSeed: null,
    posterUrl: item.posterUrl ?? null,
    backdropUrl: item.backdropUrl ?? null,
    logoUrl: item.logoUrl ?? null,
    imdb: item.imdbRating ?? null,
    tmdbRating: item.voteAverage ?? null,
    tmdbVotes: item.voteCount ?? null,
    rt: item.rottenTomatoesRating ?? null,
    overview: "",
    genres: item.genres ?? [],
    mediaType,
  }
}

/** A chart's titles with their 1-based chart rank, skipping unusable ones. */
function rankedTitles(
  category: ApiSuggestionCategory | undefined,
  type: ExploreCategory,
): RankedTitle[] {
  if (!category || category.state === "UNAVAILABLE") return []
  return category.movies.flatMap((item, index) => {
    const movie = chartTitle(item, type)
    return movie ? [{ rank: index + 1, movie }] : []
  })
}

/**
 * "loading" only before any answer. While a retry runs after a failure the
 * notice stays, so the section never grows and shrinks again (EH04).
 */
function statusOf(shown: number, request: HighlightsRequest): HighlightStatus {
  if (shown > 0) return "ready"
  return request.loading && !request.data && !request.error
    ? "loading"
    : "unavailable"
}

/**
 * What the Explore highlights section shows for one highlights response.
 * The spotlight rotates up to 5 of the weekly chart's titles that have a
 * backdrop, each badged with its chart rank; the Top 10 row numbers the daily
 * chart's first 10 usable titles 1-10. Library titles are kept: these are charts. A missing, failed or
 * empty chart makes only its own section unavailable (EH04).
 */
export function highlightsView(
  type: ExploreCategory,
  request: HighlightsRequest,
): HighlightsView {
  const categories = request.data?.categories ?? []
  const find = (id: string) => categories.find((c) => c.id === id)

  const slides = rankedTitles(find("spotlight"), type)
    .filter(({ movie }) => Boolean(movie.backdropUrl))
    .slice(0, SPOTLIGHT_MAX_SLIDES)
    .map(({ rank, movie }) =>
      createHeroSlide({
        badge: `#${rank} Trending this week`,
        categoryPillar: type,
        movie,
      }),
    )
  // The row numbers what it shows 1-10 without gaps.
  const entries = rankedTitles(find("top-10"), type)
    .slice(0, TOP_TEN_SIZE)
    .map(({ movie }, index) => ({ rank: index + 1, movie }))

  const staleSince = (id: string): StaleSince => {
    const category = find(id)
    return category?.state === "STALE" ? (category.updatedAt ?? "") : null
  }

  return {
    spotlight: {
      status: statusOf(slides.length, request),
      slides,
      staleSince: slides.length > 0 ? staleSince("spotlight") : null,
    },
    topTen: {
      status: statusOf(entries.length, request),
      entries,
      staleSince: entries.length > 0 ? staleSince("top-10") : null,
    },
  }
}
