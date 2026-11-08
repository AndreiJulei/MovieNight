import type { Movie } from "../store/data"

export type HomeShelfType = "personal" | "friends" | "top-rated" | "popular"

export interface DetermineHomeShelvesParams {
  personalMovies: Movie[]
  friendMovies: Movie[]
  topRatedMovies?: Movie[]
  popularMovies?: Movie[]
}

/**
 * Filter popular movies to voteAverage >= 7.0 and deduplicate against titles in Top Rated (RW02).
 */
export function filterAndDeduplicatePopular(
  popularMovies: Movie[],
  topRatedMovies: Movie[],
): Movie[] {
  const topRatedIds = new Set(topRatedMovies.map((m) => m.id))
  const topRatedTmdbIds = new Set(
    topRatedMovies.map((m) => m.tmdbId).filter(Boolean),
  )
  const topRatedTitles = new Set(
    topRatedMovies.map((m) => m.title.trim().toLowerCase()),
  )

  return popularMovies
    .filter((m) => {
      const rating = m.tmdbRating ?? m.imdb ?? 0
      return rating >= 7.0
    })
    .filter((m) => {
      if (topRatedIds.has(m.id)) return false
      if (m.tmdbId && topRatedTmdbIds.has(m.tmdbId)) return false
      if (topRatedTitles.has(m.title.trim().toLowerCase())) return false
      return true
    })
}

/**
 * Determine Home page shelf ordering based on recommendation availability (RW01).
 *
 * Case 1: No personal recommendations and no friends suggestions:
 *   - Top Rated row
 *   - Popular & Well-Rated row
 *
 * Case 2: Personal recommendations available, but no friends suggestions:
 *   - Personal Recommendations row
 *   - Top Rated row
 *   - Popular & Well-Rated row
 *   (Also accommodates friend-only activity as single recommendation source fallback).
 *
 * Case 3: Both personal recommendations and friends suggestions available:
 *   - Personal Recommendations row
 *   - Friend Suggestions row
 *   - Top Rated row
 */
export function determineHomeShelfOrdering(
  params: DetermineHomeShelvesParams,
): {
  caseIndex: 1 | 2 | 3
  shelves: HomeShelfType[]
} {
  const hasPersonal = params.personalMovies.length > 0
  const hasFriends = params.friendMovies.length > 0

  if (hasPersonal && hasFriends) {
    return {
      caseIndex: 3,
      shelves: ["personal", "friends", "top-rated"],
    }
  }

  if (hasPersonal && !hasFriends) {
    return {
      caseIndex: 2,
      shelves: ["personal", "top-rated", "popular"],
    }
  }

  if (!hasPersonal && hasFriends) {
    return {
      caseIndex: 2,
      shelves: ["friends", "top-rated", "popular"],
    }
  }

  // Case 1: No personal recommendations and no friends suggestions
  return {
    caseIndex: 1,
    shelves: ["top-rated", "popular"],
  }
}

export const EMPTY_STATE_MESSAGES = {
  personal: {
    message:
      "No recommendations yet. Start by marking movies as watched to let MovieNight learn your taste.",
    ctaLabel: "Explore Movies",
    ctaTo: "/explore/movies",
  },
  friends: {
    message:
      "No friend suggestions yet. Add friends who have watched movies to see their picks here.",
    ctaLabel: "Find Friends",
    ctaTo: "/friends",
  },
} as const

export const RELOAD_BUTTON_ICON = "↺"
export const RELOAD_BUTTON_LABEL = "Reload list"
export const RELOAD_BUTTON_TEXT = `${RELOAD_BUTTON_ICON} ${RELOAD_BUTTON_LABEL}`
export const SHELF_SPACING_CLASS = "space-y-10 sm:space-y-16"
