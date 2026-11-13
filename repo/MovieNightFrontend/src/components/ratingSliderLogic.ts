/**
 * Logic and calculations for the 0-10 personal rating slider
 * (Ticket 4: RS01-RS04; ticket #20: RP01-RP04, one decimal place).
 */

export const MIN_RATING = 0
export const MAX_RATING = 10
export const RATING_STEP = 0.1
export const COARSE_RATING_STEP = 0.5
export const PAGE_RATING_STEP = 1.0

const ARROW_DIRECTIONS: Record<string, number> = {
  ArrowUp: 1,
  ArrowRight: 1,
  ArrowDown: -1,
  ArrowLeft: -1,
}

const PAGE_DIRECTIONS: Record<string, number> = {
  PageUp: 1,
  PageDown: -1,
}

/** Rounds to tenths without float drift (0.1 + 0.2 -> 0.3). */
function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * True when the value is a personal rating the API accepts:
 * 0 to 10 with at most one decimal place.
 */
export function isValidPersonalRating(rating: number): boolean {
  return (
    Number.isFinite(rating) &&
    rating >= MIN_RATING &&
    rating <= MAX_RATING &&
    rating * 10 === Math.round(rating * 10)
  )
}

/**
 * Converts a personal rating (number | null) to the slider's numeric position (0 to 10).
 * A null rating maps to 0 ("Unrated").
 */
export function ratingToSliderValue(rating: number | null | undefined): number {
  if (rating == null || isNaN(rating) || rating <= 0) {
    return 0
  }
  const clamped = Math.min(MAX_RATING, Math.max(MIN_RATING, rating))
  return roundToTenth(clamped)
}

/**
 * Converts a slider value (0 to 10) back to a personal rating (number | null).
 * 0 maps to null ("Unrated").
 */
export function sliderValueToRating(sliderVal: number): number | null {
  const snapped = ratingToSliderValue(sliderVal)
  return snapped === 0 ? null : snapped
}

/**
 * Parses raw input from an input event or string into a validated rating or null.
 */
export function parseRatingInput(
  raw: number | string | null | undefined,
): number | null {
  if (raw == null) return null
  const num = typeof raw === "string" ? parseFloat(raw) : raw
  return sliderValueToRating(num)
}

export type TypedRating = { valid: true; rating: number | null } | { valid: false }

/**
 * Parses a rating typed into the number field. Unlike the slider, typed text is
 * never rounded: anything other than 0-10 with at most one decimal is invalid.
 * Empty text and 0 mean "Unrated", matching the slider.
 */
export function parseTypedRating(text: string): TypedRating {
  const trimmed = text.trim()
  if (trimmed === "") return { valid: true, rating: null }
  if (!/^(\d+(\.\d)?|\.\d)$/.test(trimmed)) return { valid: false }
  const rating = Number(trimmed)
  if (!isValidPersonalRating(rating)) return { valid: false }
  return { valid: true, rating: rating === 0 ? null : rating }
}

/**
 * Formats a rating value into human-readable text.
 * e.g. 0 or null -> "Unrated"
 * 8.2 -> "★ 8.2"
 * 8.0 -> "★ 8.0"
 */
export function formatRatingReadout(rating: number | null | undefined): string {
  const val = ratingToSliderValue(rating)
  if (val === 0) {
    return "Unrated"
  }
  return `★ ${val.toFixed(1)}`
}

/**
 * Computes the next rating value based on keyboard navigation.
 * Accepts canonical KeyboardEvent.key values:
 * - ArrowLeft / ArrowDown: -0.1 (-0.5 with Shift)
 * - ArrowRight / ArrowUp: +0.1 (+0.5 with Shift)
 * - PageDown: -1.0
 * - PageUp: +1.0
 * - Home: 0 (Unrated -> null)
 * - End: 10.0
 * Returns undefined if key is not a navigation key.
 */
export function calculateNextRating(
  currentRating: number | null | undefined,
  key: string,
  modifiers: { shiftKey?: boolean } = {},
): number | null | undefined {
  const current = ratingToSliderValue(currentRating)

  if (key === "Home") {
    return null
  }
  if (key === "End") {
    return MAX_RATING
  }

  let delta: number | undefined
  if (key in ARROW_DIRECTIONS) {
    delta = ARROW_DIRECTIONS[key] * (modifiers.shiftKey ? COARSE_RATING_STEP : RATING_STEP)
  } else if (key in PAGE_DIRECTIONS) {
    delta = PAGE_DIRECTIONS[key] * PAGE_RATING_STEP
  }
  if (delta !== undefined) {
    const next = Math.min(MAX_RATING, Math.max(MIN_RATING, current + delta))
    return sliderValueToRating(next)
  }

  return undefined
}

/**
 * Computes percentage across track (0 to 100) for CSS background-fill.
 */
export function calculateTrackFillPercentage(
  rating: number | null | undefined,
): number {
  const val = ratingToSliderValue(rating)
  return (val / MAX_RATING) * 100
}
