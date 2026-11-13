import type { Status } from "../store/data"

/**
 * The single line under the title on a library card (#22 PG02):
 * Watched shows the personal rating, Watchlist shows the release year.
 */
export function libraryCardCaption(
  status: Status,
  card: { rating?: number | null; year?: number | null },
): string {
  if (status === "watched") {
    const rating = formatRating(card.rating)
    return rating == null ? "Unrated" : `★ ${rating}`
  }
  return card.year == null ? "" : String(card.year)
}

function formatRating(rating: number | null | undefined): string | null {
  return typeof rating === "number" && Number.isFinite(rating)
    ? rating.toFixed(1)
    : null
}

/**
 * The line under the title on a friend's library card (#22): the year, then
 * the friend's personal rating on Watched, or the TMDB audience rating on
 * Watchlist (the friend has not rated those yet).
 */
export function friendLibraryCardCaption(
  status: Status,
  card: {
    year?: number | null
    friendRating?: number | null
    tmdbRating?: number | null
  },
): string {
  const parts = card.year == null ? [] : [String(card.year)]
  if (status === "watched") {
    const rating = formatRating(card.friendRating)
    parts.push(rating == null ? "Unrated" : `★ ${rating}`)
  } else {
    const rating = formatRating(card.tmdbRating)
    if (rating != null) parts.push(`TMDB ${rating}`)
  }
  return parts.join(" · ")
}
