# Personal movie recommendations

Status: implemented on `feat/006-personal-movie-recommendations` at `52976c0`;
post-commit review fixes are in the current worktree awaiting human review and
commit approval. The feature remains unpublished and unmerged. Roadmap: milestone 6. Product requirements:
P09/P10, with P01/P12 applying to explicit saves and failure feedback.
GitHub issue: not published.
Base: `dbc560d743f2c2b289dc1ce3c3b68547c03fc820` on local `main`.
Starting implementation worktree: this unpublished feature record was the only
untracked file; no tracked changes or remote fetch. The earlier specification
session started clean.

## Outcome

A signed-in person sees movie recommendations derived from their own watched
movies, in recommendation order, excluding movies already watchlisted or watched.
The personal-movie page, Home preview, and existing dedicated/aggregate API movie
rows use the same source and explain limited coverage or failures honestly.
Browsing recommendations does not add anything to the person's library.

## Acceptance criteria

| ID | Given / when | Expected result |
| --- | --- | --- |
| AC01 | Recompute with watched movies rated 0, 7.5, and unrated, plus rated unwatched records and watched TV/anime records | Only watched movies with usable provider IDs seed movie recommendations. Zero remains supplied, 7.5 stays fractional, and missing rating uses the agreed default weight. Unwatched ratings, TV/anime, friends, and custom-list membership do not supply seeds. |
| AC02 | Multiple watched seeds contribute candidates, including tied scores; repeat equivalent reads/recomputations | Sum the agreed similarity and configured TMDB contributions. Keep positive totals only; rank by descending unrounded total then ascending movie provider ID. Resolve equal seed weights by provider ID. Return at most 30 unique movies after library/metadata filtering; browser default order and Home preview preserve server order. |
| AC03 | A candidate is watchlisted, watched, custom-list-only, or has the same numeric provider ID as a TV library entry | Exclude the owner's watchlisted/watched movies. Custom-list-only movies remain eligible. A TV entry does not exclude a distinct movie with the same numeric ID. Apply current movie-library exclusions on every read, including cached results. |
| AC04 | Read recommendations, open details, deliberately save a candidate, repeat the save, then reload | Reads/details leave library membership unchanged. A confirmed watchlist/watched save refreshes recommendations and removes the movie; repeated saves retain one library entry. A failed save keeps the candidate eligible and does not claim persistence. Reload recovers saved library state and current exclusions. |
| AC05 | There are no watched movies with usable provider IDs, insufficient/unavailable recommendation coverage, or only library-excluded candidates | Return a distinguishable explanatory state for each case. With usable results but partial coverage, show results and explain the limitation. Identify watched-history personalization and rating influence. Offer an explicitly labelled Explore movies link; never fill personal results with popular, friend-derived, or other general discovery titles. |
| AC06 | Candidate metadata exists only for TV with the same ID, is missing a real movie title, or lacks optional fields | Resolve metadata only from movie catalog/cache data or movie-endpoint summaries. Omit candidates without a real nonblank movie title and explain omissions; if none can be displayed, explain missing movie information. Missing posters use the existing fallback; missing year/rating remains absent. Never fabricate title/year/rating or borrow TV metadata. |
| AC07 | TMDB is unconfigured, successfully returns no recommendations, or a configured request fails; API/network/timeout/malformed-response failures occur | Unconfigured optional TMDB is an explained supported limitation; a successful empty provider response is valid. Configured provider failure fails the refresh, as do invalid/failed application responses. Show an error and explicit retry rather than empty success or an apparently complete reduced ranking. Do not present a previous list as a successful current refresh; library data remains intact. |
| AC08 | Enter a personal-movie surface, reload the page, request reload/retry, or confirm an own-library change while a surface is active | Fetch current server results. Manual reload requests fresh computation, including retry after failure. Show pending state, bound requests, and disable duplicate refreshes while pending. Library changes invalidate results; obsolete overlapping responses cannot restore excluded movies. Other-session changes are reflected on the next fetch; no polling/push is required. |
| AC09 | Anonymous caller reads/forces refresh, another account has history, or account changes during an outstanding read/refresh | Require authentication, derive the owner from it, and use only that owner's history/results. Responses contain no private notes or other owners' history. Clear prior-account results and prevent late responses from populating the new account. |
| AC10 | Personal/aggregate reads, forced refresh, or scheduled/shared recomputation encounter movie/TV/anime candidates with equal numeric IDs or legacy mixed cache rows | The shared personal-recommendation path computes, writes, and serves movies only. Legacy TV/anime personal rows are not served or allowed to cause mixed-type cache writes/collisions. TV cache metadata cannot replace movie metadata. TV/anime discovery remains available; full typed catalog coexistence is deferred. |

