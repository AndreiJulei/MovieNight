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

- [Baseline report](docs/features/000-baseline/report.md): audit recorded on
  2026-10-13; integration pending.
- [Reliable watchlist saving](docs/features/001-reliable-watchlist-save/spec.md):
  local validation recorded on 2026-10-13; integration pending on
  `feat/001-reliable-movie-library`.

Keep future work in this table until selected. Create its feature record when
specification begins. Link the GitHub issue once published; mark a slice complete
after required validation and integration. Reassess priorities between slices.
See [the workflow](docs/movienight-workflow.md) for the next step.
