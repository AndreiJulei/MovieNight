/**
 * View modes for poster collections with a view switcher (#42 PD-24).
 *
 * The chosen view comes from `?view=` first, then the remembered
 * `app_view_mode`, then Grid. Grid is the default, so it is never written to
 * the URL.
 */

export const VIEW_MODES = ["grid", "compact", "list"] as const

export type ViewMode = (typeof VIEW_MODES)[number]

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  grid: "Grid",
  compact: "Compact",
  list: "List",
}

export const VIEW_MODE_STORAGE_KEY = "app_view_mode"

export function parseViewMode(value: unknown): ViewMode | null {
  return typeof value === "string" && (VIEW_MODES as readonly string[]).includes(value)
    ? (value as ViewMode)
    : null
}

export function resolveViewMode(urlValue: unknown, storedValue: unknown): ViewMode {
  return parseViewMode(urlValue) ?? parseViewMode(storedValue) ?? "grid"
}

export function readStoredViewMode(): ViewMode | null {
  try {
    return parseViewMode(localStorage.getItem(VIEW_MODE_STORAGE_KEY))
  } catch {
    return null
  }
}

export function rememberViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
  } catch {
    /* storage unavailable: the URL still carries the view */
  }
}

/** The query string (without `?`) with `view` set for `mode`; Grid removes it. */
export function viewModeSearch(search: string | URLSearchParams, mode: ViewMode): string {
  const params = new URLSearchParams(search)
  if (mode === "grid") params.delete("view")
  else params.set("view", mode)
  return params.toString()
}

function validScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10
    ? value
    : null
}

/** The audience rating a List row shows: IMDb, else TMDB. */
export function listRowRating(movie: { imdb?: number | null; tmdbRating?: number | null }): number | null {
  return validScore(movie.imdb) ?? validScore(movie.tmdbRating)
}

/** The `year · ★ rating` line of a List row, omitting missing parts. */
export function listRowMeta({ year, rating }: { year?: number | null; rating?: number | null }): string {
  const parts: string[] = []
  if (typeof year === "number" && Number.isFinite(year) && year > 0) parts.push(String(year))
  const score = validScore(rating)
  if (score != null) parts.push(`★ ${score.toFixed(1)}`)
  return parts.join(" · ")
}
