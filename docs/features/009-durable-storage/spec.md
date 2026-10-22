# Durable storage and schema upgrades

Status: implemented locally on 2026-10-22; verification and human review evidence below.
Live provider checks remain blocked without credentials; no integration is claimed.
Roadmap: milestone 9 (Production readiness), first bounded storage slice.
Product requirements: P13 preparation; P02–P07/P09/P11/P12 regression boundaries.
GitHub issue: not published. Fixed specification base:
`1d342d605f0fb522a602bafab6f29bb618ac1204` on `feat/008-production-readiness`.
The original specification started with a clean worktree; no remote fetch.
This contract was first recorded in feature 006 and is now relocated here without
changing the agreed scope. Relocation began with only that earlier documentation
addition in the worktree. Feature 006 is restored to its committed record.

## Outcome

A person can sign in to the existing Spring/JWT application and recover their
confirmed personal data after backend/database restarts and a supported versioned
schema upgrade. Select Supabase-hosted PostgreSQL as the production destination;
implement and verify this slice against isolated local PostgreSQL only. Provide
server-side database, JWT, TMDB and OMDb configuration. Local results do not certify
Supabase connectivity, hosted permissions, deployed releases or the whole milestone.

## Acceptance criteria

| ID | Given / when | Expected result |
| --- | --- | --- |
| PR01 | Start the PostgreSQL runtime path from documented, ignored environment configuration; omit a required DB/JWT/TMDB/OMDb setting or supply invalid DB credentials | Required settings are validated and startup fails clearly without exposing values, using credential defaults, silently selecting H2 or creating a different database. Tracked examples contain blank placeholders only. Database and provider credentials/signing secrets stay server-side and out of frontend assets, logs and recorded evidence. Deterministic tests use explicit isolated configuration rather than inheriting live keys. |
| PR02 | Initialize a fresh, explicitly selected local PostgreSQL database, then start the application | Versioned migrations establish the complete mapped application schema and migration history in a private application schema. Hibernate validates it without creating/updating/dropping tables. The H2-only identity migrator does not run on PostgreSQL. Runtime access uses a separate role without schema-mutation privileges; migration credentials are used only for migration. No browser/Supabase Data API access to application data is introduced. |
| PR03 | Create accounts and personal data through supported authenticated HTTP flows; stop/start the backend, then stop/start PostgreSQL retaining its storage; sign in and independently read the data after each restart | Accounts remain usable; confirmed library status, unrated/0/7.5 ratings, private notes, custom lists/memberships and friendship states are retained for the correct owners. Equal numeric movie/TV provider IDs remain distinct, and anime TV retains TV identity. No reset, test reseeding or direct personal-data insertion substitutes for recovery. |
| PR04 | Populate a supported preceding PostgreSQL schema version, stop application traffic and execute the actual next versioned upgrade | The upgrade preserves account credentials, catalog keys and user relationships/values, typed uniqueness and foreign keys. The new application validates the resulting schema and independently reads retained data through authenticated HTTP. Schema history records success only after successful completion. Disposable discovery/recommendation caches may be rebuilt; they cannot substitute for or erase personal data. |
| PR05 | Repeat fresh-start/upgrade commands against the already migrated database | Completed versions are not reapplied; no duplicate accounts, library entries, memberships or relationships appear, and user values remain intact. History/checksum validation detects changed applied migrations rather than silently accepting them. |
| PR06 | Encounter a failing supported migration, changed migration checksum, unsupported/drifted schema or unavailable database during startup | The application does not serve normal traffic or reset/fallback to H2. Supported upgrade steps are transactional: an injected failure rolls back that step and does not mark it successful. Existing user data remains intact. A documented, explicit forward repair/retry restores a valid startup; no automatic history rewrite or destructive reset is offered as recovery. |
| PR07 | On PostgreSQL, repeat existing saves/memberships, change watched status/ratings, and deliberately fail a write; reload through an independent HTTP read | Existing explicit-save, one-entry-per-typed-title, mutually exclusive watchlist/watched, rating and list-independence rules hold. A failed write is an error rather than confirmed persistence; prior confirmed state survives and retry remains possible without duplicates. Database read failures do not become empty-success or a substituted recommendation source. |
| PR08 | Use three independent accounts before and after restart/upgrade; probe anonymous requests and owner, pending, accepted, removed and unrelated relationships | Authentication/owner checks still apply on the real PostgreSQL path. Other accounts cannot read private notes/lists or mutate owner data; permitted friendship status/rating access appears only while accepted and is revoked on the next read after removal. Personal recommendations retain current typed library exclusions and do not expose another owner's history. |
| PR09 | Run the local PostgreSQL setup, migration, start/stop, verification and disposable-environment cleanup instructions | Commands identify the selected target and retained storage explicitly. Cleanup is confined to the dedicated disposable local environment; it cannot silently target Supabase or existing H2/personal data. Record the pinned PostgreSQL version and required runtime versions. Fresh initialization, restart retention and prior-version upgrade are distinct reproducible checks. |
| PR10 | Configure real server-side TMDB and OMDb credentials and run separate bounded movie-provider smoke checks through the local backend | Each provider has a recorded sanitized success/failure result demonstrating its actual client/configuration path. Use a controlled movie lookup with a suitable IMDb identity for OMDb. Do not commit keys or raw credential-bearing URLs/responses. Existing failure, empty-result and optional-enrichment behavior remains unchanged; a live failure is recorded, not replaced with a fixture pass. No general connectivity/quality guarantee follows. |
| PR11 | Finish implementation checks and reviews at a fixed revision | Map every PR ID to passed/failed/blocked/not-run with commands and sanitized observations. Include actual PostgreSQL migration/restart/HTTP evidence, focused and full regression results, frontend engineering checks, independent Standards/Spec reviews and limitations. Missing keys, tools or checks remain blocked/not run. Local results never establish browser interaction, Supabase behavior, deployed P13 or full production readiness. |

