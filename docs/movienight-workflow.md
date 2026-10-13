# MovieNight: exact feature workflow

Read [the explanation](spec-driven-development.md) for the concepts. This guide
gives the sequence to follow in this repo. Keep `specEg.md` as your personal
notes and `CONTEXT.md` as the original overview; the agreed product contract
lives in [../spec.md](../spec.md).

The target audience includes users beyond the owner and friends, and the release
goal is a publicly deployed application. Validate early feature slices locally,
then complete the production-readiness, staging, and public-release milestones.
A local feature passing its checks does not by itself establish deployed release
readiness. Broader app access leaves the agreed data-privacy rules intact.

## Files and authority

| File | When to read or update it |
| --- | --- |
| `mission.md` | When deciding whether a feature serves the project |
| `tech-stack.md` | Before choosing implementation or verification tools |
| `roadmap.md` | Before choosing a slice and after validating/merging it |
| `spec.md` | Before feature design; update only for agreed product changes |
| `GLOSSARY.md` | Before naming domain concepts; update as terms are resolved |
| `docs/adr/NNNN-<decision>.md` | Only for a consequential resolved trade-off |
| `docs/features/<slug>/spec.md` | Agreed behavior for the selected feature |
| `docs/features/<slug>/implementation.md` | Plan, test boundaries, ticket links, progress |
| `docs/features/<slug>/validation.md` | Actual checks, review findings, results, limitations |
| `docs/agents/*.md` | Existing tracker, triage-label, and domain conventions |

Use the three files under `docs/templates/` as starting points for feature
documents. Replace placeholders; do not publish an unanswered template as ready.
GitHub issues carry active work status and blocking links. When publishing a
feature spec, link its repo file and make the agreed issue body match it. If
behavior changes, update both deliberately; do not maintain divergent contracts.

## Step 0: establish today's baseline

Run these read-only commands at the repo root:

```sh
git status --short
git branch --show-current
git log -5 --oneline
```

The exploration found substantial unfinished working-tree code. Review that
inventory before branching, committing, or merging. Preserve unrelated work;
do not reset the tree or sweep every modification into a feature commit.
Decide which current work to finish or isolate first.

Run the checks listed in `tech-stack.md`, if prerequisites are available. Record
existing failures separately from regressions introduced by the next slice.
Completion: you know the current branch, unfinished work, and baseline check
results. A new chat alone does not satisfy this step.

## Step 1: select one complete slice

Start with roadmap milestone 1: a discovered movie can be explicitly saved to
watchlist, survive reload, and report a failed save honestly.

Suggested feature folder: `docs/features/001-reliable-watchlist-save/`.
The folder is created when that feature interview begins; it is not assumed
implemented merely because the overall product spec exists.

Suggested request:

> Use grill-with-docs to specify reliable watchlist saving. Read the constitution,
> product spec, and existing code. Keep this slice to explicit add, duplicates,
> reload persistence, and pending/failed save feedback. Ask about unresolved
> behavior, propose test boundaries, and write its feature documents.

Completion: the slice has an agreed goal, exclusions, concrete examples, and no
unanswered question that blocks implementation. For this slice, settle duplicate
clicks, failure recovery, retry, and the chosen browser/API test boundary.

## Step 2: specify and publish

Create the feature `spec.md` from `docs/templates/feature-spec.md`. Assign stable
acceptance IDs so the implementation and validation can refer to the same cases.
Check the test boundaries with the user before building.

Suggested request:

> Use to-spec with docs/features/001-reliable-watchlist-save/spec.md. Synthesize
> the agreed decisions, confirm the test boundaries, and publish the feature to
> AndreiJulei/MovieNight. Add its issue link to the local feature documents.

Invoking `to-spec` authorizes its documented publishing workflow. Writing this
guide has not invoked it or created any issues. Once the feature is specified,
the published issue receives `ready-for-agent` according to the installed skill.
Completion: the agreed contract is reachable from the issue and local docs.

## Step 3: choose one issue or a ticket graph

For a small slice, implement its spec issue directly. Use `to-tickets` only when
the feature needs independently verifiable slices or prerequisite work.

Suggested request for a larger feature:

> Use to-tickets with the spec issue. Propose vertical slices and genuine blocking
> relationships. Let me review the breakdown before publishing it.

Record issue links and blockers in the feature `implementation.md`. A ticket
can start when all blockers are resolved. Layers alone are not useful slices.
Completion: every ticket has an outcome and acceptance criteria; dependencies
reflect actual constraints.

## Step 4: prepare isolated work

Agree on a clean base commit and a feature branch, or an isolated worktree when
the current tree contains unrelated work. Record the base SHA in the implementation
document. Use a short feature branch such as `feat/reliable-watchlist-save`.

For a larger parallel task graph, use `implement-spec` and its integration-branch
workflow. Keep independent implementers in separate worktrees. For this learning
project, begin with one slice and one implementer so the process is visible.
Completion: the intended change range is identifiable and unrelated changes
are protected.

## Step 5: implement against the contract

Suggested request:

> Use implement with issue #<actual-number>. Use the agreed test boundaries,
> preserve unrelated work, and record implementation progress and check results
> in the feature documents.

Use red/green tests where an appropriate behavior boundary exists. A failed-save
case should prove what the user sees and whether the saved state really exists;
it should not merely assert the name of an internal function.

The installed `implement` skill includes review and a commit. Therefore resolve
branch ownership and the change range before invoking it. Update the spec and
plan explicitly if a new discovery changes scope.
Completion: acceptance behavior works and relevant engineering checks pass, or
remaining failures are clearly recorded and prevent calling the feature done.

## Step 6: review and validate

Use an independent review of the committed feature range. The installed
`code-review` skill compares committed changes using a fixed point; it does not
cover unrelated uncommitted changes. Supply the base SHA and originating spec:

> Use code-review since <base-SHA>, against the feature spec issue and its local
> spec. Review standards and specification coverage separately.

Record actual commands and outcomes in `validation.md`. Include backend tests,
frontend typecheck/build, and the user-flow checks affected by the feature.
Map every acceptance ID to passed, failed, blocked, or not run. Never mark a
blocked provider-dependent check as passed.

Fix findings. Repeat checks affected by the fixes. Completion: required criteria
are met, no blocking review findings remain, and validation is reproducible.

## Step 7: merge and reconcile work tracking

Review the final diff and validation evidence. Prepare a PR when that is the
chosen merge workflow. Perform merge or publication only within the user's
authorization. Resolve the issues once their implementation is integrated and
validated; keep pending work open. Link the commit or PR in validation.

Update `roadmap.md` to reflect verified progress. Completion: the intended
changes are integrated and the tracker and documents agree about completion.

## Step 8: replan and begin fresh

Check the constitution for changes in vision, constraints, and priority. Decide
whether the next roadmap slice is still useful. Start a new feature task once
the required context is captured in files and issues.

Suggested fresh-task context:

> Read mission.md, tech-stack.md, roadmap.md, spec.md, and GLOSSARY.md. The next
> approved feature is <path/issue>. The base commit is <SHA>. Read its plan and
> validation evidence; explore current code before making changes.

Do not blindly copy the previous conversation. Carry the agreed intent and
evidence through document pointers, and interview again where decisions remain.
