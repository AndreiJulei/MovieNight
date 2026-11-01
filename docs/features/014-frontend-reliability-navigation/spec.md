# Frontend reliability and navigation

Status: agreed direction; published implementation contracts; not implemented.
Selected on 2026-10-31 as a follow-up to roadmap milestones 9a–9c.
Product requirements: P01, P12, P15, P18–P20.
Inspection base: `cf22e3a712bbb6935e46e9fc5b503bb1362d6001` on
`feat/013-additional-discovery-results`.

## Outcome and authority

Make first-open title details reliable, simplify Explore posters, make browser
navigation predictable, and refine the existing interface for desktop, keyboard
and phone use. The user confirmed the behavior through six design questions.
Preserve the existing MovieNight visual identity.

GitHub Issues govern acceptance criteria, implementation scope and work status:

| Contract | User report covered |
| --- | --- |
| [#1: Title loading and automatic recovery](https://github.com/AndreiJulei/MovieNight/issues/1) | First-open metadata failure; routine Refresh controls; Explore expiry recovery |
| [#2: Compact Explore metadata](https://github.com/AndreiJulei/MovieNight/issues/2) | Persistent score badge and verbose hover text |
| [#3: Consistent links and controls](https://github.com/AndreiJulei/MovieNight/issues/3) | Inconsistent underlining and control treatment |
| [#4: Browser navigation](https://github.com/AndreiJulei/MovieNight/issues/4) | Reload returns home; browser Back exits the app |
| [#5: Search focus](https://github.com/AndreiJulei/MovieNight/issues/5) | Overlapping blue focus rectangle |
| [#6: Same-network phone validation](https://github.com/AndreiJulei/MovieNight/issues/6) | Reproducible phone access and responsive verification |

These links replace a local duplicate acceptance contract. Implement one
reviewable ticket at a time. Start by reproducing the reported server failure;
the visual tickets can proceed independently. Coordinate shared CSS between #3
and #5, and use #1's recovery behavior when implementing #4's history restoration.
No blanket implementation, commit, push or merge approval is implied.

## Relationship to earlier contracts

Issue #1 deliberately replaces feature 012 DQ09's routine user Refresh control
and feature 013 Q6/DR03/DR05's manual session-expiry recovery. It permits a
separately labelled renewed results segment when the prior pool cannot continue,
without implying one globally reranked combined pool. Preserve ordering within
each generation and existing provider-work/freshness bounds. Earlier feature
records remain historical implementation evidence; reconcile their governing
behavior references when the replacement is implemented.

Issue #4 replaces the current in-memory navigation behavior, including its
preview-specific rationale, for ordinary browser use. A full reload retains
the route and URL controls but starts a fresh bounded results session;
history restoration retains usable browsing context. Server deep-link handling
belongs in its verification boundary. Update engineering guidance when shipped.

The existing glossary already distinguishes Title, Library entry, Audience
rating and Critic approval. No new domain term or ADR was needed for this
refinement; do not confuse compact presentation with changing rating semantics.

## Validation evidence and limitations

On 2026-10-31, performed read-only source inspection, checked Git state and
existing open GitHub issues, published the six contracts, and verified their
published bodies and labels. The only pre-existing local change was the
untracked `.vscode/settings.json`; it is unrelated and was left untouched.

Source explains the reload/Back defects: `src/router.tsx` initializes at `/`
and deliberately omits browser history/location. The title error is generated
by the backend's generic unhandled-exception handler; its underlying exception
has not been reproduced. Provider/enrichment/persistence paths are investigation
leads, not a diagnosis.

No application code changed. No application tests, builds, runtime flows,
screenshots or physical-phone checks were run in this planning pass. Ticket
publication and documentation checks do not certify any reported issue as fixed.
Use the checks and acceptance IDs in each issue for later implementation evidence.

Phone access currently requires more than sharing Wi-Fi: Vite binds all
interfaces on HTTP port 8443 by default, but API defaults point to localhost,
backend CORS is restricted, and the demo API binds loopback. Issue #6 owns a
complete runnable LAN setup and explicitly distinguishes emulation from an
actual phone run. No network-exposure configuration was changed here.

### Issue #1 Implementation and Validation Evidence (2026-10-31)

Implemented GitHub issue [#1: Title loading and automatic recovery](https://github.com/AndreiJulei/MovieNight/issues/1) covering acceptance criteria LR01–LR06.

#### 1. Root Cause Diagnosis & Backend Repairs (LR01)
- **Reproduction:** Created controlled regression test `TitleDetailsLoadingDiagnosisTest` verifying uncached movie and TV requests against mock provider servers.
- **Diagnosed server failures:**
  1. *Concurrent transaction race:* In `MovieCatalogLookupService.getOrFetchMovie`, multiple concurrent lookups for the same uncached title (e.g. React StrictMode or parallel components) triggered a DB unique constraint violation on `idx_movie_tmdb_id(resourceType, tmdbId)`. Because the method ran under a single `@Transactional` boundary, Hibernate marked the session rollback-only; the subsequent attempt to find the persisted row threw `org.hibernate.AssertionFailure: Entry for instance of 'com.movienight.backend.model.Movie' has a null identifier`, escaping as a generic HTTP 500 error (`Request failed. Reload to check your saved data, then retry.`).
  2. *Unhandled provider exceptions:* `TmdbClient` threw generic `IllegalStateException` on provider 503, 429, or network drop, which escaped `GlobalExceptionHandler` as an unhandled 500 instead of returning structured transient HTTP statuses.
  3. *Synchronous OMDb blocking:* `getOrFetchMovie` performed synchronous OMDb enrichment, blocking core details delivery when OMDb was slow.
- **Repairs implemented:**
  - Synchronized first-open lookup on interned `(resourceType + ":" + tmdbId).intern()`.
  - Created `CatalogPersistenceService` with `@Transactional(propagation = Propagation.REQUIRES_NEW)` to isolate insert attempts, handle duplicate key conflicts gracefully, and eliminate session rollback pollution.
  - Decoupled OMDb critic enrichment to bounded `catalogEnrichmentExecutor` (`ThreadPoolTaskExecutor` core 2, max 4, queue 50, `DiscardPolicy`), allowing core details to return immediately (<100ms).
  - Explicit client timeouts in `OmdbClient` (connect 2000ms, read 3000ms).
  - Structured error mapping in `TmdbClient` and `GlobalExceptionHandler` mapping provider 429 to HTTP 429 and 503/socket failures to HTTP 503.
  - Safe truncation on variable provider strings (genres 200, castMembers 500, title 300, director 300, trailerKey 100, posterUrl 1000, backdropUrl 1000).
  - Backfill for incomplete legacy rows missing overview/cast details.

#### 2. Frontend Bounded Read Recovery Policy & Decoupled Enrichment (LR02, LR03, LR04)
- **Bounded read policy (`src/api/movies.ts`):**
  - Implemented `isTransientError`: classifies 502/503/504, 429 (with `Retry-After` <= 5s), `TypeError` (network drop), and `TimeoutError` as transient; classifies 400/401/403/404/409/410/422 as non-transient.
  - Implemented `boundedRead`: initial attempt 0, retry 1 delay 500ms, retry 2 delay 1500ms (max 2 retries, 3 total attempts). Respects `Retry-After` headers <= 5s; fails immediately without retry if `Retry-After` > 5s.
  - In-flight request coalescing via `pendingReads` map keyed by `${userScope}:${actionKey}`.
  - Cancellation distinction: user aborts (navigation, unmount, account change) stop immediately and never retry.
  - Strict read boundary: applied strictly to reads (`getByTmdbId`, `getById`, `search`, `getExploreCategoryPage`, `getFriendsRatings`, `getExploreMedia`); writes (`saveWatchlist`, `addMovie`, `updateEntry`, `removeMovie`) are never retried automatically.
- **Title details (`src/pages/MovieDetailPage.tsx`):**
  - Renders available core details immediately without waiting for enrichment. Missing trailer, overview, or critic scores never block or error the page.
  - Scheduled bounded enrichment polling: at most 2 backoff checks (1.5s, 3.5s) fetch newly available ratings in the background and update the open page without a page reload or infinite polling.
  - On retry exhaustion, renders an accessible contextual alert with a single `<button>Retry details</button>` without instructing the user to reload the entire application.
- **Explore browsing (`src/pages/ExploreContentPage.tsx`):**
  - Removed routine "Refresh discovery" and shelf "Refresh" buttons. Reads and category switches load automatically.
  - Contextual error with single accessible `<button>Retry</button>` rendered only upon failed read.

#### 3. Explore Session Renewal (LR05, LR06)
- **Automatic renewal on 410 / 30-min expiry (`src/hooks/useExploreCategory.ts`):**
  - Visible loaded cards and scroll position are preserved on 410 Gone or when returning to an expired session (>30 min).
  - Clicking "Load more" triggers `renewSession`, obtaining a fresh session starting at page 0 without manual user Refresh.
  - Deduplication by typed identity `(resourceType, tmdbId)` ensures no duplicate cards appear.
  - Distinct items appended in a labelled segment (`Renewed Results`).
  - Consecutive duplicate limit: if 3 consecutive renewed pages contain only already-visible titles, the loop stops, retains the advanced cursor, and keeps `hasMore: true`, allowing another explicit "Load more" click without stranding or falsely marking the stream exhausted.
  - Confirmed library exclusions, account isolation, 24-hour stale labelling, and 7-day unavailable cutoff remain preserved.

#### 4. Verification Matrix & Results
- **Backend automated tests:**
  - `TitleDetailsLoadingDiagnosisTest`: 7 tests pass with strict assertions. Concurrency test directly asserts both threads receive HTTP 200, response body, and exactly 1 persisted `Movie` entity in the repository without rollback pollution. 503 and 429 tests assert exact HTTP status codes, forwarding of the `Retry-After: 60` response header, and CORS exposure of `Access-Control-Expose-Headers: Retry-After`. Incomplete-row recovery verifies non-blocking core response and asynchronous backfill via `Awaitility`.
  - Shared extraction mapping `extractMetadata` in `MovieCatalogLookupService` ensures first-open and backfill cannot drift.
  - `SecurityConfig` exposes `Retry-After` header through CORS (`setExposedHeaders(List.of("Retry-After"))`) so browser JavaScript can inspect cooldown delays.
  - Full suite: `./mvnw test` runs **154 tests, 0 failures, 0 errors, 2 skipped** (live provider smoke checks).
- **Frontend unit tests (`tests/unit/bounded-read.test.cjs`):**
  - **14 tests pass** directly importing production functions from `src/api/boundedRead.ts`.
  - Verifies: `isTransientError` classification matrix, attempt 0 immediate success, attempt 1 recovery at 500ms, attempt 2 recovery at 1500ms, 3-attempt exhaustion, 404 immediate fail, `Retry-After` <= 5s vs > 5s, request timeout retry as transient (`RequestTimeoutError`), in-flight coalescing, cancellation safety where Caller 1 aborting does not strand or reject Caller 2, StrictMode remount safety where new callers start fresh requests, account isolation preventing cross-account request coalescing (Spec 1), and ownership-checked pending entry cleanup ensuring aborted requests never delete replacement entries (Spec 3).
- **Frontend browser integration suite (`tests/browser/issue-1-reliability.cjs`):**
  - Tested on Chrome at both **1440×900 (Desktop)** and **390×844 (Mobile)** viewports:
    - LR01/LR02: First-open uncached title renders core details immediately; ratings backfill asynchronously.
    - LR03: Transient read auto-recovery recovers after 503 error.
    - LR03: Browser reads `Retry-After` header across origins with CORS and respects the cooldown duration.
    - LR04: Contextual retry without reload instruction; verified read boundary with 0 `POST /refresh` rebuild calls.
    - LR05: Automatic session renewal on 410, deduplication by typed identity `(resourceType, tmdbId)`, and labelled segment `Renewed Results`.
    - LR05: Bounded duplicate-page limit forces HTTP 410 renewal, asserts exact cursors `[0, 20, 40]` across 3 duplicate pages, verifies advanced cursor 60 retention, and continues pagination with distinct movies grouped under labelled segment `Renewed Results`.
    - LR06: Saved titles excluded when returning from details to Explore across multi-generation segments.
    - LR06: Stale snapshot status warning (>24h) and 7-day cutoff rendering `Discovery is unavailable` with zero cards.
    - Keyboard Tab navigation across interactive elements and no horizontal scroll overflow (`noOverflow`).
- **Frontend typecheck and build:**
  - `tsc --noEmit`: 0 errors.
  - `npm run build`: built in 309ms with 0 errors.
- **Historical specifications reconciled:**
  - `docs/features/012-meaningful-discovery-recommendations/spec.md`: Added supersession note on DQ09 regarding removal of routine user Refresh controls in favor of automatic initial loads and failure-only contextual Retry.
  - `docs/features/013-additional-discovery-results/spec.md`: Added supersession notes on DR05, Q6, and Q13 clarifying that expired or lost sessions (>30 min or HTTP 410) automatically renew upon Load more under a labelled "Renewed Results" segment without requiring manual Refresh.

#### 5. Remaining Limitations & Exclusions
- Scope is strictly bounded to Issue #1. Excludes visual badge compacting (#2), persistent link underlining (#3), browser history / back-navigation integration (#4), search input focus rectangle (#5), and same-network phone validation setup (#6).
- Live external network provider calls require opt-in environment keys (`MN_LIVE_PROVIDER_SMOKE=true`, `MN_TMDB_KEY`, `MN_OMDB_KEY`). Controlled mock fixtures govern all standard test runs.

### Issue #2 Implementation and Validation Evidence (2026-10-31)

Contract: [GitHub #2: Simplify Explore posters to year and one compact score on hover or focus](https://github.com/AndreiJulei/MovieNight/issues/2).

Tested revision: base `392b07f794b21c9727b0a251b831c34b879ca803` on
`feat/014-frontend-reliability-navigation`, with uncommitted changes in
`src/components/PosterShelf.tsx`, `src/components/MovieGrid.tsx`,
`src/components/ExplorePosterOverlay.tsx`, `src/components/ratingEvidence.ts`,
`src/pages/ExploreContentPage.tsx`, `tests/unit/compact-rating.test.cjs`, and
`tests/browser/issue-2-compact-explore.cjs` (paths relative to the frontend).
This record accompanies those changes; integration is pending human review.

#### Implementation and review repairs

- Explore shelves and both category grid views use a shared `ExplorePosterOverlay`.
  Posters have no rating badge at rest; title names and missing-poster fallbacks
  remain available. Library consumers retain their existing presentation.
- Hover or keyboard focus reveals year and one compact source-labelled score:
  valid IMDb first, otherwise valid TMDB. Finite scores must be within 0–10;
  genuine zero survives. Missing year/score is omitted without separators.
  Rotten Tomatoes remains separate critic approval on details.
- Explore compact grids and phone regular grids use columns with a 160px minimum (bounded by available
  container width), preserving enough space for the full metadata line rather
  than clipping it. Library grids retain their original column counts.
- Keyboard tests use Shift+Tab/Tab to enter each tested card, assert
  `:focus-visible`, a nontransparent outline at least 2px wide, and revealed
  metadata. The former assertion accepted a missing outline and has been removed.
- Regular-grid checks compare every metadata line’s rendered scroll/client width
  before switching views; a failing 320px regression reproduced clipping before
  the regular-grid fix. Compact-card checks compare those widths under hover and
  focus, including phone keyboard focus. The shared overlay removes duplicated
  shelf/grid markup; its metadata also supplies the accessible description.

#### Verification

Commands run from `repo/MovieNightFrontend/` on 2026-10-31:

- `node --test tests/unit/*.test.cjs`: **28 passed**, including 14 compact-rating
  tests and 14 bounded-read regression tests.
- `./node_modules/.bin/tsc --noEmit`: passed.
- `npm run build`: passed. Vite reports its existing native-config compatibility
  and bundle-size warnings.
- `node tests/browser/issue-2-compact-explore.cjs`: passed in Chrome 156 at
  **1440×900, 1024×768, 768×1024, 390×844, and 320×640**.
- `git diff --check`: passed.

| Acceptance | Result and observable boundary |
| --- | --- |
| PM01 | Passed: shelf/grid overlays hidden at rest, accessible title and missing-poster fallback checked. |
| PM02 | Passed: compact IMDb preference and TMDB fallback on hover; regular/compact grid metadata revealed with actual keyboard navigation. |
| PM03 | Passed: critic-only, unrated, zero, unknown year, and out-of-range preferred-score fixtures; unit cases cover both bounds and provider fallback. |
| PM04 | Passed: fixture details retain separate IMDb, TMDB audience and Rotten Tomatoes approval; no provider integration or per-card request added. |
| PM05 | Passed: single-tap details navigation, visible keyboard outline, full compact metadata fit and no document overflow at tested widths. |

Desktop and phone screenshots were inspected together. Compact focus screenshots
are written to `/private/tmp/issue-2-browser/issue-2-compact-<width>.png` by the
browser script. The Impeccable mechanical detector could not run:
`Error: bundled detector not found.` Manual screenshot inspection and browser
assertions supplied the available visual verification.

### Issue #3 Implementation and Validation Evidence (2026-11-01)

Contract: [GitHub #3: Standardize links and action styling across core MovieNight screens](https://github.com/AndreiJulei/MovieNight/issues/3).

Tested revision: base `278ebb48222fff6dbb9157dd93083f3d033c83ec` on
`feat/014-frontend-reliability-navigation`, with changes in
`repo/MovieNightFrontend/DESIGN.md`,
`repo/MovieNightFrontend/src/index.css`,
`repo/MovieNightFrontend/src/components/NavRail.tsx`,
`repo/MovieNightFrontend/src/components/NavSearch.tsx`,
`repo/MovieNightFrontend/src/components/AddToListPopover.tsx`,
`repo/MovieNightFrontend/src/components/PersonalRecommendationStatus.tsx`,
`repo/MovieNightFrontend/src/pages/HomePage.tsx`,
`repo/MovieNightFrontend/src/pages/CustomListsIndexPage.tsx`,
`repo/MovieNightFrontend/src/pages/CustomListDetailPage.tsx`,
`repo/MovieNightFrontend/src/pages/FriendProfilePage.tsx`,
`repo/MovieNightFrontend/src/pages/FriendSuggestionsPage.tsx`,
`repo/MovieNightFrontend/src/pages/AddMoviePage.tsx`,
`repo/MovieNightFrontend/src/pages/MovieDetailPage.tsx`,
`repo/MovieNightFrontend/src/pages/ExploreContentPage.tsx`,
`repo/MovieNightFrontend/src/pages/LoginPage.tsx`,
`repo/MovieNightFrontend/src/App.tsx`,
`docs/features/014-frontend-reliability-navigation/controls-validation.md`, and
`repo/MovieNightFrontend/tests/browser/issue-3-5-controls-search.cjs`.
Detailed screen-by-screen inventory is recorded in `controls-validation.md`.
This record accompanies those changes; integration is pending human review.

#### Implementation details

- **Consistent shared affordances (`src/index.css`, `DESIGN.md`):**
  - Added `.prose-link` with `text-decoration: underline`, `text-underline-offset: 0.2em`, and shared `--color-link: #818cf8` token (exceeding WCAG AA 4.5:1 with 5.4–6.3:1 contrast across all dark backgrounds).
  - Added `.quiet-action` with inline-flex centering, vertical padding, tokenized border/hover, and minimum dimensions, standardizing secondary actions.
- **Semantic anchors and navigation state (`src/components/NavRail.tsx`, `src/pages/HomePage.tsx`, `src/pages/CustomListsIndexPage.tsx`):**
  - Replaced buttons and unsemantic clickable `div`s with native `<Link>` and `<a>` elements for navigation destinations (menu items, preview collages, list cards).
  - Added `aria-current="page"` and surface fill to active navigation menu items.
- **Valid ARIA hierarchy (`src/components/NavSearch.tsx`):**
  - Enclosed suggestion `<a>` options inside `role="listbox"`, keeping the footer `<Link>` outside to ensure standard ARIA structure.
- **Core-screen inventory repairs:**
  - Repaired underlined actions on Authentication, Home, Explore, Title details, Library, Custom lists, Friends, and Settings.

#### Verification

- `cd repo/MovieNightFrontend && ./node_modules/.bin/tsc --noEmit`: **0 errors**.
- `cd repo/MovieNightFrontend && npm run build`: **Built successfully** in 282ms.
- `cd repo/MovieNightFrontend && node --test tests/unit/*.test.cjs`: **38 passed, 0 failed**.
- `cd repo/MovieNightFrontend && MOVIENIGHT_BROWSER_URL=http://127.0.0.1:8765 node tests/browser/issue-3-5-controls-search.cjs`:
  - **PASS controls/search 1440x900**
  - **PASS controls/search 390x844**
  - **PASS core screens walkthrough, clipping checks, and 200% zoom reflow verification** (covers `/login`, `/`, `/explore/movies`, `/movies/301`, `/movies`, `/lists`, `/friends`, `/settings` at 640px reflow width representing 200% zoom of 1280px desktop, asserting zero horizontal page overflow, clipping assertions verifying visible controls stay within viewport bounds without text clipping, and strict focus assertions requiring active elements to display >= 2px outline or focus shadow).

| Acceptance | Result and observable boundary |
| --- | --- |
| CS01 | Passed: Complete source inventory across all 8 core screen areas; before/after repairs recorded in `controls-validation.md`. |
| CS02 | Passed: Consistent underlines at rest for prose links (`.prose-link`); structured button shapes (`.quiet-action`) for actions; screenshots inspected. |
| CS03 | Passed: Semantic anchors in navigation (`NavRail`), list cards, and search options; current destination announced with `aria-current="page"` and surface fill. |
| CS04 | Passed under automated Chrome test: 200% zoom reflow (640px) and phone (390px) have zero horizontal overflow; clipping assertions confirm visible controls stay within bounds; strict focus rings (>=2px outline or focus shadow) verified on focused controls; link contrast >= 5.4:1 with `--color-link: #818cf8`. Physical phone touch and native OS browser window zoom toggles remain bounded for Ticket #6. |
| CS05 | Passed: Shared CSS classes (`.prose-link`, `.quiet-action`) and design tokens (`var(--color-link)`, `var(--color-border)`, `var(--color-accent)`); feature behavior preserved. |

### Issue #4 Implementation and Validation Evidence (2026-10-31)

Contract: [GitHub #4: Preserve screen URLs on reload and support browser Back and Forward](https://github.com/AndreiJulei/MovieNight/issues/4).

Tested revision: base `278ebb48222fff6dbb9157dd93083f3d033c83ec` on
`feat/014-frontend-reliability-navigation`, with changes in
`src/router.tsx`, `src/routerUtils.ts`, `src/App.tsx`, `src/store/MovieStore.tsx`,
`src/api/auth.ts`, `src/pages/LoginPage.tsx`, `src/pages/MovieDetailPage.tsx`,
`src/hooks/useExploreCategory.ts`, `src/pages/AddMoviePage.tsx`,
`src/components/MovieGrid.tsx`, `src/components/PosterShelf.tsx`,
`tech-stack.md`, `tests/unit/router.test.cjs`, and
`tests/browser/issue-4-navigation.cjs` (paths relative to the frontend unless noted).
This record accompanies those changes; integration is pending human review.

#### Implementation details

- **Browser-driven router (`src/router.tsx`, `src/routerUtils.ts`):**
  - Replaced the in-memory scaffold with a History API router initialized from
    `window.location.pathname + window.location.search + window.location.hash`.
  - Extracted pure URL validation and route pattern matching into `src/routerUtils.ts`
    (`safeInternalUrl`, `matchPath`) to guard against open redirects and malformed URIs.
  - Ordinary navigation uses `history.pushState`; normalization and redirects use
    `history.replaceState`. A `popstate` listener syncs browser Back and Forward
    without triggering full reloads or duplicate history entries.
  - Denied History API in embedded sandbox previews triggers a scoped in-memory
    history fallback without breaking normal browser behavior.
- **Authentication hydration & safe return (`src/App.tsx`, `src/pages/LoginPage.tsx`, `src/store/MovieStore.tsx`):**
  - App shell waits for authentication profile hydration before deciding route access.
  - Unauthenticated access to protected routes redirects to `/login?returnTo=...`.
  - On sign-in success, validates `returnTo` via `safeInternalUrl` against permitted
    in-app routes (`/home`, `/movies`, `/lists`, `/suggestions`, `/explore`, `/friends`,
    `/settings`), falling back safely to `/` to eliminate open redirect vectors.
  - Account switching or logout clears private cached context, including active
    Explore category sessions and saved list state in `sessionStorage`.
- **Scoped Explore session restoration (`src/hooks/useExploreCategory.ts`, `src/pages/MovieDetailPage.tsx`):**
  - History entry restoration is scoped to `entryKey` and `currentUserId`.
  - Browser Back from title details to Explore restores loaded category results, active
    sort/filter controls, and scroll position, while pruning confirmed library saves.
  - Direct URL loads or page reloads start a fresh bounded pagination session.
  - Eliminated global `last_movie_referrer` and `details_return_target` sessionStorage
    markers; return navigation uses router history and entry references.
- **Semantic links & typed identity (`src/components/MovieGrid.tsx`, `src/components/PosterShelf.tsx`, `src/router.tsx`):**
  - `<Link>` renders native `<a>` elements with `href`. Modified clicks (`Ctrl`, `Cmd`,
    `Shift`, `Alt`), middle clicks, and "Open in new tab" retain browser-native behavior.
  - Movie and TV titles sharing the same numeric TMDB ID remain distinct across direct
    URLs and new tabs via explicit typed identifiers (`tv:<id>` or `?type=TV`).
- **Accessible route transitions (`src/App.tsx`):**
  - Meaningful `document.title` assigned on each route transition (`<Screen> · Movie Night`).
  - Screen headings receive programmatic focus on route entry; return navigation from
    title details restores contextual focus to the originating title link.
- **Deployment & serving guidance (`tech-stack.md`):**
  - Added SPA fallback routing guidance for production web servers, noting the requirement
    to route unknown paths to `index.html` while preserving genuine `/api/*` and missing
    asset 404/500 errors.

#### Verification

Commands run from `repo/MovieNightFrontend/` on 2026-10-31:

- `node --test tests/unit/*.test.cjs`: **38 passed** (10 router tests, 14 compact-rating
  tests, and 14 bounded-read tests).
- `./node_modules/.bin/tsc --noEmit`: passed with 0 errors.
- `npm run build`: built production client bundle in 302ms with 0 errors.
- `node tests/browser/issue-4-navigation.cjs`: passed in Chrome (headless) exercising
  direct URL loading, full page reload, unknown route recovery, real browser history
  Back/Forward without reload, query-string preservation, multi-page Explore scroll
  restoration, new tab direct navigation, distinct Movie/TV identities, live search
  input history synchronization, safe login redirection, expired/unavailable session
  recovery, and sandbox History API denial fallback.
- Direct HTTP requests: verified deep-link SPA serving fallback.

| Acceptance | Result and observable boundary |
| --- | --- |
| BN01 | Passed: Core screens use real URLs; ordinary navigation creates history entries; Back/Forward updates route without reload loops or duplicate entries. |
| BN02 | Passed: Direct navigation and reload retain paths and query parameters; reload starts fresh pagination; unknown route displays 404 recovery view. |
| BN03 | Passed: Access decision waits for auth hydration; login return validated against permitted in-app paths; logout/account switch purges cached sessions. |
| BN04 | Passed: Explore return restores loaded cards, active controls, confirmed saves, and scroll position; scoped to history entry and user; no global referrer marker. |
| BN05 | Passed: Semantic `<a>` links support modified clicks, new tabs, and copied URLs; distinct movie/TV identities with identical numeric IDs preserved. |
| BN06 | Passed: Documented serving guidance in `tech-stack.md`; verified fallback behavior; preview History API exception handled gracefully without breaking normal browser navigation. |
| BN07 | Passed: Meaningful document titles set per screen; focus managed smoothly across route transitions; contextual focus restored to title link on return. |

Final two-axis review: **Standards 0 findings; Spec 0 remaining findings**.

#### Limitations and exclusions

Browser verification was executed in Chrome against local Vite dev and preview servers
with mocked auth and API fixtures. Physical phones, alternative browser engines (Safari,
Firefox), and production web server deployments (Nginx, Caddy) remain outside this test
boundary. Unrelated working tree changes for Issue #3, Issue #5, and Issue #6 are
identified and excluded from the proposed Issue #4 commit scope.

### Issue #5 Implementation and Validation Evidence (2026-10-31)

Contract: [GitHub #5: Replace overlapping search focus effects with one coherent focus treatment](https://github.com/AndreiJulei/MovieNight/issues/5).

Tested revision: base `278ebb48222fff6dbb9157dd93083f3d033c83ec` on
`feat/014-frontend-reliability-navigation`, with changes in
`src/components/NavSearch.tsx`, `src/index.css`, and
`tests/browser/issue-3-5-controls-search.cjs` (paths relative to the frontend).
This record accompanies those changes; integration is pending human review.

#### Implementation and focus consolidation

- **Single coherent keyboard ring (SF01, SF02):**
  - Consolidated search field focus styling to one 2px accent focus ring
    (`.nav-search-keyboard:focus-within { border-color: var(--color-accent); box-shadow: 0 0 0 2px var(--color-accent); }`)
    applied directly to the outer 10px rounded container.
  - Eliminated the 6px blurred box shadow (`box-shadow: 0px 0px 0px 6px ...`) and
    layout shift from expanding width (`w-48` / `w-60` to `w-64` / `w-80`). Container
    width remains fixed at `lg:w-64` on desktop and full width on mobile.
  - Removed `!important` from global `input:focus-visible` in `src/index.css` so
    component-level rules cooperate. Added `.nav-search-field input:focus-visible { outline: none; }`
    to suppress the inner blue rectangle without disabling focus outlines globally.
- **Calm pointer/touch interaction (SF02):**
  - Pointer down (`onPointerDown`) on the search container sets `keyboardFocus = false`,
    ensuring mouse clicks and phone touch taps do not display the keyboard ring or shadow.
  - Keyboard interactions (Tab keydown, search keyboard shortcuts `/`, `Cmd+K`, `Ctrl+K`,
    and arrow keys) set `keyboardFocus = true`, rendering the clear accent ring.
  - Other text inputs across the application (such as the Friends search input) retain
    standard `outline: 2px solid var(--color-accent); outline-offset: 2px;`.
- **Search operations and accessibility (SF03):**
  - Live search debouncing, clear action button, suggestion selection with ArrowUp/ArrowDown,
    Enter navigation to title details, Escape dismissal, and full search navigation to
    `/movies/add?q=...` continue working cleanly.
  - Added semantic `role="listbox"`, `aria-label="Search results"`, `role="option"`,
    `aria-selected`, `aria-controls`, and `aria-activedescendant` for screen-reader usability.
  - Suggestion items render as semantic `<a>` anchors with preserved modified click handling.
- **Responsive bounds and dark theme (SF04):**
  - Popover width is clamped to `w-[min(24rem,calc(100vw-2.5rem))]` and max height to
    `max-h-[min(420px,55dvh)]` to prevent viewport clipping and on-screen keyboard obstruction.
  - Long queries do not cause horizontal document scroll overflow.
  - Preserved existing dark palette (`#0e1320`, `var(--color-accent)`).

#### Verification

Commands run from `repo/MovieNightFrontend/` on 2026-10-31:

- `node --test tests/unit/*.test.cjs`: **38 passed** (10 router tests, 14 compact-rating
  tests, and 14 bounded-read tests).
- `./node_modules/.bin/tsc --noEmit`: passed with 0 errors.
- `npm run build`: built production bundle in 340ms with 0 errors.
- `node tests/browser/issue-3-5-controls-search.cjs`: passed in Chrome (headless) at
  **1440×900 desktop** and **390×844 phone emulation**.
  - Verified: pointer focus calmness (no box shadow), keyboard Tab focus ring, stable container width
    (before: 256px, after: 256px), long query no-overflow, clear button, empty results message and full
    search link, 503 error alert and full search link, Escape closes suggestions, arrow down selection,
    Enter route navigation, semantic option anchors, and regression text input outline width >= 2px.
- Batched screenshots: `/private/tmp/issue-3-5-controls/search-1440.png` and `search-390.png` inspected
  together; ring is contained and aligned with visible pill border, with no inner rectangle or clipping.

| Acceptance | Result and observable boundary |
| --- | --- |
| SF01 | Passed: Single coherent 2px accent ring aligned to container border; no inner input rectangle, no 6px glow, no width expansion layout shift. |
| SF02 | Passed: Pointer/touch focus is calm; keyboard focus displays high-contrast ring; non-search inputs retain focus outline. |
| SF03 | Passed: Query entry, suggestions, arrow/Enter/Escape, clear action, empty and error states verified in browser tests. |
| SF04 | Passed: Desktop (1440×900) and phone (390×844) viewports verified without page overflow or clipping; dark theme preserved. |

#### Limitations and exclusions

Browser verification was executed in Chrome against local Vite dev server with mocked
API fixtures. Physical on-screen keyboards and physical phone devices remain outside this
automated test boundary. Unrelated working tree changes for Issue #3, Issue #4, and Issue #6
are excluded from the proposed Issue #5 commit scope.

### Issue #6 Implementation and Validation Evidence (2026-10-31)

Contract: [GitHub #6: Provide reproducible same-network phone access and verify mobile core flows](https://github.com/AndreiJulei/MovieNight/issues/6).

Tested revision: base `278ebb48222fff6dbb9157dd93083f3d033c83ec` on
`feat/014-frontend-reliability-navigation`, with changes in
`docs/features/008-production-readiness/demo.sh`,
`docs/features/008-production-readiness/test_lan_launcher.py`,
`repo/MovieNightFrontend/vite.config.ts`,
`repo/MovieNightFrontend/tests/http/lan-proxy.test.cjs`,
`repo/MovieNightFrontend/tests/browser/responsive-usability.cjs`, and
`docs/features/014-frontend-reliability-navigation/phone-validation.md`.
This record accompanies those changes; integration is pending human review.

#### Implementation details

- **Repeatable LAN launcher mode (`docs/features/008-production-readiness/demo.sh`, `test_lan_launcher.py`):**
  - Added opt-in `lan` mode: `LAN_IP=<address> [PORT=8443] ./demo.sh lan`.
  - Added strict IP validation verifying `LAN_IP` is a valid IPv4 address that is not loopback, unspecified, multicast, reserved, or link-local.
  - Passes `VITE_API_URL="http://${LAN_IP}:${PORT}"` so the mobile browser makes same-origin API requests instead of erroneously calling its own `localhost:8080`.
  - Preserves the default loopback-only behavior for `demo.sh run`.
- **Same-origin dev API proxy (`repo/MovieNightFrontend/vite.config.ts`, `tests/http/lan-proxy.test.cjs`):**
  - In `mode === 'lan'`, Vite proxies `/api` requests to loopback backend (`127.0.0.1:8080`).
  - Request rewriting removes matching browser `Origin` headers when `origin.host === host`, allowing Spring's loopback CORS policy to succeed for legitimate same-network phone users while retaining backend CORS protection and passing foreign origins through for rejection.
  - Production configurations, CORS policies, and bindings remain untouched.
- **Documentation and mobile verification checklist (`docs/features/014-frontend-reliability-navigation/phone-validation.md`):**
  - Documented exact startup, network discovery (`ipconfig getifaddr en0`, `ip -4 addr show`), failure simulation via fixture modes, and clean shutdown steps.
  - Detailed connection troubleshooting covering firewalls, client isolation, VPN routing, HTTP vs HTTPS, and invalid proxy targets.
  - Formulated comprehensive mobile checklist covering 10 testing dimensions across portrait/landscape and viewports 360, 390, 430, 1280, 1440 CSS px.
  - Added 430px viewport to `tests/browser/responsive-usability.cjs`.

#### Verification

Commands run from repository root and `repo/MovieNightFrontend/` on 2026-10-31:

- `python3 -m unittest discover -s docs/features/008-production-readiness -p test_lan_launcher.py`: **2 passed** (checks address requirement and loopback rejection).
- `node --test repo/MovieNightFrontend/tests/http/lan-proxy.test.cjs`: **1 passed** (forwards authenticated POST, strips matching simulated phone Origin, retains foreign Origin, preserves upstream 404, serves Vite deep links).
- `node --test repo/MovieNightFrontend/tests/unit/*.test.cjs`: **38 passed** (10 router, 14 compact-rating, 14 bounded-read).
- `cd repo/MovieNightFrontend && ./node_modules/.bin/tsc --noEmit`: passed with 0 errors.
- `cd repo/MovieNightFrontend && npm run build`: built production bundle in 376ms with 0 errors.
- `bash -n docs/features/008-production-readiness/demo.sh`: passed syntax check.

| Acceptance | Result and observable boundary |
| --- | --- |
| PV01 | Passed: Complete repeatable LAN development path with exact commands, address discovery, cleanup steps, and unit tests (`test_lan_launcher.py`). |
| PV02 | Partially passed over HTTP; physical phone run left unverified: Vite LAN proxy forwards authenticated API requests without localhost leaking; production CORS and binding unchanged. |
| PV03 | Passed: Emulation vs physical distinction and comprehensive troubleshooting documented in `phone-validation.md`. |
| PV04 | Passed as checklist: Concise checklist covering 10 testing dimensions across 360/390/430/1280/1440px provided; viewport 430 added to `responsive-usability.cjs`. |
| PV05 | Passed: Date, base revision, environment, missing physical phone/browser, and individual statuses honestly recorded without fabricating physical completion. |
| PV06 | Passed: Provider calls remain local/mocked, authentication and privacy boundaries maintained, no public tunnels or production config altered. |

#### Limitations and exclusions

Physical phone device and mobile browser execution could not be run because no physical mobile device was connected to the development environment. The runnable setup, proxy tests, launcher checks, and checklist are provided with physical test rows explicitly designated as "Not run" per PV05. Unrelated working tree changes for Issue #3, Issue #4, and Issue #5 are excluded from the proposed Issue #6 commit scope.
