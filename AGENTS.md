## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `AndreiJulei/MovieNight`.
Before tracker operations, read `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels.
Before triaging, read `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` and `docs/adr/`.
Before exploring the codebase, read `docs/agents/domain.md`.

## Human review

Before implementation, summarize the intended outcome, scope, and likely files.
Before committing, present every changed file with its reason, the user-visible
before/after behavior, checks actually run, and remaining limitations. Include
new/deleted files and identify unrelated changes. Provide commands to inspect
the proposed diff. Follow `docs/movienight-workflow.md` for the review checkpoint.
Implement and verify within the agreed scope; wait for explicit approval of the
reviewed change set before committing. Push and merge require explicit authorization.
This project rule overrides a skill's automatic commit step.
