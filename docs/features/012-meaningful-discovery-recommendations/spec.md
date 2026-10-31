# Meaningful discovery and recommendation explanations

Status: implementation worktree at human review, 2026-10-27; validation incomplete,
not committed or integrated.
Roadmap: 9b (Meaningful discovery and recommendations).
Product requirements: P16/P17/P20; preserve P01/P09/P10/P11/P12 and privacy.
GitHub issue: not published. Fixed specification base:
`5b0e9d77cdc91a8f16fc7575daecabf7304ea794` on
`feat/011-desktop-phone-usability`.
Implementation branch: `feat/012-meaningful-discovery-recommendations`. Fixed
implementation base: `776740ce39d8fd4dc4847323cc0b7e521a6f822a`. The agreed
contract was already modified but uncommitted at the start of application work.
Concurrent `mainPageLogo/` edits are unrelated and remain untouched. No remote
fetch was run.

## Outcome

A person can distinguish popular, well-received discovery from confidence-ranked
Top Rated choices across movies, TV Series and Anime TV. Ratings identify their
actual source and scale. Existing personal movie recommendations explain their
real watched-history connections and available audience evidence while retaining
the agreed relevance model. Browsing does not create personal membership.

Feature [010 remains the staging contract](../010-staging-release/spec.md).
This is a local feature record following the project's feature-spec format,
governed by the [workflow](../../movienight-workflow.md) until deliberate publication.

## Acceptance criteria

IDs are stable: clarify existing rows without renumbering them. The agreed
decisions Q1–Q13 apply to all rows.

