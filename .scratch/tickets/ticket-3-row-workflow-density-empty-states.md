## Outcome
Refine the Home page and Explore page row hierarchies: implement an adaptive fallback shelf workflow for recommendations, tighten vertical spacing while expanding row scale, replace blank empty shelves with centered bold guidance and CTAs, and standardize the "Reload list" control across both pages.

## Requirements and scope
1. **Home page row workflow & fallback hierarchy:**
   - **Case 1: No personal recommendations and no friends suggestions:**
     - Render `Top Rated` row (sourced from explore `top-rated`).
     - Render `Popular & Well-Rated` row below it (sourced from explore `popular`, filtered to `voteAverage >= 7.0` and deduplicated against titles in Top Rated).
   - **Case 2: Personal recommendations available, but no friends suggestions:**
     - Render `Personal Recommendations` row.
     - Render `Top Rated` row.
     - Render `Popular & Well-Rated` row below.
   - **Case 3: Both personal recommendations and friends suggestions available:**
     - Render `Personal Recommendations` row.
     - Render `Friend Suggestions` row.
     - Render `Top Rated` row.
2. **Row scale & density:**
   - Increase poster card presentation scale slightly to highlight titles.
   - Reduce vertical gap between shelves on both the Home page and Explore pages from `space-y-16 sm:space-y-24` down to `space-y-10 sm:space-y-16`.
3. **Empty state overhaul:**
   - Eliminate blank rows. If a user has no data for personal recommendations or friend suggestions, display a clear, centered, bold card:
     - **Personal recommendations empty:**
       - Bold message: "No recommendations yet. Start by marking movies as watched to let MovieNight learn your taste."
       - Primary CTA button: `[Explore Movies]` navigating to `/explore/movies`.
     - **Friend suggestions empty:**
       - Bold message: "No friend suggestions yet. Add friends who have watched movies to see their picks here."
       - Primary CTA button: `[Find Friends]` navigating to friends/social view.
4. **Unified reload button:**
   - Standardize the reload action on both Home and Explore section headers:
     - Ghost button format: `[↺ Reload list]`
     - Placed consistently in the top-right of the shelf header.

## Acceptance Criteria
- **RW01 — Adaptive row ordering:** Home page renders shelves matching the exact 3-case state workflow.
- **RW02 — Deduplication:** Titles appearing in Top Rated do not appear in Popular & Well-Rated.
- **RW03 — Density:** Vertical spacing between shelves measures `space-y-10 sm:space-y-16`.
- **RW04 — Centered empty states:** No empty poster shelves are rendered; instead, clear bold messages with buttons display centered.
- **RW05 — Unified reload action:** Both pages use the identical `[↺ Reload list]` button in the shelf header.

## Verification
- Unit tests verifying shelf ordering logic under empty, partial, and full data states.
- Playwright tests confirming presence of empty state messages and navigation from the CTA buttons.

