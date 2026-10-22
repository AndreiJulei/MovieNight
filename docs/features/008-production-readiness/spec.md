# Reproducible local demo validation

Status: agreed unpublished local contract, confirmed 2026-10-22. Specification
only; implementation and runtime validation have not started for this slice.
Roadmap: milestone 8 (Local demo validation), preparing for separate milestone 9
(Production readiness). The directory name records the requested feature-008
location; this contract does not select production infrastructure.
Product requirements: P01–P12; P13/P14 deployment certification remains deferred.
GitHub issue: not published.
Fixed specification base: `d247114e08c9025b3a2b4c97a4a6844ccbace580` on
`feat/007-tv-anime-tv`. Starting worktree was clean; no remote fetch.

## Outcome

A person can start an isolated MovieNight demo from a fresh checkout using
documented setup, then manually verify existing product flows with three separate
accounts through the real browser app and API. Deterministic external-provider
fixtures make the walkthrough repeatable without real provider credentials.
Recorded evidence distinguishes observed behavior, failures and unverified
boundaries. This establishes local-demo evidence before production design;
it does not certify the application for public release.

## Acceptance criteria

| ID | Given / when | Expected result |
| --- | --- | --- |
| DEMO01 | Follow tracked setup instructions from a fresh checkout using Java 21, Node 22 and the declared pnpm version | The real frontend/backend start with explicit secret-free demo configuration and a dedicated disposable H2 database. The documented path does not depend on ignored local properties, ignored Figma files, real provider credentials or the author's cached setup. Prerequisites, configuration, start/check/stop/reset commands and runtime versions are recorded. Demo-only configuration remains confined to the demo path. |
| DEMO02 | Start the deterministic external-provider fixtures and controlled recommendation data; switch documented success, empty and failure cases | Movie, TV and anime TV metadata, equal numeric movie/TV provider IDs, recommendation candidates and usable watched-movie seeds are reproducible. The application API, authentication, services and persistence remain real. Fixtures substitute external services only; personal library/list/friendship data is created through supported app/API actions, not direct database seeding. No live provider key is required or recorded. |
| DEMO03 | Create three accounts through supported browser sign-up/sign-in, sign out and switch between them | Each can use its own account without injected tokens or identities. Prior-account library, notes, lists and recommendations do not appear in the next account. Re-login recovers the correct owner's confirmed data. Controlled recommendation fixtures support the agreed personal-history walkthrough without changing scoring rules. |
| DEMO04 | Browse/search movie, TV and anime TV, open details, then inspect the library/lists; include equal numeric movie/TV provider IDs | Reads create no personal membership. Movie/TV identities and metadata stay separate. Anime TV shares TV resource identity, appears once and remains separate from the TV Series category under feature 007's classification rule. Missing optional metadata/posters uses existing honest fallback behavior. |
| DEMO05 | Deliberately save equal-ID movie/TV titles to watchlist, repeat saves, mark watched, exercise unrated, 0 and 7.5, clear a rating and reload | Confirmed saves recover via in-app navigation after reload and re-login. Each owner has one library entry per typed title; watchlist/watched are exclusive, missing differs from zero, fractions survive and the other resource type is unchanged. Failed writes do not claim confirmed persistence and remain retryable. |
| DEMO06 | Save private notes, organize titles in two private custom lists, repeat a membership, remove it from one list and delete that list | Owner reads recover confirmed values/memberships. Remaining list membership and library state are unchanged. Custom-list-only titles do not become library entries. Another account cannot read notes/lists or mutate the owner's data, as checked through targeted authenticated API probes as well as the UI. |
| DEMO07 | Use separate accounts to invite, accept and remove a friendship; read permitted data at each stage and as an unrelated third account | Pending/unrelated accounts have no friend-library access; accepted friends see permitted status/ratings but never private notes/lists. Removal revokes access on the next read. Manual browser steps and targeted API probes record the server's actual authorization result. |
| DEMO08 | Prepare accepted-friend watched/rated data and watchlist-only data, then read friend suggestions | Existing score/ranking rules, supplied zero handling, separately labelled watchlist source and owner's current library exclusions are observable. Pending/unrelated users supply no friend results. Movie-only recommendation boundaries remain as agreed in features 005/007. |
| DEMO09 | Prepare watched-movie history with controlled recommendation coverage; read Home/personal recommendations, save a candidate and reload; also exercise no history and insufficient coverage | Existing movie-only scoring/order, current typed library exclusions and explicit source/limitation states hold. TV history and custom-list-only membership do not become movie seeds or wrongly exclude a distinct movie. A confirmed library save removes that movie from personal results. General discovery never silently fills personal recommendations. |
| DEMO10 | Exercise documented provider failure/retry, valid empty results and a failed write during the walkthrough | Error differs from valid emptiness, pending/failure feedback is visible, no fabricated metadata or silent source substitution appears, and successful explicit retry recovers. Failed writes leave confirmed data intact. Saved library data remains usable during provider failure. Record the reproducible failure controls and actual observations. |
| DEMO11 | Stop and reset only the explicitly selected demo environment, then follow setup and the checklist a second time from clean demo state | Reset is confined to the dedicated disposable demo data and cannot silently target a personal database. The second clean run succeeds with independently created accounts/data. Record both runs; this is repeatability evidence, not process-restart data retention. |
| DEMO12 | Complete the manual checklist, API probes and required engineering checks against a fixed implementation revision | Every acceptance ID has passed/failed/blocked/not-run evidence with sanitized expected/actual results and practical limits. Failures and any bounded repairs link to acceptance IDs; affected steps are rechecked after repairs. Missing evidence cannot be called a pass or full milestone/release completion. |

