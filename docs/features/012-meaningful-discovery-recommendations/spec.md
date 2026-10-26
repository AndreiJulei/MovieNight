# Meaningful discovery and recommendation explanations

Status: draft, interview in progress on 2026-10-26; not ready for implementation.
Roadmap: 9b (Meaningful discovery and recommendations).
Product requirements: P16/P17/P20; preserve P01/P09/P10/P11/P12 and privacy.
GitHub issue: not published. Fixed specification base:
`5b0e9d77cdc91a8f16fc7575daecabf7304ea794` on
`feat/011-desktop-phone-usability`.
Existing feature-011/frontend work, roadmap edits and concurrent `mainPageLogo/`
work are unrelated and preserved. No remote fetch or runtime baseline was run.

## Outcome

A person can distinguish popular, well-received discovery from confidence-ranked
Top Rated choices across movies, TV Series and Anime TV. Ratings identify their
actual source and scale. Existing personal movie recommendations explain their
real watched-history connections and available audience evidence while retaining
the agreed relevance model. Browsing does not create personal membership.

Feature [010 remains the staging contract](../010-staging-release/spec.md).
This is a local feature record based on the [template](../../templates/feature-spec.md),
governed by the [workflow](../../movienight-workflow.md) until deliberate publication.

## Acceptance criteria

IDs are stable: clarify existing rows without renumbering them. This draft records
Q1–Q8; remaining decisions below must be resolved before calling it agreed.

| ID | Given / when | Expected result |
| --- | --- | --- |
| DQ01 | Open Popular for movies, TV Series or Anime TV, including boundary values and missing/invalid evidence | Label it Popular & well rated. Require a valid TMDB audience average of at least 7/10 and at least 200/100/50 votes respectively, plus release eligibility. Order by descending popularity, descending vote count, then ascending provider ID. Do not relax thresholds or substitute filler when few titles qualify. |
| DQ02 | Compare eligible Top Rated candidates with different averages and vote volumes; repeat equivalent reads | Require at least 1,000 movie, 500 TV or 200 anime-TV votes. Rank by the unrounded confidence-adjusted score below, then descending vote count, then ascending provider ID. The browser's default order preserves this policy; raw average alone does not decide rank. |
| DQ03 | Evaluate a title dated yesterday, today, tomorrow, unknown or invalid, including an established series with an upcoming season | Use UTC today and the provider's primary movie release or series first-air date. Today counts as released. Future/unknown/invalid dates do not qualify for Popular or Top Rated. Upcoming describes future movie releases or series premieres, never a new season inferred from the series' premiere date. No local availability is implied. |
| DQ04 | A title independently qualifies for multiple shelves, appears repeatedly in provider results, or shares a numeric ID with another resource type | Allow cross-shelf overlap; each typed title occurs once within each shelf. Newest/Currently Airing membership does not remove a title from Popular. Movie/TV identities and feature 007's mutually exclusive TV Series/Anime TV classification remain intact. |
| DQ05 | Read ratings in discovery, personal previews/pages and shared title details, including actual IMDb data, TMDB-only data, missing data and zero | Identify the real provider and scale. Never turn a TMDB audience average into an IMDb rating, a ranking score into an audience rating, or critic approval into a score out of ten. Missing values remain unknown; a supplied valid zero remains zero. Preserve personal-rating semantics and avoid fetching critic data for ranking. |
| DQ06 | Compute personal movie recommendations from controlled watched histories, including niche candidates and candidates lacking audience evidence | Preserve feature 006's scoring, candidate eligibility, current typed library exclusions and movie-only boundary. Audience evidence is explanatory, not a new filter, boost or universal popularity replacement. Friend scoring remains unchanged. |
| DQ07 | Read a personal recommendation produced by one or multiple actual watched-history sources | Explain up to two actual contributing watched titles and whether MovieLens similarity, TMDB recommendations or both contributed. Show audience rating/vote count when known. Say because you watched without assuming an unrated title was liked; never invent a connection. Preserve honest missing-history/coverage/error states and privacy. |

