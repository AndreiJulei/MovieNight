# Friend suggestions

Status: agreed unpublished local contract. Roadmap milestone 5; product P08/P09.
Base: `75597e585ad45939ebb4b07adf2a344482a6b7b5`.
Branch: `feat/005-friend-suggestions`. No open GitHub issues on 2026-10-20.

## Outcome and scope

Show movie choices from accepted friends, ranked by their supplied watched
ratings, with watchlist suggestions in a separate section. Preserve the existing
visual system. No commit, push, merge, publication, or deployment is authorized.

## Acceptance

| ID | Scenario | Expected result |
| --- | --- | --- |
| AC01 | Friends rate A 8 and 6, B 9; repeat authenticated reads | A score 14 ranks above B score 9; supplied zero participates, unrated watched titles do not; ties use ascending provider ID. |
| AC02 | Accepted friends watchlist movies, including a rated overlap | Separate watchlist section, ordered by distinct friends then provider ID; overlap appears only in rated; source and rating explanation visible. |
| AC03 | Viewer watchlists/watches a candidate, or adds it only to a custom list | Library titles excluded; custom-list-only movies remain eligible. |
| AC04 | Pending invitation, unrelated account, removal, anonymous read, TV title | Only accepted friends and movies contribute; revocation reflected on next read; anonymous access denied; private notes absent. |
| AC05 | Pending, failed, empty, retried read or account change | Honest loading/error/empty and retry, no local fallback; obsolete responses cannot show another account's results. |
| AC06 | Enter page, reload, save to watchlist, or change friendships | Fetch current server suggestions; preserve consensus order in browser; confirmed library additions disappear; failed saves do not remove candidates. |

## Decisions and test boundary

User confirmed Q1/Q2 on 2026-10-20. Movie-only: TV identity is milestone 7.
Rated score = average supplied personal rating × distinct raters, including 0.
A title in both sources appears once, under rated. Watchlist sources have no
rating score. Both dedicated and legacy aggregate APIs use the same friend rows.
No accepted friends and no eligible candidates have explanatory empty copy.
Refresh on mount, manual reload, library changes and accepted-friend changes;
no polling/push or recall of already downloaded data.

Confirmed seams: real JWT-authenticated HTTP with real services/repositories and
isolated H2, observed through API reads; controlled Playwright browser fixtures
for visible ordering, source metadata, loading/error/retry, saves and obsolete
account responses. Fixtures do not prove API persistence or live providers.
Use red → green vertical slices, focused tests/typechecks, full backend suite
once at the end, production build, and independent Standards/Spec review.
The existing glossary already defines Friend and Friend suggestion accurately;
no new term or consequential architectural decision requires a glossary or ADR.

## Exclusions

Personal recommendation changes, TV/anime identities, new ML methods, provider
integration, production migrations, restart retention and deployment.

## Validation

Validated on 2026-10-20 against uncommitted changes from the base above.
Baseline TypeScript passed; existing SuggestionServiceTest: 3 passed.

| Acceptance | Result | Actual evidence |
| --- | --- | --- |
| AC01 | Passed | API A 14 before B 9, supplied zero, repeated reads and ID ties. Browser A IMDb 2 stays above B IMDb 10. |
| AC02 | Passed | API verifies separate rows, rated overlap precedence, watchlist counts/ID ties on dedicated and aggregate routes; browser shows sources, reasons and zero score. |
| AC03 | Passed | API excludes watchlist/watched, retains custom-list-only candidate. Browser failed save keeps candidate, confirmed save refreshes and removes it. |
| AC04 | Passed | API populated pending/outsider exclusions, accepted consent/removal, anonymous denial, TV exclusion, notes absent. Browser removes friend and re-enters to current empty results. |
| AC05 | Passed at confirmed seams | Browser 503/403/offline/real 15-second timeout/malformed response, held loading/disabled reload, retry, empty and late old-account response. No page errors. |
| AC06 | Passed | Home preview, page entry/reload, confirmed save refresh, friendship removal/re-entry verified in browser. Independent API reads and revocation verified. No polling claimed. |

