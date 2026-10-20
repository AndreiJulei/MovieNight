# MovieNight roadmap

Deliver one reviewable slice at a time. Each row is a milestone; its first slice
starts the work and does not establish completion of the whole milestone.

| Order | Milestone | First verifiable outcome |
| --- | --- | --- |
| 0 | Baseline audit | Record current behavior, checks, and implementation gaps |
| 1 | Reliable movie library | Explicit watchlist saves survive reload; failures remain retryable |
| 2 | Watched history and ratings | Mark a movie watched; preserve unrated, 0, and 7.5 after reload |
| 3 | Private custom lists | Persist owner-only lists independently of library status |
| 4 | Accepted friendships and privacy | Invite, accept, and revoke access; keep notes private |
| 5 | Friend suggestions | Rank accepted friends' watched/rated titles; label watchlist suggestions separately |
| 6 | Personal movie recommendations | Use watched history, exclude library titles, and explain insufficient coverage |
| 7 | TV and anime TV | Track movie/TV identities separately; classify anime TV without duplicates |
| 8 | Local demo validation | Verify product flows with separate accounts and reproducible setup |
| 9 | Production readiness | Specify and verify durable storage, migrations, onboarding, recovery, secrets, and operations |
| 10 | Staging and public release | Deploy over HTTPS; verify access, privacy, restart/release retention, and backup/restore |

Public deployment is required for the initial release. Anime films, public
custom-list sharing, episode tracking, and webhook integrations remain deferred.
Hosting and database choices are open until the deployment feature is specified.
Correctness dependencies may move earlier: resolve identity collisions before
shipping a slice that exposes them.

## Current work

Local Git inventory on 2026-10-21; remote state was not fetched. These are slice
integration facts, not certification that entire milestones or the release are complete.

- Local `main` at `3fc94fd` includes the [baseline audit](docs/features/000-baseline/report.md)
  (`a775f3c`), [watchlist slice](docs/features/001-reliable-watchlist-save/spec.md)
  (`9a585ef`), [watched history/ratings](docs/features/002-watched-history-ratings/spec.md)
  (`5a9b2c9`), and [private custom lists](docs/features/003-private-custom-lists/spec.md)
  (`b36ae89`).
- `feat/005-friend-suggestions` at `b9f6b96` adds [accepted friendships/privacy](docs/features/004-accepted-friendships-privacy/spec.md)
  (`b94cb81`, review fix `75597e5`) and [friend suggestions](docs/features/005-friend-suggestions/spec.md)
  (`b9f6b96`). These commits await integration into local `main`; merge requires
  explicit authorization. Feature-003 record corrections are also in `b94cb81`.
- Next feature to specify: movie-only personal recommendations (milestone 6).
  Preserve the full release scope and existing human-review requirements.

### Dependency preflight — 2026-10-21

Source inspection found no production database or full identity-migration blocker
for movie-only milestone 6. Specify watched-movie seeds, movie-only candidate
metadata and library exclusions, and honest empty/error states. Keep movie/TV
recommendation writes from colliding: the persisted recommendation key currently
omits resource type, while recomputation processes multiple categories.
Test resource-type isolation, including equal numeric provider IDs.

The relevant code is `PersonalizedRecommendationService`, `SuggestionService`,
`UserMovieEntryRepository`, and frontend `useSuggestions`. This was a source
inspection, not runtime validation or the agreed acceptance contract for feature 006.

Before milestone 7, settle typed identity across catalog, recommendation cache,
frontend IDs, and exclusions together with the storage/migration approach. Full
movie/TV coexistence requires schema work; hosting and unrelated operations can
remain in milestones 9–10. Existing toolchain/setup limitations remain documented
in [tech-stack.md](tech-stack.md); address reproducibility alongside the next
affected checks and verify real-account flows in milestone 8.

Keep future work in this table until selected. Create its feature record when
specification begins. Link the GitHub issue once published; mark a slice complete
after required validation and integration. Reassess priorities between slices.
See [the workflow](docs/movienight-workflow.md) for the next step.
