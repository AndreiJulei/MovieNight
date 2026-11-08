/**
 * Logic and calculations for the 0-10 personal rating slider (Ticket 4: RS01-RS04).
 */

export const MIN_RATING = 0
export const MAX_RATING = 10
export const RATING_STEP = 0.5

const KEY_STEP_DELTAS: Record<string, number> = {
  ArrowUp: RATING_STEP,
  ArrowRight: RATING_STEP,
  ArrowDown: -RATING_STEP,
  ArrowLeft: -RATING_STEP,
  PageUp: 1.0,
  PageDown: -1.0,
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
  return Math.round(clamped * 2) / 2
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

/**
 * Formats a rating value into human-readable text.
 * e.g. 0 or null -> "Unrated"
 * 7.5 -> "★ 7.5"
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
 * - ArrowLeft / ArrowDown: -0.5
 * - ArrowRight / ArrowUp: +0.5
 * - PageDown: -1.0
 * - PageUp: +1.0
 * - Home: 0 (Unrated -> null)
 * - End: 10.0
 * Returns undefined if key is not a navigation key.
 */
export function calculateNextRating(
  currentRating: number | null | undefined,
  key: string,
): number | null | undefined {
  const current = ratingToSliderValue(currentRating)

  if (key === "Home") {
    return null
  }
  if (key === "End") {
    return MAX_RATING
  }

  const delta = KEY_STEP_DELTAS[key]
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
