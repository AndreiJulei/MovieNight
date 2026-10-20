# Watched history and ratings

Local feature contract; no GitHub issue published. Product: P03, P04, P12.
Base: `0f35ba9cb57721c9ed57f8510b200bdc8d777680` on
`feat/001-reliable-movie-library`.
Status as of 2026-10-21: implementation committed as `5a9b2c9`, included in local
`main` at `3fc94fd`. The review and validation below describe the historical worktree.

## Outcome and scope

A signed-in owner can mark a movie watched from details or Add movie, either
directly or from watchlist, and edit or remove its optional personal rating.
Reload recovers one watched entry and the exact rating, including zero.
Keep the existing visual system. Custom lists, removal/undo, note-save reliability,
friendship/privacy changes, recommendation changes, TV identity migration,
deployment, and restart/release retention are excluded.

## Acceptance criteria

| ID | Scenario | Expected result |
| --- | --- | --- |
| AC01 | Mark a watchlist movie watched with 7.5, repeat, then reload | One watched entry, no watchlist entry, rating 7.5; existing notes retained unless edited |
| AC02 | Add a movie directly as watched without a rating | One watched entry; rating is null after reload |
| AC03 | Edit rating to 0, then remove it | Reload distinguishes zero from null; status remains watched |
| AC04 | Supply ratings on POST or PUT | Accept 0–10 in half-point steps; reject invalid values without changing saved state; omitted PUT rating preserves it, explicit null clears it |
| AC05 | A watched/rating write is pending, fails, or is retried | Disable duplicate actions; confirm only after success; failure retains prior state and input, explains retry; successful retry survives reload |
| AC06 | Another owner or anonymous caller attempts a write | Only the authenticated owner's entry can change; anonymous requests rejected |
| AC07 | Refresh overlaps a write, or account changes during it | Stale reads cannot erase confirmed writes; previous-account responses cannot populate the current library |
| AC08 | Catalog primary key differs from provider ID, including a collision | Updating watched/rating targets the exact catalog movie returned in the library response |

## Decisions and validation boundary

Use nullable floating-point ratings; all valid half-point values are represented
exactly. Shared response DTOs and friend average calculation must accept decimals.
POST WATCHED supplies the desired rating (missing/null means unrated); duplicate
WATCHLIST saves continue to preserve watched entries. PUT changes rating only
when supplied, including explicit null. PUT identifies a catalog primary key;
the frontend retains it separately from its provider-based display identity.

Use confirmed writes with bounded timeout and account guards, extending the
watchlist approach. A timeout may follow a committed write: reload/retry is safe.
Rating controls start unrated and allow an explicit rating or removal.

User-approved test boundary: JWT-authenticated API integration tests using real
controllers/services/repositories and isolated H2. Verify through independent GETs.
Run frontend TypeScript/build and inspect UI source; browser tests are excluded
at the user's request. UI behavior will therefore remain unverified in a browser.

## Validation on 2026-10-19

Tested boundary: uncommitted feature changes against the base above. No commit,
merge, push, tracker publication, or deployment. No unrelated starting changes.

| ID | Result | Evidence / limitation |
| --- | --- | --- |
| AC01 | Passed (API) | Watchlist → watched 7.5 repeated twice; independent GET returns one watched entry, no watchlist entry, and unchanged notes |
| AC02 | Passed (API) | Direct POST with rating omitted; independent GET returns WATCHED and null |
| AC03 | Passed (API) | PUT zero, notes-only PUT, then explicit null; GET recovers 0 then null |
| AC04 | Passed (API) | All 21 half-point values survive GET; POST/PUT reject -0.5, 10.5, 7.25, and 0.1 without changing the library; valid retry succeeds |
| AC05 | Partial | API rejection leaves saved state intact and retry succeeds; repeated direct POST retains one entry; pending/failure/timeout UI source-reviewed, browser checks not run |
| AC06 | Passed (API) | Another authenticated owner cannot update the entry and has an empty library; anonymous watched POST/PUT rejected with 403 |
| AC07 | Not run | Account-generation guards and overlapping-read revision handling source-reviewed; browser/race execution excluded from the approved test boundary |
| AC08 | Passed (API) | Catalog/provider key collision updates only the intended movie; an unknown catalog key cannot fall back to a provider ID; frontend retains catalog key separately (source-reviewed) |