## Decisions and test boundary

### Agreement so far

The user accepted Q1–Q4, then Q5–Q8 on 2026-10-26. These settle scope, optional
critic deferral, release meaning, the high-level verification boundary, both
ranking policies, explanation-only personal changes and cross-shelf overlap.
The final shared-understanding checkpoint is pending.

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
details for the remaining shelves are part of the pending boundary decisions.

Personal movie scoring and the 30-result post-filter limit remain as specified
in feature 006. Existing zero/unrated seed weights, summed similarity/provider
contributions, score ties and failure rules remain. A niche taste match can stay
eligible with only 40 audience votes, or no audience evidence; it is not thereby
a Popular or Top Rated pick. Specific reasons must come from actual computation,
not title/genre guesses. Exact explanation selection and freshness are pending.

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

Require focused Chrome browser checks at representative desktop and phone sizes
for default ordering, labels, explanations, pending/failure/retry and account
changes. Combine real application/provider-fixture checks with separately labelled
controlled browser responses for awkward states. Browser fixtures do not establish
real API persistence. Exact viewport allocation and migration coverage are pending.
Safari and physical-device certification are outside this feature's boundary;
this does not waive feature 011's own required coverage.

Require strict TypeScript, production frontend build, backend regressions and
diff checks. Use [engineering entry points](../../../tech-stack.md) and record
actual commands, versions, base/worktree and failures during implementation.
Review bounded representative live results separately when credentials are
available; absent credentials do not turn fixtures into live-provider evidence.
Tests cannot certify universal taste, current provider accuracy or global ranking.

### Unresolved questions

Blocking implementation:

- Candidate query sources, page/work limits and the ranking coverage claim.
- Snapshot freshness, reload/refresh semantics, stale/empty/error behavior and
  handling legacy cache rows without trustworthy ranking/rating evidence.
- Exact presentation/sorting/filtering and personal-reason selection rules.
- Remaining release horizons, schema-compatibility verification and final
  confirmation of the complete contract.

## Out of scope

- Application implementation in this specification session; GitHub publication,
  infrastructure provisioning, deployment, commit, push or merge.
- Load more/pagination/session expansion and new Explore library exclusions (9c),
  logo rotation (9d), edits to feature 010 and completion claims for feature 011.
- TV/anime personal recommendations, changed friend scoring, new ML training,
  altered library/list/privacy rules, regional availability or season tracking.
- Critic-driven ranking, new providers, subscriptions, scraping and a full
  catalog index; performance, provider-quality or universal-taste guarantees.
- Visual redesign, native apps, Safari/physical-device certification and hosted
  storage/release evidence.

## Validation

Specification work only. Source/document/Git inspection and primary provider-doc
reads were performed on 2026-10-25/26 against the base and changing unrelated
worktree noted above. The formula examples were calculated directly. No runtime
baseline, application tests, browser checks, live provider calls or migrations
were run for this feature. Independent factual sub-agents could not execute due
to an account usage limit; the main agent completed the source checks directly.
No independent review pass is claimed.

| Acceptance ID | Result | Check / evidence |
| --- | --- | --- |
| DQ01 | Not run | Planned API thresholds/order and rendered category checks |
| DQ02 | Not run | Planned API numeric examples and browser order preservation |
| DQ03 | Not run | Planned fixed-clock date boundaries and accurate shelf labels |
| DQ04 | Not run | Planned API/browser overlap, deduplication and typed regressions |
| DQ05 | Not run | Planned actual-source/missing/zero cases across shared consumers |
| DQ06 | Not run | Planned feature-006/005 regression evidence |
| DQ07 | Not run | Planned contribution-provenance and owner-only explanation checks |

Record per-ID evidence, actual check commands, reviews, limitations and the tested
revision after implementation. This draft is not an implementation or validation
claim. Final documentation checks and the review inventory will be recorded after
the interview is complete.
