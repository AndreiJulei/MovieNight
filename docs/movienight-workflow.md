# MovieNight feature workflow

Use [roadmap.md](../roadmap.md) to select work and [spec.md](../spec.md) for the
product contract. [The explanation](spec-driven-development.md) covers the
concepts. Public deployment is part of the initial release; local checks prove
only their stated boundaries.

## Document responsibilities

| Document | Purpose |
| --- | --- |
| `mission.md` | Audience, purpose, and success |
| `tech-stack.md` | Engineering context and verification entry points |
| `roadmap.md` | Short milestones, order, and links to selected work |
| `spec.md` | Product-wide rules and stable P01–P14 examples |
| `GLOSSARY.md` and `docs/adr/` | Domain terms and consequential decisions |
| `docs/features/<slug>/spec.md` | One selected feature: acceptance, essential decisions, and validation |
| `docs/features/000-baseline/report.md` | Dated baseline evidence |
| GitHub Issues | Published feature contracts, tickets, status, and dependencies |

Use [the feature template](templates/feature-spec.md) when a slice is selected.
Leave future features as short roadmap entries. Add a separate implementation
plan only when a larger task graph needs one. Keep test code with the app's
test tooling and link it from the feature record.

A local feature draft governs until publication. After publication, GitHub is
the authority for that feature's acceptance contract and work status; the local
record links to it and retains implementation/validation evidence. Consolidate
local acceptance text into the issue when publishing, leaving a summary/link
in the local record. Change the authoritative contract deliberately when intent
changes. Existing unpublished feature 001 keeps its local acceptance criteria.

## 1. Establish the starting point

Read the mission, roadmap, product spec, glossary, and relevant feature record.
Inventory Git state before editing or branching:

```sh
git status --short
git branch --show-current
git log -5 --oneline
```

Protect unrelated changes. Use the existing branch when appropriate or an
isolated branch/worktree when needed. Run relevant baseline checks from
[tech-stack.md](../tech-stack.md); record pre-existing failures separately.
Completion: the base revision, work boundary, and existing failures are known.

## 2. Specify one outcome

Use `grill-with-docs` for unresolved feature decisions. Write a short outcome,
stable acceptance IDs, essential decisions, test boundary, and exclusions in
one feature record. Include failures, duplicate actions, authorization, and
reload cases where relevant. Agree on the test boundary before implementation.
Completion: no unanswered question blocks the selected slice.

For example:

> Specify the next watched-history slice. Read the product contract and current
> code. Keep the outcome small, settle rating edge cases, and record acceptance
> criteria and the test boundary in one feature record.

## 3. Choose the execution size

For work that fits one session, use `implement` with the agreed behavior. For a
multi-session build, use `to-spec` to synthesize and publish the contract, then
`to-tickets` to propose independently verifiable vertical slices and blockers.
Follow that skill's approval step before publishing the ticket breakdown.
Work tickets with `implement`, or use `implement-spec` for its orchestration
workflow. A database/API/UI layer split is usually not an independently usable
slice.

Read [tracker conventions](agents/issue-tracker.md) before tracker operations.
Invoking `to-spec` includes publication; a request for local documentation cleanup
does not invoke that publishing workflow. Use links for tracker status rather
than maintaining another status table locally.
Completion: the next work item has acceptance criteria and genuine blockers.

## 4. Implement and verify

Use the agreed test boundary and the implementation skill's TDD/review flow.
Preserve unrelated changes. Record only essential implementation decisions and
scope changes; update the authoritative contract when intent changes.

In the feature's validation section, record the date and tested revision, map
all acceptance IDs to passed/failed/blocked/not run, and give commands, results,
review findings, and practical limitations. Use the most direct observable
checks available. Distinguish browser fixtures from real API persistence and
local checks from deployed behavior. Link scripts/artifacts; avoid run diaries.
Completion: required checks pass and blocking review findings are resolved.

The existing [watchlist record](features/001-reliable-watchlist-save/spec.md)
contains historical local results. Its relocated browser script is linked there.
Those results are evidence for the recorded worktree, not a fresh certification
of later changes.

## 5. Integrate and replan

### Human review checkpoint

Before implementation, state the outcome, exclusions, and likely files. Flag
scope changes as they arise. After implementation and verification, present:

- Every changed file (including additions/deletions), its reason, and related
  acceptance criteria; group repeated reasons while naming every file.
- The before/after behavior and a short scenario the human can try.
- Actual check results, review findings, and remaining limitations.
- The exact proposed commit scope and commands to inspect the changes.

Use `git diff --stat` and `git diff -- <path>` for tracked unstaged changes;
include `git status --short --untracked-files=all` so new files are visible.
New file contents need separate inspection before staging. If staged, inspect
`git diff --cached --stat` and `git diff --cached`. For committed work, use
`git show --stat <SHA>` and `git show <SHA> -- <path>`.

Wait for explicit approval of the reviewed change set before committing. If
the code changes after review, show the updated diff and checks for approval.
Push and merge require explicit authorization. This project rule overrides
the installed `implement` skill's automatic commit step.

Supply the spec source and fixed base to
`code-review`, whose normal comparison covers committed changes. Record any
review with a different boundary accurately.

Integrate within the user's authorization. Link the PR/integration revision,
reconcile GitHub work status, and update the roadmap only after validation and
integration. Reassess the next milestone and start a fresh task at a feature or
ticket boundary once the necessary context is captured.
Completion: the integrated revision, evidence, and tracker agree.
