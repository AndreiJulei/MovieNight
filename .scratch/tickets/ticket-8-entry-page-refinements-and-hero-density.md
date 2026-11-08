## Outcome
Refine the title detail page (`/movies/:id`) and hero presentation across 8 key areas: inline hero trailer playback replacing the logo/backdrop spot without a pop-up modal, title logo rendering with graceful text fallback, robust audience/critic rating display with background enrichment sync, horizontal "You May Also Like" recommendation shelf, in-place watched history removal without unwanted redirection, top-bar artwork clearance and height tuning, high-fidelity squircle cast photo cards matching reference designs, and hero decluttering with lighter backdrop dimness and elegant empty states.

## Requirements and scope

1. **Inline Hero Trailer Playback (Item 1):**
   - Eliminate the detached modal popup dialog for trailers.
   - When the user clicks "Play" / "Play Trailer", embed the YouTube iframe directly in the hero section (occupying the media artwork viewport area).
   - The title logo/heading, ratings, genres and synopsis fade out smoothly (with the dark scrims) while the trailer plays, and fade back in when it closes. The action button row stays visible below the hero.
   - The Play Trailer button turns into a "Close Trailer" toggle while the trailer plays (Escape also closes it), returning to the key art backdrop.

2. **Title Logo Rendering & Data Mapping (Item 2):**
   - In `MovieDetailPage.tsx`, map `logoUrl: res.logoUrl` from the backend `MovieResponse` into the page's resolved movie model.
   - Render the transparent PNG title logo (`max-h-20 sm:max-h-28 object-contain object-left`) in place of the generic text title whenever available.
   - Fall back smoothly to clean typographic title heading when `logoUrl` is missing or fails to load.

3. **IMDb and Rotten Tomatoes Rating Display & Sync (Item 3):**
   - Address missing ratings for newly cataloged titles: when background OMDb enrichment completes in the backend, allow the frontend to reflect fresh ratings without requiring a manual page refresh.
   - For unreleased or upcoming titles (e.g. *Resident Evil 2026*), handle provider `"N/A"` states cleanly by distinguishing unreleased/unrated from missing data, and display available TMDb community scores prominently.

4. **"You May Also Like" Recommendation Shelf (Item 4):**
   - Standardize the "You May Also Like" recommendation row in `MovieDetailPage.tsx` to match the Explore page rows exactly: same header layout (title + subtitle left, reload button right that re-fetches recommendations), same section spacing, and the same compact wrapped grid of posters Explore uses in its compact view (`MovieGrid` with `compact` and `explorePresentation`). No "View all" link, since similar titles have no category page.

5. **In-Place Watched Library Removal (Item 5):**
   - Fix library removal behavior: when removing a title from watched history on the detail page, perform an in-place store update and display a success toast, keeping the user on the current title detail page (matching the non-redirecting watchlist toggle behavior).
   - Eliminate the unwanted `handleBack()` call on removal.

6. **Top Bar Artwork Clearance & Poster Scaling (Item 6):**
   - Adjust `AppShell` fullBleed container padding and hero banner height (`min-h-[560px] sm:min-h-[640px] lg:min-h-[720px]`) to ensure the fixed desktop nav (`h-14`) does not truncate key backdrop art and focal points.

7. **Squircle Cast Gallery Cards (Item 7):**
   - Replace the circular avatar icons (`rounded-full h-16 w-16`) with modern squircle actor cards matching reference designs (`aspect-[3/4]`, `w-28 sm:w-32`, `rounded-xl` or `rounded-2xl`, `object-cover`).
   - Display the actor's full name in bold white typography with the character name directly below in muted typography.

8. **Decluttering, Dimness Tuning & Refined Empty States (Item 8):**
   - **Backdrop Dimness**: Soften the heavy dark gradient vignettes (bottom scrim reduced to `h-48 sm:h-56` with lighter stops, side vignette narrowed to `w-1/2`, removing top scrim and `brightness-[0.85]` filter) to match homepage hero clarity.
   - **Type & Button Density**: Scale title, rating badges, and action buttons down to balanced, elegant proportions giving the backdrop artwork visual breathing room.
   - **Layout**: The action button row (Play Trailer, watchlist, watched, add to list, rating slider, remove) sits directly below the hero banner, not inside it. The logo/title, rating badges, genres and synopsis are bottom-aligned within the hero, lower on the artwork.
   - **Empty States**: Redesign the bulky dark placeholder boxes for "Private Personal Notes" and "Friends' Ratings" into subtle, integrated micro-cards.

## Impeccable Skills Mapping
- `/impeccable layout`: Inline trailer hero integration, recommendation shelf layout, top-bar offset & hero height clearance.
- `/impeccable distill`: Hero decluttering, balanced typography scale, compact button row, removing redundant scrim density.
- `/impeccable onboard`: Elegant empty state styling for unrated personal notes and shared friends' ratings.
- `/impeccable colorize`: Softening gradient scrims and matching backdrop luminosity to the homepage hero.
- `/impeccable polish`: Squircle cast photo cards, smooth hover states, and seamless video playback transition.

## Acceptance Criteria
- **ET01 — Inline trailer playback:** Clicking Play Trailer plays the trailer directly within the hero area without a modal popup; the logo/title and details fade out while it plays and return on close; provides a clear dismiss/close action.
- **ET02 — Title logo display:** Official TMDB title logo displays when `logoUrl` exists; graceful typographic fallback on missing/error.
- **ET03 — Rating visibility:** Verified IMDb and Rotten Tomatoes ratings display when available; unreleased/unrated states are handled cleanly.
- **ET04 — Recommendation shelf row:** "You May Also Like" displays as a unified horizontal shelf matching Explore page rows.
- **ET05 — No redirect on removal:** Removing a watched title keeps the user on the detail page and resets action states in place.
- **ET06 — Top bar clearance:** Hero artwork and posters have ample top clearance and do not appear cramped under the nav bar.
- **ET07 — Squircle cast cards:** Cast section displays portrait squircle photos (`aspect-[3/4]`, `rounded-xl`/`rounded-2xl`) with actor and character labels.
- **ET08 — Hero declutter & luminosity:** Backdrop scrims match homepage hero brightness; action buttons sit below the hero with details bottom-aligned inside it; empty states render as refined micro-cards.

## Verification
- Unit test for `MovieDetailPage` watched removal preserving current page state.
- Component test for title logo rendering with text fallback on error.
- Playwright browser test verifying squircle cast layout, inline trailer playback toggle, and decluttered hero styling.

