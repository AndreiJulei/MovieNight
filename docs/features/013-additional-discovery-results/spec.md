# Additional discovery results

Status: Q1–Q13 agreed on 2026-10-28; consolidated contract awaiting final
shared-understanding confirmation. No application implementation is authorized
by this specification review.
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

Documentation and source inspection only. No Feature 013 implementation exists,
and no application checks have been run for this specification task. Historical
Feature 012 evidence does not validate Feature 013 behavior or close its recorded
PostgreSQL/browser verification gaps.

The review updated only this pre-existing untracked feature draft. Documentation
checks cover Q1–Q13 agreement coverage, preserved DR01–DR06 IDs, relative Markdown
links and whitespace in the complete untracked file. No glossary/ADR, roadmap,
product contract or application files changed. No tracker operation, commit,
push or merge ran.

| Acceptance ID | Result | Check / evidence |
| --- | --- | --- |
| DR01–DR06 | Not run | Agreed specification; implementation and verification pending. |
