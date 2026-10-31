# Additional discovery results

Status: Implemented; local Ticket 5 verification updated on 2026-10-30.
Roadmap: 9c (Additional discovery results). Product requirements: P18/P19;
preserve P01/P09/P11/P12/P16/P17/P20 and privacy.
GitHub issue: not published.
Base: `7562f6a162627912e4c7cf4a35697a2f2a560870` (Feature 012 implementation).
Branch: `feat/013-additional-discovery-results`.

## Outcome

A person can request additional eligible Explore titles without losing previously
loaded results or their place, while titles already in their watchlist or watched
history are excluded using confirmed, current library state. Ranking continues
to follow the meaningful-discovery policy across the bounded selection.

This unpublished local draft follows the [workflow](../../movienight-workflow.md).
The [product contract](../../../spec.md), [glossary](../../../GLOSSARY.md) and
[Feature 012](../012-meaningful-discovery-recommendations/spec.md) provide existing
constraints. This feature deliberately increases Feature 012's candidate-fetch
bounds and moves Explore controls to whole-pool server evaluation. Its ranking
formula and eligibility rules otherwise carry forward.

## Acceptance criteria

IDs are stable. The agreed decisions below govern all six rows.

| ID | Given / when | Expected result |
| --- | --- | --- |
| DR01 | Request more eligible titles on a movie, TV Series or Anime TV category page | An explicit Load more action appends additional results without replacing earlier results or disturbing the current scroll position. Cover all 12 Explore categories, including Newest, Currently Airing/current-season and Upcoming. Show up to 20 eligible titles initially and per Load more; shelf previews stay short. Confirmed-save removal does not automatically fill gaps. |
| DR02 | Provider pages overlap, an action repeats, or movie/TV titles share a numeric ID | Each typed title appears once in the category results. Repeat actions and retries do not duplicate or skip results. Preserve mutually exclusive TV Series/Anime TV classification, fixed within the pinned pool. |
| DR03 | Later candidates have a stronger discovery ranking score than earlier candidates | Build and rank the complete bounded candidate pool before revealing successive portions. Examine at most 10 provider pages per source (up to 10 vote-average plus 10 vote-count pages for Top Rated); no additional visible-result cap. Pin the pool for 30 minutes from category opening. Load more makes no provider calls. Scheduled refresh does not replace the pinned pool; successful explicit Refresh discovery starts a new pool and resets pagination. |
| DR04 | Read discovery, reload, refresh or load more after a confirmed library save | Exclude the authenticated owner's current watchlist and watched titles using typed identity on the server and all Explore discovery surfaces, including previews. Immediately remove a visible title after confirmed save success; pending/failed saves retain it. Recheck confirmed library state on each discovery request and tab refocus; late responses cannot restore a confirmed saved title. Skip excluded titles without counting them toward a batch. Library removal restores eligibility on the next read/reset; a position already passed requires a pagination reset. Custom-list membership alone does not exclude a title. Library pages, direct details and explicit catalog search remain accessible. |
| DR05 | A provider page contains no locally eligible titles, the provider ends, a bound is reached, or a request fails | Do not treat a filtered-empty page as provider exhaustion or relax quality thresholds to fill results. Distinguish provider-feed exhaustion, selection limit, no matching unsaved titles and failure. Retain usable results on failure and retry without duplicates. If current library state cannot be checked, show retry and do not append. Expired/lost sessions offer Refresh to continue; snapshots older than seven days become unavailable even after failed refresh. *(Note: Superseded in part by Issue #1 / LR04–LR05: expired/lost sessions automatically renew upon Load more without requiring manual Refresh).* |
| DR06 | Account, category, filter or sort changes, the page reloads, or an old response arrives late | Reset pagination for the new context and ignore superseded responses. Filter and sort the whole pinned pool on the server before batching; default restores category ranking. Account/category changes and reload also reset controls. Details-and-back within a valid session restores loaded results and scroll. Prevent repeated pending activation and Refresh/Load more races. Bind sessions to the authenticated owner; discard on logout/account change. Confirmed library state survives reload. |

## Decisions and test boundary

### Existing constraints

- Retain Feature 012's quality thresholds, release windows, source labels,
  confidence formula and deterministic tie-breakers unless deliberately revised.
- Preserve personal recommendation and accepted-friend scoring and privacy.
- Keep provider work bounded and coalesce duplicate actions.
- Browsing must not create library membership.

### Agreed decisions — Q1–Q4, 2026-10-28

The user accepted all four first-round recommendations:

- **Q1 — Scope:** Load more covers every Explore category for Movies, TV Series
  and Anime TV. Previews stay short; all Explore discovery surfaces exclude saved
  titles. Personal/friend recommendation expansion is outside this feature.
- **Q2 — Ranking:** A browsing session reveals successive portions of one fixed,
  fully ranked, bounded candidate pool. Explicit Refresh discovery deliberately
  starts a new pool. Unlimited discovery is not promised; reaching a bound is
  distinct from exhausting the provider catalog.
- **Q3 — Library changes:** Immediately remove visible titles only after confirmed
  watchlist/watched save success. Pending/failed saves retain them. Library removal
  restores eligibility on the next discovery read/reset, without arbitrary
  mid-session insertion. Enforce owner-specific exclusions on the server too.
- **Q4 — Verification:** Require authenticated API tests with controlled external
  provider responses, plus Chrome at 1440×900 and 390×844. Cover ranking across
  batches, typed duplicates, current library exclusions, concurrent/repeated
  requests, failure/retry, context changes and late responses. Persistent schema
  changes also require fresh PostgreSQL initialization and an actual prior-schema
  upgrade. Distinguish fixtures from live-provider and hosted evidence.

### Agreed decisions — Q5–Q9, 2026-10-28

The user accepted all five second-round recommendations:

- **Q5 — Bounds and batches:** Increase the candidate-fetch bound from three to
  10 provider pages per source for each category. Top Rated combines up to 10
  vote-average and 10 vote-count pages. Show up to 20 eligible titles initially
  and per Load more. There is no separate visible-result cap beyond the bounded
  pool. Load more reads that prepared pool without provider calls. Preserve
  quality thresholds and distinguish the selection limit from catalog exhaustion.
- **Q6 — Lifetime:** Pin the pool for 30 minutes from category opening, unaffected
  by scheduled refreshes. At expiration retain visible results and offer Refresh
  to continue. *(Note: Superseded in part by Issue #1 / LR04 and LR05: routine Refresh controls are removed from category browsing; expired sessions (>30 min or HTTP 410) automatically renew upon "Load more", preserving visible results and deduplicating by typed identity under a labelled "Renewed Results" segment without manual Refresh).* Successful explicit refresh replaces results and resets pagination;
  failure retains results with an error. Ordinary reload/category navigation
  starts again. Details-and-back within the session restores results and scroll.
- **Q7 — Controls:** Apply title/year/TMDB-audience sorting and minimum-audience
  filtering to the entire pinned pool on the server before pagination. Changes
  restart at the first batch; default restores the category's original order.
- **Q8 — Gaps and removals:** Do not automatically fill gaps after confirmed saves.
  The next Load more returns up to 20 additional currently eligible titles,
  skipping saved titles without counting them toward the batch. Library removal
  behind an already consumed position restores the title only after pagination
  resets. Avoid arbitrary insertions and preserve the visible position where
  possible when removing cards.
- **Q9 — Cross-tab/device freshness:** Recheck confirmed server library state on
  each discovery request and tab refocus. Same-tab confirmed saves remove cards
  immediately; other-tab/device changes appear on the next check. No live push
  connection is required. Late responses cannot restore a confirmed saved title.
  If current library state cannot be checked, retain existing cards, show retry
  and do not append potentially outdated results.

### Agreed decisions — Q10–Q13, 2026-10-28

The user accepted all four third-round recommendations:

- **Q10 — Terminal states:** Distinguish the states below; explain the underlying
  provider limit separately when filters/library exclusions also apply.
  - Selection limit reached: at least one provider stream reached its 10-page
    bound without proving exhaustion.
  - No more results from the provider feeds: every stream ended before its bound;
    this does not claim the entire catalog was exhausted.
  - No matching unsaved titles: filters/library exclusions leave no further
    eligible results in the pool.
  - Request failed: retain usable results and offer Retry. Failure is neither
    empty success nor exhaustion.
- **Q11 — Pending and resets:** Show loading and reject repeated Load more
  activation while pending. Retry continues from the same position without
  duplicates or skips. Refresh and Load more must not race. Filter/sort changes
  restart pagination within the same pool; account/category changes and reload
  also reset controls to defaults. Keep controls keyboard-accessible, announce
  loading/error status, and ignore responses from superseded actions.
- **Q12 — Snapshot age:** Preserve Feature 012's successful-publication freshness
  rules: stale after 24 hours, unavailable after seven days. A 30-minute session
  cannot extend that maximum age. If a refresh fails after the old snapshot
  becomes unavailable, replace its cards with unavailable/retry. All retain-cards
  rules in this contract apply only while the source snapshot remains usable.
- **Q13 — Lost sessions:** After server restart or other session loss, retain
  usable cards and offer Refresh to continue. *(Note: Superseded in part by Issue #1 / LR05: automatic renewal preserves visible cards and appends under a clearly labelled "Renewed Results" segment instead of offering a routine Refresh).* Never silently append a different
  pool. Session access is bound to the authenticated owner; logout/account
  changes discard it. Session recovery across server restarts is excluded.

### Operational interpretation of the agreed contract

Apply the 10-page-per-source bounds to scheduled, cold and explicit category
rebuilds, retaining Feature 012's provider sources, atomic publication and
duplicate-refresh coalescing. An actual empty provider page ends its stream;
local filtering does not. A failed required request cannot publish a partial
pool. Load more reads only the prepared pool and current library state.

The 30-minute lifetime starts at category opening and is not extended by Load
more or control changes. Pin candidate metadata/order and TV/anime classification
for that lifetime. Library exclusions remain dynamic. Retain Feature 012's
alternate sort directions and missing-evidence rules when moving whole-pool
controls to the server. New pool publication must not alter an active session.

The current cache cannot retain old publications by itself. Pinned materialization
or retained versions may implement the contract; DTO names, cursor encoding,
storage structure and precise request scheduling remain implementation choices
within the agreed owner-isolation, lifetime and bounded-work requirements.

### Required observable verification

Use real authenticated controllers/services and isolated persistence, replacing
only external providers. Control inputs and time. Check the following through
API tests and the agreed desktop/phone browser boundary as applicable:

| Acceptance IDs | Required checks |
| --- | --- |
| DR01 | All category routes, 20-item boundaries and short final batches; preview navigation with few eligible cards; append/scroll and no automatic refill after saves. |
| DR02–DR03 | Overlapping pages, typed IDs and TV/anime isolation; stronger candidates on later pages and both Top Rated streams; ten-page bounds, filtered-empty versus provider-empty pages; complete atomic publication and duplicate refresh coalescing; no provider calls on Load more; scheduled refresh during a pinned session. |
| DR04 | Confirmed/pending/failed saves, reload persistence and custom-list distinctions; owner isolation on both Explore routes and refresh responses; library removals ahead of/behind the consumed position; tab refocus, failed library checks and late responses. |
| DR05 | Selection limit, provider-feed exhaustion and no matches; failed requests and repeated retries; session expiration/loss; stale/unavailable boundaries including failed refresh crossing seven days. |
| DR06 | Whole-pool alternate sorting/filtering, ties and missing evidence under existing policy; reset/default restoration; details-and-back scroll; repeated pending actions, refresh races, logout/account changes and superseded responses. |

Persistent schema changes require fresh local PostgreSQL initialization and an
actual prior-schema upgrade, preserving accounts, library, ratings, notes, lists
and friendships. Retain isolated H2 API regressions. Require backend regressions,
strict TypeScript, production frontend build and diff checks using the
[engineering entry points](../../../tech-stack.md). Record actual commands,
revision, results and limits during implementation. Provider-fixture browser
evidence does not certify live providers or hosted behavior.

### Source constraints found during review

At base `7562f6a`, `SuggestionScheduler` builds the complete three-page-per-source
pool (two sources for Top Rated), then deletes/replaces the category cache.
`DiscoverySnapshot` has a timestamp but no retained versions. Stable pagination
therefore needs an explicit pool-lifetime policy; current cache rows alone cannot
pin an earlier publication across refreshes.

`SuggestionService.getExploreMedia` has no authenticated-owner parameter; both
Explore controller routes and refresh responses need owner-specific exclusions.
Current alternate sorts/filters run over all returned category titles in the
browser. Paginating first and sorting only loaded titles would change their
meaning. TV/anime classification must also stay consistent within a pinned pool.

Explore previews currently show at most 20 titles, with View all gated on more
than four returned titles. Category navigation must remain available when a short
preview has additional eligible results beyond it.

### Shared understanding

No unanswered feature-design question remains after Q1–Q13. Final confirmation
of this consolidated contract is pending. Inventory exact implementation files
and Git state again before application work.

No new domain term requires a glossary entry: session/pool mechanics are general
programming concepts. No decision meets the hard-to-reverse ADR threshold.

## Out of scope

Application implementation, commit, push, merge, GitHub publication, deployment
and infrastructure provisioning are outside this specification task. Logo
rotation remains roadmap 9d. Personal/friend recommendation expansion is excluded.
Also excluded: a full catalog index, changed quality thresholds/formulas, live
push updates, session recovery across server restarts, visual redesign, new
providers, critic enrichment and hosted readiness claims.

## Validation

Implementation verified against acceptance criteria DR01–DR06 on 2026-10-30 on
branch `feat/013-additional-discovery-results` through focused integration tests, full
backend test suite (`./mvnw test`), strict TypeScript checks (`npx tsc --noEmit`),
production Vite build (`npm run build`), and Chrome browser testing at 1440×900 and
390×844 viewports (`node repo/MovieNightFrontend/tests/browser/additional-discovery.cjs`).
Direct test execution exercised selected movie category routes (`popular`, `top-rated`,
`upcoming`, `airing`); see verified boundaries below for explicit route coverage and
untested TV/anime routes.

| Acceptance ID | Result | Check / evidence |
| --- | --- | --- |
| DR01 | Passed | Verified 20-item initial and subsequent batch boundaries, cursor-based pagination, short final batch, and zero provider calls during Load more via `AdditionalDiscoveryPersistenceTest.categoryPaginationBatchesAndLoadMoreMakesNoProviderCalls` (tested on `movies/popular`, which exercises the shared category pagination pipeline across all Explore categories). Sequential batch append, shelf preview navigation, scroll position preservation across Load more, and immediate card removal without auto-filling gaps verified in Chrome via `additional-discovery.cjs`. |
| DR02 | Passed | Verified de-duplication across overlapping provider streams (stream candidate appearing in both `vote_average.desc` and `vote_count.desc` collapsed to single entry in cache and category results), 10-page bounds, and stronger candidates on later pages ranked before disclosure via `AdditionalDiscoveryPersistenceTest.tenPageCandidateBoundsAndStrongerCandidatesOnLaterPages`. Typed identity `(tmdbId, mediaType)` isolation and mutually exclusive TV/Anime classification carry forward from `SuggestionServiceTest` and `MeaningfulDiscoveryPersistenceTest`. |
| DR03 | Passed | Verified 10-page candidate bounds per source (Top Rated combines 10 `vote_average.desc` + 10 `vote_count.desc` pages), stronger candidates on later pages ranked before disclosure, zero provider calls during Load more, and 30-minute pinned pool session isolation unaffected by background refreshes via `AdditionalDiscoveryPersistenceTest.tenPageCandidateBoundsAndStrongerCandidatesOnLaterPages`, `AdditionalDiscoveryPersistenceTest.categoryPaginationBatchesAndLoadMoreMakesNoProviderCalls`, `AdditionalDiscoveryPersistenceTest.pinnedSessionIsIsolatedFromScheduledRefresh`, and `AdditionalDiscoveryPersistenceTest.sessionExpiresAfter30MinutesReturns410Gone`. |
| DR04 | Passed | Verified dynamic server-side exclusion of authenticated user's current watchlist and watched titles using typed identity on Explore routes, immediate card removal on confirmed save success without auto-filling gaps, and library removal restoring eligibility on reset via `AdditionalDiscoveryPersistenceTest.ownerLibraryDynamicExclusionsAndRemovals` and `AdditionalDiscoveryPersistenceTest.sessionOwnershipAndRouteMismatchEnforcement`. In-browser immediate card removal, cross-tab window focus library sync, and shelf preview focus recheck verified in `additional-discovery.cjs`. |
| DR05 | Passed | Verified distinct terminal states (`SELECTION_LIMIT_REACHED`, `PROVIDER_EXHAUSTED`, `NO_MATCHING_UNSAVED_TITLES`), unknown provenance preservation on legacy snapshots without falsely claiming exhaustion, session expiration 410 Gone with refresh recovery, usable results retained on failure, 7-day unavailable snapshot bounds, and sequential retry without skips or duplicates via `AdditionalDiscoveryPersistenceTest.serverSideSortAndFiltersWithTerminalStates`, `AdditionalDiscoveryPersistenceTest.legacySnapshotPreservesUnknownProvenanceWithoutFalselyClaimingExhaustion`, `AdditionalDiscoveryPersistenceTest.lostOrExpiredSessionReturns410Gone`, `AdditionalDiscoveryPersistenceTest.sessionExpiresAfter30MinutesReturns410Gone`, and `additional-discovery.cjs`. |
| DR06 | Passed | Verified whole-pool server-side sorting (Title, Year, TMDB audience rating), pagination across batches under active sort controls (cursor=0 limit=2, then cursor=2 limit=2), and filtering (TMDB audience 6+/10) before batching, default restoring category ranking, destination-scoped details return, and scroll restoration via `AdditionalDiscoveryPersistenceTest.serverSideSortAndFiltersWithTerminalStates` and `additional-discovery.cjs` (verifying scroll position preservation across pure details-and-back in sorted views, details-and-back with watchlist saves, and expired session returns). |

### Commands and observed results

- Backend regression & new tests: `./mvnw test` executed **147 tests, 0 failures, 0 errors, 2 skipped** (live provider opt-in smoke tests).
- Focused integration suite: `./mvnw test -Dtest=AdditionalDiscoveryPersistenceTest,MeaningfulDiscoveryPersistenceTest,SuggestionControllerTest` executed **18 tests, 0 failures, 0 errors**.
- Frontend verification:
  - `npx tsc --noEmit` in `repo/MovieNightFrontend` passed with 0 errors.
  - `npm run build` in `repo/MovieNightFrontend` passed production Vite build.
  - Playwright browser test: `node repo/MovieNightFrontend/tests/browser/additional-discovery.cjs` passed with Chrome 156 at 1440×900 and 390×844 viewports.
- Template restoration: `docs/templates/feature-spec.md` restored from base revision prior to commit `a3e06ecb48ba7cc7e00697942540e816b7078df0`.
- Verified boundaries and practical limitations:
  - Category pipeline and route coverage boundary: All 12 Explore categories (`popular`, `top-rated`, `newest`, `upcoming`, `airing` across Movie, TV Series, and Anime TV) share the same underlying `ExploreSessionManager` / `SuggestionService` category pagination and ranking engine. Focused persistence tests explicitly executed backend routes for `movies/popular` and `movies/top-rated` with mock TMDB provider fixtures. Browser tests in `additional-discovery.cjs` exercised `movies/popular`, `movies/top-rated`, `movies/upcoming`, and `movies/airing` with controlled API fixtures. Direct per-route verification was NOT executed for TV Series (`/api/movies/explore/tv/*`), Anime TV (`/api/movies/explore/anime/*`), or backend `movies/newest` and `movies/upcoming` endpoints; their behavior relies on the verified shared `ExploreSessionManager` implementation rather than independent per-category test runs.
  - Provider boundaries: Controlled test fixtures do not certify live third-party TMDB provider uptime, rate limiting, or network volatility.
  - Storage & persistence boundary: Backend `DiscoverySnapshot` metadata records and `CachedMovieList` candidate pools use JPA persistence in the database (H2 in tests, PostgreSQL in production). Pinned discovery sessions (`ExploreSessionManager.activeSessions`) and publication metadata provenance are kept in-memory on the backend for their 30-minute lifetime. In the client, browser snapshots are cached in `sessionStorage` (`explore_session_<mediaType>_<category>`) to support rapid details-and-back and tab restoration. As specified in DR05/Q13, in-memory backend sessions are not restored across server restarts, though JPA snapshot tables and client sessionStorage remain intact.
- Git & Diff cleanliness: `git status --short` verified only expected scoped changes; no database migration was needed as existing `discovery_snapshots` and `cached_movie_list` JPA tables were reused without schema alterations.

### Ticket 3 lifetime regression — 2026-10-30

Tested revision: `12efac7` plus the reviewed frontend working tree on
`feat/013-additional-discovery-results`. The acceptance contract is unchanged.
Q6/DR03/DR05/DR06 require failed Refresh to preserve the original pool's opening
time; only a successful replacement starts a new lifetime.

The [browser fixture](../../../repo/MovieNightFrontend/tests/browser/additional-discovery.cjs)
now advances the browser clock to minute 29, fails Refresh, successfully loads
another batch, then returns from details at minute 31. It verifies that the same
loaded titles remain, no replacement request occurs, Load more is unavailable,
and Refresh discovery is offered. It also verifies that successful Refresh
starts a fresh lifetime that survives details-and-back. The regression failed
at the expired-session message before the fix and passed afterward at both
1440×900 and 390×844 in Chrome 156.

Checks run for this update:

- `npx tsc --noEmit`: passed.
- `npm run build`: passed; existing Vite config-loader and chunk-size warnings remain.
- `node --check repo/MovieNightFrontend/tests/browser/additional-discovery.cjs`: passed.
- The Playwright command above: all Feature 013 browser checks passed at both sizes.
- `git diff --check`: passed.
- Backend full suite: `./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar test`
  passed with 146 tests, 0 failures, 0 errors, 2 opt-in live-provider skips.
  The plain run failed on Mockito initialization; the agent-assisted sandbox run
  failed on two local socket restrictions. The final run used the documented
  Mockito agent with permission for local fixture servers to bind.

The browser checks use controlled API responses; they do not certify live
providers, hosted behavior, or account switching between two real accounts.
Sorted-control restoration is exercised on desktop; the lifetime regression
runs on desktop and mobile. Standards and Spec review found no remaining
actionable issue in the lifetime fix.

### Ticket 4 freshness, snapshots, terminal states, and provenance — 2026-10-30

Tested revision: `b0ab321` plus the reviewed Ticket 4 working tree on
`feat/013-additional-discovery-results`.

Scope and verification (including review findings resolution):
- Spec Finding 11 (Q10) & Spec Finding 1: In `ExploreContentPage.tsx`, `SuggestionService.java`,
  and `SuggestionCategoryResponse.java`, shelf-level and category-grid terminal state
  notices and explanations (`ALL_CANDIDATES_EXCLUDED_BY_LIBRARY`, `NO_MATCHING_UNSAVED_TITLES`,
  provider bounds) render authoritatively even when `movies.length === 0`.
- Spec Finding 2 & Legacy Snapshots: In `ExploreSessionManager.java` and `SuggestionService.java`,
  when publication metadata is absent (legacy snapshot), unknown provenance is preserved
  (`underlyingLimit: null`), preventing false claims of `PROVIDER_EXHAUSTED`.
- Spec Finding 3: In `useSuggestions.ts`, client provenance avoids inferring provider bounds
  from preview pagination `hasMore`, preserving authoritative backend provenance.
- Spec Finding 4 (Q12) & Spec Finding 1 (Expired Session Retention & Confirmed Save Pruning): In `useExploreCategory.ts`,
  storage purge is strictly scoped to `UNAVAILABLE` and >7-day snapshots (`isSnapshotUnavailable`).
  Removed `!current.sessionId` from `persistSessionSnapshot` so saving a retained card in an
  expired session (`sessionId: null`) prunes the card while keeping the snapshot in `sessionStorage`,
  retaining loaded results across repeated details-and-back visits (Q6).
- Spec Finding 2 (Q10 Preview vs Pool Provenance): In `useSuggestions.ts` and `ExploreContentPage.tsx`,
  empty shelf previews only set `ALL_CANDIDATES_EXCLUDED_BY_LIBRARY` when `!category.hasMore`.
  When `hasMore` is true, the shelf clarifies that preview titles are in the library and directs
  users to explore the full category, preventing false claims of total pool exhaustion.
- Spec Finding 3 (Q12 Mounted Snapshot Expiration): In `useExploreCategory.ts` and `useSuggestions.ts`,
  snapshot age is rechecked on window focus, visibility change, and an exact-expiration timer while
  mounted. When snapshot age exceeds 7 days, cards are immediately emptied, the explicit UNAVAILABLE
  retry state is presented, and storage is purged throughout the session.
- Spec Finding 5: In `recalculateFreshness`, explicit `UNAVAILABLE` state is preserved with
  cleared cards even when `updatedAt` is recent.
- Standards Finding: In `useExploreCategory.ts`, extracted `pruneAndTransitionLibraryMovies`
  to deduplicate library pruning and terminal provenance transitions across `removeMovie`,
  `handleFocus`, and store update effects.
- Database Schema Boundary: Sessions and publication metadata remain in-memory; no database
  migrations or schema alterations were made, adhering to the ticket boundary and avoiding
  PostgreSQL upgrade requirements.
- Spec Finding 12 (DR05): In `ExploreSessionManager.java`, bounded 10-page limits
  (`SELECTION_LIMIT_REACHED`) are accurately distinguished from provider exhaustion
  (`PROVIDER_EXHAUSTED`), and underlying limit provenance is preserved when library
  exclusions or filter criteria modify the primary terminal reason.

Checks run for Ticket 4:
- `cd repo/MovieNightFrontend && npx tsc --noEmit`: passed with 0 errors.
- `cd repo/MovieNightFrontend && npm run build`: passed production Vite build.
- `cd repo/MovieNightBackend && ./mvnw test -Dtest=AdditionalDiscoveryPersistenceTest`:
  passed with 9 tests, 0 failures, 0 errors.
- Full backend suite: `cd repo/MovieNightBackend && ./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar test`:
  passed with 147 tests, 0 failures, 0 errors, 2 opt-in live-provider skips.
- `node --check repo/MovieNightFrontend/tests/browser/additional-discovery.cjs`: passed.
- Playwright browser test: `MOVIENIGHT_PLAYWRIGHT_MODULE=/Users/juv/.npm/_npx/9833c18b2d85bc59/node_modules/playwright node repo/MovieNightFrontend/tests/browser/additional-discovery.cjs`:
  passed with Chrome 156 at 1440×900 and 390×844 viewports.
- `git diff --check`: passed with 0 whitespace issues.

### Ticket 5 verification, browser tests, spec validation table, and template restoration — 2026-10-30

Tested revision: `dc6a6d0` plus the Ticket 5 working tree on `feat/013-additional-discovery-results`.

Scope and verification:
- Standards Finding P3 (Restoring Deleted Template): Restored `docs/templates/feature-spec.md`
  from base revision prior to erroneous deletion in commit `a3e06ecb48ba7cc7e00697942540e816b7078df0`.
- Browser Test Fixes (`additional-discovery.cjs`):
  - Fixed user authentication/signup setup: removed `context.addInitScript` which bypassed the
    UI signup flow and caused storage conflicts on logout/navigation; updated `/api/auth/signup`
    and `/api/auth/login` mocks to return proper user DTO formats, allowing authentic signup form
    execution through the UI.
  - Added explicit assertions verifying scroll position preservation during details-and-back navigation
    across multiple scenarios: pure details-and-back in sorted views, details-and-back with confirmed watchlist
    saves, and details-and-back on expired sessions.
  - Added robust Playwright module loader in `additional-discovery.cjs` allowing execution via
    standard `node repo/MovieNightFrontend/tests/browser/additional-discovery.cjs`.
- Spec Validation Integrity & Additional Test Coverage:
  - In `AdditionalDiscoveryPersistenceTest.tenPageCandidateBoundsAndStrongerCandidatesOnLaterPages`,
    added an overlapping candidate item across `vote_average.desc` and `vote_count.desc` streams to strictly
    verify that duplicates are collapsed to a single entry in the database cache and category results.
  - In `AdditionalDiscoveryPersistenceTest.serverSideSortAndFiltersWithTerminalStates`, added explicit coverage
    for `sortBy=rating` (TMDB audience rating descending) and verified that whole-pool server-side sorting
    paginates accurately across multiple batches (`cursor=0 limit=2` and `cursor=2 limit=2`).
  - Updated validation table to map acceptance IDs strictly to actual test methods in
    `AdditionalDiscoveryPersistenceTest.java` (including `legacySnapshotPreservesUnknownProvenanceWithoutFalselyClaimingExhaustion`)
    and `additional-discovery.cjs`.
  - Clarified verified boundaries: explicitly identified that direct test execution covered selected movie
    routes (`movies/popular`, `movies/top-rated`, `movies/upcoming`, and `movies/airing`), while TV Series
    (`tv/*`), Anime TV (`anime/*`), and remaining movie routes rely on the verified shared `ExploreSessionManager`
    pipeline and were not directly executed per-route.
  - Accurately distinguished persistence mechanisms: clarified that backend `DiscoverySnapshot` and `CachedMovieList`
    are persisted in the database via JPA, pinned discovery sessions (`ExploreSessionManager`) and publication
    provenance metadata are in-memory with a 30-minute lifetime, and browser snapshots are cached in client `sessionStorage`.

Checks run for Ticket 5:
- Backend test suite: `cd repo/MovieNightBackend && ./mvnw -q test` passed (147 tests, 0 failures, 0 errors, 2 skipped).
- Focused backend suite: `cd repo/MovieNightBackend && ./mvnw test -Dtest=AdditionalDiscoveryPersistenceTest,MeaningfulDiscoveryPersistenceTest,SuggestionControllerTest` passed (18 tests, 0 failures, 0 errors).
- TypeScript check: `cd repo/MovieNightFrontend && npx tsc --noEmit` passed with 0 errors.
- Frontend build: `cd repo/MovieNightFrontend && npm run build` passed production build.
- Browser test: `node repo/MovieNightFrontend/tests/browser/additional-discovery.cjs` passed with Chrome 156 at 1440×900 and 390×844 viewports.
- Template check: `git status --short docs/templates/feature-spec.md` verified clean restoration.
- Spec diff check: `git diff docs/features/013-additional-discovery-results/spec.md`.
