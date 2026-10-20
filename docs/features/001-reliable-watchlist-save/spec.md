# Reliable watchlist saving

Status as of 2026-10-21: implementation committed as `9a585ef`, included in local
`main` at `3fc94fd`. Validation below retains its original date and test boundary.
GitHub spec issue: none published; local contract for this slice.
Base: `891b5078416ee754bd1293314e15eeb940884691`.
Branch: `feat/001-reliable-movie-library`.
Roadmap: [task 1](../../../roadmap.md).
Product requirements: [P01, P02, P12](../../../spec.md).

## Problem

Before this slice, watchlist actions created local entries and success feedback
before the server confirmed a write. Refresh retained unmatched local entries and ignored an
empty server library, allowing failed saves to appear persisted.

## Outcome

A signed-in user can browse or open movie details without changing their library,
deliberately add a discovered movie, and recover that entry after a browser reload.
Pending and failed requests are visible, and failure leaves the action retryable.

## Acceptance criteria

| ID | Given / when | Expected result |
| --- | --- | --- |
| AC01 | Search or open a discovered movie, then reload | No library entry is created |
| AC02 | Explicitly add a movie, then reload | One server-backed watchlist entry with the correct title identity |
| AC03 | Click repeatedly while pending or repeat the API add | Pending UI prevents repeat submission; the API retains one entry |
| AC04 | The write is rejected or the network fails | No local entry or success feedback; show failure and allow retry |
| AC05 | Retry a failed add successfully | Confirm success only after the response; one entry survives reload |
| AC06 | Load a valid empty library or encounter a failed read | Empty results replace old entries; failed reads show an error and retry, not an empty success |
| AC07 | Two users access the library; an anonymous caller tries to save | Saves/reads belong to the authenticated owner; anonymous requests are rejected |
| AC08 | A duplicate add arrives for an already watched movie | Keep the existing watched entry, rating, and notes |
| AC09 | A refresh started before a save, or the account changes during a request | Stale responses cannot erase a confirmed save or populate another account |
| AC10 | Distinct movie provider IDs share title/year or overlap a catalog primary key | Saving links the exact movie, without merging distinct titles or changing another entry |

## Decisions and test boundary

Use the existing library POST/GET endpoints and database uniqueness constraint.
Do not insert optimistic watchlist entries. Use the confirmed response immediately;
successful refresh replaces the current owner's entries, including an empty result.
Keep in-flight saves per account/title, repeat reads that overlap confirmed saves,
and ignore responses superseded by another refresh or account transition.
Use a bounded request timeout so an unresponsive save becomes retryable. A timeout
may occur after the server committed: explain that confirmation failed; reloading
or retrying is safe because repeated watchlist adds retain the same entry.

Apply the shared save behavior to details, discovery grids, home suggestions,
friend grids, and the Add movie form's watchlist target. Keep the current visual
system. Pending controls are disabled and announce saving; errors explain retry.
Watchlist adds never move existing watched entries back to watchlist.

Authenticated API tests use isolated H2 fixtures, real security, controllers,
services, and repositories. Controlled Playwright checks establish browser
feedback independently of backend persistence; live providers are excluded.

## Out of scope

Rating changes, reliable removal/undo, custom-list behavior, friendship consent,
recommendations, movie/TV identity migration, provider cache freshness, and
restart/release persistence. These belong to subsequent roadmap slices.
No tracker publication, merge, or deployment is part of this local implementation.

## Validation recorded on 2026-10-13

These are the original run's results against uncommitted feature work based on
the SHA above. Documentation consolidation on 2026-10-19 did not rerun product
acceptance checks. No commit, PR, merge, or tracker publication was performed.

