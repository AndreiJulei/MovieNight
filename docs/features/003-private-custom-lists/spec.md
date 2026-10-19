# Private custom lists

Status: implemented and locally validated; awaiting human review, uncommitted. No GitHub issue published.
Roadmap: milestone 3. Product requirements: P05, P06, P12.
Base: `5a9b2c9` on `main`; branch: `feat/003-private-custom-lists`.

## Outcome

A signed-in owner can create, rename, and delete private movie lists, add a movie
once to each of several lists, and remove memberships independently of their
watchlist/watched history. Server state survives page reload. Confirmed writes
replace local-only success; failures retain saved state and offer retry.

## Acceptance criteria

| ID | Scenario | Expected result |
| --- | --- | --- |
| AC01 | Create and rename a list, then reload | Server ID, trimmed title, and memberships recovered; blank or >150-character titles rejected without changing saved state |
| AC02 | Add one catalog movie twice to list A and once to B | One membership per list; catalog key is distinct from provider/display ID; no library entry created |
| AC03 | Remove from A; delete B, then reload | Other memberships survive removal; watched/watchlist state, rating, and notes unchanged by list operations |
| AC04 | Another owner or anonymous caller reads/changes a list | Server denies detail and all mutation routes; owner index contains only own lists; public index exposes nothing, including legacy public rows; public writes rejected |
| AC05 | Create, rename, delete, add, or remove is pending/fails/retried | No premature success or changed membership; duplicate actions disabled; input/prior state retained; error offers retry; success recovered on reload |
| AC06 | Load fails, returns empty, overlaps a write, or account changes | Distinct loading/error/empty states with retry; empty server response clears stale lists; obsolete reads/writes cannot restore old account data or erase confirmed changes |

## Decisions and test boundary

Retain 150-character titles, trimming surrounding whitespace. Duplicate names
are allowed: lists use server IDs. Preserve insertion order; custom reordering
is not expanded. Initial movie IDs are catalog primary keys; invalid initial
IDs reject the whole create and repeated IDs create one membership. Membership
writes use catalog primary keys, never infer them from a provider/display ID.
Resolve discovered movies through the catalog details API without library writes.
Retain catalog IDs separately and namespace catalog-only display IDs as
`catalog-<id>`; membership cache keys include media type and provider/catalog
provenance. Existing removal calls retain catalog keys with this display change.

Scope correction from review: the shared catalog previously reclassified an
existing TV record when asked for the movie with the same provider ID. Reject
conflicting MOVIE/TV lookups without changing saved metadata; reject non-movie
list additions. Full separate movie/TV persistence remains a deferred migration:
a conflicting movie currently fails safely rather than becoming the wrong title.

All list reads enforce ownership regardless of legacy `isPublic`. Keep the
legacy public index as an empty compatibility response; reject `isPublic: true`
on create/update. Retain the database column for compatibility, without granting
access. No schema migration or public sharing introduced.

Confirmed frontend writes have bounded requests, duplicate-action guards, account
generation guards, and protection against stale refreshes. Discard the historical
local-storage list cache; the server is authoritative. An uncertain timeout may
follow a committed create: reload before retrying to avoid another list.

User approved JWT-authenticated API integration tests using real controllers,
services, repositories, and isolated H2, observed through independent API reads;
and browser checks using controlled API fixtures for visible success/failure
states. Fixtures do not prove real server persistence or live provider behavior.
Run strict frontend TypeScript, production build, and the full backend suite.

## Out of scope

TV/anime identity migration, public sharing, description/reorder UI, friendships,
recommendations, library removal/notes reliability, deployment, database upgrades,
and restart/release retention. Keep the current visual system and in-memory router.

## Validation on 2026-10-19

Tested boundary: the uncommitted working tree against
`5a9b2c9d66c1d39a90858cbd945440cfb0c0d25b`. Starting tree was clean. No staging,
commit, push, merge, tracker publication, or deployment. An initial sandboxed GitHub read failed; the final read retry succeeded and
returned no published issues. This unpublished local contract governs the slice.

