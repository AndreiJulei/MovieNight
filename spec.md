# MovieNight product specification

Status: agreed product direction, with feature-level design and validation still
required. This is the overall product contract. It is not a single
`ready-for-agent` implementation ticket and does not certify the working tree.

Roadmap task 0 checks the existing application and records its baseline; it does
not replace this contract or settle later feature-level decisions. See the
[2026-10-13 baseline validation](docs/features/000-baseline/report.md) for
the audited commit, actual check results, and remaining verification gaps.

## Problem statement

A person needs one place to organize what they plan to watch and what they have
watched, retain their opinions, and find useful next choices from discovery,
accepted friends, and their own viewing history.

## Solution and release boundary

Build a publicly deployed MovieNight application for people who want to manage
their viewing and discover titles, including users beyond the owner and their
friends. Deliver and verify the movie workflow in small steps using the existing
application, then follow [roadmap.md](roadmap.md) through production readiness,
deployment, and public release. Early slices are developed and tested locally;
the release goal includes deployment. Anime films remain deferred.

## User goals

- Sign in and keep a personal watchlist and watched history.
- Browse/search titles and open details with posters and available metadata
  without changing personal collections.
- Deliberately save titles, mark them watched, and retain optional ratings/notes.
- Create, rename, and delete private custom lists independently of library
  membership.
- Accept friendships and share viewing status/ratings while keeping notes private.
- Discover choices from accepted friends and personal watched history, with
  sources and limitations explained.
- Discover movies, TV, and anime TV with distinct catalog identities.
- Use the publicly deployed app with supported onboarding and data retained
  across restarts and releases.

## Product rules

### Catalog and personal ownership

- Posters are remote URLs or provider paths resolved into URLs; poster image
  bytes are not stored as database blobs for this release.
- Browsing may cache discovery summaries. Opening details may fetch and persist
  reusable catalog metadata. Neither action creates a library entry.
- Adding to watchlist, marking watched, or adding to a custom list requires an
  explicit user action. These operations may also fetch missing catalog data.
- Catalog identity must distinguish provider resource type and provider ID.
  A movie and TV series with the same numeric ID are different titles.
- Anime TV is a discovery classification of a TV title, not a second identity.

### Library and custom lists

- A user has at most one library entry for a title.
- Watchlist and watched are mutually exclusive states. Marking a title watched
  moves it out of watchlist or creates a watched entry directly.
- Personal ratings are optional, with valid values 0, 0.5, 1, ... through 10.
  Missing and zero must remain distinct throughout storage and display.
- Private notes are owner-only. Friends can see viewing status and ratings.
- Custom lists are owner-only and independent of library membership. A title
  can appear once per custom list and in several different lists.
- Removing a title from a custom list or deleting that list does not change
  the title's library entry.
- Custom-list sharing and the backend's existing `DROPPED` status are outside
  the initial product contract.

### Friendship and recommendations

- A friendship invitation grants no friend-library access until accepted.
  Removing an accepted friendship revokes friend-only access.
- Rated friend suggestions use accepted friends' watched titles. The score is
  average personal rating multiplied by the distinct friends who rated the
  title, using only supplied ratings. A supplied zero participates in scoring.
- Titles on friends' watchlists are presented as a separate source, not mixed
  into the rated ranking without an explanation.
- Personal recommendations use the user's watched history. Unwatched rated
  records are not substitutes for watched history.
- Friend and personal recommendations exclude the user's watchlist and watched
  titles. Custom-list membership alone does not imply library membership.
- Missing history or inadequate model coverage produces an explanatory state.
  General discovery may be offered, explicitly labelled as such.
- API failures must not silently become an empty-result success or a different
  recommendation source presented under the original label.

### Persistence and feedback

- A successful save must be recoverable after reload. UI feedback must account
  for pending and failed persistence, including any optimistic updates.
