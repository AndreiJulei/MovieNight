# Main-page popular movie hero

Status: Implemented and validated; confirmed 2026-11-07. Pending review checkpoint approval.
Roadmap: 9d (Main-page popular movie hero). Product requirements: P15, P18, P20.
GitHub issue: not published.
Base: `7a93437b85fe17c6c2641f2a52c76e56ecb3325b` on `feat/016-popular-movie-hero`.

## Outcome

A person visiting the MovieNight home page sees a curated, cinematic hero banner
at the top of the page rather than the static brand logo asset. The hero features
four spotlight slides representing the core catalog discovery pillars and personal
interests:
1. `#1 in Movies`: The top-ranked title from Popular Movies.
2. `#1 in TV Series`: The top-ranked series from Currently Airing / New Seasons.
3. `#1 in Anime`: The top-ranked seasonal anime hit from the current anime quarter.
4. `#1 For You`: The user's highest-confidence personalized recommendation (falling
   back to `#1 Anticipated` upcoming release when personal history is insufficient).

Each slide presents a high-resolution horizontal backdrop with dark gradient
vignettes for typography contrast, a contextual rank badge, title typography, star
audience rating, release year, media badge, top genres, a clamped synopsis overview,
a primary "More info" button linking to the title's detail page, and a quick Watchlist
toggle button reflecting existing library status. The hero banner smoothly cycles every
7 seconds with progress indicator dashes and a manual pause/play toggle, pausing
automatically on hover or keyboard focus, and supporting touch-swipe gestures and
indicator jumping. The rest of the home page follows cleanly: Personalized
Recommendations and Friend Suggestions shelves in the middle, and the editorial
narrative ("A single, deliberate space...") at the bottom.

## Acceptance criteria

These IDs remain stable. The agreed decisions below govern all seven rows.

| ID | Given / when | Expected result |
| --- | --- | --- |
| PH01 | Load the home page as an authenticated user | The hero renders up to 4 curated spotlight slides: `#1 in Movies` from cached Popular Movies; `#1 in TV Series` from Currently Airing / New Seasons; `#1 in Anime` from Current Season Anime hits; and `#1 For You` from the user's personalized recommendations (falling back to `#1 Anticipated` from Upcoming if personal history has no eligible recommendations). If a category has no eligible title, that slide is omitted without breaking remaining slides. |
| PH02 | View any active hero slide across desktop or phone | The slide displays a high-resolution horizontal backdrop (`backdropUrl`, falling back to `posterUrl`), dark bottom/left gradient vignettes ensuring text readability, a red accent badge (e.g. `#1 in Movies`, `#1 in TV Series`, `#1 in Anime`, `#1 For You`), bold title typography with text-shadow, star audience rating (★ X.X), release year, media badge (`Movie` / `TV` / `Anime`), top genres, and a 2–3 line clamped synopsis overview. |
| PH03 | Click "More info" or the Watchlist toggle on any hero slide | "More info" navigates directly to `/movies/:id` (with typed media context where applicable). The Watchlist icon button (`+` / `✓`) toggles watchlist membership immediately using `useWatchlistSave` without navigating away, reflecting current library status and preserving confirmed state on reload. |
| PH04 | Observe carousel cycling or interact with controls | The carousel auto-advances every 7 seconds with smooth crossfade transitions. Progress indicator dashes in the bottom-right indicate the active slide and jump to any slide on click. Mouse hover over the hero or keyboard focus on any hero control pauses auto-advance. A manual pause/play toggle freezes or resumes cycling. Touch devices support horizontal swipe gestures. |
| PH05 | Scroll the home page vertically | The layout renders the Hero banner at the top, followed immediately by the Recommendations section (Personalized Recommendations and Friend Suggestions), with the editorial app narrative ("A single, deliberate space...") and its three pillars positioned at the bottom of the page. |
| PH06 | Initial data is loading or network feeds fail | While feeds load, the hero displays a dark skeleton placeholder with a subtle pulse animation. If all hero candidate feeds fail or return empty, the hero section collapses gracefully without horizontal overflow, uncaught exceptions, or obstructing lower page content. |
| PH07 | Resize between mobile (< 768px) and desktop viewports | On mobile viewports, the hero maintains an immersive height (~60–70vh) with center-cropped backdrop artwork (`object-cover`), clamped synopsis (2 lines), and minimum 44×44px touch targets. Desktop viewports scale up to 75vh with full synopsis and metadata visibility without page-level horizontal overflow. |

## Decisions and test boundary

### Agreed decisions — Q1–Q20, 2026-11-07

The user confirmed all four rounds of the grilling interview:

- **Q1–Q2 — Data provenance & carousel format:** Sourced from the backend's cached
  discovery feeds without exposing third-party TMDB API keys to the browser.
  Organized as a curated multi-pillar hero carousel.
- **Q3 & Q17–Q19 — Actions & Trailer centralization:** Primary action is consolidated
  into a single "More info" button linking to `/movies/:id`, paired with a compact
  quick-save Watchlist toggle icon button (`+` / `✓`). Trailer viewing is centralized
  on the title's detail page, avoiding video player clutter on the home page. The
  watchlist button allows reversible toggling: clicking `+` adds the title, while clicking
  `✓` for a title in the watchlist removes it; watched items remain read-only.
- **Q4–Q5 — Library status honesty:** The hero reflects whether any featured title
  is already in the user's Watchlist (showing `✓`) or Watched history.
