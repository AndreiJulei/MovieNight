# Restricted HTTPS staging

Status: agreed specification, 2026-10-23; not implemented or deployed.
Roadmap: milestone 10 (Staging and public release), first bounded staging slice.
Product requirements: hosted P13 verification; P01–P12 at the API boundary.
Public onboarding under P14 and browser certification remain deferred.
GitHub issue: not published. Fixed specification base:
`3fa4c6b971f7439a6418b1905d65a708200f81bd` on `feat/009-durable-storage`.
The worktree was clean before this documentation addition; no remote fetch.

## Outcome

A controlled tester can use the existing MovieNight API over HTTPS against
dedicated Supabase PostgreSQL and recover confirmed personal data after hosted
application/database restarts, an application release and a separate-target
backup restoration. Deploy the static frontend and Docker/Java 21 API on Render
Free. The sign-in screen and static assets may be publicly reachable; application
data and API use are restricted to controlled synthetic tester accounts.

This is an API-verified staging environment, not a public launch or certification
of browser behavior. Free-tier capacity and account quotas must support the
checks; an unavailable capability is a blocker, not permission to spend money or
substitute local evidence.

## Acceptance criteria

| ID | Given / when | Expected result |
| --- | --- | --- |
| STG01 | Build and deploy a fixed revision to Render Free static hosting and a Free Docker/Java 21 web service | Both URLs use valid HTTPS and redirect HTTP. Tracked, reproducible setup identifies the revision/artifact, explicit staging configuration, API origin, required runtime versions and readiness path. Frontend configuration points to the deployed HTTPS API without a localhost fallback. Only the agreed frontend origin receives CORS permission; arbitrary origins do not. All resources remain free, with chargeable overages/upgrades prevented rather than merely budgeted. Cold starts and quota suspension are documented. |
| STG02 | Produce deployment artifacts, supply server settings, or omit/incorrectly configure a required setting | Clean builds exclude ignored local properties, `.env` files, credentials and secret-bearing build arguments/layers. DB/migration/JWT/TMDB/OMDb secrets remain in explicit server-side configuration, outside frontend assets, logs and evidence. Missing or invalid configuration fails clearly without values, H2 fallback or destructive initialization. Ordinary tests do not inherit live keys. |
| STG03 | Provision testers, then call the deployed API anonymously, with invalid credentials, or with a controlled account | At least three separate synthetic accounts are created through controlled setup using application password hashing/validation. No default/shared account or open registration remains. Only login, necessary CORS preflight and minimal operational probes are unauthenticated. Existing anonymous catalog/discovery/data routes require authentication in staging. Public registration, forgot/reset-password shortcuts, H2 console, public-list and deferred webhook endpoints are disabled server-side, including for authenticated testers. No reset codes are returned or logged. The same restrictions apply on every exposed API hostname. |
| STG04 | Initialize and connect to the actual staging Supabase project, then inspect application access and grants | Record the actual PostgreSQL version, connection mode and successful TLS server-identity verification. Use the private `movienight` schema, versioned migrations and Hibernate validation, with distinct migration/runtime roles. Runtime DDL, ownership/role escalation and migration-history writes are denied. PUBLIC, Supabase anonymous/authenticated roles and Data API exposure cannot bypass server authorization to read application data. Local PostgreSQL grants are not evidence of these hosted properties. |
| STG05 | Use three independent accounts through real HTTPS; browse, save twice, mark watched, rate, write notes/lists, invite/accept/remove friendship, and independently read again | Existing P01–P12 rules hold at the API seam: reads do not create library entries; duplicate actions do not duplicate relationships; watchlist/watched are exclusive; unrated, 0 and 7.5 remain distinct; lists are independent and owner-only; notes remain private; friendship access exists only while accepted. Movie/TV equal numeric IDs remain distinct and anime TV retains TV identity. Personal recommendations use watched movies and current typed library exclusions, with honest source/error states. No new scoring or product rules are introduced. |
| STG06 | Create a personal-state snapshot through HTTPS, restart the deployed application, restart the hosted database non-destructively, then deploy a distinct compatible application revision | After each separate operation, sign in again and compare independent HTTPS reads: accounts, library statuses/ratings/notes, list memberships and friendship states retain their confirmed values and ownership. Record both release revisions/artifacts. Repeating a deployment of the same artifact is restart/redeployment evidence, not the complete release check. No reseeding, H2 import, personal-row SQL insertion, schema reset or cache substitution establishes retention. |
| STG07 | With normal traffic stopped, execute a supported preceding-schema upgrade, a failed transactional step and explicit forward repair/retry on a dedicated synthetic hosted target; repeat valid startup | Actual versioned migrations preserve HTTP-created personal state and typed constraints; failure rolls back the step without recording success. A correct retry succeeds, and completed versions are not reapplied. Checksum/drift errors and unavailable DB paths fail closed without resetting data or serving normal traffic. Record the source/target versions and mechanism. A prior-schema fixture is allowed; fresh initialization alone is not upgrade evidence. Applied migration history is never rewritten as repair. |
| STG08 | Deliberately fail a deployed write/read, then restore availability and retry; check owner/friend/outsider access again after maintenance | A failed write is an error, prior confirmed data survives and retry does not duplicate it. A failed read is not empty success or a substituted recommendation source. Notes/lists remain private after restart, upgrade and release; friendship removal still revokes access. Readiness is unsuccessful while required DB/schema initialization is unavailable and exposes no secrets, row data or detailed exception output. |
| STG09 | Take an operator-run logical backup and restore it into a separate dedicated Supabase target | The protected off-repo backup includes the application schema, migration history and personal data needed for recovery. Recreate required roles/grants with separately supplied secrets; role-password backup is not assumed. Start the application against the restored target and verify account sign-in, personal-state snapshots, typed relationships and privacy through independent authenticated HTTP. The source staging target remains intact. Record backup/restore commands, revisions and sanitized results without publishing dumps or credentials. |
| STG10 | Configure real server-side TMDB and OMDb keys and run separate bounded live movie smoke checks | Each actual provider client/configuration path has a sanitized success/failure result, including evidence from the deployed backend path. Use a known movie/IMDb identity, such as TMDB 550 and IMDb `tt0137523`. Distinguish provider success, failure and optional enrichment absence; do not substitute fixture success or a cached response that bypassed the client. A local smoke alone does not prove hosted connectivity. No key, raw credential-bearing URL or raw response is recorded. |
| STG11 | Finish checks and prepare the staging handoff | Record target identifiers without credentials, deployed revisions, actual commands/results and every STG ID as passed/failed/blocked/not run. Include controlled provisioning, start/maintenance/release, forward repair, backup/restore, free-tier suspension recovery and narrowly targeted cleanup instructions. Run isolated backend regressions, strict frontend typechecking/build and independent Standards/Spec reviews against the implementation base. Browser interaction remains unverified; neither API passes nor source/build checks certify UI behavior, P14 or the whole release. |

