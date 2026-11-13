# Rows, poster grids, Top Rated depth, recommendation quality and hero picks

Status: locally validated 2026-11-13. Pending review checkpoint approval.
Roadmap: part of #16. GitHub issues (the authority for acceptance and status):
[#21 PD-05 rows](https://github.com/AndreiJulei/MovieNight/issues/21),
[#22 PD-06 poster grids](https://github.com/AndreiJulei/MovieNight/issues/22),
[#23 PD-07 Top Rated](https://github.com/AndreiJulei/MovieNight/issues/23),
[#24 PD-08 recommendations](https://github.com/AndreiJulei/MovieNight/issues/24),
[#25 PD-09 hero picks](https://github.com/AndreiJulei/MovieNight/issues/25).
Base/branch: `3b31122` on `perf/explore-read-cache` (uncommitted at validation).

## Outcome

Rows and poster grids use the page better, Top Rated draws from up to 1,000
titles, personal recommendations stop showing poorly rated titles and favour
titles rated well on IMDb and Rotten Tomatoes, and the main-page hero mixes in
the user's own picks. Acceptance criteria live in the issues above.

## Decisions and scope changes (2026-11-13)

Recorded here pending an update of the issue text:

- **#21 width:** content is centred and capped at 1680px with 16px / 32px
  minimum gutters (120px each side at 1920px), replacing the issue's "32px
  gutters at every width". Above 1744px the row track bleeds only 12px.
- **#21 hover:** row posters zoom to 1.05 (DESIGN.md `scale-105`), which keeps
  the hover room small enough for the row-gap limits.
- **#21 pages:** the title page keeps **You May Also Like as a grid**; only Key
  Cast is a row there. The suggestion pages are grids (covered by #22), so the
  row rule does not apply to them.
- **#22 friends:** a friend's Watched cards show title + year + the friend's
  rating; Watchlist cards show title + year + TMDB audience rating.
- **#23 request volume:** 50 pages of `vote_average.desc` plus 10 pages of
  `vote_count.desc` (60 requests per category, not 100). Paging still stops on
  an empty page, not a short one: test fixtures use one-title pages, and the
  saving is one request per sort. AniList curation is already paced (700ms)
  and cached for 14 days; a first refresh of ~1,000 anime takes ~12 minutes.
- **#24 OMDb failures:** a title is marked as checked only when OMDb answers
  (found or not found). With no answer (network/HTTP error, daily limit) the
  run stops and the title stays eligible next run. The reserved budget unit
  stays spent.
- **#24 naming:** IMDb is an audience rating, so enrichment code uses
  "rating"/"OMDb" names (`RecommendationRatingEnricher`, `recordOmdbCheck`,
  `V7__recommendation_rating_enrichment.sql`), not "critic".
- **#25 friends label:** titles only on friends' watchlists are labelled
  "On a friend's watchlist" (glossary: Friend suggestion); rated ones keep
  "Friends' pick". Both share the friends pool's 2-slide limit.
- **#25 pool cap:** the default "#1 For You" slide is dropped once two
  recommended picks are shown.
- **#25 loading:** the hero's own requests start at once; only the random draw
  waits for the library's first load, so the two loads overlap.

## Validation

Run 2026-11-13 on base `3b31122` plus the uncommitted change set. Browser
checks use `page.route` fixtures (layout and UI logic only, not real API
persistence). Backend checks use H2 with stubbed TMDB/OMDb.

| Acceptance ID | Result | Check / evidence |
| --- | --- | --- |
| RO01 | Passed | `rows-and-grids.cjs` gap check at 1920/1440/390 (38px desktop, 24px phone) |
| RO02 | Passed | `rows-and-grids.cjs`, capped content: side margin = max(gutter, (viewport − 1680) / 2) |
| RO03 | Passed | `rows-and-grids.cjs` hover/focus at 1920/1440/390 |
| RO04 | Passed | `rows-and-grids.cjs` shared heading/spacing on Home, Explore, title page |
| PG01 | Passed | `rows-and-grids.cjs` 7/5/3/2 columns |
| PG02 | Passed | `rows-and-grids.cjs`, `library-card.test.cjs` (own and friends' cards) |
| PG03 | Passed | `rows-and-grids.cjs` truncation at fixed height |
| TR01 | Passed | `TopRatedThousandPersistenceTest.tr01_*` (60 requests, 1,000 distinct titles; early stop) |
| TR02 | Passed | `TopRatedThousandPersistenceTest.tr02_*` |
| TR03 | Passed | `TopRatedThousandPersistenceTest.tr03_*` |
| TR04 | Passed | `TopRatedThousandPersistenceTest.tr04_*` |
| PR01 | Passed | `RecommendationQualityPolicyTest.pr01_*`, `PersonalizedRecommendationServiceTest.pr01_*` |
| PR02 | Passed | `RecommendationQualityPolicyTest.pr02_*`, `PersonalizedRecommendationServiceTest.pr02_*` |
| PR03 | Passed | `RecommendationQualityPolicyTest.pr03_*` |
| PR04 | Passed | `RecommendationRatingEnrichmentPersistenceTest` (30 per run, 300 per day, no-answer retry) |
| PR05 | Not run | Needs the reporter's real account and database |
| HM01 | Passed | `hero-picks.test.cjs` (seeded draws) |
| HM02 | Passed | `hero-picks.test.cjs`; `hero-banner.cjs` |
| HM03 | Not run | Code review only: one draw per mount, latched per user |
| HM04 | Passed | `hero-picks.test.cjs`, including the friends-watchlist label |

Commands:

- Backend: `./mvnw -o test` in `repo/MovieNightBackend` → 240 tests, 0
  failures, 2 skipped (live provider smoke tests).
- Frontend unit: `node --test tests/unit/*.test.cjs` → 155 passed.
- Frontend types: `npx tsc --noEmit -p .` → clean.
- Browser (Vite on 8443): `rows-and-grids.cjs`, `hero-banner.cjs`,
  `row-workflow-empty-states.cjs`, `movie-detail-redesign.cjs` → passed.

Limitations:

- `additional-discovery.cjs` and `issue-2-compact-explore.cjs` need a running
  backend for account sign-up: not run.
- `friend-suggestions.cjs` fails because its fixtures predate the current
  session check and never reach the page. It is unrelated to this change set
  and still needs a fixture update.
- No real TMDB/OMDb/AniList calls were made. Nightly refresh duration and OMDb
  answer rates are unmeasured.
