---
name: Movie Night
description: Sophisticated, restrained dark cinematic tracking and curation system. Dark warm-ink navy background with subtle indigo accents and quiet peer controls.
colors:
  bg: "#05070d"
  surface: "#0b1019"
  surface-raised: "#111726"
  surface-popover: "#0e1320"
  border: "#1a2236"
  border-subtle: "rgba(255, 255, 255, 0.08)"
  border-hover: "rgba(255, 255, 255, 0.18)"
  text-primary: "#e5e9f0"
  text-muted: "#7c869c"
  accent: "#4f46e5"
  accent-hover: "#4338ca"
  link: "#818cf8"
  link-hover: "#a5b4fc"
  success: "#22c55e"
  danger: "#f0888c"
typography:
  sans:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
rounded:
  card: "8px"
  btn: "6px"
  popover: "8px"
spacing:
  base: "4px"
  nav-height: "56px"
---

# Movie Night Design System

## Overview
A tracker for movies, TV, and anime TV intended for public deployment.
Product behavior and privacy follow the [root specification](../../spec.md). The tone is **simple, not clinical** — sophisticated through restraint and consistency, not decorative noise. Every screen belongs to the same app; nothing feels bolted on.

Three core surfaces with three distinct jobs:
- **Watched / Watchlist**: Your tracking surface (what you've already engaged with).
- **Explore**: The catalog, browsable by media type (what exists in the world). Each Explore page opens with its spotlight hero and Top 10 today row.
- **Home**: Curated for you specifically (what's worth your attention right now).

## Colors
- **Page Ground (`#05070d`)**: Deep atmospheric midnight black/navy.
- **Surface (`#0b1019`)**: Base card background and shelf backgrounds.
- **Surface Raised (`#111726`)**: Interactive cards, filter buttons, and search inputs.
- **Surface Popover (`#0e1320`)**: Dropdowns, select sheets, and floating menus.
- **Borders (`#1a2236` / `white/[0.08]`)**: Crisp, subtle hairline borders. Hover lifts to `white/[0.18]`.
- **Text Primary (`#e5e9f0`)**: High contrast, crisp readable white/neutral.
- **Text Muted (`#7c869c`)**: Subtle secondary metadata, dates, genre tags.
- **Accent (`#4f46e5`)**: Electric indigo used sparingly for active states, CTA highlights, and primary markers.
- **Link Text (`#818cf8`)**: Accessible indigo text for small links and inline actions, meeting WCAG AA 4.5:1 contrast against dark backgrounds.

## Typography
- **Primary Typeface**: Inter (weights 400, 500, 600, 700).
- **Rank Numerals** (Top 10 today): the one display exception to the scale. Outlined Inter 700 at 104px (phone) / 152px (`sm`+), filled with Page Ground and stroked in Text Primary at 78%.
- **Numbers**: Tabular numerals (`font-variant-numeric: tabular-nums`) for all ratings, runtimes, counts, and release dates.
- **Scale**:
  - Display / Hero Title: `text-2xl` to `text-3xl font-bold tracking-tight`
  - Row Headings (`ShelfSection`): `text-lg sm:text-xl lg:text-2xl font-semibold tracking-tight` (18px phone, 24px desktop)
  - Section Headings: `text-base font-semibold tracking-wide text-text-primary`
  - Body: `text-sm text-text-muted`
  - Badges & Controls: `text-xs font-medium`
  - Phone exceptions (below 768px, #28): the phone home hero title is `text-xl font-bold` so title, metadata and actions fit under the poster within 85vh (#41); the phone title-page action row uses `text-[11px] font-semibold` labels so its buttons stay on one row at 360px; the phone hero's poster badge is `text-[10px]`.

## Layout
- **Global Navigation**: Fixed top bar (`h-14`) on desktop with subtle glassmorphism (`bg-[#05070d]/80 backdrop-blur-md`). Below 1024px, a bottom bar (`h-14`) with exactly three items: the **MN** monogram (home; "N" in the accent colour), the menu button, and Settings (#27). The menu opens as a full-width panel resting on the bar's top edge with a fade of at most 100ms and no slide. It is non-modal: the bar stays usable, and tapping ☰ again, tapping outside, Esc or navigating closes it. Opening it never focuses the search field. The page dims only while searching, and the panel rises above the on-screen keyboard.
- **Filter Zone**: Grouped into **one quiet cluster** at the top-right. View, Sort, and Media Type sit side-by-side as equal peer controls with identical heights and visual weights.
- **Poster Shelves**: Horizontal carousels with smooth scrolling and clean "View all →" affordances. Rows and poster grids use the wide content area: centred, at most 1680px of content, with 16px / 32px minimum gutters (120px each side at 1920px); shelf tracks bleed into the gutters. Row posters zoom to 1.05 on hover/focus (the same `scale-105` as poster cards). Rows stack with ≤32px (phone) / ≤48px (desktop) between posters and the next heading.
- **Poster Grids**: 2 columns on phones, 3 from 600px, then ~220px minimum cards.
- **View Modes** (#42): pages with the View switcher (Watched/Watchlist, Explore "View all", personal recommendations, custom lists) offer Grid / Compact / List, remembered in `app_view_mode` and carried in `?view=`. On phones Grid is 3 columns and Compact 4; from 1024px Grid keeps the ~220px cards and Compact stays denser. List stacks one title per row: a 96px 2:3 poster, then the title (≤2 lines), `year · ★ rating` and the overview clamped to 3 lines (omitted when empty), with hairline dividers between rows; the whole row opens the title. Watched cards show title + personal rating; Watchlist cards show title + year. A friend's library cards show title + year + the friend's rating (Watched) or the TMDB audience rating (Watchlist).

## Elevation & Depth
- Flat, atmospheric tonal layering rather than heavy drop shadows.
- Micro-glassmorphism on dropdowns (`backdrop-blur-xl bg-[#0e1320] border border-white/15`).

## Shapes
- Buttons and chips: `rounded-md` (`6px`) to `rounded-lg` (`8px`).
- Cards and posters: `rounded-lg` (`8px`) with subtle overflow clipping.
- Phone exception (below 768px, #28): the phone home hero's large centred posters, and the phone title page's poster, trailer box (#44) and one-row action buttons, use `rounded-xl` (`12px`).

## Components
- **Peer Filter Controls**: Dropdown triggers using `h-8`, `px-3`, `text-xs`, `border border-white/10 bg-[#111624] text-text-primary hover:border-white/20`.
- **Nav Dropdown**: Clean plain text list beneath the parent link with seamless hover highlights (`hover:bg-white/[0.04]`).
- **Poster Cards**: 2:3 ratio with lazy loading, subtle scale transition on hover (`group-hover:scale-105`), and clean rating tags.
- **Hero Banner**: Curated spotlight presentation showcasing prominent titles across core discovery pillars (Movies, TV, Anime, For You) with cinematic backdrop, rank badge, clean metadata pills, direct 'More info' access, and quick-save watchlist toggle (synopsis omitted for unobstructed artwork and streamlined visual density). On phones (below 768px), the Home hero instead shows portrait poster slides over a dimmed, blurred backdrop, with the title, metadata and actions below the poster, all within 85vh (#28, #41). The poster is about 72% of the screen width where the height allows. Its slide indicator is a slim 28px row of dots (active dot elongated) with an inline pause/play button and no panel, directly below the actions; each control keeps a 44px tap target through padding. Tablets and desktop keep the bordered control panel at the bottom-right.
- **Phone Title Page** (below 768px, #44, IMDb-style; replaces the #28 centred poster): the title (`text-3xl font-bold`, wrapping) and a `year · certification (if known) · runtime` line; then the trailer box at full content width, 16:9 and `rounded-xl`, showing the backdrop with a centred ▶ when a trailer exists (▶ plays it inside the box; Close, Esc or navigating restores the backdrop) and the backdrop alone otherwise; then the portrait poster (~30% width, add-to-watchlist toggle on its corner, the poster-transition target) beside horizontally scrolling genre chips and the overview; then the rating badges. Watchlist, Watched/rating and List actions sit in one row of equal icon-over-label buttons (≥44px). Tablets and desktop keep the wide backdrop hero.
- **Spotlight Hero** (Explore): the Hero Banner's `spotlight` variant at the top of each Explore page, replacing the page title. About 55vh on desktop (`sm:h-[55vh]`, 440–640px), rotating five of the category's titles trending this week with a "#N Trending this week" badge. The category name sits above the badge as a small uppercase label (`text-xs sm:text-sm font-semibold tracking-[0.18em]`). If it is unavailable, the category heading and a retry take its place.
- **Ranked Row** ("Top 10 today"): the shared poster row in chart mode directly below the spotlight hero. Each poster has its rank numeral (1–10) at its left, tucked slightly behind the poster, with the same posters, gaps and gutters as every other row. A stale chart shows the shelves' "Stale snapshot" notice; an unavailable one shows a notice with a retry.
- **In Library Tag**: small `text-xs font-medium` tag at a poster's top-left (`bg-bg/85 backdrop-blur-sm rounded-md`), used where a row keeps library titles (the Top 10 today chart).

## Do's and Don'ts
- **DO** keep filters unified in one quiet cluster; do not create separate layout rows or mismatched control styles.
- **DO** explain missing history or insufficient recommendation coverage and show service errors with recovery actions. Optional decorative shelves may be hidden when empty; preserve required explanatory states.
- **DO** deduplicate rows (e.g. exclude items already in Newest from Most Popular).
- **DON'T** invent decorative variations between Movies, TV, and Anime pages; let data differences (e.g. Currently Airing) drive the structure.
- **DON'T** turn Home into an Explore repeat; keep it curated to the spotlight Hero Banner, personalized/friend recommendations shelves, and the editorial narrative.
