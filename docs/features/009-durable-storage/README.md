# Local PostgreSQL storage

Production destination: Supabase PostgreSQL, **not exercised here**. This runner
uses a fresh native PostgreSQL **17.6** cluster bound to loopback. It never reads
the root `.env`, connects to Supabase, or transfers existing H2 data. Java **21**,
Python **3.9+**, Node **22** and pnpm **10.34.3** are the verification runtimes.
Install PostgreSQL 17.6 from a trusted distribution and set `PG_BIN` to its binary
directory containing `postgres`, `initdb`, and `pg_ctl`. On macOS arm64 the recorded
run used Zonky's `embedded-postgres-binaries-darwin-arm64v8:17.6.0` archive from
Maven Central, unpacking its `postgres-darwin-arm_64.txz`. A Docker daemon is not
required. This is a test-local version pin, not certification of a hosted version.

## Setup and start

From the repository root, with `JAVA_HOME` pointing to Java 21:

```sh
python3 -m venv /private/tmp/mn009-python
/private/tmp/mn009-python/bin/pip install 'psycopg[binary]==3.2.10'
export PG_BIN=/absolute/path/to/postgresql-17.6/bin
export MN_LOCAL_DIR=/private/tmp/mn009-demo
/private/tmp/mn009-python/bin/python docs/features/009-durable-storage/local_postgres.py init "$MN_LOCAL_DIR"
(cd repo/MovieNightBackend && ./mvnw -DskipTests package)
```

`init` refuses an existing directory. It prints the selected storage directory;
its protected marker records the loopback port. The database is explicitly named
`movienight_local`. Files under `data/` are retained storage; `.env.postgres` holds
random **local-only** runtime/migration passwords and signing material. The cluster
has its own local administrator, separate `mn_migrate`/`mn_runtime` login roles,
a private `movienight` schema, no public schema access, and no runtime DDL, TEMP,
role administration, ownership or migration-history writes. Local Unix-socket
administration is confined to this mode-0700 directory; TCP requires SCRAM.
These local grants do not prove Supabase's role or Data API isolation.

Add `MN_TMDB_KEY` and `MN_OMDB_KEY` to the generated ignored `.env.postgres` for a
real-provider local run. Both are required by the PostgreSQL runtime. For a
manually configured target, copy `.env.postgres.example` to an ignored file and
fill **every** blank assignment. Use shell quoting for values containing special
characters. Never paste or log the file's contents. A JWT signing secret must
contain at least 32 UTF-8 bytes. JDBC URLs must explicitly name a PostgreSQL
database; only an optional `sslmode` URL parameter is accepted, never credentials.

```sh
docs/features/009-durable-storage/run-postgres.sh "$MN_LOCAL_DIR/.env.postgres"
```

The launcher accepts one explicit trusted shell-format env file and clears
inherited Spring/provider configuration. It explicitly loads the PostgreSQL
configuration resource and profile, so ignored development `application.properties`
cannot select H2. Missing/blank settings, conflicting runtime settings and
migration/permission/validation failures block startup. Do not use the root
colon-labelled Supabase `.env` as a shell file. Do not point local test/cleanup
commands at hosted credentials or personal storage.

## Migrations, restart and recovery

Stop the backend with Ctrl-C before maintenance. On each PostgreSQL startup,
Flyway uses only the migration role, validates checksums, then applies pending
versions transactionally before Hibernate validates and normal HTTP traffic starts.
The separate runtime datasource uses only `mn_runtime`. The H2 identity migrator
is excluded from this profile. V1 contains all eleven mapped tables, indexes and
foreign keys, with notes limited to 255 characters; V2 expands notes to text and
adds the half-step/range rating constraint. Personal rows and identity sequences
are preserved. V1 is the supported preceding local schema, not a claim that an
older PostgreSQL release was deployed. No H2 schema is baselined or imported.

```sh
# Backend must be stopped. These commands reuse the SAME directory and database.
/private/tmp/mn009-python/bin/python docs/features/009-durable-storage/local_postgres.py stop "$MN_LOCAL_DIR"
/private/tmp/mn009-python/bin/python docs/features/009-durable-storage/local_postgres.py start "$MN_LOCAL_DIR"
docs/features/009-durable-storage/run-postgres.sh "$MN_LOCAL_DIR/.env.postgres"
```

Repeated startup is a no-op for completed migrations. Unknown nonempty schemas
are not baselined. Hibernate validates mapped columns; the startup guard also
checks application uniqueness/foreign keys and runtime privileges. These checks
are not a general database schema comparison tool. The canonical rating-CHECK
comparison is verified against PostgreSQL 17.6; another hosted version must
verify its rendered definition before this validation is reused. Keep changes in new versioned
migrations; do not modify applied SQL. Flyway clean and automatic repair are not
exposed. Automatic downgrade and rolling upgrades are unsupported.

