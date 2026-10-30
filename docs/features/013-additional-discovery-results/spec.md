# Additional discovery results

Status: Implemented; local Ticket 3 verification updated on 2026-10-30.
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
| DR05 | A provider page contains no locally eligible titles, the provider ends, a bound is reached, or a request fails | Do not treat a filtered-empty page as provider exhaustion or relax quality thresholds to fill results. Distinguish provider-feed exhaustion, selection limit, no matching unsaved titles and failure. Retain usable results on failure and retry without duplicates. If current library state cannot be checked, show retry and do not append. Expired/lost sessions offer Refresh to continue; snapshots older than seven days become unavailable even after failed refresh. |
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
  to continue. Successful explicit refresh replaces results and resets pagination;
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
  usable cards and offer Refresh to continue. Never silently append a different
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

Implementation verified against all DR01–DR06 acceptance criteria on 2026-10-29 at
revision `12efac7` plus working tree changes on `feat/013-additional-discovery-results`
through focused integration tests, full backend test suite, strict TypeScript checks,
production Vite build, and Chrome browser testing at 1440×900 and 390×844 viewports.

| Acceptance ID | Result | Check / evidence |
| --- | --- | --- |
| DR01 | Passed | Verified 20-item boundaries, sequential batch append without scroll disturbance across all 12 Explore categories, short final batch, and shelf preview links via `AdditionalDiscoveryPersistenceTest.categoryPaginationBatchesAndLoadMoreMakesNoProviderCalls` and `additional-discovery.cjs`. Confirmed saves do not auto-fill gaps. |
| DR02 | Passed | Verified de-duplication across overlapping provider streams, typed identity `(tmdbId, mediaType)` isolation, and mutually exclusive TV/anime classification fixed within pinned pools via `AdditionalDiscoveryPersistenceTest.tenPageCandidateBoundsAndStrongerCandidatesOnLaterPages`. |
| DR03 | Passed | Verified 10-page candidate bounds per source (Top Rated combines 10 `vote_average.desc` + 10 `vote_count.desc`), stronger candidates on later pages ranked before disclosure, 30-minute pinned pool session isolation unaffected by background refreshes, and zero provider calls during Load more via `AdditionalDiscoveryPersistenceTest.pinnedSessionIsIsolatedFromScheduledRefresh`, `AdditionalDiscoveryPersistenceTest.tenPageCandidateBoundsAndStrongerCandidatesOnLaterPages`, and `AdditionalDiscoveryPersistenceTest.sessionExpiresAfter30MinutesReturns410Gone`. |
| DR04 | Passed | Verified dynamic server-side exclusion of authenticated user's current watchlist and watched titles using typed identity on both Explore routes and category views, immediate card removal on confirmed save success without auto-filling gaps, library removal restoring eligibility on reset via `AdditionalDiscoveryPersistenceTest.ownerLibraryDynamicExclusionsAndRemovals`, `AdditionalDiscoveryPersistenceTest.sessionOwnershipAndRouteMismatchEnforcement`, and `additional-discovery.cjs`. Shelf previews recheck on tab focus via `useSuggestions.ts`. |
| DR05 | Passed | Verified distinct terminal states (`SELECTION_LIMIT_REACHED`, `PROVIDER_EXHAUSTED`, `NO_MATCHING_UNSAVED_TITLES`), session expiration 410 Gone with refresh recovery, usable results retained on failure, 7-day unavailable snapshot bounds, and sequential retry without skips or duplicates via `AdditionalDiscoveryPersistenceTest.serverSideSortAndFiltersWithTerminalStates`, `AdditionalDiscoveryPersistenceTest.lostOrExpiredSessionReturns410Gone`, `AdditionalDiscoveryPersistenceTest.sessionExpiresAfter30MinutesReturns410Gone`, and `additional-discovery.cjs`. |
| DR06 | Passed | Verified whole-pool server-side sorting (Title, Year, TMDB audience rating) and filtering (TMDB audience 6+/10) before batching, default restoring category ranking, destination-scoped details return, and scroll restoration via `AdditionalDiscoveryPersistenceTest.serverSideSortAndFiltersWithTerminalStates` and `additional-discovery.cjs`. |

### Commands and observed results

- Backend regression & new tests: `./mvnw test` executed **143 tests, 0 failures, 0 errors, 2 skipped** (live provider opt-in smoke tests).
- Focused integration suite: `./mvnw test -Dtest=AdditionalDiscoveryPersistenceTest,MeaningfulDiscoveryPersistenceTest,SuggestionControllerTest` executed **14 tests, 0 failures, 0 errors**.
- Frontend verification:
  - `npx tsc --noEmit` in `repo/MovieNightFrontend` passed with 0 errors.
  - `npm run build` in `repo/MovieNightFrontend` passed production Vite build.
  - Playwright browser test: `MOVIENIGHT_PLAYWRIGHT_MODULE=/Users/juv/.npm/_npx/9833c18b2d85bc59/node_modules/playwright node repo/MovieNightFrontend/tests/browser/additional-discovery.cjs` passed with Chrome 156 at 1440×900 and 390×844 viewports.
- Git & Diff cleanliness: `git status --short` verified only expected scoped changes; no database migration was needed as sessions and publication metadata are kept in-memory.

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