## Decisions and test boundary

### Agreed decisions

The user settled Q1–Q8 and confirmed the complete understanding in Q9 on
2026-10-23. There are no unanswered product decisions blocking this slice.
Q1 expressly selects this new feature-010 record, preserving the existing
feature-006 recommendations record. Q5 selects **API checks only; browser
unverified**, overriding the proposed deployed browser walkthrough. This local
contract governs until deliberately published under
[the workflow](../../movienight-workflow.md).

Reuse the [recorded dependency preflight](../../../roadmap.md#dependency-preflight--2026-10-21),
[product rules](../../../spec.md), [glossary](../../../GLOSSARY.md),
[recommendations contract](../006-personal-movie-recommendations/spec.md),
[typed-identity contract](../007-tv-anime-tv/spec.md),
[local-demo contract](../008-production-readiness/spec.md) and
[storage contract](../009-durable-storage/spec.md). The preflight is source
evidence, not a fresh runtime pass. Preserve ratings, privacy, explicit saves,
list independence, typed identity, anime classification and recommendation
scoring. Roadmap current-work text and historical feature status/evidence predate
this base; do not infer integration or milestone completion from them or commit
names. This task does not update those records.

Keep Spring API/JPA and existing application JWT authentication. Supabase remains
PostgreSQL only; no Supabase Auth migration or browser database access. Use
dedicated synthetic staging and restore targets, not personal data or the existing
H2 database. Credentials present locally do not authorize repurposing or erasing
an existing database. Controlled account provisioning must complete before
application access is opened, without leaving a public bootstrap/registration
endpoint. Restriction is enforced by the server, not hidden links or CORS alone.
Public static assets and the sign-in screen are deliberately permitted.

Use provider HTTPS subdomains; no custom domain or paid access gateway is
required. Render Free is the selected host, not a measured claim that its memory
or quotas fit the current app. Accept cold starts and pauses; do not add artificial
keep-awake traffic or paid fallback. Prevent chargeable use using actual account
configuration, verify free project slots and limits before provisioning, and stop
with a recorded blocker if the free setup cannot complete the contract.

Continue the storage slice's single-instance, stopped-traffic maintenance model,
transactional forward migrations and separate credentials. The actual hosted
connection/TLS trust and custom-role syntax must work with the chosen connection
mode; narrow compatibility changes to configuration validation are in scope.
Do not weaken runtime privileges or TLS to bypass a hosted incompatibility.
Validate the actual hosted PostgreSQL version and constraint representation;
local PostgreSQL 17.6 results do not establish hosted compatibility.

Backup is one operator-run drill, not an automated service or scheduled retention
promise. Keep the backup encrypted at rest with access limited to the operator,
outside Git, images, public CI artifacts and public hosting. Keep it until restore
verification completes. Restore roles/grants and supply their secrets separately.
Use the distinct synthetic restore target for destructive restore/upgrade/failure
drills, sequentially if free quotas require it. Target selection and cleanup must
be explicit; never overwrite staging or delete unrelated projects to free a slot.
An unavailable second free target is blocked, not a local-restore pass.

### Source facts affecting implementation

- [Feature 009 validation](../009-durable-storage/validation.md) records local
  PostgreSQL and isolated regressions, not hosted retention. Its PR10 live checks
  were blocked/skipped. Newly added root `.env` provider entries have no recorded
  live pass. Structure-only inspection found no shell `NAME=value` assignments;
  no automatic dotenv loading was found. Do not shell-source this file or edit
  it as part of this specification task. The existing explicit provider settings
  are `MN_TMDB_KEY` and `MN_OMDB_KEY`.
- Current recovery logs reset codes and returns `devCode`; staging must disable
  that flow rather than expose it. Existing security permits anonymous routes
  that this staging boundary must restrict or disable. CORS currently permits
  localhost origins; frontend API configuration has a localhost fallback.
- Entry-name-only inspection found ignored `application.properties` in the
  existing local JAR. Do not deploy that artifact. A clean build context/resource
  policy must exclude local secret configuration, including from image layers.
- No deployment manifest/container build or application readiness endpoint was
  found. Existing similarity data loads into the database at startup, and
  discovery refresh can make live provider calls. Record startup/resource/quota
  observations without asserting a memory, latency or provider-quality guarantee.

Current primary-source constraints checked on 2026-10-23:

- [Render Free](https://render.com/docs/free) supports free static/web hosting,
  idle sleep and ephemeral API filesystems. Free quotas can suspend service;
  bandwidth/build usage can incur charges when billing is enabled. The chosen
  account configuration must enforce the zero-spend boundary.
- Render documents [Docker for Java](https://render.com/docs/docker),
  [managed HTTPS](https://render.com/docs/tls) and
  [HTTP readiness checks](https://render.com/docs/health-checks).
- [Supabase Free](https://supabase.com/pricing) has limited active project slots
  and may pause inactive projects. Its
  [backup guidance](https://supabase.com/docs/guides/platform/backups) recommends
  off-site exports for free projects; paid automatic backups are not assumed.
- Follow actual [Supabase connection/TLS guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)
  for the persistent backend: direct connection where supported, or the compatible
  session pooler where needed. Verify server identity, not encryption alone.

### Agreed verification boundary for implementation

Use real externally reachable HTTPS and real Spring controllers/services/JWT,
repositories and hosted PostgreSQL. Use at least three independently authenticated
synthetic accounts; a tester can transition between unrelated, pending, accepted
and removed friendship states. Observe independent reads after real writes and
each maintenance operation. Provision accounts through controlled application
logic; do not insert personal library/list/friendship rows directly to establish
retention. Controlled catalog/similarity and preceding-schema fixtures are allowed
where needed for deterministic identities, rankings and migration setup.

Exercise the actual hosted migration and permissions/TLS boundaries, including
failure/retry, not only the local harness. Use a compatible pair of real deployed
application revisions for release retention; identify both and what changed.
Exercise hosted database restart using a supported non-destructive mechanism;
if unavailable, mark that criterion blocked rather than replacing it with an
application restart. Verify backup restoration through the app against the
separate Supabase target, including freshly provisioned role credentials/grants.

Keep live provider checks separate and opt-in. Reuse
[LiveProviderSmokeTest](../../../repo/MovieNightBackend/src/test/java/com/movienight/backend/client/LiveProviderSmokeTest.java)
for the existing client assertions where useful, and record the additional
deployed-path evidence. Deterministic failure/ranking regressions may stub only
external provider responses, using explicit synthetic/blank configuration; this
does not certify real keys, provider quality or hosted egress. Live errors remain
errors, not fixture passes. Supply credentials through a safe explicit server
configuration path without shell evaluation of the human-readable root `.env`.

Source-review frontend staging origin/API configuration, disabled signup/recovery
entry points and existing loading/error feedback. Inspect deployed static asset
configuration and engineering outputs without calling those browser acceptance.
Run declared Java 21, Node 22 and pnpm 10.34.3 checks with isolated regression
configuration, plus focused staging tests and the hosted HTTPS harness/runbook
introduced during implementation. Reuse the isolated commands in
[feature 009 validation](../009-durable-storage/validation.md#engineering-checks);
record actual new names/commands and establish affected baselines then. Do not
blindly run a default test command that inherits ignored provider credentials.
Obtain independent Standards/Spec reviews at the actual implementation boundary.

**Application-browser execution is excluded by user choice.** Source review,
CORS/HTTP probes, static asset checks, typechecking and builds do not prove
rendered states, interaction, accessibility, frontend timing/account races or
browser-to-API persistence. Leave those unverified. The earlier local-demo browser
acceptance is not superseded or silently marked passed by this staging slice.

Likely later implementation seams: new Render/container/build-context definitions;
backend `pom.xml` resource packaging, staging/PostgreSQL settings,
`PostgresStorageConfiguration`, `SecurityConfig`, auth controller/service and
controlled provisioning, minimal readiness handling, plus focused security and
hosted HTTPS/process tests; frontend deployment/API configuration and existing
signup/recovery controls; deployment/maintenance/backup scripts and runbook.
This is an implementation boundary, not authorization to edit those files now.
Inventory exact paths before implementation under the human-review workflow.
No new domain term or separate ADR is needed; keep these bounded operational
decisions in this record and preserve the existing glossary.

## Out of scope

- Application/test/script implementation or execution, live provider calls,
  provisioning, deployment, credential-file edits, tracker publication, commit,
  push, merge and roadmap/history corrections during this specification task.
- Public launch, general registration/onboarding (P14), real email recovery,
  whole-site access protection, Supabase Auth or direct frontend database access.
- Application-browser testing or UI certification; completing the earlier
  local-demo browser contract through API evidence.
- Paid infrastructure/overages, custom domains, uptime or numerical performance/
  concurrency/quality promises, artificial keep-awake traffic or auto-upgrades.
- H2/personal-data import, destructive staging restore, automated/scheduled backups,
  point-in-time recovery, automatic downgrade, rolling/zero-downtime or
  multi-instance deployment, and a general production operations program.
- Product/scoring changes, UI redesign, expanded recommendation categories,
  anime films, public custom-list sharing, episode tracking or webhook activation.

## Validation — specification only, 2026-10-23

The fixed base and clean starting worktree are recorded above. Q1–Q9 are resolved
and confirmed by the user. Source/document inspection and primary-source hosting
checks informed this contract; historical results were not rerun. No application,
provider, browser, migration or deployment checks ran in this specification task.
No real `.env` provider values are included in this record.

Documentation checks actually run: required template sections present; STG01–STG11
appear once each in order in the acceptance table; all 12 local links/anchors
resolve; newline and tracked/new-file whitespace checks found no problems.
`git status --short --untracked-files=all` showed only this new file. The
`git diff --no-index` comparisons returned 1 for the expected new-file difference,
with no whitespace diagnostics. No existing tracked-file diff was present.

| Acceptance ID | Result | Evidence / limit |
| --- | --- | --- |
| STG01–STG11 | Not run | Agreed contract only; implementation, provisioning and execution have not started. |

At implementation completion, expand this mapping per ID with dated deployed
revisions, commands, results, review findings/resolutions and limitations. Keep
browser coverage explicitly unverified and distinguish this staging slice from
public-release readiness.

## Human review checkpoint — documentation only

Proposed change set: **one new file**,
`docs/features/010-staging-release/spec.md`, containing the agreed outcome,
STG01–STG11, decisions, test boundary, exclusions and specification-only evidence.
No existing files, application behavior or credentials are changed. No unrelated
changes were present at specification start. Before: milestone 10 had no selected
feature record. After: the next restricted-staging slice has a confirmed local
contract; there is still no deployed staging environment or new test pass.

Inspect from the repository root; an untracked file is absent from ordinary diff
statistics until staged, so inspect its contents separately:

```sh
git status --short --untracked-files=all
git diff --stat
git diff -- docs/features/010-staging-release/spec.md
cat docs/features/010-staging-release/spec.md
# For a complete unstaged new-file diff (exit 1 means differences):
git diff --no-index -- /dev/null docs/features/010-staging-release/spec.md
```

This task stops before implementation. Commit requires explicit approval of the
reviewed change set under [the workflow checkpoint](../../movienight-workflow.md#human-review-checkpoint).
