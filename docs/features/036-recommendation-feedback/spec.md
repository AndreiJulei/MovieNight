# Recommendation feedback (PD-19 – PD-22)

Status: #37 locally validated 2026-11-18. Pending review checkpoint approval.
#38–#40 not started.
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

## Out of scope for #37

- The director, acclaimed and dismissal work (#38–#40). A first draft is in a
  local stash, not in this change set.

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
