# MovieNight roadmap

Deliver one reviewable slice at a time. Each row is a milestone; its first slice
starts the work and does not establish completion of the whole milestone.
Order labels 9a–9d insert the 2026-10-25 priorities before deployment without
renumbering existing feature records; these labels are not feature IDs.

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
| 9a | Desktop and phone usability | Fix desktop signup panel overflow; verify core flows in responsive phone and desktop layouts with touch/keyboard access |
| 9b | Meaningful discovery and recommendations | Quality-filter popular picks, rank Top Rated with rating confidence, and improve personal relevance explanations; evaluate optional critic enrichment |
| 9c | Additional discovery results | Load more category results with bounded work, stable ranking, typed deduplication and current watchlist/watched exclusions |
| 9d | Main-page logo rotation | Display a different user-approved `/mainPageLogo` asset on each reload; exact filenames and selection order pending user input |
| 10 | Staging and public release | Deploy over HTTPS; verify access, privacy, restart/release retention, and backup/restore |

Public deployment is required for the initial release. Anime films, public
custom-list sharing, episode tracking, and webhook integrations remain deferred.
Feature 009 selects Supabase PostgreSQL as the hosted destination; the existing
[feature 010 draft](docs/features/010-staging-release/spec.md) selects restricted
Render/Supabase staging. These choices do not establish deployed readiness.
Correctness dependencies may move earlier: resolve identity collisions before
shipping a slice that exposes them.

## Current work

Priority update on 2026-10-25, based on local inspection only; no remote fetch.
The starting branch is `feat/009-durable-storage` at `3fa4c6b` with the feature-010
spec as an existing untracked file. This is not a new integration or runtime
validation claim. Current branch history includes implementation commits through
feature 009; consult the feature records for their actual evidence and limits:
[personal recommendations](docs/features/006-personal-movie-recommendations/spec.md),
[TV/anime TV](docs/features/007-tv-anime-tv/spec.md),
[local demo](docs/features/008-production-readiness/spec.md), and
[durable-storage validation](docs/features/009-durable-storage/validation.md).
Historical local API/storage passes do not certify browser or hosted behavior.

Next, specify **9a: desktop and phone usability**, including the reported desktop
account-creation fields extending below their panel. Preserve the current visual
identity and existing product rules. Verify responsive layouts and essential
interactions in a browser; record physical-device coverage separately. This is
mobile web support, not a native app or a requirement to deploy now.

Then specify **9b: meaningful discovery and recommendations**. Existing source
uses TMDB popularity and raw vote-average ordering with vote-count floors (movie
Top Rated: 1,000; TV: 500; anime TV: 200). Merely adding a vote floor is not a new
solution. Define confidence-aware ordering, quality/release eligibility, honest
source labels and personal-history relevance. Evaluate critic data access,
coverage and cost before selecting it; do not promise that a particular classic
always ranks above a newer title. Keep friend scoring unchanged.

Follow with **9c: additional discovery results**, preferably an explicit Load more
button. The scheduler currently fetches a bounded cache of up to three provider
pages per category on full refresh; extending results requires backend candidate
retrieval as well as UI changes. The observed 41 TV titles are a user report,
not a diagnosed hardcoded limit. Settle batch/cap sizes, stable ordering,
exhaustion/error behavior and refreshed library exclusions with the 9b policy.

Add **9d: main-page logo rotation** as a small slice before staging. Use only the
logos the user explicitly selects from `/mainPageLogo`, with a different logo on
each reload when multiple assets are approved and no change on ordinary
rerenders. Keep desktop/phone sizing and accessible branding intact. Confirm the
exact filenames, asset path and random-versus-sequential behavior before
implementation; no assets are selected by this documentation update.

These priorities implement the product direction in [spec.md](spec.md#product-rules).
They are planned, not implemented or validated. Keep them as roadmap entries until
each slice is selected and its feature contract/test boundary is settled. No
tracker publication, application changes, provisioning or deployment is part of
this documentation update. Revisit feature 010 afterward; public release remains
the eventual goal and the existing staging contract is preserved.

### Dependency preflight — 2026-10-21

Historical source inspection before features 006–009; the observations below
are not a current defect inventory or the next-work selection.

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