## Decisions and test boundary

### Agreed decisions

The user settled Q1–Q7 and confirmed the complete understanding on 2026-10-21.
Q3 explicitly selects **API tests and source review only**, overriding the
proposed browser-fixture checks. There are no open product decisions blocking
this slice. This local record governs until deliberately published under
[the workflow](../../movienight-workflow.md).

Reuse the [recorded dependency preflight](../../../roadmap.md#dependency-preflight--2026-10-21)
and [product rules](../../../spec.md); no new production database or full identity
migration is a prerequisite for this bounded movie-only slice. That preflight is
source inspection, not runtime certification. The source check for this interview
confirmed the watched-or-rated seed bug, mixed cache writes, untyped metadata and
exclusions, swallowed provider errors, and invented frontend/aggregate fallbacks.
These findings refine the selected contract without reopening established rules.

Preserve the existing movie scoring model:

- A supplied personal rating has weight `rating - 5.5`; an unrated watched movie
  has weight `+1.5` (the existing default of 7). Zero therefore has weight `-5.5`.
- Sum `seed weight × MovieLens similarity` for each candidate. This does not train
  a new model or imply MovieLens covers every movie.
- When TMDB is configured, take movie recommendations from page 1 for up to three
  positive-weight watched-movie seeds, sorted by weight descending then provider
  ID ascending. For each returned position `i`, starting at zero, add
  `max(0.1, 1.0 - 0.04 × i)` to that candidate's total. This boost is not multiplied
  by the seed weight. Sum contributions to the same movie across sources.
- Filter nonpositive totals, library members, and unresolvable movie titles
  before the 30-result limit. Rank by unrounded total and movie provider ID;
  existing two-decimal score presentation must not determine order. Scores are
  ranking values, not personal ratings or predicted quality guarantees.

Use explicit response states or an equivalent unambiguous API contract for
history, coverage, library exhaustion, metadata omissions, and source failures;
the browser must not infer all of these from an empty movie array. Partial
coverage means not all usable watched seeds have recommendation data, optional
TMDB is unavailable by configuration, or candidate information had to be omitted.
Negative preferences/no positive totals may legitimately yield insufficient
coverage. If filtering has several causes, retain the applicable explanations
rather than mislabelling everything as library exhaustion. Exact copy and DTO
field names are implementation choices; the distinctions above are required.

Configured provider failure is fail-closed for that refresh: do not publish a
partial ranking or clear the need for a successful retry as if computation
succeeded. The provider client must distinguish failure from valid emptiness.
Existing cached results must not conceal a failed refresh. No automatic source
substitution or automatic retry loop is required; retry is explicit.

Narrow shared personal recomputation to movies across all callers, including
scheduled work and forced refresh, and remove/ignore legacy mixed personal rows
as necessary for that boundary. This deliberately suspends legacy TV/anime
personal results until milestone 7, without changing their discovery workflows.
Movie-only selection applies before seed collection, exclusion, metadata lookup,
and persistence. Full movie/TV catalog coexistence is not claimed: the existing
catalog cannot store two resource types with the same numeric provider ID.

Likely implementation seams, not files changed by this specification task:
`PersonalizedRecommendationService`, `SuggestionService`, recommendation/library
repositories and response DTOs, the narrow `TmdbClient` failure seam, and affected
shared refresh callers; frontend `useSuggestions`, API mapping, personal-category
and Home surfaces, and their confirmed library-change integration. Keep the
existing visual system. Tests belong with the existing backend tooling.
The glossary already defines Personalized recommendation, Library, and Explore;
no new domain term or consequential architectural decision requires a glossary
change or ADR for this slice.

### Agreed verification boundary for implementation

Use real JWT-authenticated HTTP through real controllers, services, repositories,
and isolated H2. Seed controlled similarity/movie-cache data and stub only
external provider responses, including configured success, valid empty, failure,
and retry. Observe repeated independent reads after real library mutations and
forced refreshes; do not substitute mocked repository assertions for API behavior.
Exercise the shared scheduled recomputation seam with the same persistence data.

Include deterministic numeric ranking cases (zero versus missing, fractional
ratings, summed sources, score/seed ties, nonpositive totals, deduplication and
post-filter limit), coverage/metadata states, ownership, explicit saves, reload
reads, and failed refresh/retry. For identity isolation, use a TV catalog/library
ID colliding with a movie similarity/cache/provider candidate ID, and equal
movie/TV cache IDs. Do not require impossible simultaneous movie/TV catalog
records or claim P11/full typed identity is delivered.

Review frontend source for server-order preservation, Home/page consistency,
honest states and source labels, bounded requests, duplicate-refresh disabling,
confirmed-versus-failed saves, library invalidation, and account/response guards.
Run strict typechecking and production build. Obtain independent Standards and
Spec reviews against this contract and the fixed implementation base, accurately
recording whether the review covers committed changes or a worktree.

**Browser execution is excluded by user choice.** Typecheck/build and source
review cannot prove rendered states, interactions, race timing, accessibility,
or end-to-end browser/API persistence. Report those as unverified rather than
marking UI acceptance fully passed from source inspection.

Planned commands, from the respective application directories:

```sh
# repo/MovieNightBackend: include the new authenticated persistence suite
./mvnw -Dtest=PersonalizedRecommendationServiceTest,SuggestionServiceTest test
./mvnw test
# repo/MovieNightFrontend
pnpm exec tsc --noEmit
pnpm build
# repository root
git diff --check
```

The implementer must record the new suite's actual name/command and actual
results. Existing setup/toolchain limitations and cached Mockito-agent/npm
workarounds are recorded in [tech-stack.md](../../../tech-stack.md) and the
[feature 005 evidence](../005-friend-suggestions/spec.md); reusing historical
results is not a fresh pass. Establish affected baseline checks at implementation
start and record pre-existing failures separately. No runtime baseline is rerun
for this specification-only task.

## Out of scope

- Tracker publication, push, merge, deployment, and roadmap integration-status
  updates. Commit remains subject to explicit human approval.
- TV/anime personal recommendations, full typed catalog/cache identity migration,
  and simultaneous movie/TV catalog records with equal numeric IDs (milestone 7).
- Friend-ranking changes, custom-list changes, redesign, new ML training methods,
  new recommendation-quality metrics, or numeric latency guarantees.
- General-discovery filler, polling/push, automatic retries, and new save/removal
  workflows beyond integrating existing explicit library actions.
- Automated/manual browser validation, real-account browser end-to-end checks,
  live-provider connectivity/quality certification, production storage/migrations,
  restart/release retention, onboarding/recovery, and deployment readiness.

## Validation — 2026-10-21

Historical pre-commit validation of the implementation worktree based on
`dbc560d743f2c2b289dc1ce3c3b68547c03fc820`; subsequently committed as
`52976c0a13c2b74c2eda5e7b717ca55a1794de57`. The checks and initial review
below describe that earlier worktree; current follow-up evidence appears at the end.
All acceptance rows below distinguish backend execution from frontend source
inspection. Browser execution remains excluded by the agreed boundary.

Retained API suites:

- [PersonalRecommendationsPersistenceTest](../../../repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/PersonalRecommendationsPersistenceTest.java):
  nine real JWT/MockMvc/controller/service/H2 tests, with only the external TMDB
  client stubbed. Controlled similarity, catalog, cache and legacy-row fixtures;
  library/list mutations and independent reads use authenticated HTTP.
- [PersonalRecommendationProviderPersistenceTest](../../../repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/PersonalRecommendationProviderPersistenceTest.java):
  real JWT/API/H2 and real TMDB HTTP client against a loopback-only HTTP fixture.
  Valid empty, malformed/missing/null JSON results, wrong resource type, HTTP 503,
  retry, movie-summary metadata, poster URL and unchanged library checks.

| Acceptance ID | Result | Evidence / practical limit |
| --- | --- | --- |
| AC01 | Passed API | Watched movie 0/7.5/unrated sum to 2.95; rated unwatched, TV and anime excluded. Custom lists remain independent. Frontend rating influence explained in source. |
| AC02 | Passed API; UI source only | Stable repeated ranking by unrounded score/ID, 30 after metadata/library filtering, top-three tied seeds, summed model/provider totals, deduplication, nonpositive totals. Home/page preserve server order in source. |
| AC03 | Passed API | Watchlist/watched exclusions, independent cached reads, custom-list-only eligibility, movie candidate with TV catalog/library/cache ID collision. |
| AC04 | Passed API; UI source only | Details/reads leave library unchanged; invalid save remains eligible; repeated confirmed watchlist saves yield one entry; reload reads apply exclusions. Save feedback/invalidation inspected, browser interaction unverified. |
| AC05 | Passed API; UI source only | NO_HISTORY, INSUFFICIENT_COVERAGE, LIBRARY_EXHAUSTED, MISSING_METADATA and READY plus retained limitation codes. No personal filler. Source labels and general Explore link inspected. |
| AC06 | Passed API; UI source only | TV-only/blank metadata omitted, real movie summaries used, missing year/rating remain null, poster URL resolution checked. Nullable year propagated through frontend sorts/saves. Rendered image fallback unverified. |
| AC07 | Passed API; UI source only | Unconfigured source explained, valid empty succeeds, configured HTTP/malformed failures fail closed; stale success stays unavailable until retry succeeds; library intact. Frontend validates/bounds requests and exposes retry. Timeout/offline presentation unexecuted. |
| AC08 | Passed API; UI source only | Forced computation and repeated fresh reads, shared scheduled success/failure path and current exclusions. Hook source has pending/duplicate-refresh guards, library/rating keys and monotonic input generations; browser races unexecuted. |
| AC09 | Passed API; UI source only | Anonymous read/refresh denied; another owner sees NO_HISTORY; no private notes/history in result DTO. Source suppresses prior-account and late results; account-switch browser execution excluded. |
| AC10 | Passed API | Movie-only shared computation, scheduled replacement of equal-ID legacy TV rows, dedicated/aggregate consistency, movie/TV cache metadata isolation. Full typed catalog coexistence remains deferred. |

### Checks actually run

- Affected original focused service baseline: four tests passed with an explicit
  cached Mockito agent and clean compilation. Default Mockito attachment failed;
  stale incremental class output also caused `ClassFormatError`, resolved by
  `clean`. Neither is counted as a product failure.
- TDD: the initial authenticated watched-weight/type-isolation test failed against
  the original implementation (HTTP 500 with mixed duplicate cache IDs), then
  passed. Ranking slice passed two tests; expanded API run passed nine tests;
  focused existing services passed four tests. Real HTTP-provider test passed.
- `pnpm` is unavailable. The existing installed TypeScript executable and npm
  build workarounds passed both baseline and implementation checks.
- Final isolated full backend suite: **118 tests passed, 0 failures, 0 errors,
  0 skipped** with the explicit provider-key overrides and Mockito agent.
- Strict frontend typecheck and production build passed. No browser script was
  run or added. Final `git diff --check` and whitespace checks for each new file
  passed.

Reproducible final commands (application directories respectively):

```sh
# repo/MovieNightBackend: real provider credentials disabled, local HTTP fixture allowed
./mvnw -Dapp.tmdb.api-key= -Dapp.omdb.api-key= -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar clean test
# focused suites use the same flags, plus:
# -Dtest=PersonalRecommendationsPersistenceTest,PersonalRecommendationProviderPersistenceTest,PersonalizedRecommendationServiceTest,SuggestionServiceTest
# repo/MovieNightFrontend
./node_modules/.bin/tsc --noEmit
npm run build
# repository root
git diff --check
```

The agent path above is machine-specific and must match an installed Mockito
artifact. Node 25.3.0, npm 11.6.2, Java 25 were used; declared Node 22/Java 21/pnpm
remain unverified. A sandboxed loopback fixture initially failed to bind; rerunning
with local socket permission passed. The first full-suite attempt inherited
ignored local provider credentials and triggered startup discovery requests; it
was interrupted and replaced with the explicit no-real-provider-key command.
That interrupted attempt is not a pass or a live-provider certification.

Logs (temporary, untracked): `/tmp/movienight-006-red-clean.log`,
`/tmp/movienight-006-ranking.log`, `/tmp/movienight-006-focused.log`,
`/tmp/movienight-006-provider.log`, `/tmp/movienight-006-full-isolated.log`,
`/tmp/movienight-006-final-types.log`, `/tmp/movienight-006-final-build.log`.

### Implementation decisions and limitations

Response `state` distinguishes the primary result; `limitations` retains partial
coverage, optional TMDB configuration, metadata omissions and library exclusions.
These diagnostics persist with the disposable recommendation cache on the user;
null diagnostics invalidate old mixed caches. Refresh replaces all personal rows
with movies only, ordering before persistence without rounding. A forced refresh
marks the cache dirty before the computation transaction, so a failed refresh
cannot reveal a previous list as a current success. Scheduled users compute in
separate transactions, allowing a failure to remain retryable without rolling
back other users. Provider requests have connect/read bounds and sanitized errors.

The existing catalog still cannot hold equal numeric movie and TV IDs together.
Tests deliberately use TV catalog/library rows alongside movie cache/provider
candidates, without claiming simultaneous typed catalog records or safe movie/TV
coexistence for writes. Existing explicit save workflows remain in use.
Frontend requests have 15-second bounds; each provider connect/read has 5/10-second
bounds. Cancellation of UI interest does not cancel an already-running server
computation. No polling or automatic retry was added.

H2 tests prove transaction persistence and independent reads, not restart/release
retention, migrations, public deployment, live recommendation quality or account
onboarding. Frontend source/type/build checks do not prove rendered layout,
interactions, accessibility or race timing. No browser acceptance is fully
certified. No glossary, ADR, roadmap integration-status, tracker or deployment
changes were made.

### Independent review

Two read-only agents reviewed the worktree against the fixed base above, including
new files. This deliberately differs from the review skill's normal committed
three-dot comparison: `git log dbc560d..HEAD --oneline` is empty; the review used
`git diff dbc560d -- repo/MovieNightBackend repo/MovieNightFrontend` and read new
files separately.

Standards: no documented standard breaches. Two nonblocking judgement calls remain:
string-based protocol vocabulary could use backend enums/frontend unions, and
metadata precedence could move into a small resolved-movie value/resolver.
These are maintainability suggestions, not known acceptance failures.

Spec: two P2 source findings were fixed: the personal landing grid lacked the
membership callback needed to render save buttons, and watched saves synthesized
the current year for unknown release years. The recheck confirmed both fixes and
no remaining findings. A nonblocking A→B→A state-reuse edge was also corrected
with monotonic request keys and rechecked. Browser behavior was not executed.

## Human review checkpoint — proposed commit scope

**28 files: 23 modified and 5 new, no deleted files.** All belong to feature 006.
The existing untracked feature specification is included, preserving its
acceptance contract and replacing specification-only evidence with these results.
No unrelated tracked changes were present or edited. Nothing is staged, committed,
pushed, merged or published.

Backend paths below are relative to `repo/MovieNightBackend/`:

| File | Reason / acceptance |
| --- | --- |
| `src/main/java/com/movienight/backend/client/TmdbClient.java` | Configured recommendation failures stay errors; strict provider envelope, bounded requests, sanitized errors (AC07). |
| `src/main/java/com/movienight/backend/controller/SuggestionController.java` | Failed forced refresh remains dirty/retryable; movie-only endpoint description (AC07/AC08). |
| `src/main/java/com/movienight/backend/dto/SuggestionCategoryResponse.java` | Explicit state and limitation fields (AC05–AC07). |
| `src/main/java/com/movienight/backend/model/PersonalizedRecommendation.java` | Preserve optional release year (AC06). |
| `src/main/java/com/movienight/backend/model/User.java` | Cache diagnostics and legacy invalidation (AC05/AC07/AC10). |
| `src/main/java/com/movienight/backend/service/PersonalizedRecommendationService.java` | Movie-only watched scoring, deterministic order, typed metadata/exclusions, shared read states and safe publication (AC01–AC10). |
| `src/main/java/com/movienight/backend/service/SuggestionScheduler.java` | Separate computation transactions so caught provider failures do not poison the shared scheduler transaction (AC07/AC10). |
| `src/main/java/com/movienight/backend/service/SuggestionService.java` | Dedicated/aggregate use one movie source; remove discovery filler and mixed personal mapping (AC05/AC10). |
| `src/test/java/com/movienight/backend/service/PersonalizedRecommendationServiceTest.java` | Adapt existing fixture to real movie metadata instead of invented titles (AC06). |
| `src/test/java/com/movienight/backend/service/SuggestionServiceTest.java` | Adapt existing composition fixtures to shared movie category (AC05/AC10). |
| `src/test/java/com/movienight/backend/controller/PersonalRecommendationsPersistenceTest.java` **new** | JWT/API/H2 weights/ranking/limit/metadata/exclusions/ownership/save/reload/scheduler coverage (AC01–AC10). |
| `src/test/java/com/movienight/backend/controller/PersonalRecommendationProviderPersistenceTest.java` **new** | Real HTTP provider envelope/failure/empty/retry and summary checks through API/H2 (AC06/AC07). |

Frontend paths below are relative to `repo/MovieNightFrontend/`:

| File | Reason / acceptance |
| --- | --- |
| `src/api/movies.ts` | Bounded validated reads/refresh, explicit failures and typed response diagnostics (AC05/AC07/AC08). |
| `src/hooks/usePersonalRecommendations.ts` **new** | Server-only movie metadata and lifecycle, refresh/library/account/late-response guards (AC02–AC09). |
| `src/components/PersonalRecommendationStatus.tsx` **new** | Shared honest source, coverage, loading/error/retry and Explore copy (AC05/AC07/AC08). |
| `src/hooks/useSuggestions.ts` | Remove obsolete personal/friend/catalog fallback hooks; retain Explore and incumbent shared mapper (AC05). |
| `src/pages/HomePage.tsx` | Server preview/order and shared states replace friend/catalog filler (AC02/AC05/AC08). |
| `src/pages/SuggestionsPage.tsx` | Ordered personal movie grid, explicit saves and shared feedback (AC02/AC04/AC05/AC08). |
| `src/pages/SuggestionCategoryPage.tsx` | Shared movie source, recommendation default order, save feedback and retry (AC02/AC04/AC05/AC08). |
| `src/components/TopBar.tsx` | Scoped recommendation-order option on desktop/mobile (AC02). |
| `src/store/data.ts` | Represent unknown release year as null (AC06). |
| `src/store/MovieStore.tsx` | Preserve unknown year in save payloads and recovered library data (AC04/AC06). |
| `src/pages/MovieDetailPage.tsx` | Preserve missing year through details mapping and watched saves (AC04/AC06). |
| `src/components/MovieGrid.tsx` | Omit null year from card tooltip (AC06). |
| `src/pages/CustomListDetailPage.tsx` | Null-safe year ordering for shared Movie type (supporting AC06). |
| `src/pages/ExploreContentPage.tsx` | Null-safe year ordering/filtering for shared Movie type (supporting AC06). |
| `src/pages/MoviesPage.tsx` | Null-safe library year ordering (supporting AC06). |

Documentation: `docs/features/006-personal-movie-recommendations/spec.md` **new**:
agreed local contract, implementation evidence, limitations and complete review
inventory (AC01–AC10).

Before: personal surfaces could seed from unwatched ratings, mix TV metadata and
writes, rank imprecisely, and substitute friends/popular titles under a personal
label. After: watched-movie results share deterministic server order, current
movie-library exclusions, real movie metadata and explicit limitations/errors.

Human scenario (suggested, **not executed**): mark a movie watched with 7.5, open
Home then Personal Recommendations, inspect matching order and coverage copy,
open details, save an eligible movie, then reload and verify it is excluded. With
no watched movies, expect a history explanation and labelled Explore link. With
a configured provider failure, expect an error and Retry rather than old picks.

Inspect from repository root; new files require separate inspection:

```sh
git status --short --untracked-files=all
git diff --stat
git diff -- repo/MovieNightBackend repo/MovieNightFrontend
# inspect any individual tracked file:
git diff -- repo/MovieNightFrontend/src/pages/HomePage.tsx
# all new files:
cat docs/features/006-personal-movie-recommendations/spec.md
cat repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/PersonalRecommendationsPersistenceTest.java
cat repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/PersonalRecommendationProviderPersistenceTest.java
cat repo/MovieNightFrontend/src/hooks/usePersonalRecommendations.ts
cat repo/MovieNightFrontend/src/components/PersonalRecommendationStatus.tsx
```

The initial change set above was subsequently committed as `52976c0`. The
follow-up change set below has its own review checkpoint. Wait for explicit
approval before committing it, per
[the workflow checkpoint](../../movienight-workflow.md#human-review-checkpoint).

## Post-commit review fixes — 2026-10-21

Fixed base: committed feature 006 at `52976c0a13c2b74c2eda5e7b717ca55a1794de57`.
The new feature 007 draft is an unrelated untracked file and is excluded from
this change set. No tracker publication, merge or roadmap status update occurred.

The required two-axis review of `git diff dbc560d...52976c0` found no hard
documented-standards violation. Its Spec axis found two frontend gaps: Home and
the category page used an untyped library lookup, so an equal-ID TV entry could
appear to be the recommended movie; Home also claimed watched TV/anime influenced
personal movie picks. A follow-up source inspection found the Home removal path
could use an untyped ID and the backend could accept a movie save as an equal-ID
TV catalog entry. The first two findings were fixed and independently rechecked.
The final Home removal adjustment was made after that recheck; its source and
type/build checks are recorded below. Existing nonblocking review judgements
concern free-form protocol state strings and metadata resolution placement.

The repair uses movie-typed membership checks on Home and the personal category
page. Home recommendation bookmarks add only; a stale card already saved is
disabled until refresh removes it. The backend rejects a save if the globally
unique catalog provider ID belongs to the other resource type. This returns a
clear failure and keeps both the TV library entry and the movie recommendation
intact, pending the typed catalog migration in feature 007. It does not claim
simultaneous equal-ID catalog records or successful collision saves.

An authenticated API/H2 test at the agreed seam was red before the guard: it
expected HTTP 400 but received 201. After the guard, it passed. The focused
provider HTTP fixture initially could not bind a loopback port in the sandbox;
it passed with local socket permission. An incremental focused run encountered
the existing stale Java class-output problem; a clean focused run passed. These
were setup failures, not passing feature behavior. The final isolated full
backend suite passed **119 tests, 0 failures/errors/skipped**, including the
new collision case and the loopback provider fixture. Strict TypeScript and the
production frontend build passed after the page/copy fixes; the final add-only
Home adjustment was followed by another typecheck/build. `git diff --check`
passed. Browser execution remains excluded by the agreed contract, so rendered
feedback, account races and accessibility remain unverified.

| Acceptance ID | Follow-up result | Evidence / limit |
| --- | --- | --- |
| AC01 | Passed API; UI source only | Existing movie-only API cases passed in the full suite; Home copy now names watched movies and rating influence. |
| AC03 | Passed API; UI source only | New authenticated collision case returns 400, leaves TV library status intact and keeps distinct movie eligible; Home/category membership source uses media type and ID. Collision save cannot succeed until feature 007. |
| AC04 | Passed API; UI source only | New collision failure remains retryable without changing TV; existing repeated save/read API cases passed; add-only Home action avoids untyped removal. Browser interaction unverified. |
| AC02, AC05–AC10 | Passed at previously agreed seams | Existing API cases passed in the full suite; frontend source, typecheck and build rechecked. No new browser evidence. |

Commands actually run from the application directories:

```sh
# repo/MovieNightBackend: focused red, then clean green, then full suite
./mvnw -Dapp.tmdb.api-key= -Dapp.omdb.api-key= -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar -Dtest=PersonalRecommendationsPersistenceTest#savingRecommendedMovieCannotChangeEqualIdTvLibraryEntry clean test
./mvnw -Dapp.tmdb.api-key= -Dapp.omdb.api-key= -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar clean test
# repo/MovieNightFrontend
./node_modules/.bin/tsc --noEmit
npm run build
# repository root
git diff --check
```

The loopback fixture required local socket permission. Installed runtime and
Mockito-agent paths are machine-specific as described above. Tests used no
real provider keys. Local H2/API checks do not prove production retention,
deployed behavior or live-provider quality. Logs are untracked under
`/tmp/movienight-006-current-*.log` and `/tmp/movienight-006-collision-*.log`.

### Human review checkpoint for the follow-up change set

Proposed commit scope: **seven modified files**, no additions or deletions:

| File | Reason / acceptance |
| --- | --- |
| `docs/features/006-personal-movie-recommendations/spec.md` | Correct committed status and record current review, checks, limitation and commit scope (AC01/AC03/AC04). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/service/UserMovieService.java` | Reject equal-ID cross-type saves while catalog identity is untyped (AC03/AC04). |
| `repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/PersonalRecommendationsPersistenceTest.java` | New authenticated collision save/read regression (AC03/AC04). |
| `repo/MovieNightBackend/src/test/java/com/movienight/backend/service/SuggestionServiceTest.java` | Correct obsolete movie-only test description (AC01). |
| `repo/MovieNightFrontend/src/api/movies.ts` | Correct obsolete personal API description (AC01). |
| `repo/MovieNightFrontend/src/pages/HomePage.tsx` | Typed membership, add-only bookmark and accurate watched-movie copy (AC01/AC03/AC04). |
| `repo/MovieNightFrontend/src/pages/SuggestionCategoryPage.tsx` | Movie-typed membership keeps equal-ID TV from hiding the movie save control (AC03/AC04). |

Before: equal-ID TV state could mask a recommended movie, and a movie save could
silently target the TV catalog row; Home described the wrong seed history. After:
movie cards use movie-only membership, collision saves fail visibly without
altering the TV entry, and Home names the watched-movie source. A human can try
marking a movie watched, inspect Home and Personal Recommendations, then save a
different movie; it should disappear after confirmation. With an equal-ID TV
library row, the movie recommendation remains visible and its save reports a
failure until feature 007 establishes typed catalog coexistence. This human
scenario was not executed in a browser.

Inspect before approving a commit:

```sh
git status --short --untracked-files=all
git diff --stat
git diff -- docs/features/006-personal-movie-recommendations/spec.md
git diff -- repo/MovieNightBackend/src/main/java/com/movienight/backend/service/UserMovieService.java repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/PersonalRecommendationsPersistenceTest.java repo/MovieNightBackend/src/test/java/com/movienight/backend/service/SuggestionServiceTest.java
git diff -- repo/MovieNightFrontend/src/api/movies.ts repo/MovieNightFrontend/src/pages/HomePage.tsx repo/MovieNightFrontend/src/pages/SuggestionCategoryPage.tsx
cat docs/features/007-tv-anime-tv/spec.md
```

The last command exposes the unrelated untracked draft so it cannot be mistaken
for part of the proposed commit. Nothing is staged, committed, pushed or merged
for this follow-up. Wait for explicit approval of this exact change set before
committing under the project human-review rule.
