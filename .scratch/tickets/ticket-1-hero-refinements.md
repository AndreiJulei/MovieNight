## Outcome
Refine the home page Hero Banner so that it highlights the freshest top-ranked movie, applies Bayesian confidence checks for TV (with intentional 150-vote floor), uses seasonal anime, filters out kids and family titles across spotlight pillars, streamlines hero visual density (prominent backdrop, smaller left-aligned title and buttons, no synopsis), conforms strictly to design-system tokens (subtle elevation, 6–8px border radii, no ad-hoc colors), provides a reversible watchlist toggle, and auto-dismisses watchlist save toast notifications after 3 seconds.

## Requirements and scope
1. **Hero slide candidate sourcing:**
   - `#1 in Movies`: Source from the Newest Releases (`newest` category / `RECENT` list) filtered with a minimum rating floor of `voteAverage >= 6.5`. Filter out kids and family titles (TMDB genre IDs 10751, 10762, family/kids genre keywords, and juvenile franchise keywords) to maintain a mature cinematic spotlight. If no title meets the floor, fallback to the top `top-rated` movie (also filtering kids/family).
   - `#1 in TV Series`: Source strictly from the top-rated category (`top-rated`) which enforces Bayesian confidence ranking (`minimumVotes = 150`, adjusted intentionally from 500 to ensure candidate availability while maintaining statistical confidence). If vote count metadata is present, candidate must satisfy `voteCount >= 150`; if metadata is omitted by the backend feed, candidate is preserved. Filter out kids and family titles.
   - `#1 in Anime`: Source from the seasonal anime category (`current-season`), filtering out kids and family releases.
   - `#1 For You`: Highest-confidence personal recommendation (or fallback to `#1 Anticipated` from Upcoming).
2. **Hero visual presentation & Design System:**
   - Make the backdrop poster artwork significantly more visible and unobstructed.
   - Scale down the main title font and buttons; align them cleanly to the left.
   - Omit the synopsis / overview text from the hero banner to keep the presentation clean and cinematic.
   - Replace `bg-red-600` on the rank badge with the design token `bg-accent`.
   - Adhere strictly to `DESIGN.md`:
     - Shapes: Badges, chips, and icon buttons use `rounded-md` (`6px`) or `rounded-lg` (`8px`) instead of `rounded-full`.
     - Elevation & depth: Rely on atmospheric tonal gradients and subtle hairline borders (`border-white/10`); eliminate heavy drop shadows and `shadow-2xl`.
     - Colors: Use design tokens (`bg-surface-raised`, `bg-surface`, `border-border`, `text-accent`) rather than ad-hoc colors (`amber-400`, `bg-black/70`, `bg-black/50`).
3. **Watchlist toggle & toast auto-dismiss:**
   - The hero watchlist action button supports reversible toggling:
     - When not in library (`+`): clicking adds to watchlist via `useWatchlistSave` with a 3-second auto-dismiss success toast.
     - When already in watchlist (`✓`): clicking removes from watchlist via `store.removeFromWatchlist` with a 3-second auto-dismiss confirmation toast.
     - When in watched history (`✓`): disabled/read-only to protect tracked history.
   - All watchlist toast notifications auto-dismiss after 3 seconds (3000ms).

## Acceptance Criteria
- **HB01 — Newest movie candidate:** The `#1 in Movies` slot renders the first movie from the `newest` feed that has `voteAverage >= 6.5`, excluding kids/family titles. If no title meets the floor, falls back to the top non-family `top-rated` movie.
- **HB02 — TV confidence ranking:** The `#1 in TV Series` slot uses the Bayesian confidence-ranked `top-rated` TV feed with `minimumVotes = 150` (if vote count is present) and excludes kids/family titles, rejecting raw airing feeds.
- **HB03 — Streamlined hero overlay & Design System:** The active hero slide renders title, rank badge with `bg-accent`, rating, year, media badge, and action buttons on the left with no synopsis text block, using 6–8px radii, design tokens, and atmospheric layering without heavy drop shadows.
- **HB04 — Toast auto-dismiss & Reversible Toggle:** Watchlist save and removal confirmation toasts automatically disappear after 3 seconds; hero button toggles watchlist state reversibly.

## Verification
- Unit tests covering slide candidate selection, family/kids filtering, and TV vote floor rules in `heroBannerLogic.ts`.
- Component/browser tests verifying hero layout, design token classes, reversible watchlist toggle, and toast auto-dismiss after 3000ms.