## Decisions and test boundary

The user settled Q1–Q6 and confirmed the complete contract in Q7 on 2026-10-22.
Q5 selected **local PostgreSQL only**; Q7 explicitly excludes browser and Supabase
execution. No unanswered product decision blocks this bounded slice. This local
contract governs until deliberate publication under [the workflow](../../movienight-workflow.md).

Reuse the [recorded preflight](../../../roadmap.md#dependency-preflight--2026-10-21),
[product rules](../../../spec.md), [glossary](../../../GLOSSARY.md),
[recommendations contract](../006-personal-movie-recommendations/spec.md),
[typed-identity contract](../007-tv-anime-tv/spec.md) and
[local-demo contract](../008-production-readiness/spec.md). Do not reopen ratings,
privacy, explicit saves, list independence, typed identities, anime classification
or recommendation scoring. The preflight is source evidence, not a fresh runtime
pass. Roadmap current-work text predates this base; do not rewrite integration
history or infer completion from commit names or historical check results.

Supabase provides PostgreSQL only for this slice. Keep Spring API/JPA and existing
application JWT authentication; do not migrate accounts to Supabase Auth or put
database access in the frontend. A private, non-exposed application schema and
separate migration/runtime roles preserve the existing server authorization
boundary. Supabase's [Spring Boot guide](https://supabase.com/docs/guides/getting-started/quickstarts/spring-boot)
documents JDBC and a non-public schema. Its tutorial's automatic Hibernate schema
updates are not this contract: use versioned migrations and validation instead.
Connection details for the future hosted target must follow the actual project's
[connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres);
neither connection mode nor TLS/role configuration has been verified here.

Start the PostgreSQL path fresh. No H2 accounts or personal data are transferred.
Leave existing H2 data and its reviewed legacy-identity mapping behavior intact.
Source inspection found only the H2 driver, an H2-only startup migrator, Hibernate
schema mutation in the development setup and in-memory persistence tests. The
local demo deliberately uses disposable H2. Those paths can remain development
tools; neither is evidence of PostgreSQL compatibility or restart retention.
The PostgreSQL baseline must cover every mapped entity, including existing cache,
similarity and webhook-related tables, without activating deferred product behavior.

Use a single-instance maintenance window with traffic stopped during migrations.
Supported upgrades are transactional and forward-only; the runtime role cannot
perform DDL. Choose the migration tool, precise version sequence, local process/
container tooling and configuration names during implementation, and test the
actual chosen mechanism. Do not silently baseline an unknown schema or repair a
checksum mismatch by rewriting history. Document the explicit repair/retry path;
operational backup restoration and automatic downgrade are separate work.

The root `.env` is ignored and contains colon-labelled Supabase/Postgres connection
information rather than standard `NAME=value` assignments. No TMDB/OMDb entries
were detected during structure-only inspection. No credential values were copied,
validated or used. Later implementation must document explicit environment loading
and blank examples; file presence alone is not configured connectivity. Do not
edit `.env` in this specification task. Required PostgreSQL runtime settings include
DB connection/authentication, a JWT signing secret and both provider credentials.
Keep existing development/demo optional-provider behavior; explicitly configured
test fixtures are a separate mode. Clean credential defaults from affected tracked
templates as part of later configuration work, without reproducing their values.

Likely later seams: backend `pom.xml`, PostgreSQL/profile configuration and blank
environment templates; `IdentityMigrationConfiguration`, migration resources/
tooling, mapped entities/repositories only where PostgreSQL compatibility requires
it; PostgreSQL HTTP/migration/process tests and isolated setup/verification docs.
Existing JWT, library, list, friendship and recommendation paths change only to
meet these criteria on PostgreSQL. Preserve frontend behavior and the H2 demo.
Exact files and new test/script names must be inventoried before implementation.
No new domain term requires a glossary change; this task records the storage
decision here and creates no additional glossary or ADR file.

### Agreed verification boundary for implementation

Use real local PostgreSQL, real controllers/services/repositories and real
authenticated HTTP. Create separate accounts through supported sign-up/sign-in;
create personal state through app APIs and use independent reads after writes,
backend restart, database restart and upgrade. Mock only external provider data in
repeatable product tests, not application persistence/authentication. Use controlled
catalog/similarity inputs for typed identity and recommendation checks. A prior-
version migration fixture may establish the preceding schema/data; execute the
actual migration against it and verify retained values/constraints and HTTP reads.
Do not confuse repeat startup with executing a versioned upgrade.

Exercise initialization, meaningful prior-version upgrade, no-op rerun, checksum/
schema rejection, transactional failure/repair and unavailable-database paths.
Observe persisted values and API results, not just mocked repository calls.
Verify runtime-versus-migration privileges and private schema access locally;
these checks do not prove Supabase Data API configuration or hosted grants.
Keep local PostgreSQL storage across restart checks and make destructive cleanup
a separate, explicitly targeted operation. Use synthetic accounts/data only.

Pin and record the tested PostgreSQL version; future Supabase acceptance must
check the target's actual PostgreSQL version, connection method, TLS, schema and
grants. Run no Supabase connection, write, migration or project creation here.
Hosted initialization, role/Data API isolation, restart/upgrade retention and
deployment P13 remain required release gates with separate evidence. Local
PostgreSQL cannot stand in for them.

Run focused PostgreSQL/API/migration/process checks, retain H2 regression coverage,
then run the full backend suite, strict frontend typechecking, production build and
diff checks. Use declared Java 21, Node 22 and pnpm; establish relevant baselines
and report pre-existing failures separately. Historical toolchain workarounds in
[tech-stack.md](../../../tech-stack.md) are not fresh passes. Record actual new
commands during implementation; no PostgreSQL runner exists for this contract yet.

```sh
# repo/MovieNightBackend: also run the new explicit PostgreSQL checks
./mvnw clean test
# repo/MovieNightFrontend
pnpm exec tsc --noEmit
pnpm build
# repository root
git diff --check
```

Keep live TMDB/OMDb smoke commands separate and opt-in, using only the configured
server credentials; record provider, action, sanitized status and result. They
exercise live provider configuration, not persistence reproducibility or provider
quality. Tests must not inherit live `.env` secrets. Source-review frontend
configuration boundaries and existing failure feedback; **browser execution is
excluded by user choice**, so rendered states, interactions and timing remain
unverified. Obtain independent Standards and Spec reviews against this contract
and the fixed implementation base, stating the actual comparison boundary. Follow
the human review checkpoint before any later commit.

## Out of scope

- Implementation, app/test/provider execution and credential-file edits in this
  specification task; tracker publication, commit, push, merge and roadmap updates.
- Supabase execution/provisioning, hosted connectivity/TLS/permissions certification,
  public deployment/HTTPS and a claim of deployed-release retention or readiness.
- H2-to-PostgreSQL import, legacy personal-data transfer, Supabase Auth migration,
  onboarding/recovery changes, direct browser database access or browser execution.
- Rolling/zero-downtime upgrades, multi-instance orchestration, automatic downgrade,
  backup/restore, broader secrets rotation/incident operations and monitoring.
- Product-rule/scoring changes, UI redesign, expanded recommendation categories,
  new ML training, webhook behavior, performance/concurrency or quality guarantees.

## Implementation and validation — 2026-10-22

Implementation was explicitly requested after this specification was agreed. The
specification-task exclusion of implementation above is historical, not an
exclusion from this implementation run. The agreed acceptance criteria and local
verification boundary remain unchanged. The initial untracked specification is
preserved here with updated status/evidence; no unrelated changes were present.

See [local setup and maintenance](README.md) for reproducible commands and
[validation and human review](validation.md) for acceptance results, exact review
boundary, file inventory, limitations and commands to inspect the proposed diff.
No commit, tracker publication, push, merge or roadmap update is authorized by
this implementation request. Implementation remains an uncommitted worktree on
the fixed base above until explicit approval of the reviewed change set.
