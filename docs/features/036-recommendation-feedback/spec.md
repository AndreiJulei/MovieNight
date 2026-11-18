# Recommendation feedback (PD-19 – PD-22)

Status: #37 committed (`074fdee`), #38 committed (`f15512e`). #40 locally
validated 2026-11-18, pending review checkpoint approval. #39 not started.
Roadmap: [#36](https://github.com/AndreiJulei/MovieNight/issues/36). GitHub issues
(the authority for acceptance and status):

- [#37 PD-19 Stronger, continuous IMDb / Rotten Tomatoes weighting](https://github.com/AndreiJulei/MovieNight/issues/37)
- [#38 PD-20 Films by directors you liked](https://github.com/AndreiJulei/MovieNight/issues/38)
- [#39 PD-21 Acclaimed titles in your top genres](https://github.com/AndreiJulei/MovieNight/issues/39)
- [#40 PD-22 Remove a title ("Not interested") with undo](https://github.com/AndreiJulei/MovieNight/issues/40)

Base/branch: `aea762e` on `feat/recs-phone-layouts-title-page`. #38 was built on
`feat/recs-director-source`; for #40 that branch's commit was fast-forwarded onto
`feat/recs-phone-layouts-title-page` (2026-11-18), so #40 builds on `f15512e`.
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

### #40 (2026-11-18)

- **Implementation from the stash.** `RecommendationDismissal`,
  `RecommendationDismissalRepository` and `V10__recommendation_dismissals.sql` are
  the draft's, unchanged. V10 was checked free on `main`, `origin/main` and both
  recommendation branches, with no open PR adding a migration. The draft's
  acclaimed source, interleaving and TMDB client changes stay in `stash@{0}` for
  #39; the stash was read with `git show`, not popped.
- **The exclusion #39 reuses.** `RecommendationDismissals.dismissedMovieIds(user)`
  is the single exclusion. The read excludes dismissed rows and the recomputation
  skips them before OMDb enrichment and ranking. #39's acclaimed source calls the
  same method. Dismissed titles do not add `LIBRARY_EXCLUDED`: they are not in the
  library.
- **Idempotent dismissal (RM04).** The draft checked for an existing row and then
  inserted it, so two concurrent requests both passed the check and the second
  returned 500 from the unique constraint. The insert now runs in its own
  transaction and a constraint violation counts as "already dismissed" (the
  `OmdbRequestBudget` pattern). Undo is a delete and is idempotent too.
- **Owner only.** The user comes from the token, never from the path, so a caller
  can dismiss or undo only their own titles. Personal recommendations are
  movie-only; `media_type` is always `MOVIE` (the issue names the column). Any
  positive id is accepted, recommended or not: dismissing an unrecommended title
  only keeps it out of later recommendations.
- **Undo after a recomputation (RM03, review round 1).** A recomputation skips
  dismissed titles, so one that runs between a dismissal and its Undo drops the
  stored row. An Undo that removes a dismissal whose title is no longer stored
  marks the user for recomputation, so the title returns on the next read. Its
  position then comes from the new ranking, so other titles may shift: "previous
  position" holds only while the stored rows are unchanged. The decision lives in
  `PersonalizedRecommendationService.undoDismissal`; `RecommendationDismissals`
  only stores and removes dismissals.
- **Replacement (RM02).** No recompute: 30 rows stay stored and the read excludes
  dismissed ones. The Home row shows the first 20, so it keeps 20 while at least
  20 stored titles remain. View all shows every stored title, so it shrinks by one.
- **Double tap in the UI (RM04).** The next card slides under the pointer, so a
  second tap would dismiss it. A per-card check does not help, because that card
  has a different id. A second tap on the same slot (list and index) within
  600 ms of a dismissal is ignored (`acceptDismissalTap`, through
  `dismissFromList`); a quick dismissal of another card goes through.
- **Control placement.** Row cards overlap their right-hand neighbour by 34 px, so
  a top-right ✕ sat under the next card (a double click opened that card). The ✕
  is at the top left of row and grid cards. Personal recommendations exclude
  library titles, so it never covers the "In library" tag. The 44 px button holds
  a 28 px disc. It is always visible on touch screens; with a hover-capable
  pointer it appears on card hover or focus.
- **Markup.** A button cannot sit inside a link, so a dismissable row card is a
  wrapper `div.shelf-card` around the link and the ✕. The shelf CSS also matches
  `.shelf-card:has(:focus-visible)` for the lift and overlay. Rows without
  `onDismiss` render exactly as before.
- **Undo toast and keyboard (RM05).** The existing `Toast` gained two options. A
  keyboard dismissal (`detail === 0`) moves focus to Undo, and the toast stays
  open while it holds focus (it would otherwise close in 5 s). This deliberately
  departs from the issue's "Undo for ~5 s": a keyboard user's Undo toast stays
  until they act, press Escape or move focus away (WCAG 2.2.1, timing
  adjustable). When it closes with
  focus inside (Undo, Escape or ✕), focus returns to the list: to the restored
  card's ✕ after Undo, otherwise to the ✕ of the card now in that place. Mouse and
  touch dismissals leave focus alone. Undo's touch target is 44 px through an
  `::after` box, so the toast looks the same. The provider re-created
  `onDismiss` on every render, which restarted each toast's timer whenever another
  toast appeared; the timer now uses a ref.
- **Undo after the request.** Undo waits for the dismissal request, so a fast
  Undo cannot reach the server first and leave the title dismissed. A failed
  dismissal closes the Undo toast (`toast()` returns a close handle) and brings
  the card back with an error toast; a failed undo removes the card again with an
  error toast.
- **Shared state in the tab.** `recommendationDismissals.ts` keeps the dismissed
  ids per user for every mounted list, so the Home row and View all agree while a
  request is in flight.

## Out of scope

- #37: nothing beyond the committed change.
- #38: the acclaimed source (#39) and dismissals (#40). Their draft (the
  `discoverAcclaimedMovies` call, interleaving, `RecommendationDismissal`, V10
  migration and endpoints) stays in `stash@{0}`, not in this change set.
- #40: the acclaimed source (#39). A page listing dismissed titles, or undoing a
  dismissal after the toast has gone, is not part of #40.

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

### #40 (2026-11-18, `f15512e` + uncommitted changes)

| Acceptance ID | Result | Check / evidence |
| --- | --- | --- |
| RM01 | Passed | `PersonalRecommendationsPersistenceTest.rm01_dismissedTitleStaysGoneAfterReloadAndRecompute` (real H2 persistence through the API): gone after a read and after a forced recompute. Browser: gone after reloading the Home row and View all |
| RM02 | Passed | `rm02_nextStoredTitleTakesTheFreedPlaceWithoutARecompute`: 30 stored, one dismissed, the stored 21st becomes 20th and a candidate added afterwards does not appear (no recompute). Browser: the Home row keeps 20 cards with Pick 21 sliding in. Mutation: removing the read exclusion fails the test |
| RM03 | Passed | `rm03_undoRestoresTheTitleToItsPosition` (also after a recompute; a repeated undo is harmless) and `rm03_undoAfterARecomputeBringsTheTitleBackOnTheNextRead` (a recompute between dismissal and Undo). Browser: Undo restores the card at its index on the row and in View all, by mouse, touch and keyboard; the DELETE is sent after the POST |
| RM04 | Passed | `rm04_doubleTapCreatesOneDismissal`: two sequential and four concurrent requests all return 204 with one stored row. Mutation: rethrowing the constraint violation fails it in 3 of 3 runs. Browser: a double click sends one request and removes one title |
| RM05 | Passed (fixtures) | `tests/browser/recommendation-dismissal.cjs` at 1440 px and 390 px (touch): 44 px targets for ✕ and Undo, visible without hover on the phone, hover/focus reveal on the desktop, the toast inside the phone viewport, Tab order card → ✕, Enter/Space dismiss, focus to Undo, toast held past 5 s while focused, focus return after Undo and Escape. Not run on a physical phone or with a screen reader |

Owner-only access: `onlyTheOwnerCanDismissOrUndoTheirTitles` (unauthenticated
403; another account's undo leaves the owner's dismissal). `invalidTitleIdsAreRejected`
(id 0 → 400).

Commands:
- `repo/MovieNightBackend`: `./mvnw test -Dtest='PersonalRecommendationsPersistenceTest,PersonalizedRecommendationServiceTest,SuggestionControllerTest'`
  and `./mvnw test` (317 tests, 0 failures, 2 skipped live provider smoke tests).
- `repo/MovieNightFrontend`: `npx tsc --noEmit -p .`, `npm test` (7/7), `npm run build`.
- Browser (Vite dev server on 8443, `MOVIENIGHT_PLAYWRIGHT_MODULE` set):
  `node tests/browser/recommendation-dismissal.cjs` (all 5 scenarios passed).
  Regression: `rows-and-grids.cjs`, `row-workflow-empty-states.cjs` and
  `explore-highlights.cjs` passed. `issue-2-compact-explore.cjs` times out at
  sign-up ("Create Account"); it fails the same way on a clean `f15512e`, so it
  predates #40.

Limitations:
- The V10 migration was not run against Postgres; tests use H2 with the schema
  generated from the entity. The entity matches the migration column for column.
- A full page load in the ~300 ms between Undo and its request finishing cancels
  the undo (in-app navigation does not). A list fetched while a dismissal is
  pending, then undone, lacks the title until its next load.
- After an Undo that follows a recomputation, the next read recomputes
  synchronously (the provider requests of a normal refresh).
- Dismissing the last title on View all unmounts the grid, so focus falls back to
  the page.
- A non-numeric id in the path returns 500. `GlobalExceptionHandler` maps any
  unmatched route to 500; this predates #40 and is not changed here.

Review round 1 (`code-review`, uncommitted changes against `f15512e`):
- **Spec:** Undo after an intervening recomputation did not restore the title →
  fixed (decision above, new test). Accepted as recorded decisions: View all
  shrinks by one per dismissal (only the Home row keeps its length); the
  per-tab double-tap block; any positive id may be dismissed; the `Toast`
  changes apply to every toast. The `Toast` timer fix is an unrelated bug fix,
  included because the Undo toast depends on it: the provider re-created
  `onDismiss` on every render, restarting open toasts' timers.
- **Standards:** the frontend named dismissals "hidden", a term the new glossary
  entry avoids → renamed (`dismissedRecommendations`,
  `setRecommendationDismissed`, `useDismissedRecommendations`,
  `acceptDismissalTap`). `ShelfPoster` repeated the whole link for the
  dismissable card → one link, wrapped only when dismissable, with a shared
  `CARD_CLASS`. The two dismissal API calls share `sendDismissal`.
  `DOUBLE_TAP_MS` is no longer exported. The RM04 test imports its concurrency
  and assertion types.
- **Kept:** `media_type` in the table (the issue specifies it); `"MOVIE"` as a
  string (the existing repositories' convention).

Review round 2 (`code-review`, uncommitted changes against `f15512e`, 2026-11-18):
- **Spec:** the double-tap block applied across every card and list, so a quick
  dismissal of a different card was silently ignored → now scoped to the same
  slot of the same list (browser check added). A failed dismissal left a dead
  Undo toast open → it closes (browser check added). The Undo toast held open
  while focused is kept and recorded as a deliberate deviation. Undo after a
  recomputation may shift positions → recorded above.
- **Standards:** `RecommendationDismissals.undo` set the user's refresh flag
  (Feature Envy) → moved to `PersonalizedRecommendationService.undoDismissal`;
  `undo` now only deletes and reports whether it did. `findTmdbIds` →
  `findTmdbIdsByUserIdAndMediaType`. `MovieGrid` and `PosterShelf` built the same
  dismiss callback → shared `dismissFromList`. Comments say "excludes", not
  "hides". The module-wide `lastDismissAt` is gone.
- **Checks after round 2:** `./mvnw test` (317 tests, 0 failures, 2 skipped);
  `npx tsc --noEmit -p .`, `npm test`, `npm run build`;
  `node tests/browser/recommendation-dismissal.cjs` (all 5 scenarios passed).
  Mutation: restoring the block across every card fails the new "another card"
  check.
- **Kept:** `"MOVIE"` as a string; the copied `loadChromium` helper (the existing
  browser scripts' pattern); `(userId, tmdbId)` arguments; the branch name. The
  `Toast` changes stay in this change set and are listed separately at the review
  checkpoint.
