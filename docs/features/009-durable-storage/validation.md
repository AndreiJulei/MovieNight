# Feature 009 validation and human review

Date: 2026-10-22. Branch: `feat/008-production-readiness`.
Fixed implementation/specification base: `1d342d605f0fb522a602bafab6f29bb618ac1204`.
Comparison: tracked worktree diff against that base **plus every new file below**;
no commits since the base. These are uncommitted worktree results, not a deployed
revision or integration claim. The initial feature-009 spec was the only existing
untracked change; no unrelated modifications/deletions were found.

## Acceptance evidence

The process checks use real PostgreSQL 17.6, real backend/JWT/controllers/services/
repositories, synthetic HTTP-created accounts and a loopback provider fixture.
A shared disposable similarity fixture is the only directly inserted model data.
Personal rows are never inserted or reseeded directly. Fresh initialization and
V1→V2 upgrade use separate databases in one explicitly created local cluster.
Retained logs/databases live outside the repo in dedicated disposable directories.
No credential values or raw provider responses are recorded here.

| ID | Result | Evidence / practical boundary |
| --- | --- | --- |
| PR01 | Passed | All eight omitted-setting startup subcases, invalid DB/migration passwords and absent secret values in error output; explicit profile/location, isolated environments and blank examples. |
| PR02 | Passed | Complete 11-entity migration schema and history; Hibernate validate; private schema and denied runtime DDL/history writes; overprivileged runtime startup rejection. |
| PR03 | Passed | Three HTTP-created accounts; library/rating/note/list/friendship snapshots match after backend and retained-storage database restarts. |
| PR04 | Passed | V1 created by actual migration, populated through HTTP; actual V2 upgrade preserves authenticated snapshots and expands notes past 255 characters. |
| PR05 | Passed | Repeated startup leaves only V1/V2 successful history, unchanged HTTP state and no duplicate library entries/memberships; changed V1 checksum is rejected. |
| PR06 | Passed | Injected V2 division-by-zero rolls back note expansion/history; unchanged V2 retry succeeds; checksum, column, typed unique-index and rating-check drift block startup; bad credentials/unavailable DB block startup. |
| PR07 | Passed | Duplicate saves/memberships; watched transition, unrated/0/7.5; independent lists; revoked UPDATE yields HTTP500 with previous read intact, successful retry; revoked SELECT makes library/personal reads fail rather than empty-success. |
| PR08 | Passed | Owner, accepted friend, pending and unrelated account probes before/after recovery; notes omitted and lists denied; foreign mutations denied; removal immediately revokes access and survives restart. Positive personal recommendation plus typed library exclusions checked. |
| PR09 | Passed | Pinned native PostgreSQL and isolated CLI init/stop/start/cleanup; explicit marked directories, retained storage, no hosted URL handling. Setup and maintenance in README. |
| PR10 | Blocked | Existing ignored backend configuration has no usable TMDB/OMDb keys. Requested an ignored credential-file path. Live tests are opt-in and ordinary regression skips both. No live requests/fixture substitution claimed. |
| PR11 | Passed | Fixed base plus implementation digest below; six PostgreSQL scenarios, full H2 suite, frontend/syntax/diff checks and both independent reviews recorded. PR10 remains blocked; no hosted/browser/deployed claim. |

## Engineering checks

Toolchain: Temurin Java 21.0.13+9; PostgreSQL 17.6 (Zonky darwin-arm64v8 archive);
Node 22.20.0; pnpm 10.34.3; Python 3.9 with psycopg[binary] 3.2.10; Maven wrapper
3.9.16. Temporary runtimes/clients were downloaded outside the repository.
Docker was installed but its daemon was unavailable, so native PostgreSQL was used.

Baseline: the focused pre-change `WatchedHistoryPersistenceTest` passed 8 tests
under the initially installed Java 25. It is not the declared-Java certification.
Frontend baseline typechecking/build passed under Node 22/pnpm 10.34.3. A first
package attempt hit sandbox restrictions resolving a missing Maven plugin;
network/dependency resolution and loopback process execution required escalation.
The first Python bytecode check hit the system cache directory permission; rerun
with `PYTHONPYCACHEPREFIX=/private/tmp/mn009-pycache` is the isolated command.

Actual check commands, from the repository root unless shown otherwise:

```sh
export JAVA_HOME=/private/tmp/mn009-java/Contents/Home
export PG_BIN=/private/tmp/mn009-pg/bin
(cd repo/MovieNightBackend && env -i HOME="$HOME" PATH="$PATH" TMPDIR=/private/tmp \
 JAVA_HOME="$JAVA_HOME" SPRING_CONFIG_LOCATION=classpath:/application-regression.properties \
 ./mvnw clean test \
 "-DargLine=-javaagent:$HOME/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar -Djava.io.tmpdir=/private/tmp")
(cd repo/MovieNightBackend && ./mvnw -DskipTests package)
/private/tmp/mn009-python/bin/python docs/features/009-durable-storage/test_postgres.py
# Node 22 and pnpm 10.34.3 on PATH:
(cd repo/MovieNightFrontend && pnpm exec tsc --noEmit && pnpm build)
PYTHONPYCACHEPREFIX=/private/tmp/mn009-pycache python3 -m py_compile docs/features/009-durable-storage/*.py
bash -n docs/features/009-durable-storage/run-postgres.sh
git diff --check
```