### Actual checks

- Focused new and affected backend suites: **12 passed**, 0 failures/errors.
- Full backend suite: **108 passed**, 0 failures/errors/skipped.
- Strict frontend TypeScript passed before/after implementation and review fix.
- Production Vite build passed. Existing native-config `__dirname`/JSON import
  warnings remain, plus a >500 kB chunk warning.
- Controlled Chrome browser suite: **12 checks passed**, no page errors.
- Desktop 1440px/mobile 390px screenshots inspected together; no horizontal overflow.
  Fixtures omit posters to exercise the existing missing-image fallback.
  This was not a full accessibility audit.
- `git diff --check` passed.
- Optional Impeccable detector attempted once: unavailable, `bundled detector
  not found`. No detector pass claimed.

Red → green: API score expected 14 but returned 7; passed after score mapping.
Next source test found TV 99500206 ahead of the expected movie; passed after
movie filtering, row separation and tie ordering. Browser initially timed out
waiting for Rated by friends; passed after source rendering. Home regression
initially could not find Friend suggestions; passed after replacing catalog
filler with server sources. An incremental backend run encountered generated
classes with `Unresolved compilation problems`; clean compile resolved it.
An initial Maven invocation from root failed to find `./mvnw`; all substantive
Maven runs below used the backend directory.

Commands actually run (from respective app directories):

```sh
# repo/MovieNightBackend
./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar -Dtest=FriendSuggestionsPersistenceTest clean test
./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar -Dtest=FriendSuggestionsPersistenceTest,AcceptedFriendshipsPersistenceTest,SuggestionServiceTest test
./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar test
# repo/MovieNightFrontend (Vite in a separate terminal)
npm run dev -- --host 127.0.0.1 --port 8444
MOVIENIGHT_PLAYWRIGHT_MODULE=/Users/juv/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright node tests/browser/friend-suggestions.cjs
./node_modules/.bin/tsc --noEmit
npm run build
# repository root
git diff --check
```

Retained [API suite](../../../repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/FriendSuggestionsPersistenceTest.java)
and [browser suite](../../../repo/MovieNightFrontend/tests/browser/friend-suggestions.cjs).
Temporary logs: `/tmp/movienight-005-api.log`,
`/tmp/movienight-005-full-backend.log`, `/tmp/movienight-005-build.log`,
`/tmp/movienight-005-browser.log`. Browser artifacts:
`/tmp/movienight-005-browser/{results.json,desktop.png,mobile.png}`.
Temporary artifacts are not tracked.

### Before/after demonstration

Before: two ratings 8/6 returned score 7, rated/watchlist shared one grid, default
IMDb sort overrode consensus, and failures/Home could invent friend results.
After: A 14 above B 9, zero retained, separate watchlist source, library exclusions,
explicit errors/retry and Home using the same server sources.

Executed browser scenario: open Home then friend suggestions; inspect order and
sources; reject/retry reads and supply empty; fail then confirm A’s save; remove
friend and return; hold a read, sign out, sign in as another account, release old
response. The new account stays empty.

Human scenario with actual accounts: accept two friends. Have them mark A watched
with 8/6, and B 9 by one friend. Open Navigation Menu → Friends’ Recommendations;
A must show score 14 above B 9. Watchlist plans are separate. Save A, verify it
vanishes. Remove a friend through Friends and return. Use Reload suggestions
for another account’s changes. No real-account browser end-to-end run claimed.

### Independent review

Separate read-only Standards and Spec agents reviewed
`git diff 75597e5 -- repo/MovieNightBackend repo/MovieNightFrontend` plus all new
files below and this feature contract. No commits since base; this explicitly
reviews the working tree rather than the skill’s normal committed comparison.

Standards: one minor DESIGN.md tabular-numeral inconsistency fixed with `nums`
on the reason paragraph; independent recheck found no remaining findings.
Spec: missing browser friendship-refresh coverage resolved with actual UI
removal and re-entry; independent recheck found no remaining material findings
or scope creep. The expanded browser run passed all 12 checks.