| Acceptance ID | Result | Evidence |
| --- | --- | --- |
| AC01 | Passed | API search/detail reads leave the owner's library empty; browser discovery/details/reload also creates no entry |
| AC02 | Passed | Independent API GETs recover one saved movie; browser reload recovers the confirmed fixture entry |
| AC03 | Passed | Repeated API adds retain one entry; pending browser control is disabled; simultaneous store calls issue one POST |
| AC04 | Passed | Invalid API write leaves no entry; browser HTTP 500, 401, network failure, and timeout show errors with an enabled retry action and no success |
| AC05 | Passed | Browser retry confirms one save after response; discovery-grid and Add movie form retries also pass |
| AC06 | Passed | Failed GET shows Retry loading without an empty success; a later successful empty result clears the old entry |
| AC07 | Passed | JWT-authenticated second user sees an empty library; anonymous GET/POST requests are rejected with 403 |
| AC08 | Passed | Real duplicate watchlist POST retains WATCHED, rating 8, and the existing note |
| AC09 | Passed | A delayed pre-save empty snapshot triggers a new read and cannot erase the save; a delayed save cannot populate a newly signed-in account |
| AC10 | Passed | Distinct provider movies sharing title/year stay separate; a provider ID equal to another catalog key creates the correct entry |

### Checks and reproduction

| Boundary | Recorded result | Command / setup |
| --- | --- | --- |
| Backend | Initial 7-test run: 3 assertion failures; final full suite: 84 passed | Commands below; real JWT, separate users and catalog fixtures |
| Frontend types | Passed | `./node_modules/.bin/tsc --noEmit` in frontend |
| Frontend build | Passed; existing Vite warnings | `npm run build` in frontend |
| Browser | 14 checks passed; no browser exceptions or React update-depth errors | Script and command below; Chrome 155.0.8059.40, controlled API responses |
| Visual checks | Desktop 1440×1000 and mobile 390×844 inspected | Failed-save message fits; retry remains available |
| Diff | Passed | `git diff --check` at root |

Backend commands, from `repo/MovieNightBackend/` (the agent path is machine-specific):

```sh
./mvnw -DargLine="-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar" -Dtest=WatchlistPersistenceTest test
./mvnw -DargLine="-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar" clean test
```

Browser checks are now kept with the frontend:
[watchlist-save.cjs](../../../repo/MovieNightFrontend/tests/browser/watchlist-save.cjs).
The original run used this same script at its former feature-folder path.
Start Vite from `repo/MovieNightFrontend/`:

```sh
PORT=8444 npm run dev -- --host 127.0.0.1
```

Then, from the repository root, with an installed Playwright module and Chrome:

```sh
MOVIENIGHT_PLAYWRIGHT_MODULE=/absolute/path/to/playwright node repo/MovieNightFrontend/tests/browser/watchlist-save.cjs
```

`MOVIENIGHT_BROWSER_URL` overrides the default `http://127.0.0.1:8444`.
`MOVIENIGHT_BROWSER_SCREENSHOTS=0` skips screenshots. The original run used
Playwright from the local Codex runtime cache; it is not a declared dependency.
Node 25.3.0, Java 25, and the Maven wrapper were used; declared Node 22 / Java 21
remain unverified. See the [baseline](../000-baseline/report.md) for pnpm and
Mockito failures and the successful workarounds.

### Review and remaining work

In-thread review covered the uncommitted feature diff against the base and this
contract. It recorded passing strict TypeScript, the existing design/stack,
no new schema/runtime dependency, and resolved spec findings. API regressions
covered exact identity and preservation of watched entries. Final fixes removed the cached-entry save shortcut, made overlapping reads fetch
again after confirmed saves, and corrected a pre-existing detail-page render loop
required for this flow.
The Add movie form retained fields after failure and its note after retry.
Reliable removal/Undo stays outside this slice.

The optional Impeccable detector was unavailable; source and screenshots were
inspected directly. Initial harness failures were corrected before the reported
passes. Logs and screenshots were local `/tmp/movienight-task-1-*` artifacts;
their availability is not guaranteed. Browser mocks do not establish backend
persistence or live TMDB/OMDb connectivity.

All required local acceptance checks were recorded as passing. Production
readiness, restart/release retention, live discovery, and declared-toolchain
reproducibility remain unverified. Integration is pending; the milestone remains
open until its intended changes are integrated and evidence is tied to that
revision.