Focused Java-21 watched-history regression passed 8 tests; the two opt-in provider
checks were skipped. The initial configuration test failed before implementation
because the PostgreSQL config resource was absent, then passed. A new privilege
probe failed because an overprivileged role could start; the guard corrected it.
The initial expanded harness had incorrect expected denial status codes and a
readiness polling bug; these were corrected against observed API behavior. The
positive-recommendation fixture was corrected to use a positive-weight watched
seed instead of a zero-rated negative-weight seed. None of those failed runs is
reported as an acceptance pass.

The first isolated full-suite attempt omitted `TMPDIR` and failed on JVM agent
self-attachment and JUnit `/var/tmp` access. The corrected command above supplies
an explicit agent and temporary directory. It exposed three pre-existing
friend-suggestion failures: an isolated `git archive` of fixed base `1d342d6`
reproduced all three, whose shared request fixture omitted explicit media type.
Adding `mediaType: MOVIE` to that test helper restored all three checks without
changing application behavior. Its focused run passed 3/3; the full suite then
passed. A concurrent clean/package scheduling mistake removed the JAR used by
configuration probes; the process checks now require a packaged JAR and the final
run is sequential after the clean regression/build. The cleanup CLI check itself
passed independently before that configuration-probe rerun.

Final results:

- Full backend: **133 tests, 0 failures, 0 errors, 2 live-provider checks skipped**
  (131 executed), in 26.315 seconds.
- PostgreSQL/process: **6 tests passed**, in 111.304 seconds. Retained, stopped
  synthetic cluster: `/private/var/folders/k5/tsqb3ghs17v1yfzdhz4mgcg00000gn/T/mn009-51390`.
- Frontend strict typechecking and production build: passed.
- Python syntax, shell syntax, relative links and tracked/new-file whitespace:
  passed. No-index whitespace checks return 1 for new-file differences here;
  all 14 new files produced no whitespace/error diagnostics.

This is synthetic review evidence, not personal or hosted storage. The explicit shell launcher also rejected absent provider
keys while ignoring deliberately supplied ambient provider-key variables, without
printing their values. Source inspection confirms frontend configuration
reads only `VITE_API_URL`; there are no DB/provider/signing settings in frontend
source or new frontend artifacts. No frontend source was changed. Browser
interaction and deployment are not established by these checks.

The tested implementation snapshot is the fixed base above plus the 18 changed/new
non-Markdown implementation/config/test/tool files. Its SHA-256 content digest is:
`19db7143d49dd37f4a2f650868f196492eef3139735d23f24a128e25b23240b0`.
The digest hashes sorted relative paths, a NUL separator, exact file bytes and a
trailing NUL for each file; Markdown evidence is excluded to avoid self-reference.
Reproduce from this worktree:

```sh
python3 - <<'PYDIGEST'
import hashlib, pathlib, subprocess
changed = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], text=True).splitlines()
new = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], text=True).splitlines()
h = hashlib.sha256()
for path in sorted(p for p in set(changed + new) if not p.endswith('.md')):
    h.update(path.encode() + b'\0' + pathlib.Path(path).read_bytes() + b'\0')
print(h.hexdigest())
PYDIGEST
```

## Independent code reviews

The code-review skill ran independent Standards and Spec agents against the
uncommitted tracked diff from the fixed base plus all new files. This deliberately
uses a working-tree comparison because committing requires human approval.

Standards: 0 documented breaches and 0 actionable smell findings; evidence update
was still pending at initial review. No H2 Flyway auto-configuration regression:
only core/database dependencies were added, not Boot's Flyway auto-config module.

Spec: one P2 finding—startup did not detect removal of V2's rating CHECK. Fixed
with canonical validated-CHECK verification and a drop/reject/restore/retry probe.
A partial unique-index concern raised during review was fixed by rejecting filtered
indexes in the required uniqueness guard. Final follow-up reviews: both agents found no remaining blocking implementation
issue; the Spec reviewer confirmed the P2 fix. Both reviewers also rechecked the
later fixture/CLI/partial-index-test deltas and reported **0 new findings**. No
blocking review findings remain.

## Human review checkpoint

Proposed commit scope: **only the 21 files named below**, with no deletions or
unrelated changes. No staging/commit/push/merge/tracker operation was performed.
Paths are relative to repository root.