| ID | Result | Actual evidence |
| --- | --- | --- |
| AC01 | Passed | Authenticated API create/trim/rename/reload; blank and 151-character names rejected without changing state. Browser rename failure retains old heading and new input; retry confirms it. |
| AC02 | Passed | API repeated initial IDs and sequential/concurrent adds leave one membership per list; unknown initial ID rolls back the whole create. API catalog/provider collision targets the exact catalog key. Browser recovers list-only metadata after reload; catalog-only and provider IDs with the same numeric value remain distinct; mismatched resource type cannot send a list write. No library writes from browser list operations. |
| AC03 | Passed within tested boundary | API removal leaves the other membership; deleting that list preserves watched status, 7.5 rating, and private notes through GET. Browser confirms independent removal/delete and retry. Watchlist preservation follows the same isolated list operations but was not separately exercised with a watchlisted fixture. |
| AC04 | Passed | Real JWT/API requests deny another owner's detail, update, delete, add, remove, and reorder; anonymous detail/index/create/mutations denied. Another owner's index is empty. Legacy public rows never appear in public index or grant detail access; public writes rejected. |
| AC05 | Passed within tested boundary | Browser rejects create on HTTP failure, 401, offline, and timeout with retained input/no phantom list; pending create disabled and hidden until confirmation. Rename/add/remove/delete rejection preserves prior state; retry succeeds. All mutation controls share the pending guard; each pending variant was not separately delayed. |
| AC06 | Passed for executed cases | Browser distinguishes failed/empty loads, retries, clears stale lists, ignores the historical local cache, and prevents late previous-account reads/writes from restoring private lists. A same-account refresh held across a confirmed write cannot erase it (profile save triggers the overlapping refresh through visible UI). |

### Checks actually run

- Baseline strict frontend TypeScript and existing CustomListControllerTest:
  **9 tests passed**. No full pre-change backend suite was run this session.
- New real JWT/API/H2 suite: **7 tests passed**. No mocked application services,
  persistence, or live providers. Focused catalog lookup tests also passed.
- Final clean backend suite: **99 tests, 0 failures/errors/skips**.
- Strict frontend TypeScript (`tsc --noEmit`) and production Vite build passed.
- Final controlled Chrome browser run: **15 scenarios passed**, **0 browser
  exceptions**, **0 library writes** from list actions; includes stale same-account
  refresh and late previous-account reads/writes.
- Desktop (1440×1000) and mobile (390×844) screenshots inspected; list layout
  fits both viewports, with no horizontal mobile overflow in the executed check.
- `git diff --check` passed.
- Optional Impeccable detector attempted: **unavailable**, `bundled detector not found`.

Commands from the repository root (Playwright path is machine-specific):

```sh
cd repo/MovieNightBackend
./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar -Dtest=PrivateCustomListsPersistenceTest test
./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar clean test
cd ../MovieNightFrontend
./node_modules/.bin/tsc --noEmit
npm run build
# In a separate terminal, if no Vite server is running:
npm run dev -- --host 127.0.0.1 --port 8444
# Against that Vite server:
MOVIENIGHT_PLAYWRIGHT_MODULE=/Users/juv/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright node tests/browser/private-custom-lists.cjs
```

Browser script: [private-custom-lists.cjs](../../../repo/MovieNightFrontend/tests/browser/private-custom-lists.cjs).
API suite: [PrivateCustomListsPersistenceTest.java](../../../repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/PrivateCustomListsPersistenceTest.java).
Temporary local artifacts: `/tmp/movienight-003-browser/results.json`,
`desktop-lists.png`, and `mobile-lists.png`; backend/build logs are
`/tmp/movienight-003-full-backend.log` and `/tmp/movienight-003-build.log`.
These temporary artifacts are not tracked or deployment evidence.

Observed red → green: legacy public index exposed content; blank rename returned
200; duplicate initial memberships failed; simultaneous duplicate adds returned
500; conflicting movie lookup reclassified a TV record; rejected browser create
had no error feedback. These regressions now pass their retained tests. Early
browser runs also found test-selector mistakes (menu names, plus-sign button
label, duplicate email placeholder); those were corrected in the test script.

### Demonstrated behavior / human review scenario

1. Sign in. In **Lists**, create **Weekend picks**, open it, choose **Rename list**,
   save **Comfort rewatches**, then reload and return to Lists. The same server
   list and renamed title should be present.
2. Open a movie from Explore. Use **Add to list** to add it to that list and create
   **Friday night** with the same movie. Remove it from the first list. Reload:
   Friday night still contains the movie; list membership alone creates no
   watchlist/watched entry.
3. Delete Friday night. A movie already watched keeps its rating and notes.
4. Reject a list write using browser developer tools: input and prior membership
   should remain, with an error and retry; no success is confirmed on failure.
