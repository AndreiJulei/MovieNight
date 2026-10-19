# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `AndreiJulei/MovieNight`.
Use the `gh` CLI from this clone; it infers the repo from the remote.
Local feature records may hold unpublished drafts and validation evidence.
Once published, the GitHub issue governs the feature contract and work status;
replace the local draft contract with a summary/link and retain evidence locally.
The root `spec.md` remains the product-wide contract.

## Conventions

- Create: `gh issue create --title "..." --body-file <file>`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`.
  Apply label and state filters as needed.
- Comment: `gh issue comment <number> --body-file <file>`.
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: `gh issue close <number> --comment "..."`.

Use a temporary file containing actual newlines for multiline bodies.

“Publish to the issue tracker” means create a GitHub issue.
“Fetch the relevant ticket” means read the GitHub issue.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares issue and PR numbers. Resolve ambiguous references with
`gh pr view <number>`, falling back to `gh issue view <number>`.

## Wayfinding operations

- Map: one issue labelled `wayfinder:map`, containing Notes,
  Decisions-so-far, and Fog.
- Child: link each ticket as a sub-issue using the installed CLI's
  supported commands or GitHub API. If unavailable, add the child to a
  task list in the map and put `Part of #<map>` in the child body.
- Types: `wayfinder:research`, `wayfinder:prototype`,
  `wayfinder:grilling`, and `wayfinder:task`.
- Blocking: use native GitHub issue dependencies when available.
  The API requires the blocker’s database ID, not its issue number.
  Otherwise record `Blocked by: #<number>` in the child body.
- Frontier: the first open child in map order with no open blockers
  and no assignee.
- Claim: `gh issue edit <number> --add-assignee @me`.
- Resolve: comment with the answer, close the ticket, then append
  a summary and link to the map's Decisions-so-far.