For a failure, stop traffic and verify the selected database, role grants,
applied version/checksums and the migration artifact against source control using
a maintenance account. Do not publish row data or connection settings in evidence.
A PostgreSQL failed transactional step leaves its changes and success-history
entry rolled back. Correct the **unapplied** migration or restore the intended
artifact/configuration, then retry startup. The test-injected failure is repaired
by removing the injected division-by-zero from the unapplied copy, then retrying
the real unchanged V2. For a checksum mismatch, restore the original applied
artifact and put any intended evolution in a new forward migration; never rewrite
history to accept the mismatch. For confirmed schema drift, diagnose against the
versioned schema and explicitly restore the required objects/grants in maintenance
(or ship a reviewed forward repair migration) before restarting. The tests restore
the deliberately renamed column/dropped index and retry. There is no destructive
reset recovery command. Backup restoration is a separate release gate.

## Reproducible verification

Build first. Run Maven clean/regression before packaging, never concurrently with
the JAR-based process checks. The process test requires `PG_BIN` and Java 21, sanitizes its child
environment, starts a new dedicated marked cluster and a loopback provider fixture,
and prints the retained cluster path. It creates personal data only through HTTP.
It may control **disposable similarity data** directly. Each failure/success startup
has a separate `app-N.log`; no live keys are inherited. It stops processes at the
end but retains the database and logs for inspection and explicit cleanup.

```sh
(cd repo/MovieNightBackend && env -i HOME="$HOME" PATH="$PATH" TMPDIR=/private/tmp \
 JAVA_HOME="$JAVA_HOME" SPRING_CONFIG_LOCATION=classpath:/application-regression.properties \
 ./mvnw clean test \
 "-DargLine=-javaagent:$HOME/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar -Djava.io.tmpdir=/private/tmp")
(cd repo/MovieNightBackend && ./mvnw -DskipTests package)
PG_BIN="$PG_BIN" JAVA_HOME="$JAVA_HOME" /private/tmp/mn009-python/bin/python \
  docs/features/009-durable-storage/test_postgres.py
(cd repo/MovieNightFrontend && pnpm exec tsc --noEmit && pnpm build)
git diff --check
```

The six process tests cover blank settings, fresh initialization, duplicate
writes, independent list membership, account/library/list/friendship recovery
across backend and database restarts, real V1→V2 upgrade, no-op rerun, transactional
failure/retry, checksum/column/unique-index/rating-CHECK drift rejection, invalid credentials,
unavailable DB, runtime grants, failed writes/reads, retry and privacy across three
accounts. They check a positive personal recommendation with controlled model
inputs as well as library exclusions. Test method order follows the numbered
maintenance scenarios; run the whole file, not isolated numbered methods.
Fresh and upgrade scenarios use **separate databases** in the same dedicated cluster.
The existing H2 test suite remains separate regression coverage.

The explicit Mockito 5.23.0 startup agent avoids sandbox/JDK self-attachment
failures. The full suite uses an explicit isolated H2 regression resource and a
cleared environment, including an explicit temporary directory.

Live provider checks are **separate and opt-in**, using the actual backend client
beans and the same PostgreSQL provider property resource, without fixtures or
persistence. Set `MN_TMDB_KEY`/`MN_OMDB_KEY` in the server shell from a trusted
ignored file; do not put them on the command line. The two checks request TMDB
movie 550 and OMDb IMDb `tt0137523`, asserting only the expected identity/success.
They suppress response/exception details and preserve optional-enrichment behavior.

```sh
(cd repo/MovieNightBackend && MN_LIVE_PROVIDER_SMOKE=true \
 ./mvnw -Dtest=LiveProviderSmokeTest test)
```

Absent credentials means **blocked**, not a fixture pass. Ordinary regression
runs skip these two tests. No browser or Supabase execution is included. Frontend
assets use only `VITE_API_URL`; DB/provider/JWT settings stay in server processes.
The provider exception logs and generic HTTP failures are sanitized to avoid
credential URLs and SQL/row details.

## Explicit disposable cleanup

Use the exact directory printed by the test or selected for local setup. Stop the
backend first and stop that cluster. Cleanup refuses a running or unmarked target;
it has no JDBC/hosted connection logic. Do not reuse a personal directory.

```sh
/private/tmp/mn009-python/bin/python docs/features/009-durable-storage/local_postgres.py stop "$MN_LOCAL_DIR"
/private/tmp/mn009-python/bin/python docs/features/009-durable-storage/local_postgres.py cleanup "$MN_LOCAL_DIR"
```

After tests the cluster is already stopped: run only `cleanup` against its printed
directory. This deletes only that explicitly selected disposable cluster and its
synthetic accounts/logs. H2 files and hosted databases are unaffected.

References: [Spring database initialization](https://docs.spring.io/spring-boot/how-to/data-initialization.html),
[Flyway PostgreSQL](https://documentation.red-gate.com/fd/postgresql-database-277579325.html),
[transactional migrations](https://documentation.red-gate.com/fd/migration-transaction-handling-273973399.html).
