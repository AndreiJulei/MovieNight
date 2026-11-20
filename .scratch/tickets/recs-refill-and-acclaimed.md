# Personal recommendations: refill after "Not interested", more acclaimed titles, missing IMDb/RT scores

Status: draft (decisions agreed 2026-11-18, not implemented).
Roadmap: [#36](https://github.com/AndreiJulei/MovieNight/issues/36). Product rule:
`spec.md` → Personal recommendation quality.
GitHub issue: not published. Absorbs [#39](https://github.com/AndreiJulei/MovieNight/issues/39)
with changed parameters (see Decisions). Builds on #37, #38 and #40
([feature record](../../docs/features/036-recommendation-feedback/spec.md)).
Base/branch: `d60f92e` on `fix/recs-refill-and-acclaimed`.

## Outcome

Feedback 2026-11-18: after removing titles from Personal Recommendations, no new
titles show up, and the user still wants more acclaimed films.

Cause (from the code, at `d60f92e`):

- **Fixed list of 30.** A recomputation stores at most 30 rows
  (`PersonalizedRecommendationService`, `result.size() == 30`). A dismissal does not
  recompute (#40 RM02). Home shows the first 20, so it can only pull in rows 21–30,
  which View all already showed. View all shrinks by one per dismissal, and Home
  shrinks once more than 10 are dismissed.
- **Small candidate pool.** Reload recomputes from page 1 of TMDB recommendations
  for the top 3 liked films, MovieLens neighbours, and at most 3 directors. After
  the floor (TMDB ≥ 6.5 with ≥ 300 votes), the qualified pool can be about 30 or
  fewer, so Reload brings back the same titles minus the dismissed ones.
- **No acclaimed source.** #39 was never built. Its draft (`discoverAcclaimedMovies`
  and interleaving) is still in `stash@{0}`.

A third report: IMDb and Rotten Tomatoes scores sometimes don't show, even for
titles that have them. Causes (at `d60f92e`):

- **Personal Recommendations never show Rotten Tomatoes.** `personalized_recommendations`
  has an `imdb_rating` column but none for RT. `movieCategory` never sets
  `rottenTomatoesRating`, and the frontend's `mapPersonalMovie` hardcodes `rt: null`.
- **Recommendation scores are a snapshot.** A stored row copies the catalog's IMDb
  value at recomputation time. Ratings the catalog gains later (from a title-page
  visit or another user's enrichment) don't reach the row until the next
  recomputation. Enrichment covers at most 30 OMDb requests per run, so candidates
  further down the list often have none.
- **Explore and Home discovery rows carry no IMDb/RT.** Top Rated, Popular and the
  other rows come from `CachedMovieList`, which holds TMDB data only. `mapApiMovie`
  falls back to the local store (`existing?.imdb`), so a card shows a score only if
  the title is already in the user's library or was loaded earlier in the tab.
- **The title page shows scores only on a second visit.** `MovieCatalogLookupService`
  starts OMDb enrichment in the background (`triggerBackgroundEnrichment`) and
  returns the details before it finishes. It also only starts when
  `imdbRating == null`, so a title with IMDb but no RT is never asked for RT again.
- **"Checked once" is permanent.** The enricher sets `omdbCheckedAt` even when
  OMDb returns no scores (for example, a new release before RT has reviews), and
  `needsExternalRatings` never asks again. Background enrichment failures (OMDb
  daily limit) are only logged, and nothing retries them.

After this change, a dismissed title is replaced by one the user has not seen yet.
The row also keeps refilling from a larger pool, and every third place holds a
critically acclaimed film in one of the user's favourite genres.

## Acceptance criteria

| ID | Given / when | Expected result |
| --- | --- | --- |
| RF01 | The user has a full stored list (more than 30 rows) and dismisses a title on Home | Home still shows 20 cards. View all still shows 30, and one of them was not in the previous 30 |
| RF02 | The user keeps dismissing until fewer than 40 undismissed rows remain stored | The dismissal that crosses below 40 marks the user for recomputation. The next read recomputes and View all shows 30 again, if the pool has 30 qualified titles. A list already below 40 (a small pool) is not marked again on later dismissals |
| RF03 | The user dismisses titles, then presses Reload | The recomputed list contains titles that were not in the previous stored list, if the larger pool has them |
| RF04 | A dismissal is undone (in-place, or after a recomputation dropped the row) | Same as #40 RM03: the title returns, in place while the stored rows are unchanged. If the dismissal had already marked the user (RF02), the next read recomputes and the title returns at its recomputed place |
| RF05 | The pool has fewer than 30 qualified titles | Every qualified title is shown and the floor is not lowered (existing rule) |
| AC01 | A fresh recomputation with enough acclaimed candidates | Positions 3, 6, 9, … of the served 30 hold acclaimed titles, at most 10 of 30 |
| AC02 | Any acclaimed title shown | It belongs to one of the user's top 3 genres among liked films, has TMDB vote count ≥ 3000, and clears the floor. Explanation: "Highly rated \<genre\> on TMDB" (changed 2026-11-19 from "Critically acclaimed \<genre\>" to match the glossary: the pick is an audience rating, not critic approval) |
| AC03 | Any served list | No title appears twice. Library and dismissed titles never appear |
| AC04 | Personal candidates run out before 30 | Acclaimed titles fill the remaining places |
| AC05 | The TMDB discover request fails | The list publishes with personal titles only, and the limitation `ACCLAIMED_SOURCE_UNAVAILABLE` is recorded. The frontend accepts the code and shows "Highly rated films in your top genres could not be loaded this time." |
| AC06 | The user has no watched history | Nothing changes. The state stays `NO_HISTORY` |
| AC07 | The user has liked films with no stored genres | The acclaimed source is skipped silently (no top genres), and personal titles still show |
| SC01 | A personal recommendation whose catalog title has IMDb and RT values | Its card and title page show both scores |
| SC02 | The catalog gains IMDb/RT for a title after the user's last recomputation | The next read of Personal Recommendations shows the new scores without a recomputation |
| SC03 | A Top Rated / Popular / other Explore card for a title whose catalog row has IMDb or RT, and the title is not in the user's library | The card shows the score, as it would for a library title |
| SC04 | The user opens a title page for a title with no stored scores, and OMDb has them | The page shows the scores on the same visit, without a reload (within the OMDb timeout). If OMDb is slow or out of budget, the page loads without scores and they show next time |
| SC05 | A title has IMDb but no RT stored | It is still eligible for an OMDb check for RT (subject to SC06) |
| SC06 | OMDb answered a title with no scores | It becomes eligible again after a 7-day cool-down, within the global OMDb budget. A check OMDb never answered records nothing and is retried at the next opportunity, within the budget |
| SC07 | The global OMDb daily budget is spent | No extra OMDb requests are made. Scores already stored still show |

## Decisions (agreed 2026-11-18)

- **Refill = bigger pool + stored reserve.** This is the chosen option. The others
  were recomputing on every dismissal and growing the pool only.
  - **Stored rows:** up to 60 per user. The read serves the first 30 that are not
    library or dismissed titles. Home shows 20 of them, View all shows 30. No
    migration: the table already holds `rank_order`.
  - **Low reserve:** when a dismissal takes the undismissed stored rows from 40 or
    more to fewer than 40, set `needsRecommendationRefresh`. A list already below 40
    is not marked again (changed 2026-11-19, see the review decisions). The next read recomputes (existing path), and
    the 4-hourly `SuggestionScheduler` job catches users who don't come back.
  - **Larger pool:** TMDB recommendations for the top 5 positive-weight seeds
    (was 3), pages 1 and 2 (was 1). That is at most 10 requests (was 3). MovieLens
    and the director source are unchanged.
- **Acclaimed = #39 with a larger share.** This is the chosen option, over #39 as
  written or a separate row.
  - **Top genres:** the 3 most frequent genres among liked films (`LikedFilmPolicy.liked`).
    Ties go to the genre name, alphabetically. `Movie.genres` is a comma-separated
    list of names; map the names to TMDB genre ids (a static map or
    `/genre/movie/list`, decided at implementation).
  - **Candidates:** TMDB discover with `with_genres` set to the 3 ids joined by `|`
    (OR), sorted `vote_average.desc`, `vote_count.gte=3000`, pages 1–2 (2 requests).
    They are ranked by the quality factor (#37), and they go through the same OMDb
    enrichment and floor.
  - **Mixing:** one row (the 2026-11-17 decision stands). Every 3rd stored slot
    holds an acclaimed title, at most 10 per 30 (20 across the 60 stored). Slots
    are counted on the stored ranking, so dismissals shift the rhythm until the
    next recomputation. This is accepted.
  - **Explanation:** "Highly rated \<genre\> on TMDB" (was "Critically acclaimed \<genre\>"; changed
    2026-11-19 to match `GLOSSARY.md`). The genre is the first of the
    film's genres that is in the user's top 3.
  - **Failure:** best effort, like the director source (#38).
- **A dismissal only excludes that title.** It does not down-weight the seed or
  director behind it. A negative signal is left for a later ticket.
- **Budgets:** the OMDb enricher keeps `MAX_REQUESTS_PER_RUN = 30`. Candidates past
  that budget use cached ratings or the neutral quality factor. TMDB worst case per
  recomputation: 10 recommendations + 43 director + 2 discover = 55 requests.
- **Scores are read from the catalog when a list is read, not copied at
  recomputation (proposed, confirm).** The personal read joins each stored
  `tmdb_id` to `movies` (one `findByResourceTypeAndTmdbIdIn` query) for IMDb and
  RT, and the stored `imdb_rating` stays only as a fallback. This needs no new
  column for RT and fixes SC01 and SC02 together. Explore rows do the same batch
  lookup for the IMDb/RT values of their listed ids (SC03). List reads never call
  OMDb.
- **Title page waits briefly for OMDb (proposed, confirm).** When a title has an
  IMDb id and no stored scores, the details request asks OMDb synchronously with a
  short timeout (proposed: 2 s, through `OmdbRequestBudget`) instead of in the
  background. On a timeout it falls back to today's background path.
- **Re-check rule (proposed, confirm).** Eligible for an OMDb check: an IMDb id,
  plus either score missing, plus `omdbCheckedAt` null or older than 7 days.
  This one rule replaces the different conditions in `needsExternalRatings` and
  `MovieCatalogLookupService` line 299, and every OMDb path records `omdbCheckedAt`.
- **Issue text:** when publishing, update #39 (every 3rd slot, at most 10, top 3
  genres) or close it in favour of this ticket.

## Test boundary

- Backend unit tests in `PersonalizedRecommendationServiceTest` with a mocked
  `TmdbClient`: stored count 60 and served 30 (RF01), low-reserve flag (RF02), seed
  and page count (RF03), interleaving and cap (AC01, AC04), genre and vote filter
  (AC02), deduplication and exclusions (AC03), discover failure (AC05), no history
  (AC06), no genres (AC07). Existing #40 RM tests stay green (RF04).
- Backend tests for scores: the personal read returns catalog IMDb/RT, including
  values added after the recomputation (SC01, SC02). The Explore read returns
  catalog scores (SC03). The details lookup returns scores from a stubbed OMDb on
  the first call, and falls back on a timeout (SC04). Tests on the re-check rule
  (SC05, SC06) and on the spent budget (SC07).
- Frontend: `src/api/movies.ts` validator accepts `ACCLAIMED_SOURCE_UNAVAILABLE`,
  and `PersonalRecommendationStatus` shows its message. `mapPersonalMovie` maps
  `rottenTomatoesRating` (SC01).
- Manual: on the deployed app, open 5 Personal Recommendations and 5 Top Rated
  titles that are not in your library, and confirm IMDb and RT show on the card and
  on the title page's first visit.
- Manual check on the owner's account: record View all before the change, then
  dismiss 5 titles and confirm 5 new ones appear. Also count the acclaimed titles in
  the 30.
- Commands: `./mvnw test` in `repo/MovieNightBackend`; frontend checks from
  `tech-stack.md`.

## Likely files

- `repo/MovieNightBackend/.../service/PersonalizedRecommendationService.java`:
  cap, read limit, seeds/pages, interleaving, low-reserve flag
- `.../service/AcclaimedRecommendationSource.java` (new): modelled on
  `DirectorRecommendationSource`
- `.../client/TmdbClient.java`: `discoverAcclaimedMovies` from `stash@{0}`, plus
  a genre-id mapping
- `.../service/RecommendationDismissals.java` or the controller's dismiss path:
  low-reserve check
- `.../test/.../PersonalizedRecommendationServiceTest.java`
- `repo/MovieNightFrontend/src/api/movies.ts`, and
  `PersonalRecommendationStatus` (new limitation message)
- `.../service/RecommendationRatingEnricher.java`, `MovieCatalogLookupService.java`,
  `CatalogPersistenceService.java`: one re-check rule, synchronous title-page
  lookup, `omdbCheckedAt` on every path
- `.../service/SuggestionService.java` (or the Explore read path): batch catalog
  score lookup
- `repo/MovieNightFrontend/src/hooks/usePersonalRecommendations.ts`:
  `mapPersonalMovie` maps RT
- `GLOSSARY.md`: **Acclaimed title** (optional, if the term sticks)

## Out of scope

- Dismissals as a negative ranking signal.
- A page listing dismissed titles, or undo after the toast has gone (#40 exclusion).
- A separate acclaimed row, or acclaimed titles outside the user's top genres.
- TV or anime personal recommendations (movie-only stays).
- Score sources other than OMDb, and OMDb calls during list reads. TV and anime
  scores are included only where they already share the movie catalog path.

## Validation

2026-11-18, uncommitted working tree on `d60f92e` (`fix/recs-refill-and-acclaimed`). Local checks only;
nothing deployed.

| IDs | Result | Evidence |
| --- | --- | --- |
| RF01 | Passed | `PersonalizedRecommendationServiceTest.rf01_*`; `PersonalRecommendationsPersistenceTest.rm02_rf01_*` (HTTP + H2) |
| RF02 | Passed | `PersonalizedRecommendationServiceTest.rf02_*` (crossing, above the reserve, small pool, unstored title); `PersonalRecommendationsPersistenceTest.rf02_*` |
| RF03 | Passed | `rf03_*` (5 seeds × pages 1–2, never the 6th); persistence `...TopFiveSeedSelection` |
| RF04 | Passed | Existing `rm03_*` tests unchanged and green |
| RF05 | Passed | Existing `pr01_*` floor tests green |
| AC01–AC07 | Passed | `PersonalizedRecommendationServiceTest.ac0*`; `TmdbClientDiscoverAcclaimedQueryTest` |
| SC01, SC02 | Passed | `PersonalRecommendationsPersistenceTest.sc01_sc02_*` |
| SC03 | Passed | `SuggestionServiceTest.sc03_*` (rows); `AdditionalDiscoveryPersistenceTest.sc03_*` (View all page) |
| SC04 | Passed | `MovieCatalogLookupServiceTest.sc04_*`; `TitleDetailsLoadingDiagnosisTest.sc04_*` and `test06_*` (real HTTP mock OMDb: 100 ms answer shows on the same visit; 2.5 s answer loads without scores, stored for the next visit) |
| SC05, SC06 | Passed | `OmdbRecheckPolicyTest`; `RecommendationRatingEnrichmentPersistenceTest.sc05_*`, `sc06_*`; `MovieCatalogLookupServiceTest.sc05_*`, `sc06_*` |
| SC07 | Passed | `OmdbRequestBudgetPersistenceTest`; `MovieCatalogLookupServiceTest.sc07_*` (spent budget; a visit joins a lookup that outlasted the wait) |
| Frontend | Typecheck/build only | `tsc --noEmit` and `npm run build` pass (pnpm unavailable; local binaries used). No frontend test runner covers the validator or `mapPersonalMovie` |
| Manual (deployed) | Not run | Owner-account dismissal and score checks need the deployed app |

Commands: `./mvnw test` in `repo/MovieNightBackend` → 354 tests, 0 failures, 2 skipped (live-provider
smoke tests).

Decisions 2026-11-19 (owner): keep the separate title-page OMDb share and `V11`; keep page 1's acclaimed
titles when only page 2 fails (best effort, as the director source); rename the explanation to
"Highly rated \<genre\> on TMDB" and the AC05 message to match the glossary.

Decision 2026-11-18 (owner): only the title page, Add Movie and list resolution wait for OMDb. Entry-page
hero slides send `waitForScores=false`: the lookup starts in the background and the details return at once
(`MovieCatalogControllerTest.getMovieDetails_*`, `MovieCatalogLookupServiceTest.sc04_aCallerThatDoesNotWait*`,
`TitleDetailsLoadingDiagnosisTest.entryPagesAskWithoutWaiting*`). The frontend caches that response under its
own key, so the title page never reuses a copy that did not wait.

Implementation decisions beyond the text above: title pages get their own OMDb share
(`app.omdb.title-page-daily-budget`, default 650/day; Flyway `V11`), counted next to the 300/day
recommendation share. An OMDb request with no answer records nothing, so it is retried at the next
opportunity within the budget. A title that is both personal and acclaimed keeps its personal place (if its personal score is above 0; see the review decisions).
`TitleDetailsLoadingDiagnosisTest.test06` changed from "never waits for OMDb" to "waits at most ~2 s".

Review decisions 2026-11-19 (owner, after the two-axis code review):

- **Low reserve marks only on crossing (RF02).** The rule as first written marked a user on every dismissal
  while fewer than 40 undismissed rows were stored. A small pool (under 40 qualified titles) then recomputed,
  at up to 55 TMDB requests, on each dismissal without finding anything new, which reversed #40 RM02. Now only
  the dismissal that crosses from 40 or more to below 40 marks the user (`PersonalizedRecommendationServiceTest.rf02_*`).
- **Undo does not clear the mark (RF04).** The flag has other causes (a new liked film), so undo cannot tell
  whose it is without a new column. RF04 is reworded: after a marking dismissal, the undone title returns at its
  recomputed place.
- **A check OMDb never answered is retried, not cooled down (SC06).** Recording `omdbCheckedAt` on a failure
  would block the title for 7 days after a transient error. The recommendation enricher already stops its run on
  the first unanswered request; title pages retry within their daily share. Follow-up, not in this ticket: during
  an OMDb outage every title-page visit waits up to 2 s; a short global back-off after a failure would avoid it.
- **A title-page lookup that outlasts the 2 s wait stays in flight (SC07).** It used to be dropped from the
  in-flight map on the timeout, so a visit in the next 1–3 s sent a second OMDb request. It now removes itself
  when it ends (`OmdbClient` times out within about 5 s), and later visits join it
  (`MovieCatalogLookupServiceTest.sc07_aVisitDuringALookupThatOutlastedTheWait*`).
- **An acclaimed title that resembles a disliked film gets no place (AC03).** A title with any personal score is
  left out of the acclaimed list. A score of 0 or below comes only from films the user rated low, so such a title
  is shown neither as personal nor as "Highly rated … on TMDB"
  (`PersonalizedRecommendationServiceTest.ac03_acclaimedTitleResemblingADislikedFilmIsLeftOut`).
- **Frontend tests stay out of scope.** The frontend has no test runner; adding one is a separate change.
- **Glossary:** **Acclaimed title** added to `GLOSSARY.md`.