## Decisions and test boundary

### Agreed decisions

The user selected milestone 8 first, a new feature 008 record, manual real-app
checks, deterministic external-provider fixtures, the full existing-flow
walkthrough, declared-runtime fresh-checkout setup, targeted privacy API probes
and bounded acceptance repairs. The user confirmed the complete understanding
on 2026-10-22. No open product decision blocks this slice. This local record
governs until deliberate publication under [the workflow](../../movienight-workflow.md).

Reuse the [recorded dependency preflight](../../../roadmap.md#dependency-preflight--2026-10-21),
[product rules](../../../spec.md), [glossary](../../../GLOSSARY.md), and existing
feature contracts, particularly [personal movie recommendations](../006-personal-movie-recommendations/spec.md)
and [TV/anime TV](../007-tv-anime-tv/spec.md). Do not reopen identity, anime
classification, ratings, privacy, explicit-save semantics, list independence or
recommendation scoring. The preflight is source evidence, not runtime validation.
The roadmap's current-work text predates this fixed base; this task does not
rewrite integration history or declare milestone 7 complete.

Source inspection found that existing browser scripts intercept the application
API and inject authentication. Existing authenticated persistence tests bypass
sign-up/sign-in by creating users and JWTs directly. Those checks are reusable
within their recorded boundaries, but cannot establish this real-account demo.
The Vite configuration imports ignored Figma configuration; engineering notes
record ignored backend configuration and template cleanup needs. Address those
dependencies for the documented demo path. Do not copy local secret values into
tracked files, fixture logs or evidence.

Use isolated disposable H2 for this slice. Production database selection,
production migration procedures and transfer of existing user data are not
decided here. Fixture setup may control catalog/provider/similarity inputs;
accounts and personal relationships are created through supported flows.
Fixture mechanism, script names and configuration shape are implementation
choices within the observable contract. Provide explicit success/empty/failure
controls without changing production product rules or silently using real services.

Manual browser execution deliberately supersedes features 006/007's browser
exclusions for this slice only. No automated browser runner is required. Use a
named browser/version and real sign-up/sign-in with three accounts; authenticate
targeted API probes through those legitimate sessions/tokens. Sanitize evidence
and never persist tokens, passwords, secret values or private personal data in
the repository. Saved-state checks reload and navigate in-app, since the current
router intentionally returns to Home rather than restoring URL/history state.

Later implementation may add setup/fixture tooling and narrowly necessary fixes
to existing flows that fail this contract. Record each defect, affected acceptance
ID, repair and recheck. Flag expansion before editing; broader redesigns or new
behavior require another agreed scope. Implementation is not authorized by this
specification-only task. Before implementation, inventory the actual worktree,
state the intended outcome/exclusions and likely files, and establish baselines.

Likely later seams: demo setup/check/reset documentation and scripts; frontend
Vite/configuration and package tooling; backend demo configuration, provider
fixture wiring and controlled similarity data; a manual checklist and sanitized
evidence in this feature record. Existing auth, catalog, library, list, friendship
or suggestion code changes only for a demonstrated acceptance failure. No new
domain term or architectural trade-off calls for a glossary change or ADR here.

### Agreed verification boundary for implementation

The primary boundary is a human-executed real-browser walkthrough against the
running frontend/backend and isolated H2, paired with reproducible authenticated
API probes for server privacy that the UI cannot expose. Do not intercept app
API responses, inject authenticated state or substitute repository assertions for
observed saves and independent reads. Reuse existing fixture scenarios where
helpful while preserving the real-app boundary. External providers alone are
substituted; recommendation input data is deterministic.

Keep the checklist and reproducible commands with the feature/tooling and link
them here. For each step, identify account, fixture mode, action, expected result,
actual result and acceptance ID. Record date, implementation revision, runtime
and browser versions, both clean-run outcomes, and sanitized API responses/status
where relevant. Capture failures honestly; planned/manual steps not executed are
Not run. Reload/re-login evidence proves the running app's persistence boundary,
not data retention across backend restarts, releases or database migration.

Reuse backend suites for exhaustive edge permutations and regression coverage;
the manual walkthrough demonstrates representative real-account paths rather
than duplicating every automated test. Establish affected baselines, then run
focused checks for repairs, the full backend suite, strict frontend typechecking,
production build and diff checks. Use declared Java 21, Node 22 and pnpm rather
than treating machine-specific fallbacks as verification of that setup. Resolve
or explicitly report environment blockers; historical Mockito-agent/npm
workarounds in [tech-stack.md](../../../tech-stack.md) are not fresh passes.
Use isolated configuration so checks cannot inherit real provider credentials.

Planned engineering commands, from the respective application directories:

```sh
# repo/MovieNightBackend (with explicit isolated demo/test configuration)
./mvnw clean test
# repo/MovieNightFrontend
pnpm exec tsc --noEmit
pnpm build
# repository root
git diff --check
```

Add actual setup/check/reset commands and focused test names during implementation;
none exists for this new demo contract yet. Obtain independent Standards and Spec
reviews against the agreed contract and fixed implementation base, stating the
actual comparison boundary. Complete the workflow's human review checkpoint
before any commit. Manual observations do not establish timing/race correctness
for every interleaving, comprehensive accessibility or live-provider quality.

## Out of scope

- Application implementation or demo execution in this specification task.
- Automated browser runner, navigation/history/deep-link changes, redesign,
  new product behavior, scoring changes or expanded recommendation categories.
- Live-provider connectivity/quality certification, comprehensive accessibility,
  performance or concurrency certification, and numerical quality/latency targets.
- Production database selection, production migration or legacy-data transfer,
  process-restart/release retention, backup/restore, hosting/HTTPS, public deployment,
  secrets operations, onboarding hardening and account recovery. These remain
  milestone-9/10 work; local sign-up verification does not certify P14.
- Destructive changes to personal databases or unrelated files, tracker publication,
  roadmap integration updates, commit, push and merge under this task.

## Validation — specification only, 2026-10-22

Git inventory and read-only document/source inspection were performed at the fixed
base above. No runtime baseline, application test, browser walkthrough, provider
check or migration was executed for this slice. Feature 007 still records
verification/review in progress at this base; absent final evidence is not proof
of either success or failure. Historical results do not certify feature 008.

| Acceptance ID | Result | Planned evidence / limit |
| --- | --- | --- |
| DEMO01 | Not run | Fresh-checkout setup on declared runtimes; tracked configuration and isolation checks. |
| DEMO02 | Not run | Deterministic provider/similarity controls; real app API and no real-key dependency. |
| DEMO03 | Not run | Three browser-created accounts; sign-in/out, switching and re-login evidence. |
| DEMO04 | Not run | Manual discovery/details, equal-ID and anime classification checks; membership reads. |
| DEMO05 | Not run | Manual typed library/rating/write-failure steps; reload/re-login recovery. |
| DEMO06 | Not run | Manual notes/list independence; cross-account authenticated API probes. |
| DEMO07 | Not run | Invite/accept/remove walkthrough and server privacy probes with three accounts. |
| DEMO08 | Not run | Controlled accepted-friend ranking/source/exclusion walkthrough. |
| DEMO09 | Not run | Controlled personal-movie results, save/exclusion, empty and coverage walkthrough. |
| DEMO10 | Not run | Documented provider/write failure controls, visible failure/empty/retry observations. |
| DEMO11 | Not run | Safely isolated reset and second clean setup/walkthrough. |
| DEMO12 | Not run | Acceptance-mapped sanitized evidence, engineering checks and independent reviews. |

Documentation checks: `git diff --check` and
`git diff --no-index --check /dev/null docs/features/008-production-readiness/spec.md`
reported no whitespace errors. A local link/ID check confirmed all eight relative
file links resolve and DEMO01–DEMO12 each has an acceptance row and a Not run
validation row. Git status showed only this new record; tracked diff was empty.
These checks do not change the runtime acceptance results above.

## Human review checkpoint — documentation only

Proposed scope: one new file, `docs/features/008-production-readiness/spec.md`,
containing the confirmed outcome, DEMO01–DEMO12, essential decisions, exclusions,
test boundary and planned evidence. No modified/deleted files or unrelated changes
are intended. Features 006/007 and application behavior remain unchanged. The
before/after change is a reviewable local-demo contract, not a validated demo.

Inspect the new file separately from tracked diffs, from the repository root:

```sh
git status --short --untracked-files=all
git diff --stat
git diff -- docs/features/008-production-readiness/spec.md
cat docs/features/008-production-readiness/spec.md
git diff --no-index -- /dev/null docs/features/008-production-readiness/spec.md
```

The last command returns 1 for the new-file difference. No staging, commit,
publication, implementation, push or merge is part of this task. Any later commit
requires explicit approval of the reviewed change set under
[the human-review rule](../../movienight-workflow.md#human-review-checkpoint).
