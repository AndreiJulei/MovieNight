# Issues #3 and #5: controls and search validation

Date: 2026-10-31. Fixed base: `278ebb48222fff6dbb9157dd93083f3d033c83ec` on `feat/014-frontend-reliability-navigation`. This record describes the uncommitted controls and search changes; final combined review is pending.

## Core-screen control inventory (CS01)

| Screen | Before | After or boundary |
| --- | --- | --- |
| Authentication | Mode switches ("Create Account", "Sign In", "Forgot password?") used underlined text like links; form inputs had uncalm outlines. | Mode switches use quiet action buttons (`.quiet-action`) without underlines; input focus outline uses consistent accent ring without `!important`. |
| Home | Inline “View all” and “View friend suggestions” links were only underlined on hover; two preview collages used clickable `div` elements. | Prose links are underlined at rest with shared `.prose-link`; preview navigation uses named native links with the same visual treatment. |
| Explore and search | Search combined a focus border, six-pixel shadow, forced inner outline and expanding width; Retry actions and status links had ad-hoc underlines. | One keyboard ring follows the fixed search field shape. Pointer/touch focus stays calm. Suggestions are native anchors; full-search navigation is a link. Category status links use `.prose-link`; retry actions use `.quiet-action`. |
| Title details | Retry/removal actions had text-link underlines in several places. | Retry details, retry ratings, retry notes, and list removal actions use `.quiet-action` button treatment. |
| Watched and watchlist | Filter and retry actions already had button shapes; `+ Add` is a styled navigation link; "Change selection" and popover "Reload lists" were underlined text. | Selection change and popover reload use `.quiet-action`; shared focus input rule no longer forces `!important`. |
| Custom lists | Reload and delete confirmation were underlined like links; a clickable `div` opened a list. | Reload and delete confirm actions use quiet button treatments (`.quiet-action`). List opening is a native link separate from delete actions; back links are underlined at rest with `.prose-link`. |
| Friends | Back links and "Manage friendships" were unadorned until hover; friend profile entries had row-link treatment. | Back links and manage link are underlined at rest with `.prose-link`; row navigation and invitation buttons retain distinct treatments. |
| Settings and App shell | Labeled fields and actions already had separate treatments; session retry/home error links had ad-hoc underlines. | Existing settings actions retained; session retry action uses `.quiet-action`; error home link uses `.prose-link`. |

Shared styles in `src/index.css` govern prose links, quiet actions and search focus. `NavRail` uses anchors for destinations with `aria-current="page"`; Explore disclosure remains a button. Current destinations have a filled surface and weight change as well as color. Browser tests check desktop current-page semantics and phone anchor semantics.

## Browser and build evidence

Run from `repo/MovieNightFrontend/`:

```sh
MOVIENIGHT_BROWSER_URL=http://127.0.0.1:8765 node tests/browser/issue-3-5-controls-search.cjs
./node_modules/.bin/tsc --noEmit
npm run build
```

The focused Chrome test passed across three suites: 1440×900 desktop, 390×844 phone emulation, and a full 8-screen walkthrough testing 200% zoom reflow (640px layout viewport, the exact 200% zoom reflow equivalent of a 1280px desktop display per WCAG 1.4.10).

Assertions executed across all 8 core screens (Authentication `/login`, Home `/`, Explore `/explore/movies`, Title details `/movies/301`, Library `/movies`, Lists `/lists`, Friends `/friends`, and Settings `/settings`):
- **200% Zoom Reflow:** Confirmed zero horizontal page overflow (`scrollWidth <= clientWidth + 2`) across all 8 screens.
- **Control Clipping:** Programmatically asserted that every visible interactive button, link, and input stays within viewport boundaries (`rect.right <= viewportWidth + 3`) and that internal button/link text does not overflow without deliberate ellipsis truncation.
- **Strict Focus Rings:** Asserted that focused interactive controls display a dedicated visible focus ring (`outlineWidth >= 2px && outlineStyle !== 'none' && outlineColor !== 'transparent'` or dedicated focus box-shadow ring). Body focus and ordinary borders are rejected.
- **Accessible Contrast:** Verified shared `--color-link: #818cf8` delivers 5.4:1–6.3:1 contrast across all dark backgrounds, exceeding the WCAG AA 4.5:1 requirement for small text.

Screenshots are saved to `/private/tmp/issue-3-5-controls/`: `search-1440.png`, `search-390.png`, and `zoom200-<screen>.png`.

Typecheck, unit tests (38 passing), and Vite build passed with 0 errors. Focused browser checks use Chrome automation and emulation, not a physical phone or real API persistence. Native OS window zoom toggles and physical touch hardware belong to Ticket #6 verification.

| Acceptance | Status | Observable boundary |
| --- | --- | --- |
| CS01 | Passed | Source inventory across all 8 core screen areas completed; inconsistent underlines repaired to `.prose-link` or `.quiet-action`. |
| CS02 | Passed | Shared prose links (`.prose-link`) and quiet actions (`.quiet-action`); desktop, mobile, and 200% zoom reflow screenshots verified. |
| CS03 | Passed | Semantic anchors in navigation (`NavRail`), list cards, and search options; current destination indicated with surface fill, font weight, and `aria-current="page"`. |
| CS04 | Passed | Verified under automated Chrome test: 200% zoom reflow (640px) and phone (390px) have zero horizontal overflow; clipping assertions confirm visible controls stay within bounds; strict focus rings (>=2px outline or focus shadow) verified on focused controls; link contrast >= 5.4:1 with `--color-link: #818cf8`. Physical phone touch and native OS browser window zoom toggles remain bounded for Ticket #6. |
| CS05 | Passed | Shared CSS classes (`.prose-link`, `.quiet-action`) and design tokens (`var(--color-link)`, `var(--color-border)`, `var(--color-accent)`); feature behavior preserved. |
| SF01 | Passed | Browser computed styles verify one keyboard ring and stable width; screenshots inspected. |
| SF02 | Passed | Pointer focus has no wrapper shadow; keyboard has a visible ring; another input retains outline. |
| SF03 | Passed | Long query, empty result, clear, Escape, arrow and Enter paths pass mocked browser flows. |
| SF04 | Passed | Desktop, phone emulation, and 200% zoom reflow pass across all core screens with no horizontal page overflow. |