| File | Reason / acceptance |
| --- | --- |
| `repo/MovieNightBackend/pom.xml` | PostgreSQL JDBC and Flyway dependencies; PR02–PR06. |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/config/IdentityMigrationConfiguration.java` | Keep legacy H2 migration off PostgreSQL; PR02. |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/config/PostgresStorageConfiguration.java` (new) | Required config, migration-before-JPA, runtime grants, relationship/rating integrity; PR01–PR06. |
| `repo/MovieNightBackend/src/main/resources/application-postgres.properties` (new) | Explicit server-only PostgreSQL configuration and sanitized logging; PR01–PR02. |
| `repo/MovieNightBackend/src/main/resources/db/postgres/V1__application_schema.sql` (new) | Full preceding application schema, typed keys/FKs and runtime DML grants; PR02/PR04. |
| `repo/MovieNightBackend/src/main/resources/db/postgres/V2__private_notes_and_rating_integrity.sql` (new) | Transactional note/rating upgrade preserving personal rows; PR04–PR06. |
| `repo/MovieNightBackend/src/main/resources/application.properties.example` | Remove tracked credential defaults; PR01. |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/client/TmdbClient.java` | Suppress credential-bearing exception details; PR01/PR10. |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/client/OmdbClient.java` | Suppress credential-bearing exception details; PR01/PR10. |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/exception/GlobalExceptionHandler.java` | Generic failures no longer expose raw SQL/row/connection details; PR01/PR07. |
| `repo/MovieNightBackend/src/test/java/com/movienight/backend/client/LiveProviderSmokeTest.java` (new) | Separate opt-in actual-client checks, sanitized failures; PR10. |
| `repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/FriendSuggestionsPersistenceTest.java` | Correct the pre-existing save fixture to include explicit MOVIE type; restores ranking/privacy regression checks, PR11. |
| `repo/MovieNightBackend/src/test/resources/application-regression.properties` (new) | Explicit in-memory H2 and synthetic/blank secrets; deterministic full regression, PR01/PR11. |
| `docs/features/009-durable-storage/spec.md` (initially untracked) | Preserve agreed contract and record implementation/evidence status; PR11. |
| `docs/features/009-durable-storage/README.md` (new) | Targeted local setup, migration, restart, repair/retry, cleanup and verification; PR09/PR11. |
| `docs/features/009-durable-storage/validation.md` (new) | Acceptance/review evidence and this complete file inventory; PR11. |
| `docs/features/009-durable-storage/.env.postgres.example` (new) | Blank ignored-env template, no credential defaults; PR01/PR09. |
| `docs/features/009-durable-storage/local_postgres.py` (new) | Pinned private-schema cluster, separate roles, retained storage and explicit cleanup; PR02/PR09. |
| `docs/features/009-durable-storage/run-postgres.sh` (new) | Explicit trusted env loading and clean server-only process configuration; PR01/PR09. |
| `docs/features/009-durable-storage/provider_fixture.py` (new) | Reuse demo provider fixture with a known positive recommendation; PR03/PR08/PR11. |
| `docs/features/009-durable-storage/test_postgres.py` (new) | Real HTTP/process/migration/restart/failure/privacy checks; PR01–PR09/PR11. |

Before: only H2 was supported, its startup identity migration rejected PostgreSQL,
and Hibernate development setup owned schema changes. After: an explicitly
configured PostgreSQL path applies versioned migrations with a separate role,
validates schema/privileges, and recovers personal data after restart/upgrade.
Generic HTTP failures now show a sanitized retry/reload message. H2 remains a
separate development/demo/regression path.

Human scenario: initialize a dedicated local cluster, supply server keys, sign up
and save a movie with rating 0 and a private note; add it to a private list; stop
and restart backend/database using the same directory; sign in and read the same
library/list. The automated process file performs this and the upgrade/privacy
variants. Browser behavior remains unverified by user choice.

Inspect all tracked changes and new-file contents before staging:

```sh
git status --short --untracked-files=all
git diff --stat
git diff -- repo/MovieNightBackend
# New files do not appear above. Inspect every path in the inventory separately:
git ls-files --others --exclude-standard
# Show every new file without staging:
git ls-files --others --exclude-standard -z | xargs -0 -I{} git diff --no-index -- /dev/null "{}"
git diff --check
```

The no-index diff returns 1 for differences (xargs may consequently return 123). Alternatively open the new files
from the inventory. No existing `.env` or personal data was edited. Supabase
connectivity, hosted grants/Data API isolation, hosted migrations, backup/restore,
browser flows, public releases and deployed P13 remain separate release gates.
Explicit approval of this reviewed change set is required before committing under
[the workflow](../../movienight-workflow.md#human-review-checkpoint). Push/merge
require separate authorization. PR10 is still blocked; this is not full production
readiness or a claim that all feature acceptance gates have passed.
