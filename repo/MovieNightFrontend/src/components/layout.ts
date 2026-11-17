/**
 * Shared page-width and poster layout classes (#21 PD-05, #22 PD-06).
 *
 * The wide content area is centred and capped at 1560px of content, with
 * 16px (phone) / 32px (tablet) / 48px (desktop) gutters as the minimum side
 * margin. That leaves 180px each side at 1920px: narrower than the original
 * 1400px page, wider than the first 1680px cap, so rows no longer hug the
 * screen edges.
 */

export const WIDE_GUTTER_CLASS = "px-4 sm:px-8 lg:px-12"

/** 1560px content + 2 × 48px gutters. */
export const WIDE_CONTENT_CLASS = `mx-auto w-full max-w-[1656px] ${WIDE_GUTTER_CLASS}`

/**
 * Scroll track. On phones and tablets it bleeds into the gutters so a row can
 * be swiped edge to edge. On desktop it only bleeds 12px, enough for the 1.05
 * hover zoom and focus ring, so posters stop at the content edge instead of
 * running to the viewport edge.
 */
export const SHELF_TRACK_BLEED_CLASS =
  "-mx-4 px-4 sm:-mx-8 sm:px-8 lg:-mx-3 lg:px-3"

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

/**
 * Grid columns: 2 on phones, 3 from 600px, then ~220px minimum cards. From
 * 1536px the minimum drops to 200px so the 1560px content cap still fits 7
 * columns at 1920 (PG01: 7/5/3/2 at 1920/1440/768/390).
 */
export const POSTER_GRID_COLUMNS_CLASS =
  "grid-cols-2 min-[600px]:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"

export const POSTER_GRID_CLASS = `grid ${POSTER_GRID_COLUMNS_CLASS} gap-3 sm:gap-4`

/** #28: phone title-page actions share one row of equal icon-over-label buttons (≥44px). */
export const COMPACT_ACTION_CLASS =
  "flex min-h-[52px] w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-semibold leading-none"