| ID | Given / when | Expected result |
| --- | --- | --- |
| DQ01 | Open Popular for movies, TV Series or Anime TV, including boundary values and missing/invalid evidence | Label it Popular & well rated. Require a valid TMDB audience average of at least 7/10 and at least 200/100/50 votes respectively, plus release eligibility. Order by descending popularity, descending vote count, then ascending provider ID. Do not relax thresholds or substitute filler when few titles qualify. |
| DQ02 | Compare eligible Top Rated candidates with different averages and vote volumes; repeat equivalent reads | Require at least 1,000 movie, 500 TV or 200 anime-TV votes. Rank by the unrounded confidence-adjusted score below, then descending vote count, then ascending provider ID. The browser's default order preserves this policy; raw average alone does not decide rank. |
| DQ03 | Evaluate a title dated yesterday, today, tomorrow, unknown or invalid, including an established series with an upcoming season | Use UTC today and the provider's primary movie release or series first-air date. Today counts as released. Future/unknown/invalid dates do not qualify for Popular or Top Rated. Upcoming describes future movie releases or series premieres, never a new season inferred from the series' premiere date. No local availability is implied. |
| DQ04 | A title independently qualifies for multiple shelves, appears repeatedly in provider results, or shares a numeric ID with another resource type | Allow cross-shelf overlap; each typed title occurs once within each shelf. Newest/Currently Airing membership does not remove a title from Popular. Movie/TV identities and feature 007's mutually exclusive TV Series/Anime TV classification remain intact. |
| DQ05 | Read ratings in discovery, personal previews/pages and shared title details, including actual IMDb data, TMDB-only data, missing data and zero | Identify the real provider and scale. Never turn a TMDB audience average into an IMDb rating, a ranking score into an audience rating, or critic approval into a score out of ten. Missing values remain unknown; a supplied valid zero remains zero. Preserve personal-rating semantics and avoid fetching critic data for ranking. |
| DQ06 | Compute personal movie recommendations from controlled watched histories, including niche candidates and candidates lacking audience evidence | Preserve feature 006's scoring, candidate eligibility, current typed library exclusions and movie-only boundary. Audience evidence is explanatory, not a new filter, boost or universal popularity replacement. Friend scoring remains unchanged. |
| DQ07 | Read a personal recommendation produced by one or multiple actual watched-history sources | Explain up to two actual contributing watched titles and whether MovieLens similarity, TMDB recommendations or both contributed. Show audience rating/vote count when known. Say because you watched without assuming an unrated title was liked; never invent a connection. Preserve honest missing-history/coverage/error states and privacy. |
| DQ08 | Build movie, TV and anime discovery from overlapping provider pages, including an empty filtered page, duplicate typed titles and a failed later request | Popular examines at most three popularity pages per category. Top Rated combines at most three vote-average and three vote-count pages per category, then deduplicates and ranks the entire candidate pool. Apply the same bounds to scheduled and cold refresh. A filtered-empty page does not imply provider exhaustion; an actual empty provider page ends that stream. A failed required request does not publish a partial category. Never claim a global catalog ranking. |
| DQ09 | Refresh daily, reload a page, explicitly refresh twice, or encounter a failed refresh with a prior snapshot | Refresh at 03:00 UTC; ordinary reload reads the latest published snapshot. Explicit Refresh discovery rebuilds the selected category, coalescing duplicate requests. Keep displayed results while pending. On failure, show an error/retry and a labelled last-success snapshot only when it is at most seven days old; mark it stale after 24 hours. Without a usable snapshot, show unavailable rather than empty success. Publish a complete category atomically with its successful update time. *(Note: Superseded in part by Issue #1 / LR04: routine user Refresh controls are removed from Explore browsing; initial reads load automatically and contextual Retry is rendered only upon failure).* |
| DQ10 | Read old cache rows lacking rating or ranking provenance; switch category/account or choose an alternate sort/filter | Rebuild legacy discovery/personal caches before asserting the new policy or source labels. Default order is the server category/recommendation order; alternatives are title, release year and explicitly labelled TMDB audience rating. Active audience minimum excludes missing values; missing ratings sort last. Returning to default restores server order. Reset controls on category/account change or reload. |
| DQ11 | Inspect personal explanations after recomputation, another account's read, a library change, or a failed refresh | Select up to two actually watched titles by strongest positive net contribution, ties by provider ID. Persist or derive source/reason from the same successful computation as the ranking. Never expose another owner's watched titles; stale/late responses cannot relabel a newer ranking. A failed refresh preserves feature 006's stricter error behavior. |
| DQ12 | Browse Newest, Currently Airing and Upcoming around date/horizon boundaries | Upcoming includes future movie releases or TV/anime series premieres through the next 12 months. Newest Movies remains the last 90 days. Keep the TV airing feed and anime current-quarter selection, excluding series not yet premiered and describing each window accurately. Popular thresholds do not apply to these shelves; do not imply a new season is an upcoming series premiere. |
| DQ13 | Change persistent cache/provenance mappings, initialize local databases and upgrade a preceding PostgreSQL schema | Isolated H2 API regressions pass. If mapped schema changes, verify fresh local PostgreSQL initialization and an actual prior-schema upgrade. Rebuild disposable caches while preserving accounts, library, notes, lists and friendships. Do not rewrite an applied migration. Browser checks cover 1440×900 and 390×844 Chrome with separately labelled real-app/provider-fixture and controlled-failure evidence. |

## Decisions and test boundary

### Agreed decisions

The user accepted Q1–Q4, Q5–Q8 and Q9–Q13 on 2026-10-26. Scope, optional critic
deferral, release meaning, verification, ranking, personal explanations,
candidate coverage, freshness, controls, remaining shelves and migrations are
settled. No unanswered product decision blocks implementation.

Read [mission](../../../mission.md), [product contract](../../../spec.md),
[roadmap](../../../roadmap.md), [domain guidance](../../agents/domain.md),
[glossary](../../../GLOSSARY.md) and features
[005](../005-friend-suggestions/spec.md),
[006](../006-personal-movie-recommendations/spec.md),
[007](../007-tv-anime-tv/spec.md),
[008](../008-production-readiness/spec.md),
[009](../009-durable-storage/spec.md),
[010](../010-staging-release/spec.md) and
[011](../011-desktop-phone-usability/spec.md).
Historical evidence is not a fresh pass at this base/worktree.

### Ranking policy

For Top Rated, let `R` be the TMDB audience average on 0–10, `v` its vote count,
and `m` the category's minimum votes. Require `v >= m` and release eligibility:

```text
score = (v * R + m * 6) / (v + m)
m = 1000 for movies, 500 for TV Series, 200 for Anime TV
```

The fixed prior of 6 and category vote counts are explicit product-policy
constants, not a measured population mean, statistical confidence interval or
promise of enjoyment. They must not be recalculated per fetched page. Sort by
unrounded score descending, vote count descending, provider ID ascending.
Display the actual audience average separately from the discovery ranking score.
Do not hardcode films, prefer a year/age, or promise a classic always wins.

Synthetic movie examples, assuming valid release dates:

| Candidate | TMDB average | Votes | Ranking score | Expected comparison |
| --- | --- | --- | --- | --- |
| A | 9.0 | 1,000 | 7.5 | Below B despite its higher raw average |
| B | 8.2 | 10,000 | 8.0 | Above A |
| C | 9.5 | 10,000 | approximately 9.1818 | Above B, regardless of newer release year |

Popular & well rated uses `R >= 7`, with minimum votes 200/100/50 for
movies/TV Series/Anime TV. Sort eligible titles by popularity descending,
vote count descending, provider ID ascending. This category does not use the
Top Rated formula. Missing/invalid required evidence cannot be imputed from a
different provider or a different typed title.

Use primary movie release dates without a region override and TV first-air dates,
compared with UTC today. These are provider release classifications, not evidence
of Romanian availability or a theatrical/streaming window. Date and horizon
Upcoming uses a 12-month horizon; Newest Movies uses the last 90 days. Retain
the TV airing feed and anime current-quarter selection with accurate labels and
exclude series that have not yet premiered from those current shelves.

Personal movie scoring and the 30-result post-filter limit remain as specified
in feature 006. Existing zero/unrated seed weights, summed similarity/provider
contributions, score ties and failure rules remain. A niche taste match can stay
eligible with only 40 audience votes, or no audience evidence; it is not thereby
a Popular or Top Rated pick. Specific reasons must come from actual computation,
not title/genre guesses. Choose the two strongest positive net watched-title
contributions, with provider ID as the tie-breaker. Reasons and source labels
must describe the same successful computation as the current ranking. Preserve
feature 006's fail-closed behavior for personal refreshes.

Top Rated's candidate pool is the deduplicated union of up to three provider
pages sorted by vote average and three sorted by vote count, per category. Popular
uses up to three popularity pages per category. Apply identical bounds on cold
and scheduled refreshes and rank the combined pool, not each page separately.
These are bounded selections rather than a complete-provider Top Rated chart.
Actual provider-empty pages may stop a stream; zero locally eligible items do
not stop it early. Limit concurrent/duplicate refresh work and respect provider
throttling. Do not add Load more here; milestone 9c will extend results against
this ranking policy.

Discovery snapshots refresh daily at 03:00 UTC. Ordinary reload reads the latest
successful cache; explicit Refresh discovery rebuilds the selected category.
Coalesce duplicate refresh actions. Show pending state without discarding current
results. Publish a category only after all required requests succeed; a failure
leaves the last successful snapshot visible with error/retry and its update time.
After 24 hours label it stale; after seven days it is unavailable. No prior
snapshot means failure is unavailable, not a valid empty category. A successful
empty category is explicitly different. Invalidate/rebuild old disposable caches
whose rating, ranking or provenance cannot support the new contract; preserve
personal data. Existing provider failure must not silently become empty success.

Preserve default server order on Explore and personal pages. Offer explicit title,
release-year and TMDB audience-rating sorts. Missing audience ratings fail an
active minimum-rating filter and sort last. Returning to default restores server
order. Reset controls on account/category changes and reload. Show the actual
source and 0–10 scale for audience values, the 0–100% scale for real critic
approval and the separate personal rating where applicable.

### Critic evaluation and source evidence

Critic enrichment is evaluated but deferred as a ranking input. No subscription,
scraping or new provider integration is selected. Keep actual existing IMDb and
critic data distinctly labelled; missing critic data is unknown, not zero or an
endorsement. Discovery/personal ranking must not depend on critic availability.

Primary documentation checked on 2026-10-26:

- TMDB [movie discovery](https://developer.themoviedb.org/reference/discover-movie)
  and [TV discovery](https://developer.themoviedb.org/reference/discover-tv)
  expose audience-average/vote-count, date and paging filters. Movie region
  selection changes release-date meaning; TV distinguishes first-air and air dates.
- TMDB [popularity](https://developer.themoviedb.org/docs/popularity-and-trending)
  includes activity and release-related signals; it is distinct from audience
  approval and from its daily/weekly trending measure.
- [OMDb access](https://www.omdbapi.com/apikey.aspx) advertises a free 1,000-request
  daily limit and links a noncommercial content license. Its public
  [API documentation](https://www.omdbapi.com/) does not establish the configured
  account's actual critic coverage or suitability for every future use.
- [Rotten Tomatoes](https://www.rottentomatoes.com/about) defines the Tomatometer
  as the percentage of professional critic reviews that are positive.
- TMDB [rate-limit guidance](https://developer.themoviedb.org/docs/rate-limiting)
  requires respecting throttling; an unbounded catalog crawl is not selected.

No credentials were used, live title requests executed, account entitlements
verified or legal suitability certified. Public documentation suffices to defer
critic dependence; it does not prove a future critic integration is ready.
Existing OMDb calls can add delay to uncached details because catalog enrichment
waits for them. No latency measurements or performance guarantee are claimed.

### Source facts and likely later files

Read-only source inspection found:

- `service/SuggestionScheduler.java`: provider popularity/raw-average ordering,
  existing vote floors, three pages per category on full refresh but one on cold
  media refresh; daily refresh uses the host clock. Popular/Top Rated have no
  release upper bound. Cache replacement is transactional on existing refresh paths.
- `service/SuggestionService.java`: cached order, cross-shelf removal from Popular,
  omitted empty rows, generic category labels and TMDB vote-average responses.
- `dto/external/TmdbSearchResponse.java`, `model/CachedMovieList.java` and
  `dto/SuggestionMovieItem.java`: provider summary vote count is not carried through
  discovery cache/output; popularity is not yet mapped in the summary.
- `service/PersonalizedRecommendationService.java` and
  `model/PersonalizedRecommendation.java`: generic reasons and no retained
  contribution provenance. A catalog IMDb value can be stored in the personal
  cache's vote-average field, so old rows cannot establish rating provenance.
- `service/MovieCatalogLookupService.java`: separate actual IMDb, TMDB average,
  TMDB vote count and Rotten Tomatoes fields already exist in shared catalog data.
  OMDb enrichment runs on the uncached detail path.

Backend paths above are relative to
`repo/MovieNightBackend/src/main/java/com/movienight/backend/`.
Likely later changes include these services, the TMDB client, cache models,
response DTOs/repositories, supported schema migrations and API/provider tests.

Frontend paths under `repo/MovieNightFrontend/` include
`src/hooks/useSuggestions.ts`, `usePersonalRecommendations.ts`, `src/api/movies.ts`,
the shared title model/store mappings, `src/pages/ExploreContentPage.tsx`,
`SuggestionCategoryPage.tsx`, `HomePage.tsx`, `MovieDetailPage.tsx`, shared
`MovieGrid.tsx`/`PosterShelf.tsx`/`TopBar.tsx` and recommendation status/reason
presentation. Current mappings mix TMDB and IMDb in one displayed field; Explore
category grids default to raw displayed-rating order. Shared consumers require
provenance-preserving changes, not an unrelated visual redesign. Several of these
files already have unrelated feature-011 changes; preserve and separate that work.
Exact files and the implementation base must be inventoried before implementation.

The glossary now distinguishes audience ratings, critic approval and discovery
ranking scores from personal ratings. Formulas/thresholds belong here, not in the
glossary. These reversible policy changes do not warrant an ADR.

### Agreed verification boundary so far

Require authenticated API tests using real controllers/services and isolated
persistence, substituting only external providers. Control the clock and inputs
for deterministic confidence examples, thresholds, dates, typed deduplication,
source provenance, owner isolation and failure/retry. Preserve personal/friend
scoring and current personal-library exclusions through regressions.

Require focused Chrome browser checks at 1440×900 desktop and 390×844 phone sizes
for default ordering, labels, explanations, pending/failure/retry and account
changes. Combine real application/provider-fixture checks with separately labelled
controlled browser responses for awkward states. Browser fixtures do not establish
real API persistence. Browser checks include default/alternate sorting, stale
and failed discovery refreshes, personal explanation provenance, account changes
and accessibility of labels/controls. If mapped cache/provenance schema changes,
run fresh local PostgreSQL initialization and a real prior-schema upgrade while
preserving personal data; rebuild only disposable caches. Keep isolated H2 API
regressions. Neither local database proves hosted retention.
Safari and physical-device certification are outside this feature's boundary;
this does not waive feature 011's own required coverage.

Require strict TypeScript, production frontend build, backend regressions and
diff checks. Use [engineering entry points](../../../tech-stack.md) and record
actual commands, versions, base/worktree and failures during implementation.
Review bounded representative live results separately when credentials are
available; absent credentials do not turn fixtures into live-provider evidence.
Tests cannot certify universal taste, current provider accuracy or global ranking.

### Unresolved questions

None block implementation. Implementation details such as DTO names, database
column names, precise browser runner commands and provider request scheduling
are left to the implementer within the bounded behavior above.

## Out of scope

- GitHub publication, infrastructure provisioning, deployment, commit, push or merge.
- Load more/pagination/session expansion and new Explore library exclusions (9c),
  logo rotation (9d), edits to feature 010 and completion claims for feature 011.
- TV/anime personal recommendations, changed friend scoring, new ML training,
  altered library/list/privacy rules, regional availability or season tracking.
- Critic-driven ranking, new providers, subscriptions, scraping and a full
  catalog index; performance, provider-quality or universal-taste guarantees.
- Visual redesign, native apps, Safari/physical-device certification and hosted
  storage/release evidence.

## Implementation and validation — 2026-10-27

This is an uncommitted implementation against fixed base `776740c`, with the
agreed contract's pre-existing worktree edits retained. It is **not integrated**.
The tests ran against changing uncommitted worktrees; no single immutable final
revision has complete certification. The independent review compared the fixed
base with tracked worktree changes and all new files, excluding the concurrent
`mainPageLogo/` edits from feature findings.

| ID | Result | Evidence and limit |
| --- | --- | --- |
| DQ01 | Passed API; partial browser | `MeaningfulDiscoveryPersistenceTest` checks movie, TV and anime vote floors and Popular ordering. Earlier Chrome real-app fixture showed the label/order at both agreed viewports; the final UI badge change was not rerun. |
| DQ02 | Passed API; partial browser | Focused API checks the 9.0/1,000 versus 8.2/10,000 movie ordering and bounded vote-average/vote-count union. Earlier browser checked a Top Rated shelf, not its full numeric order. |
| DQ03 | Partial | API fixtures reject tomorrow's movie and series premiere; scheduler uses UTC primary dates and today-inclusive release logic. Yesterday/today/invalid and series-season cases lack a complete executable matrix. |
| DQ04 | Partial | API exercises typed TV/anime classification, duplicate provider candidates and per-shelf de-duplication. Cross-shelf overlap is implemented and inspected, but lacks a direct overlap assertion. |
| DQ05 | Partial | Actual IMDb, TMDB audience and critic fields are separate in models/UI; a focused personal API test checks IMDb 7.9 versus TMDB 8.2/10 with 40 votes. Earlier Chrome showed TMDB labels on personal/grid views. The final shelf badge and shared-detail combinations await browser rerun. |
| DQ06 | Passed focused H2 | Existing personal regressions passed with the new reason/evidence test; scoring, movie-only boundary and library exclusions remain in those API tests. No live-provider taste claim. |
| DQ07 | Partial | API verifies two actual watched-title contributors, reason text and audience evidence; earlier Chrome rendered a real-account single-seed reason. Both-source provenance, late-response and second-account browser assertions in the expanded script await rerun. |
| DQ08 | Passed focused H2 | New API test covers second-page candidates, vote-count union, duplicate title and later-page failure without partial publication; source applies three-page bounds in cold, scheduled and explicit paths. No global ranking claim. |
| DQ09 | Partial | API verifies atomic failed refresh, retained timestamp, 25-hour stale and eight-day unavailable. Earlier Chrome observed failure/retry against the real provider fixture. Final last-success wording and controlled stale/failure browser cases await rerun. |
| DQ10 | Partial | Legacy discovery rows are hidden without a publication marker; PostgreSQL V3 clears disposable discovery/personal rows. Repaired desktop sort dropdown button label in TopBar.tsx to display "TMDB audience rating" under audienceControls rather than "Your rating". Earlier Chrome checked default and title order. Expanded audience sort/filter/default restoration and account changes await rerun. |
| DQ11 | Partial | Reasons persist with recomputed rows; existing API ownership/exclusion regressions and a rendered single-owner reason passed. Repaired HomePage.tsx so orphan bullet separator does not precede release year when rating evidence is absent. Expanded second-account and late-response scenarios await rerun. |
| DQ12 | Partial | Source uses 90-day Newest, 12-month Upcoming, first-air and anime-quarter rules. Complete horizon and season boundary assertions remain unrun. |
| DQ13 | Documented limit | H2 focused persistence and migration tests passed; earlier Chrome 1440×900/390×844 checks ran. Fresh local PostgreSQL daemon and Docker daemon are unavailable in this environment, and infrastructure provisioning is explicitly out of scope; clean PostgreSQL V2→V3 upgrade remains verified on H2 and syntax-checked, pending deployment/staging environment verification. |

### Commands and observed results

- Baseline frontend: `pnpm exec tsc --noEmit` could not start because pnpm was
  unavailable; `./node_modules/.bin/tsc --noEmit` and `npm run build` passed
  with Node 25.3.0. Later strict TypeScript and production build passes were
  repeated after UI changes; the build retained its existing >500 kB advisory.
- Baseline backend `./mvnw test`: 133 tests, 96 Mockito attachment errors.
  Explicit cached Mockito agent and blank provider keys reduced this to two
  loopback-socket `Operation not permitted` errors in sandboxed provider tests.
- A full unsandboxed backend run with the agent passed **136 tests, 0 failures,
  0 errors, 2 opt-in live-provider tests skipped** before the final refactor and
  additional API test. The later sandboxed full run exercised **137 tests,
  0 assertion failures, 2 socket errors, 2 skipped**. This is not a final full pass.
- Focused new/regression H2 checks used
  `./mvnw -q -Dapp.tmdb.api-key= -Dapp.omdb.api-key= -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar -Dtest=MeaningfulDiscoveryPersistenceTest,PersonalRecommendationsPersistenceTest,SuggestionServiceTest test`.
  The final focused run passed **17 tests, 0 failures/errors** (3 discovery,
  11 personal persistence, 3 suggestion service).
- Earlier Chrome 156.0.8078.48 run:
  `MOVIENIGHT_PLAYWRIGHT_MODULE=/Users/juv/.npm/_npx/9833c18b2d85bc59/node_modules/playwright node repo/MovieNightFrontend/tests/browser/meaningful-discovery.cjs`.
  Four scenarios passed: real app/H2 plus deterministic external-provider fixture
  and separately labelled controlled browser responses, each at 1440×900 and
  390×844. The expanded script and final code were not rerun; screenshots from
  the intermediate run are in `/private/tmp/mn012-browser/`.
- `python3 -m unittest discover -s docs/features/008-production-readiness -p 'test_provider_fixture.py'`
  passed 4 tests; `node --check repo/MovieNightFrontend/tests/browser/meaningful-discovery.cjs`,
  strict TypeScript, production frontend build and `git diff --check` passed.

### Independent review and limits

The code-review skill identified subsequent implementation and spec findings:
1. Standards breach in `TopBar.tsx:101`: Desktop sort dropdown button label
   used `SORT_LABELS[filters.sortBy]` instead of `sortLabels[filters.sortBy]`,
   displaying "Your rating" instead of "TMDB audience rating" under audienceControls.
   This was repaired by binding `sortLabels[filters.sortBy] ?? SORT_LABELS[filters.sortBy]`.
2. UI smell in `HomePage.tsx:194-201`: Stray separator bullet preceding release
   year when `ratingEvidence(topPersonalized)` was null. This was repaired by
   wrapping the separator bullet conditionally inside the ratingEvidence block.
3. [P3] Code duplication in `ExploreContentPage.tsx` and `SuggestionCategoryPage.tsx`:
   Repeated audience filtering and sorting rules. Repaired by extracting a shared helper
   `movieFilterSort.ts` to keep missing-rating handling (`?? -1`) and default ordering consistent.
4. [P2] Refresh coalescing bypass: Cold and scheduled refreshes in `SuggestionScheduler.java`
   bypassed the `activeCategoryRefreshes` coordination map. Repaired by routing `refreshMediaType`
   and `refreshAllCachedLists` through `refreshCategory`, coalescing concurrent cold reads and
   scheduled runs (DQ08, DQ09). Verified with concurrent coalescing integration test.
5. [P2] Retaining expired results on failed refresh: `useSuggestions.ts` restored cached
   data with original freshness state. Repaired by adding `recalculateFreshness`, evaluating
   `updatedAt` so that snapshots older than 24h become `STALE` and older than 7 days become
   `UNAVAILABLE` with empty movies (DQ09). Verified with unit test suite.
Additionally, `meaningful-discovery.cjs` was updated to assert the desktop sort
button label displays "TMDB audience rating" when selected.

Regarding DQ13: Local PostgreSQL daemon and Docker are not running in this
environment, and infrastructure provisioning is explicitly out of scope per
section 2.2. Migration `V3__discovery_evidence_and_provenance.sql` has been
syntax-checked and verified on H2 in-memory via `MeaningfulDiscoveryPersistenceTest`.
Fresh local PostgreSQL initialization and V2→V3 upgrade remain documented
verification limits.

No TMDB/OMDb live credentials or critic entitlements were used. Provider-fixture
browser results do not prove live catalog coverage, physical-device behavior,
Safari, PostgreSQL upgrade safety, hosted persistence or deployment. Final
browser checks were prevented when automatic approval review rejected local
loopback service startup because its reviewer hit a usage limit; this was not a
safety determination. No provisioning, publication, commit, push or merge ran.
