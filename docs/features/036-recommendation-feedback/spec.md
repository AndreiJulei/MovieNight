# Recommendation feedback (PD-19 – PD-22)

Status: #37 committed (`074fdee`). #38 locally validated 2026-11-18, pending
review checkpoint approval. #39–#40 not started.
Roadmap: [#36](https://github.com/AndreiJulei/MovieNight/issues/36). GitHub issues
(the authority for acceptance and status):

- [#37 PD-19 Stronger, continuous IMDb / Rotten Tomatoes weighting](https://github.com/AndreiJulei/MovieNight/issues/37)
- [#38 PD-20 Films by directors you liked](https://github.com/AndreiJulei/MovieNight/issues/38)
- [#39 PD-21 Acclaimed titles in your top genres](https://github.com/AndreiJulei/MovieNight/issues/39)
- [#40 PD-22 Remove a title ("Not interested") with undo](https://github.com/AndreiJulei/MovieNight/issues/40)

Base/branch: `aea762e` on `feat/recs-phone-layouts-title-page`.
`spec.md` carries the product rule (Personal recommendation quality).

## Outcome

Personal Recommendations respond to the 2026-11-17 feedback. Critic and audience
scores weigh more (#37), liked directors and acclaimed titles in the user's top
genres become sources (#38, #39), and the user can dismiss titles (#40).

## Decisions

### #37 (2026-11-18)

- **Formulas.** Implemented as proposed in the issue, in
  `RecommendationQualityPolicy`. The IMDb adjustment is `1 + 0.20 × (imdb − 6.8)`
  and the RT adjustment is `1 + 0.012 × (rt − 65)`, each clamped to [0.70, 1.40].
  This supersedes the fixed #24 steps (×1.15 / ×0.90).
- **Out-of-range data counts as missing.** IMDb ≤ 0 or > 10, RT < 0 or > 100,
  and non-finite values give the neutral 1.0, matching the floor's existing
  `≤ 10` check. Before, IMDb 0 received the ×0.90 penalty. #37 does not ask for
  this; it is a defensive guard against bad OMDb data.
- **Consequences of the formulas.** IMDb 6.5–6.79 and RT 60–64 were neutral and
  now get a small penalty (down to about ×0.94). At the top, IMDb ≥ 8.8 and
  RT ≥ 97 reach the 1.40 cap and no longer separate titles.
- **Test boundary.** Unit tests on the policy (`RecommendationQualityPolicyTest`).
  The floor, OMDb budgets, explanations and `PersonalizedRecommendationService`
  are unchanged.

### #38 (2026-11-18)

- **One definition of "liked".** `LikedFilmPolicy.liked` (watched movie, personal
  rating ≥ 7.0 or unrated) and `effectiveRating` (unrated = 7.0) are the only
  definitions. The existing seed weight uses `effectiveRating`, so "unrated counts
  as 7.0" is no longer a literal in the service. #39 reuses `liked`.
  `GLOSSARY.md` defines **Liked film**.
- **Implementation from the stash.** The TMDB calls (`getMovieDirectors`,
  `getDirectedMovies`, `CrewMember.id`) come from the #38–#40 draft stash. The
  source itself is `DirectorRecommendationSource`, a package-private class the
  service calls; it returns candidates and an `unavailable` flag instead of
  writing into the service's maps.
- **Person id (2026-11-18, review round 2).** Directors are identified by TMDB
  person id, not by the `movies.director` name. The credits of each liked film
  (the 40 most recent) give its directors, so co-directors each count and a name
  spelling cannot mismatch. Cost: one credits request per liked film looked up,
  plus one filmography request per qualifying director, so at most 43 TMDB
  requests per recomputation. Storing the person id on `movies` was rejected for
  #38: it needs a migration and a backfill.
- **Cap and order.** At most 3 directors, most liked films first, then by name
  (case insensitive), then by person id.
- **Relevance.** `1.0 × min(3, liked)` per director film. A film shared by two
  qualifying directors adds both. Director relevance is added to any other
  source's relevance for the same title; the quality factor (#37) then applies.
  Unreleased or low-vote films fail the floor through the vote data in the
  filmography response.
- **Library.** Library titles (including the liked films themselves) are dropped
  inside the source, so they no longer add `LIBRARY_EXCLUDED` on every run.
- **Explanation.** A title the director source reached shows "Because you liked N
  films by X", even if MovieLens or TMDB also suggested it (decision confirmed
  2026-11-18). The director with the most liked films wins when two share a title.
- **Failure scope (decision confirmed 2026-11-18).** Best effort per request: a
  failed credits request skips that liked film; a failed filmography request skips
  that director. Either records `DIRECTOR_SOURCE_UNAVAILABLE`, and the remaining
  directors and sources still publish. This deliberately narrows the issue's
  "this source is skipped". The TMDB recommendations source still fails the whole
  recomputation as before.
- **Frontend.** `DIRECTOR_SOURCE_UNAVAILABLE` is a new limitation code. The
  personal-recommendations response validator (`src/api/movies.ts`) rejected unknown
  codes, so it now allows this one, and `PersonalRecommendationStatus` shows "Films
  by directors you liked could not be loaded this time." Without this, a credits
  failure would have hidden every recommendation.
- **Not changed.** No migration and no new endpoint. The source runs only when TMDB
  is configured.
- **Issue text.** #38 still says a failure skips the whole source; update it to
  the per-request scope above.

## Out of scope

- #37: nothing beyond the committed change.
- #38: the acclaimed source (#39) and dismissals (#40). Their draft (the
  `discoverAcclaimedMovies` call, interleaving, `RecommendationDismissal`, V10
  migration and endpoints) stays in `stash@{0}`, not in this change set.

## Validation

### #37 (2026-11-18, `aea762e` + uncommitted changes)

| Acceptance ID | Result | Check / evidence |
| --- | --- | --- |
| QW01 | Passed | `RecommendationQualityPolicyTest.qw01_*`: at equal TMDB rating, an 8.5 / 95% title scores about 1.62× a 7.0 / 72% title; adjustment values match the formulas |
| QW02 | Passed | `qw02_adjustmentsNeverLeaveTheirBounds` checks every IMDb value from 0.1 to 10.0 and every RT value from 0 to 100; `pr03_qw02_missingDataEqualsTheNeutralValueExactly` compares with `isEqualTo` |
| QW03 | Not run | Needs the owner's real account and OMDb data. Record the top 20 before and after below |
| PR02 / PR03 (#24) | Passed | `pr02_*` and `pr03_*` in the same class, adapted to the continuous curve |

Commands: `./mvnw test -Dtest=RecommendationQualityPolicyTest` (10/10) and
`./mvnw test` in `repo/MovieNightBackend` (288 tests, 0 failures, 2 skipped live
provider smoke tests).

Review (`code-review`, two rounds):
- **Spec:** no defects. The unrequested out-of-range guard is recorded above.
- **Standards:** the removed #24 test IDs were restored, the new constants made
  private, and comments describing removed behaviour dropped. `spec.md` states
  the rule and links #37 rather than copying the constants. Both adjustments
  share one `linearAdjustment(value, neutral, slope)` helper instead of
  repeating the formula and clamp.

#### QW03 top 20

Before (fixed steps):

1. _not recorded yet_

After (continuous weighting):

1. _not recorded yet_

### #38 (2026-11-18, `074fdee` + uncommitted changes)

| Acceptance ID | Result | Check / evidence |
| --- | --- | --- |
| DR01 | Passed | `PersonalizedRecommendationServiceTest.dr01_twoLikedFilmsByADirectorRecommendTheirOtherFilms`: Nosferatu (8.0) + The Witch (unrated) → The Lighthouse and The Northman, each "Because you liked 2 films by Robert Eggers". `dr01_directorFilmOutranksTheTopTmdbRecommendation`: at equal quality both rank above a top TMDB recommendation. `dr01_ownLikedFilmsAreNotReportedAsExcluded`: no `LIBRARY_EXCLUDED` from the director's own liked films |
| DR02 | Passed | `dr02_oneLikedFilmByADirectorAddsNothing`: Nosferatu 8.0 + The Witch 6.9 → no filmography request and no candidates; `DirectorRecommendationSourceTest.oneLikedFilmQualifiesNobody` |
| DR03 | Passed | `dr03_creditsFailureKeepsTheOtherRecommendations` and `dr03_filmographyFailureKeepsTheOtherRecommendations`: the MovieLens candidate still publishes, limitation `DIRECTOR_SOURCE_UNAVAILABLE`. `DirectorRecommendationSourceTest`: a failed credits request skips only that liked film; a failed filmography skips only that director |
| DR04 | Not run | Needs the owner's real account with two Eggers films watched; confirm The Lighthouse appears after a refresh |

Supporting tests:
- `DirectorRecommendationSourceTest` (8): 3-director cap, most-liked order and
  name tie-break; `min(3, liked)`; co-directors each credited and a shared film
  summed; library titles dropped; only the 40 most recent liked films looked up.
- `PersonalizedRecommendationServiceTest`: a director film below the floor is not
  recommended; director and TMDB relevance add up (score ratio 1.5) and the
  director explanation wins.
- `LikedFilmPolicyTest` (3: 7.0/6.9 boundary, unrated, watchlist and TV/anime
  excluded) and `TmdbClientDirectorCreditsTest` (3, local HTTP stub:
  named director crew only, one person and one movie per credit, failure message
  without the URL).

Commands in `repo/MovieNightBackend`:
`./mvnw test -Dtest='DirectorRecommendationSourceTest,PersonalizedRecommendationServiceTest,LikedFilmPolicyTest,TmdbClientDirectorCreditsTest'`
and `./mvnw test` (310 tests, 0 failures, 2 skipped live provider smoke tests).
The frontend is unchanged since round 1 (`npx tsc --noEmit -p .`, `npm run
build` and `npm test` passed then). No frontend test covers the limitation message.

Review round 1 (`code-review`):
- **Spec:** blocker. The frontend validator rejected the new limitation code, so
  DR03 failed in the real app. Fixed. Also fixed: a director film listed twice
  was boosted twice (the filmography is now deduplicated by id), and the unused
  "Same director" source label was dropped.

Review round 2 (`code-review`, fixes 2026-11-18):
- **Spec:** directors grouped by name (co-directors missed, silent name mismatch)
  → grouped by TMDB person id. Own liked films caused `LIBRARY_EXCLUDED` on every
  run → dropped in the source. Root `spec.md` contradicted the per-director
  failure scope → updated. Missing tests (cap, `min(3)`, merge, filmography
  failure, floor) → added.
- **Standards:** the work moved to branch `feat/recs-director-source`. The
  duplicated `isMovie` and watched-movie checks now live once in
  `LikedFilmPolicy`. The five accumulator parameters are gone, because the source
  returns a `Result`. The director explanation logic is in `explanation(...)` instead of a nested
  ternary. TMDB's `"Director"` job is a named constant. `TmdbPerson` moved to
  `dto/external`, and `PersonCrewCredit` is private. The constants are private
  unless a test reads them.
- **Kept as judgement calls:**
  - Limitation codes stay raw strings, matching the four existing codes. An enum
    shared with the frontend validator would be a separate refactor.
  - `PersonCrewCredit` still extends the summary type to reuse its JSON mapping.
    TMDB's crew credit is a movie summary plus `job`.
  - The TMDB client methods keep their own fetch/wrap shape, like the rest of
    `TmdbClient`.

Limitations: synthetic tests only. The live TMDB credits endpoints are covered by
a local stub, not a real request. Up to 40 credits requests plus 3 filmography
requests per recomputation, with no caching.
