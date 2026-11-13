/**
 * Shared page-width and poster layout classes (#21 PD-05, #22 PD-06).
 *
 * The wide content area is centred and capped at 1680px of content, with
 * 16px (phone) / 32px gutters as the minimum side margin. That leaves 120px
 * each side at 1920px while keeping 7 grid columns there. Rows rely on the
 * gutters: PosterShelf bleeds its scroll track into them with matching
 * negative margins.
 */
export const WIDE_GUTTER_CLASS = "px-4 sm:px-8"

/** 1680px content + 2 × 32px gutters. */
export const WIDE_CONTENT_CLASS = `mx-auto w-full max-w-[1744px] ${WIDE_GUTTER_CLASS}`

/**
 * Scroll track that reaches the viewport edge while its first item aligns with
 * the gutter. Once the content is capped (viewport ≥ 1744px) the track only
 * bleeds 12px, enough for the 1.05 hover zoom and focus ring, so posters stop
 * near the content edge instead of short of the viewport edge.
 */
export const SHELF_TRACK_BLEED_CLASS =
  "-mx-4 px-4 sm:-mx-8 sm:px-8 min-[1744px]:-mx-3 min-[1744px]:px-3"

/**
 * Vertical room around row items. It is the only headroom kept for the
 * hover/focus enlargement, because a horizontally scrolling track clips
 * vertically: scale 1.05 from the centre plus the scaled 2px+2px focus ring
 * needs ~11px on phones (270px cards) and ~12px from sm (312px cards).
 */
export const SHELF_TRACK_PADDING_CLASS = "py-3 sm:py-3.5"

/** One row's scroll track: bleeds into the gutters with hover headroom. */
export const SHELF_TRACK_CLASS = `${SHELF_TRACK_BLEED_CLASS} ${SHELF_TRACK_PADDING_CLASS}`

/**
 * Stack of rows. With the track padding this leaves 24px (phone) / 38px
 * between one row's posters and the next heading (#21 RO01: ≤32 / ≤48).
 */
export const SHELF_SPACING_CLASS = "flex flex-col gap-3 sm:gap-6"

/** Grid columns: 2 on phones, 3 from 600px, then ~220px minimum cards. */
export const POSTER_GRID_COLUMNS_CLASS =
  "grid-cols-2 min-[600px]:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]"

export const POSTER_GRID_CLASS = `grid ${POSTER_GRID_COLUMNS_CLASS} gap-3 sm:gap-4`