- A failed write must not remain presented as a confirmed success.
- Provider failures and missing images need usable states rather than blocking
  the rest of the library. Exact retry and fallback behavior belongs in the
  affected feature spec.

### Deployed release

- Public deployment is a required roadmap milestone. Broader access to the app
  does not make users' notes, custom lists, or friend-only data public.
- User data must survive application restarts and releases. The production
  persistence and migration approach requires an agreed deployment feature spec.
- Provider credentials remain server-side. Development-only endpoints and
  authentication/recovery shortcuts must be addressed before public release.
- Hosting, HTTPS, production configuration, account onboarding, recovery,
  backup/restore, and operational checks are settled and validated in deployment
  feature specs rather than silently inferred from the local scaffold.

## Acceptance examples

| ID | Scenario | Expected result |
| --- | --- | --- |
| P01 | Open a discovered title's details, then reload the library | Title is absent from the library unless explicitly added |
| P02 | Add a title to watchlist twice, then reload | One watchlist entry |
| P03 | Mark that title watched with rating 7.5, then reload | One watched entry, no watchlist entry, rating 7.5 |
| P04 | Save rating 0, then remove the rating | First state is zero; second state is unrated |
| P05 | Add a title to two custom lists, then remove it from one | Other membership and library state remain unchanged |
| P06 | Try to read another user's notes or private custom list | Access is denied or private fields are omitted by the server |
| P07 | Invite a user, then accept, then remove the friendship | Access is absent, granted, then revoked |
| P08 | Two friends rate title A 8 and 6; one friend rates B 9 | A scores 14 and ranks above B at 9 |
| P09 | A candidate is already watchlisted or watched by the user | Candidate is excluded from friend and personal recommendations |
| P10 | User has no usable watched history | Explain the limitation; any general discovery is labelled |
| P11 | Movie and TV series share a numeric provider ID | Separate title records and separate user relationships |
| P12 | A save request fails | UI communicates failure and does not claim confirmed persistence |
| P13 | Restart or release the deployed application, then sign in | User library, ratings, notes, and custom lists are retained |
| P14 | A user outside the owner's friend group follows the supported onboarding flow | They can use their own account without accessing another user's private data |

## Implementation and testing decisions

Use the existing frontend, API, persistence, and recommendation components as
the baseline. Separate shared catalog records from user relationships. Enforce
ownership and friendship authorization on the server, not only in the UI.

Prefer externally observable tests: authenticated API requests and responses,
state recovered after writes, and visible browser outcomes. Existing backend
controller and service tests provide starting points. Select the highest
practical test boundary for each feature before implementation; do not invent
a test for every internal helper.

Typechecking, a production build, and backend tests are necessary engineering
checks but do not by themselves prove the product stories. Record user-flow
checks and failures in the feature record's validation section. Performance has
not been measured; no latency target or recommendation-quality score is promised.

## Implementation evidence

The [baseline audit](docs/features/000-baseline/report.md) records source gaps
and checks at the audited commit. Later feature records establish which changes
were locally validated or integrated; the
[watchlist slice](docs/features/001-reliable-watchlist-save/spec.md) is included
in local `main` at `3fc94fd`. See [roadmap.md](roadmap.md) for current work.
Historical gaps are evidence to investigate,
not exceptions to this contract or a current defect inventory.

## Further feature-level decisions

Settle these in the relevant feature interview: invitation lifecycle and duplicate
requests; title/list text limits and ordering rules; recommendation tie-breaking,
refresh triggers, and TV coverage; cache freshness and retries; rating updates;
and the automated browser-test approach. A dependent feature remains blocked
until its own questions and acceptance criteria are resolved.

Deployment design must also settle the hosting and database choices, onboarding
policy, supported recovery flow, configuration, and operating requirements.

## Out of scope for the initial deployed release

Public custom-list sharing, anime films, episode-level tracking, webhook
integrations, new ML training methods, and numeric performance guarantees.
Existing code may contain these capabilities; their presence does not expand
the agreed release scope.
