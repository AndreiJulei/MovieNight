# Understanding spec-driven development

Spec-driven development makes an agreed behavior contract the input to coding
and the reference for validation. Writing Markdown alone is not enough: the
useful cycle is clarify, specify, implement, compare the result with the spec,
and adjust the plan as evidence arrives.

For example, “add ratings” leaves important questions unanswered. “A watched
title can be unrated or rated from 0 to 10 in half-points; saving and reloading
preserves 0 and 7.5” supplies a contract you can demonstrate and test. The current
MovieNight UI/backend discrepancy shows why that precision matters.

## The documents have different jobs

The constitution is `mission.md`, `tech-stack.md`, and `roadmap.md`: why the
project exists, its engineering context, and what to do next. MovieNight's
root `spec.md` defines overall product behavior. A feature spec covers one
small change with concrete acceptance criteria.

For a small feature, keep the outcome, acceptance criteria, essential decisions,
and validation in one record. Add a separate plan only when the work needs a
larger task graph. A proposed check belongs with the approach; an actual command,
result, and observed outcome belong in validation. Record planned checks as
not run until executed. Test scripts live with application test tooling.

Local drafts capture decisions before publication. Published feature contracts
and work status live in GitHub Issues; local feature records then link to that
contract and retain evidence. Keep the roadmap short and specify each slice
when selected. The root product spec supplies shared rules across features.

The glossary gives domain words one meaning. An ADR explains a consequential
choice and its trade-off, such as a future production database choice. Create
ADRs only when the decision is costly to reverse, surprising without context,
and the outcome of real alternatives. Routine implementation choices need no
ceremony. ADRs are created lazily under `docs/adr/`.

## Specification, implementation, validation

1. Describe the problem and user-visible outcome. Check what code already does.
2. Interview for decisions the code cannot answer. Use edge cases, not only
   the happy path. Record what is agreed and what remains open.
3. Write acceptance criteria and agree on test boundaries. Freeze the feature
   scope for this implementation cycle; resolve changes deliberately.
4. Implement one narrow path through the needed layers. A useful slice might
   save a watchlist entry through UI, API, persistence, and reload.
5. Run checks and review both code quality and agreement with the spec.
6. Fix findings, record evidence, merge, and reassess the roadmap.

A spec evolves when you learn something. Edit it when intent changes, and make
the change explicit; avoid rewriting it afterward merely to excuse accidental
implementation behavior. Requirements drive checks; checks expose discrepancies.

## What a skill does

A skill is a folder containing `SKILL.md` instructions and possibly references,
scripts, or templates. It teaches an agent a repeatable workflow. Reading a skill
does not install application dependencies or automatically execute every step.
A skill can work without an MCP server. See [OpenAI's skills explanation](https://developers.openai.com/plugins/concepts/skills).

The installed MovieNight skills give this process specific actions:

- `grill-with-docs` combines questioning with glossary and decision records.
- `to-spec` synthesizes an agreed feature and publishes a GitHub spec issue.
- `to-tickets` proposes small vertical slices and their blocking relationships.
- `implement` builds the selected work, uses tests, reviews, and commits.
- `implement-spec` orchestrates a larger ticket graph on an integration branch.
- `code-review` compares a fixed change range against standards and a spec.

The familiar `/skill-name` notation in your notes names these workflows.
Use the skill picker or attach the installed skill in this interface, together
with the file or issue reference it should operate on. Plain, precise requests
also work. Local `SKILL.md` instructions are the source for each skill's behavior.

## MCP, tools, and skills

MCP means Model Context Protocol. It connects an agent to tools and external
context through a server. For example, a documentation MCP server can expose
search and page retrieval. A skill tells the agent how to organize a task; a
tool performs an operation. An MCP connection supplies access, subject to its
permissions. It is not another name for a skill. See [OpenAI's MCP guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

For this repo, the configured issue workflow uses the `gh` CLI. GitHub access
does not require adding an MCP integration just to use that existing workflow.
Neither a skill nor a connector automatically grants authorization for every
possible external action.

## Webhooks

A webhook delivers an event to an HTTP endpoint when something happens. For
example, GitHub can notify a server when a pull request opens. The receiver
then handles that event; this differs from repeatedly polling for changes.
See [GitHub's webhook explanation](https://docs.github.com/en/webhooks/about-webhooks).

MovieNight's application webhooks and an agent's MCP tools have different jobs.
A future MovieNight webhook could notify another service of a library change;
an MCP tool lets an agent interact with a connected service. Neither is required
to learn the spec workflow. MovieNight webhook delivery is deferred from the
initial release and needs its own event, authorization, failure, and validation
contract before expansion.

## Subagents and fresh context

A subagent can explore a bounded question or review changes in its own context,
then report findings to the primary agent. Independent exploration and review
can run in parallel. Assign clear deliverables, evidence, and ownership so two
agents do not edit the same files accidentally. See [OpenAI's subagent guide](https://learn.chatgpt.com/docs/agent-configuration/subagents).

Separate context can reduce attachment to an implementer's assumptions, but a
subagent is not guaranteed to find every bug. Give the reviewer the spec, change
range, and relevant standards. For parallel coding, use isolated worktrees and
a deliberate integration process.

Start a fresh task at a feature or ticket boundary once the required context is
in documents and issues. Carry pointers to the mission, feature spec, ticket,
base commit, and validation evidence. Do not rely on a fixed “140k tokens” rule:
context limits vary, and clearing a chat does not clear unfinished Git work.

You can answer interview questions normally and steer work while it continues.
When a decision gates the design, the agent must wait for that answer while
continuing independent work where possible. No special interview mode is needed
for this workflow in the current conversation.

## Avoid unnecessary process

A small behavior change may need one spec and one issue. A larger feature may
need a parent spec and several dependent tickets. Split by independently
demonstrable behavior, not by “database ticket, API ticket, UI ticket.” Replan
between features rather than expanding an implementation without updating its
contract. The objective is understandable, verified progress.

This repo's one-record default is a documentation convention chosen to reduce
repetition. `ask-matt` routes work by its size and uncertainty; it does not
prescribe file counts. The installed `to-spec` template asks for extensive user
stories. When requesting concise output, specify that each story or acceptance
criterion should add a distinct behavior, and use the outcome paragraph instead
of repeating the same requirements in several forms.