- **Q6 & Q9–Q10 — Presentation & Typography:** Star audience rating (★ X.X), release
  year, media type badge, top genres, and clamped synopsis (omitted in Ticket 1 refinements
  for visual density). Bold, high-contrast title display typography over dark gradient
  vignettes. Red accent pill badges (using design token `bg-accent`) identifying category rank.
- **Q7–Q8 — Section ordering:** Home page sequence flows from (1) Hero Carousel at
  the top, to (2) Recommendations in the middle, to (3) Editorial narrative at the
  bottom.
- **Q11 & Q13 — Resilience & API delivery:** Dark pulse skeleton during loading;
  graceful collapse on total failure. Data served through authenticated endpoints.
- **Q12 & Q20 — Responsiveness & Transitions:** Mobile viewports adapt to ~60–70vh
  with center-cropped artwork. Smooth crossfade transitions between slides and
  animated indicator highlights.
- **Q14–Q16 — Curated 4-slide lineup & carousel controls:**
  1. `#1 in Movies` (Newest releases meeting >= 6.5 floor / fallback to Top Rated)
  2. `#1 in TV Series` (Bayesian confidence-ranked Top Rated TV with minimumVotes = 150 floor)
  3. `#1 in Anime` (Current Season Anime hits)
  4. `#1 For You` (Personalized Recommendation / `#1 Anticipated` fallback)
  All categories filter out Kids/Family titles (genre IDs 10751, 10762, family/kids keywords)
  to preserve a mature cinematic spotlight.
  7-second auto-advance cycle, pause on hover/focus, manual pause/play toggle,
  clickable indicator dashes, and touch-swipe support.

### Test boundary

1. **Unit tests (`repo/MovieNightFrontend/tests/unit/`)**:
   - Verify hero carousel state transitions, 7-second timer, pause on hover/focus,
     manual pause toggle, and indicator jump logic.
   - Verify fallback logic when personalized recommendations are empty (fallback
     to upcoming/anticipated) or when a category feed is unavailable.
2. **Component & Integration tests**:
   - Verify rendering of backdrop, title, metadata pills, rating, genres, and
     clamped synopsis.
   - Verify "More info" link destination and Watchlist toggle behavior via
     `useWatchlistSave`.
3. **Browser / Responsive verification**:
   - Verify responsive layout at desktop (> 1024px) and phone (< 768px) viewports
     without horizontal overflow.
   - Verify touch swipe interaction and accessibility focus handling.

## Out of scope

- Full movie video streaming (MovieNight is a discovery and library tracking platform).
- Embedding inline video players directly inside the hero banner (trailer playback
  remains centralized on the detail page opened via "More info").
- Public custom list sharing, anime films, episode tracking, and webhook integrations
  (deferred per roadmap).

## Validation

Validated on 2026-11-07 against `feat/016-popular-movie-hero` using frontend unit tests (`repo/MovieNightFrontend/tests/unit/hero-banner.test.cjs`) and Playwright browser regression tests (`repo/MovieNightFrontend/tests/browser/hero-banner.cjs`).

| Acceptance ID | Result | Check / evidence |
| --- | --- | --- |
| PH01 | Passed | Verified in unit tests and Playwright browser suite. Four curated spotlight slides rendered in exact pillar order (`#1 in Movies` from Popular Movies; `#1 in TV Series` from Currently Airing; `#1 in Anime` from Current Season Hits; `#1 For You` from Personal Recommendations). Fallback to `#1 Anticipated` from Upcoming Movies verified when personal history is empty. Missing/empty categories omitted without breaking remaining slides. |
| PH02 | Passed | Verified in unit tests and Playwright browser suite. Displays high-resolution backdrop (`backdropUrl` with fallback to `posterUrl`), dark bottom/left vignettes for contrast, red accent rank pill badge, bold title display typography with drop-shadow, star audience rating (`★ X.X`), release year, media badge (`Movie` / `TV Series` / `Anime`), top genres, and 2-line clamped synopsis. |
| PH03 | Passed | Verified in Playwright browser suite. "More info" link navigates directly to `/movies/:id` with typed media context. Watchlist button (`+` / `✓`) toggles watchlist membership immediately via `useWatchlistSave` without navigating away, updating library status with verified >= 44×44px touch target. |
| PH04 | Passed | Verified in unit tests and Playwright browser suite. 7-second auto-advance cycle with smooth crossfade; pauses automatically on mouse hover and keyboard focus; manual pause/play toggle freezes and resumes cycling; clickable progress indicator dashes jump directly to slides; touch horizontal swipe gestures evaluated with 50px threshold. |
| PH05 | Passed | Verified in Playwright browser suite bounding box vertical analysis. Layout renders (1) Hero Banner at the top, followed by (2) Recommendations section in the middle, and (3) Editorial narrative ("A single, deliberate space...") with its three pillars at the bottom (`heroBox.y < recBox.y < narBox.y`). |
| PH06 | Passed | Verified in unit tests and component state logic. Dark pulsing skeleton placeholder displays during initial data loading. If all candidate feeds fail or return empty, hero section collapses gracefully to null without horizontal overflow or uncaught exceptions. |
| PH07 | Passed | Verified in Playwright browser suite across desktop (1280×800) and mobile (390×844 iPhone 14) viewports. No page-level horizontal overflow (`scrollWidth <= clientWidth + 1`). Mobile viewport maintains immersive ~60–70vh proportion with center-cropped artwork and >= 44×44px touch targets. |


