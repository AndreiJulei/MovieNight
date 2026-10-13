# MovieNight roadmap

Organize in small steps. Existing code is an unverified baseline; a visible
screen or a saved source file is not a completed milestone.

| Order | Milestone | Small first slice | Completion evidence |
| --- | --- | --- | --- |
| 0 | Establish the baseline | Inventory unfinished work and run existing checks | Record failures and current behavior; preserve unrelated changes |
| 1 | Reliable movie library | Add one discovered movie to watchlist and reload; handle a failed save honestly | Successful persistence, no implicit add, no false success on failure |
| 2 | Watched history and ratings | Move a watchlisted movie to watched; preserve 0 and 7.5 | One library state per title; unchanged optional rating after reload |
| 3 | Private custom lists | Create one list and add a discovered title independently of library status | Owner-only access, correct catalog identity, membership survives reload |
| 4 | Accepted friendships and privacy | Invite, accept, then read a friend's library without private notes | No access while pending; correct access after acceptance and removal |
| 5 | Friend suggestions | Rank a few accepted friends' watched/rated movies | Agreed scoring, exclusion, source separation, deterministic test data |
| 6 | Personal movie recommendations | Recommend from watched history, with a clear no-history state | Own-library exclusion; no generic results presented as personalized |
| 7 | TV and anime TV | Open and track a movie and TV series with the same provider numeric ID | Distinct identities; anime classification does not duplicate a TV title |
| 8 | Release candidate validation | Walk through the completed flows using separate user accounts | Product acceptance checks and reproducible setup notes |
| 9 | Production readiness and staging deployment | Choose hosting and persistence, then deploy one verified movie-library flow | Persistent data across restarts; production configuration, authentication/recovery, private-data access, and backup/restore verified |
| 10 | Public release | Make the validated app accessible to users beyond the owner and friends through the agreed onboarding flow | Deployed acceptance checks, HTTPS, operational checks, and release/rollback procedure |
| Later | Product extensions | Specify anime films, public sharing, or integrations separately | Separate approved feature specs |

Within each milestone, complete one reviewable vertical slice before expanding
it. Correctness work may gate an earlier slice: for example, provider identity
must be fixed before a slice exposes movie/TV collisions. The ordering is a
learning sequence, not a claim that all code must be rewritten.

Public deployment is part of the planned release, with local development and
verification supporting it. Hosting, production persistence, and onboarding
remain decisions for the deployment feature specs.

Anime films, public custom-list sharing, and webhook integrations are deferred.
Existing code for deferred capabilities does not make them release requirements.

## How to use this roadmap

For the next slice, follow [docs/movienight-workflow.md](docs/movienight-workflow.md).
Link its feature spec and GitHub issue here once they exist. Mark a milestone
complete only after its validation evidence is recorded and its changes are
merged. Revisit priorities between feature cycles.
