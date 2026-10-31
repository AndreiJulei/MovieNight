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

Final two-axis review: **Standards 0 findings; Spec 0 remaining findings**.
The regular-grid phone concern raised during review was reproduced, fixed and
confirmed by the final five-viewport browser run.

#### Limitations and exclusions

Browser checks use mocked API/auth responses and Chrome device emulation. They
do not certify real provider responses, persistence, physical phones, deployment,
or other browser engines. No backend suite or unrelated browser suites were run
for this presentation-only change. Tickets #3–#6, ranking, filters and personal
ratings remain outside this slice. `roadmap.md` and `.vscode/settings.json` are
pre-existing changes outside the proposed Issue #2 commit scope.