### Checks actually run

- Baseline: 84 backend tests, strict frontend TypeScript, and production build passed.
- New API integration suite: 8 tests passed with real JWT security, controllers,
  transactions, repositories, and isolated H2. No mocked persistence or live providers.
- Final clean full backend suite: **92 tests, 0 failures/errors/skips**.
- Final frontend TypeScript and Vite build: passed. Existing Vite warnings about
  native config loading, `__dirname`, and JSON import attributes remain.
- `git diff --check`: passed.
- Optional Impeccable detector attempted: unavailable (`bundled detector not found`).
  No browser tests or visual verification were performed.

Commands from the repository root:

```sh
cd repo/MovieNightBackend
./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar -Dtest=WatchedHistoryPersistenceTest test
./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar clean test
cd ../MovieNightFrontend
./node_modules/.bin/tsc --noEmit
npm run build
```

Observed red → green: 7.5 originally returned 7; clearing zero originally retained
zero; 7.25 was accepted; and an unknown catalog key updated a provider match.
The integration tests now cover and pass these regressions. One initial collision
assertion used incorrect JSONPath indexing; corrected to assert the returned list.

### Demonstrated API behavior

These are assertions executed by `WatchedHistoryPersistenceTest`, not a browser demo.

| Action | Observed response / independent read |
| --- | --- |
| POST watchlist, PUT WATCHED + 7.5 twice | 200 on updates; GET: one WATCHED / 7.5 entry, empty WATCHLIST |
| PUT personalRating 0 | 200; GET personalRating 0.0 |
| PUT notes only | 200; GET still personalRating 0.0 |
| PUT personalRating null | 200; GET personalRating null, still WATCHED |
| PUT or POST personalRating 7.25 | 400; GET retains previous valid rating |
| Another owner PUTs the movie | 400; original owner's state unchanged |
| Anonymous POST or PUT | 403 |

### Review

Two narrowly scoped GPT-6.1 Sol / low-effort subagents reviewed the uncommitted
tracked diff and all four new files against the fixed base. This deliberately
uses the working-tree boundary instead of the code-review skill's usual committed
comparison. The subsequent change to this record only adds validation evidence.

**Standards:** no actionable findings; no hard violations or judgment calls worth
reporting. **Spec:** no findings or scope creep. Both were read-only reviews.

### Manual UI review scenario

1. Sign in; open a movie in watchlist. Choose **Mark as Watched**, select **7.5 / 10**,
   and **Confirm Watched**. Reload: the title should be watched, absent from watchlist,
   and show 7.5.
2. Choose **Edit personal rating**, select **0.0 / 10**, save, and reload: show zero.
3. Edit again, choose **Unrated**, save, and reload: show **Watched · Unrated**.
4. In **Add movie**, select/search a movie or use Manual Entry. Keep Watched and
   Unrated, then save and reload: one watched entry without a rating.
5. To inspect UI failure feedback, reject a library write in browser developer tools:
   the form should retain input, display an error, and allow retry after failure.
   This step has not been executed by the agent.

### Remaining limitations

Validation used Node 25.3.0 and Java 25 with the cached Mockito agent; declared
Node 22 / Java 21 and pnpm remain unverified. H2 was created fresh for tests;
existing database schema/data upgrades were not validated. Browser execution,
live provider connectivity, deployed behavior, and restart/release retention
remain unverified. Private-note reliability and removal/undo remain outside scope.
Updates now require the catalog movie ID from GET, including note updates; clients
that previously sent provider IDs must switch to that returned key.

All 22 changed/new files belong to this feature: decimal rating types/validation,
exact update identity, confirmed frontend writes and controls, compatible existing
fixtures, the new integration suite, and this contract/evidence record. No files
were deleted. Roadmap/integration status has not been advanced.