### Limitations

Node 25.3.0/Java 25/npm and cached Mockito agent were used; declared Node 22/Java 21/
pnpm unverified. H2/API checks prove transactions and independent reads, not
restart/release retention, migration, deployment or live providers. Browser
fixtures establish UI behavior separately from API persistence. Another account’s
changes require reload/navigation; no polling/push or recall of downloaded data.
TV/anime identity remains milestone 7; personal recommendation fallback remains
milestone 6. The unchanged global companion may overlap content on mobile.
No glossary/ADR or roadmap integration-status changes were needed.

## Human review checkpoint — complete proposed commit scope

All **14 files** below belong to feature 005: **9 modified**, **5 new**, no deleted
files and no unrelated working-tree changes. No staging, commit, push, merge,
issue publication or deployment occurred.

| File (repository-relative) | Reason / acceptance |
| --- | --- |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/repository/UserMovieEntryRepository.java` | Movie-only sources, stable ties, watchlist/watched exclusions (AC01–AC04). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/service/SuggestionService.java` | Shared dedicated/aggregate friend rows, consensus score, separate sources, rated precedence and reasons (AC01–AC04). |
| `repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/AcceptedFriendshipsPersistenceTest.java` | Adapt assertions to separate rated/watchlist rows (AC02/AC04). |
| `repo/MovieNightBackend/src/test/java/com/movienight/backend/service/SuggestionServiceTest.java` | Adapt aggregate row count from 5 to 6 (AC02). |
| `repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/FriendSuggestionsPersistenceTest.java` | **New** real JWT/HTTP/H2 scoring, sources, exclusion, custom-list and consent tests (AC01–AC04/AC06). |
| `repo/MovieNightFrontend/src/App.tsx` | Dedicated friend route without unrelated recommendation requests (AC05/AC06). |
| `repo/MovieNightFrontend/src/api/movies.ts` | Bounded, validated friend reads with explicit failures (AC05). |
| `repo/MovieNightFrontend/src/hooks/useSuggestions.ts` | Remove obsolete friend fallback/ranking; expose existing movie mapper (AC01/AC02/AC05). |
| `repo/MovieNightFrontend/src/hooks/useFriendSuggestions.ts` | **New** server-only lifecycle, reload, library/friend/account guards (AC03–AC06). |
| `repo/MovieNightFrontend/src/pages/FriendSuggestionsPage.tsx` | **New** ordered source sections, metadata, saves and loading/error/empty/retry (AC01–AC06). |
| `repo/MovieNightFrontend/src/pages/HomePage.tsx` | Replace local friend/catalog filler with server preview and explanatory states (AC01/AC02/AC05/AC06). |
| `repo/MovieNightFrontend/src/pages/SuggestionCategoryPage.tsx` | Remove obsolete friends branch/request; preserve personal categories (AC05/AC06). |
| `repo/MovieNightFrontend/tests/browser/friend-suggestions.cjs` | **New** controlled UI regression checks and desktop/mobile captures (AC01–AC06). |
| `docs/features/005-friend-suggestions/spec.md` | **New** agreed contract, evidence, decisions, limits and review inventory. |

Inspect from repository root:

```sh
git branch --show-current
git status --short --untracked-files=all
git diff --stat
git diff -- repo/MovieNightBackend repo/MovieNightFrontend
# git diff excludes new files; inspect all five explicitly:
cat docs/features/005-friend-suggestions/spec.md
cat repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/FriendSuggestionsPersistenceTest.java
cat repo/MovieNightFrontend/src/hooks/useFriendSuggestions.ts
cat repo/MovieNightFrontend/src/pages/FriendSuggestionsPage.tsx
cat repo/MovieNightFrontend/tests/browser/friend-suggestions.cjs
```

Stop for explicit approval of this exact change set before committing, per
[the project review checkpoint](../../movienight-workflow.md).

