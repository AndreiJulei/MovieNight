import type { Movie } from "../store/data";
import type { MinRating, SortBy } from "./TopBar";

/**
 * Shared filter and sort logic for exploration shelves and suggestion category views.
 *
 * Implements DQ10:
 * - Active audience minimum excludes missing ratings.
 * - Missing audience ratings sort last when sorting by rating.
 * - Sort alternatives: title (alphabetical), year (newest first), rating (highest first).
 * - Default "recommendation" order preserves the original server/candidate order.
 */
export function filterAndSortMovies(
  movies: readonly Movie[] | undefined | null,
  sortBy: SortBy,
  minRating: MinRating,
): Movie[] {
  let list = (movies || []).filter((m): m is Movie => Boolean(m));
  if (minRating > 0) {
    list = list.filter((m) => m.tmdbRating != null && m.tmdbRating >= minRating);
  }
  const result = [...list];
  if (sortBy === "title") {
    result.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  } else if (sortBy === "year") {
    result.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  } else if (sortBy === "rating") {
    result.sort((a, b) => (b.tmdbRating ?? -1) - (a.tmdbRating ?? -1));
  }
  return result;
}