5. With a second account, own lists are separate and authenticated API access to
   the first account's list is denied, including legacy public rows.

Steps 1–4 were exercised with browser API fixtures; step 5's server ownership
rules were exercised by real authenticated integration requests. The browser
fixture does not establish real API persistence; the H2/API tests do.

### Review

Two separate read-only code-review agents reviewed tracked changes and new files
against the fixed base, using the working-tree boundary rather than committed
changes. **Standards:** 0 outstanding findings; shared account-reset helper
resolved one nonblocking duplication heuristic. **Spec:** 0 outstanding findings;
resolved media-type and catalog/provider identity collisions and reran affected
checks. Subsequent feature-record edits only capture validation evidence.

### Remaining limitations

Node **25.3.0**, Java **25**, npm, and the cached Mockito agent were used.
Declared Node 22 / Java 21 / pnpm remain unverified. Existing Vite native-config
warnings (`__dirname`, JSON import attributes) remain. Fresh H2 tests do not
verify schema/data upgrades, real provider connectivity, production deployment,
or restart/release retention. No combined real-provider/browser persistence flow
was run. An uncertain create timeout may have saved; reload before retrying to
avoid a second list. Historical local-only cached lists are intentionally not
restored as confirmed server data. Full movie/TV identity migration is deferred;
conflicting resource identities return an error, and TV/anime list additions are
outside this movie slice. Full accessibility, image-failure, and large-list
performance audits were not performed.

### Proposed human-review scope

All 15 affected files belong to feature 3; no unrelated changes or deletions.
No roadmap/integration status was advanced.

Paths below are relative to the repository root:

| Changed file | Reason / acceptance |
| --- | --- |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/dto/CreateCustomListRequest.java` | Reject public creation (AC04). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/dto/UpdateCustomListRequest.java` | Reject blank rename/public updates (AC01, AC04). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/repository/CustomListRepository.java` | Lock owner mutations so simultaneous duplicate adds succeed once (AC02). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/service/CustomListService.java` | Owner-only reads, no public enumeration, atomic/deduplicated initial memberships, movie-only adds (AC02–AC04). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/service/MovieCatalogLookupService.java` | Reject cross-resource catalog reclassification (AC02; scope correction above). |
| `repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/CustomListControllerTest.java` | Existing controller fixtures use private-list semantics (AC04). |
| `repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/PrivateCustomListsPersistenceTest.java` **new** | Real JWT/API persistence, ownership, validation, concurrency, identity, and library-independence evidence (AC01–AC04). |
| `repo/MovieNightFrontend/src/api/lists.ts` | Bounded requests, explicit failures, validated confirmation, safe catalog resolution (AC02, AC05, AC06). |
| `repo/MovieNightFrontend/src/store/MovieStore.tsx` | Server-authoritative hydration and writes, rename, session/reset/race guards, exact membership identity; preserve removal keys after catalog-only display namespacing (AC01–AC06). |
| `repo/MovieNightFrontend/src/store/data.ts` | Retain exact catalog keys and typed membership identity map (AC02). |
| `repo/MovieNightFrontend/src/components/AddToListPopover.tsx` | Await add/remove/create confirmation; preserve state/input and expose recovery (AC02, AC05, AC06). |
| `repo/MovieNightFrontend/src/pages/CustomListsIndexPage.tsx` | Confirm create/delete; show loading/error/reload/empty states (AC01, AC05, AC06). |
| `repo/MovieNightFrontend/src/pages/CustomListDetailPage.tsx` | Rename and read/error/reload states (AC01, AC05, AC06). |
| `repo/MovieNightFrontend/tests/browser/private-custom-lists.cjs` **new** | Reproducible UI fixtures, failure/reload/account/identity checks, screenshots (AC01–AC03, AC05, AC06). |
| `docs/features/003-private-custom-lists/spec.md` **new** | Local contract, decisions, validation, limitations, and complete review inventory. |

Inspect tracked changes and all three new files before staging:

```sh
git status --short --untracked-files=all
git diff --stat
git diff -- repo/MovieNightBackend repo/MovieNightFrontend
cat docs/features/003-private-custom-lists/spec.md
cat repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/PrivateCustomListsPersistenceTest.java
cat repo/MovieNightFrontend/tests/browser/private-custom-lists.cjs
```

Stop before committing under [the project review checkpoint](../../movienight-workflow.md).

