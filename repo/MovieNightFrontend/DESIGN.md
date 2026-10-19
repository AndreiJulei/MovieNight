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
- **Explore**: The catalog, browsable by media type (what exists in the world).
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

## Typography
- **Primary Typeface**: Inter (weights 400, 500, 600, 700).
- **Numbers**: Tabular numerals (`font-variant-numeric: tabular-nums`) for all ratings, runtimes, counts, and release dates.
- **Scale**:
  - Display / Hero Title: `text-2xl` to `text-3xl font-bold tracking-tight`
  - Section Headings: `text-base font-semibold tracking-wide text-text-primary`
  - Body: `text-sm text-text-muted`
  - Badges & Controls: `text-xs font-medium`

## Layout
- **Global Navigation**: Fixed top bar (`h-14`) on desktop with subtle glassmorphism (`bg-[#05070d]/80 backdrop-blur-md`). Clean bottom bar on mobile (`h-14`).
- **Filter Zone**: Grouped into **one quiet cluster** at the top-right. View, Sort, and Media Type sit side-by-side as equal peer controls with identical heights and visual weights.
- **Poster Shelves**: Horizontal carousels with smooth scrolling, edge fade masks, and clean "View all →" affordances.

## Elevation & Depth
- Flat, atmospheric tonal layering rather than heavy drop shadows.
- Micro-glassmorphism on dropdowns (`backdrop-blur-xl bg-[#0e1320] border border-white/15`).

## Shapes
- Buttons and chips: `rounded-md` (`6px`) to `rounded-lg` (`8px`).
- Cards and posters: `rounded-lg` (`8px`) with subtle overflow clipping.

## Components
- **Peer Filter Controls**: Dropdown triggers using `h-8`, `px-3`, `text-xs`, `border border-white/10 bg-[#111624] text-text-primary hover:border-white/20`.
- **Nav Dropdown**: Clean plain text list beneath the parent link with seamless hover highlights (`hover:bg-white/[0.04]`).
- **Poster Cards**: 2:3 ratio with lazy loading, subtle scale transition on hover (`group-hover:scale-105`), and clean rating tags.
- **Hero**: Single featured item with cinematic backdrop, clean metadata pills, synopsis, and quiet actions.

## Do's and Don'ts
- **DO** keep filters unified in one quiet cluster; do not create separate layout rows or mismatched control styles.
- **DO** explain missing history or insufficient recommendation coverage and show service errors with recovery actions. Optional decorative shelves may be hidden when empty; preserve required explanatory states.
- **DO** deduplicate rows (e.g. exclude items already in Newest from Most Popular).
- **DON'T** invent decorative variations between Movies, TV, and Anime pages; let data differences (e.g. Currently Airing) drive the structure.
- **DON'T** turn Home into an Explore repeat or a carousel; keep it curated to a single hero and two equal suggestion entry panels.
