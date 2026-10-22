# TV and anime TV discovery and tracking

Status: agreed unpublished local contract, confirmed 2026-10-21; implementation
in the local worktree on 2026-10-22, verification and human review in progress. Roadmap: milestone 7, first TV slice.
Product requirements: P01–P06, P09, P11/P12; existing friendship privacy applies.
GitHub issue: not published.
Fixed specification base: `52976c0a13c2b74c2eda5e7b717ca55a1794de57` on
`feat/006-personal-movie-recommendations`. Starting worktree was clean; no remote
fetch. This does not establish integration into `main`.

## Outcome

A signed-in person can discover TV and anime TV, open details, deliberately save
titles to their watchlist or watched history, retain optional ratings/private
notes, and organize them in private custom lists using the existing workflows.
A movie and TV series sharing a numeric provider ID remain independent. TV Series
and Anime TV are separate, non-overlapping app categories with their own pages
and filters. Both use the provider's TV resource identity; classification does
not create a second catalog title. Browsing never creates library or list membership.

## Acceptance criteria

| ID | Given / when | Expected result |
| --- | --- | --- |
| TV01 | Explore, search and open details for movie 123 and TV 123; repeat reads with both cached | Both titles coexist with their own metadata and typed identity. Details use the requested resource endpoint; neither metadata nor IDs are borrowed from the other type. Reads/details create no library or custom-list membership. |
| TV02 | Discover a TV-endpoint title with Animation genre and Japanese original language or Japanese origin country | Classify it as Anime TV consistently in Explore, search, details and category filters; exclude it from TV Series pages and filtered results, including cached discovery. TV Series contains TV resources not classified as Anime TV. Keep separate pages/filters and deduplicate within each category. Missing classification metadata does not establish anime membership. A movie-endpoint animation never becomes anime TV. |
| TV03 | Save equal-ID movie/TV titles to watchlist repeatedly, including concurrent duplicate requests, then independently read/reload | One library entry per owner per typed title. Both entries coexist; saving or pending state for one does not mutate or block the other. Repeated saves of an anime series through discovery, search or details refer to the same provider TV identity and remain idempotent. |
| TV04 | Mark a TV title watched directly or from watchlist; save unrated, 0 and 7.5, clear the rating, and reload | One watched entry replaces watchlist membership. Missing and zero stay distinct, fractions survive, and only 0–10 half-point ratings are accepted. The equal-ID movie is unchanged. Existing private-note workflows apply to the TV entry. Invalid writes do not alter confirmed data. |
| TV05 | Add equal-ID movie/TV titles to two private lists; repeat a TV add via anime discovery; remove one membership or delete one list | Typed titles coexist; each appears at most once per list. Other memberships and library status remain unchanged. Custom-list-only titles remain outside the library. Existing list creation/rename/deletion rules remain in force. |
| TV06 | A write fails; provider/read requests fail, return empty, or lack optional metadata; retry | Clear pending/failure feedback and explicit retry; failed writes do not claim confirmed persistence. Valid emptiness differs from failure. Never use a different resource endpoint, invented metadata or a different recommendation source as a silent fallback. Missing posters have the existing fallback; missing optional year/rating stays absent. Other saved library titles remain usable. |
| TV07 | Anonymous caller accesses personal data; another owner accesses TV notes/lists or mutates an entry; friendships are pending, accepted, then removed | Server enforces existing ownership and friendship rules for TV exactly as for movies. Notes and custom lists stay owner-only. Only accepted friends can see permitted status/ratings; revocation applies on the next read. Provider credentials remain server-side. |
| TV08 | Equal-ID movie/TV titles are saved, listed, or watched; read personal/friend recommendations and refresh shared caches | Both recommendation workflows remain movie-only under features 005/006. TV history supplies no movie seeds or friend candidates and excludes no distinct movie. Movie watchlist/watched entries still exclude that movie on current reads; custom-list-only membership does not exclude it. Catalog, discovery and personal-cache keys cannot collide across resource types. |
| TV09 | A title request omits resource type, supplies invalid/ambiguous provider identity, or supplies an unambiguous internal catalog key | Provider identity requires movie/TV type; an internal key must resolve exactly one catalog title. Missing/invalid/ambiguous identity receives a clear client error without mutation or cross-endpoint guessing. No title-text, arbitrary-cache-row, or numeric catalog/provider-ID fallback selects a different title. All current clients send the agreed identity. |
| TV10 | Migrate a verified legacy H2 fixture containing catalog rows, multiple owners, memberships, ratings, notes and private lists; rerun | An explicit versioned migration establishes typed catalog/cache identity while preserving catalog primary keys, user relationships and user values. Equal-ID movie/TV records can subsequently coexist. Disposable discovery/personal caches may be invalidated and rebuilt without changing user data. A rerun is safe and does not duplicate or lose records. |
| TV11 | Migration encounters a legacy row whose resource type cannot be verified, especially ANIME; resolve it with an explicitly reviewed mapping and retry | Stop before applying changes and report the ambiguous rows requiring mapping. No blanket ANIME→TV conversion, speculative provider-ID inference, partial migration or data reset. With verified mappings, migration completes and retains user data; an anime film is never silently retyped as TV. |
| TV12 | Use equal-ID titles across current frontend views/actions, refresh/reload, or change accounts while a response is pending | Typed identities survive mapping, selection, detail navigation, list/library mutations, pending/error state and deduplication. Confirmed reads recover the correct saved state. Prior-account data is cleared and late responses cannot populate another account or overwrite the other resource type. |

## Decisions and test boundary

### Agreed decisions

The user confirmed scope, verification, anime classification, migration and
request-identity behavior, then confirmed the complete understanding on
2026-10-21. Subsequent clarification on the same date supersedes the original
permission for overlapping discovery: TV Series and Anime TV must be mutually
exclusive app categories. The user selected a **new feature 007 record**, superseding the
original request to write into feature 006. Preserve feature 006 unchanged.
No open product decision blocks this contract. This local record governs until
deliberate publication under [the workflow](../../movienight-workflow.md).

Reuse the [recorded dependency preflight](../../../roadmap.md#dependency-preflight--2026-10-21),
[product rules](../../../spec.md), [glossary](../../../GLOSSARY.md), and existing
feature contracts. Do not reopen movie scoring, friend ranking, list rules,
rating range, privacy or explicit-save semantics. The recorded preflight is
source evidence, not a runtime pass. Roadmap status text predates the fixed base;
this specification neither rewrites that history nor declares integration.

Identity is provider resource type plus provider ID. Anime is a classification,
never a third resource identity. Apply this distinction through persisted catalog
uniqueness, caches, request/response mappings, frontend IDs and exclusions. User
relationships continue to reference catalog records; preserve their primary keys
during migration. Internal key shape, DTO names and route layout are implementation
choices within TV09. Existing untyped clients fail clearly until updated together
with the server; implicit movie-default compatibility was not selected.

Use Animation genre plus (Japanese original language **or** Japanese origin
country), restricted to TV resources, consistently across discovery and details.
This includes Japanese-origin TV animation whose original language is not Japanese.
The app's TV Series category excludes titles classified as Anime TV. Preserve
their separate pages, shelves and filters; apply the same classification to
search results and cached discovery so recognized anime does not leak into TV
Series. An unfiltered search can show both categories, with each title appearing
once and carrying its correct classification. Provider TV identity remains shared
as a resource type, not as overlapping app category membership. Missing evidence
does not prove anime classification. No anime-film discovery expansion is included.

Keep H2 for this local slice; introduce an explicit versioned migration rather
than relying on automatic schema update to establish the new invariants. Select
the migration mechanism during implementation and test the actual mechanism.
It must support legacy-fixture execution, safe reruns and stopping on ambiguity
before changes apply. Existing ANIME values alone do not prove TV origin: current
provider classification can also mark anime films ANIME, and historical detail
lookup can cross endpoints. Require verified resource types or explicit reviewed
mapping; do not infer solely from numeric IDs. Do not silently discard unsupported
legacy user records. Disposable caches may be rebuilt; production database and
operational migration procedures remain separate deployment work.

Source investigation found globally unique catalog provider IDs, untyped personal
cache uniqueness, numeric-only frontend keys and lookups, cross-endpoint fallback,
and TV/anime rejection in private-list handling. These are seams to change, not
new exceptions to the contract. Preserve movie-only recommendations from
[feature 005](../005-friend-suggestions/spec.md) and
[feature 006](../006-personal-movie-recommendations/spec.md), including their
errors, ranking, coverage explanations and current exclusions.

Likely implementation files/seams (not changed by this task): backend catalog,
personal-recommendation and discovery-cache entities/repositories; provider DTO
classification and discovery scheduler; `MovieCatalogLookupService`,
`UserMovieService`, `CustomListService`, recommendation/suggestion services and
affected controllers/DTOs; versioned migration resources/configuration and tests.
Frontend API mappings, `MovieStore`, `useSuggestions`, typed title models,
detail/Explore/library/list views and shared title actions will need corresponding
identity updates. Preserve the existing visual system. The implementer must
inventory actual files and state the intended implementation scope before editing.

The glossary already defines Title, Library entry, Explore and anime TV as a TV
classification. No new domain term is introduced. No separate ADR is needed to
repeat product-wide typed identity; the local migration boundary belongs here.

### Agreed verification boundary for implementation

Use real JWT-authenticated HTTP through controllers, services and repositories
with isolated H2, stubbing only external providers and controlling catalog/cache
fixtures. Verify independent reads after actual mutations rather than repository
mock assertions. Include concurrent/repeated writes, both resource types with
equal numeric IDs, repeated anime saves, category separation, invalid requests, two owners and accepted/pending/
revoked friendship privacy. Exercise search/details/discovery with deterministic
provider metadata, empty responses and failures. Reuse existing API fixtures and
preserve movie-only friend/personal regression suites, including shared refresh
and scheduled cache writes.

Execute the actual versioned migration against a seeded legacy schema with real
foreign keys and user values. Assert primary-key/value/membership preservation,
new typed uniqueness, safe rerun, and no applied changes on ambiguous rows. Supply
an explicit verified mapping in the successful retry fixture. Fresh-schema tests
alone cannot prove migration. This is local migration evidence, not production
restart/release retention or a tested production upgrade procedure.

Review frontend source for every current consumer of title identity, including
keys, mapping, navigation, deduplication, pending mutations, save feedback, reload,
privacy and account/late-response guards. Run strict frontend typechecking and a
production build. Browser execution is excluded by user choice: source review and
build checks do not prove rendering, interactions, timing or accessibility. Do not
mark browser acceptance fully passed from source inspection.

At implementation start establish affected baselines using
[tech-stack.md](../../../tech-stack.md); record pre-existing failures separately.
Focused API/migration checks must be followed by the full backend suite, strict
frontend typecheck/build and diff checks. Record actual suite names and results;
planned commands are not passes. Obtain independent Standards and Spec reviews
against this contract and the fixed implementation base, stating the actual diff
boundary. The base above is the specification base, not automatic permission to
implement on a later changed worktree.

```sh
# repo/MovieNightBackend: add the actual focused API/migration suite names
./mvnw test
# repo/MovieNightFrontend
pnpm exec tsc --noEmit
pnpm build
# repository root
git diff --check
```

Existing pnpm/declared-runtime, Mockito attachment and ignored local configuration
limitations remain as recorded in tech-stack and feature 006. Use explicit
provider-key overrides for isolated checks; record any required workaround and
runtime versions without copying secret values. No runtime baseline is rerun for
this specification-only task.

## Out of scope

- Commit, push, merge, tracker publication, roadmap integration updates or claims
  that the entire milestone 7 is complete. The user authorized this implementation
  on 2026-10-22 after reviewing the recorded gaps.
- TV/anime personal recommendations or friend-ranking expansion; changes to movie
  recommendation scoring, new ML methods or quality/latency guarantees.
- Episode/season tracking, anime-film discovery expansion, public custom lists,
  new library statuses, redesign, polling/push or automatic retry loops.
- Browser execution, real-account browser end-to-end certification, live-provider
  connectivity/quality certification or accessibility certification.
- Production database selection, hosting, production migration operations,
  restart/release retention, backup/restore, onboarding/recovery or deployment.
- Destructive data reset, guessed legacy type conversion or silent user-data loss.

## Historical specification validation

Specification recorded 2026-10-21 against the fixed base above. Git inventory and
read-only document/source inspection were performed; no application, browser,
provider or migration checks were run. No implementation exists for this contract.
Historical feature-006 results do not certify this slice.

Documentation checks: `git diff --check` and the new-file
`git diff --no-index --check /dev/null docs/features/007-tv-anime-tv/spec.md`
reported no whitespace errors (the latter returns 1 for the new-file difference).
A local link/ID check confirmed that every relative file link resolves and each
TV01–TV12 has both an acceptance row and a Not run validation row. Git status
showed only this new record; tracked diff was empty.

| Acceptance ID | Result | Planned evidence / limit |
| --- | --- | --- |
| TV01 | Not run | Typed catalog/details/discovery API fixtures; read-only membership assertions. |
| TV02 | Not run | Anime classification matrix; recognized anime absent from TV Series pages/filters and cached rows; unfiltered search deduplication; frontend source only. |
| TV03 | Not run | Equal-ID and concurrent/repeated authenticated save/read fixtures; pending UI source only. |
| TV04 | Not run | TV watched/rating/note persistence, invalid ratings and movie-isolation API cases. |
| TV05 | Not run | Private-list cross-type/alias deduplication, independent memberships and deletion API cases. |
| TV06 | Not run | Failed writes/provider reads, valid empty and retry fixtures; feedback/fallback source only. |
| TV07 | Not run | Authentication, ownership, note/list privacy and friendship-revocation API cases. |
| TV08 | Not run | Movie-only friend/personal regression, exclusions and typed shared-cache fixtures. |
| TV09 | Not run | Missing/invalid/ambiguous identity rejection and no-mutation API cases; client source audit. |
| TV10 | Not run | Actual legacy-schema migration, data/foreign-key preservation and rerun fixtures. |
| TV11 | Not run | Ambiguous legacy migration stops unchanged; verified mapping enables safe retry. |
| TV12 | Not run | Independent API reload reads plus frontend identity/account/response source audit; browser timing unverified. |

## Historical documentation review checkpoint

One new file: `docs/features/007-tv-anime-tv/spec.md`, containing the confirmed
outcome, TV01–TV12, decisions, exclusions and implementation test boundary.
No modified/deleted files or unrelated changes are intended. Feature 006 and all
application code remain unchanged. User-visible application behavior is unchanged;
the change makes the next TV slice reviewable before implementation.

Inspect the new, unstaged record separately from tracked diffs:

```sh
git status --short --untracked-files=all
git diff --stat
git diff -- docs/features/006-personal-movie-recommendations/spec.md
cat docs/features/007-tv-anime-tv/spec.md
git diff --no-index -- /dev/null docs/features/007-tv-anime-tv/spec.md
```

The final command returns 1 when it displays the new-file diff. No commit,
publication or implementation is authorized by this documentation checkpoint.
Wait for explicit approval before committing under
[the human-review rule](../../movienight-workflow.md#human-review-checkpoint).


## Implementation decisions — 2026-10-22

Fixed implementation base: `76a9eaf` on `feat/007-tv-anime-tv`. The user committed
feature 006 follow-ups and the 007 specification before implementation; the starting
worktree was clean. This work supersedes the earlier specification-only boundary.
The original specification base and historical checks above are retained as history.

Provider resource identity is represented by `ResourceType.MOVIE` or `TV`, separate
from the `MOVIE`/`TV`/`ANIME` app classification. Catalog and personal-cache unique
keys include resource type. API category hints `TV` and `ANIME` both explicitly
identify the TV resource; missing/unknown hints fail. Saves may instead supply an
exact `catalogMovieId`, with conflicting provider identity rejected. Catalog-only
manual titles retain their server-allocated catalog identity. Requests no longer
match titles by display text or reinterpret a catalog key as a provider number.

Frontend title IDs are `movie:<provider-id>`, `tv:<provider-id>`, or
`catalog:<catalog-id>`. All API mapping, navigation, library/list membership,
pending writes and details use those IDs. Anime shares the `tv:` identity; separate
TV Series and Anime TV pages and filters remain. Provider discovery uses the same
Animation plus Japanese language/origin classification as search/details. Broad
TV results are filtered; anime discovery requests Animation without a language-only
restriction, then applies the agreed rule. Result sets are bounded by existing
provider pages, so filtering can produce sparse shelves. No coverage guarantee is
added. Cached discovery also excludes titles already recognized as anime in catalog.

Configured provider failures remain errors; valid empty results remain empty. On
startup/background refresh, provider failure rolls back discovery cache changes
without preventing access to saved libraries. Explicit discovery reads can retry.
Frontend discovery no longer invents local filler after an empty/failed API read.
Details use the requested endpoint only. Notes and removals now apply confirmed
writes with pending/failure feedback instead of showing unconfirmed success.

### Local H2 versioned migration

`IdentityMigrationConfiguration` makes `LocalH2IdentityMigration` run before the
entity manager/Hibernate schema initialization. V1 uses JDBC and a migration ledger,
with no new dependency or production database choice. Fresh databases are created
with the new entity schema. Legacy catalog rows require an explicitly reviewed
properties file keyed by **catalog primary key**, including legacy MOVIE/TV rows
whose old cross-endpoint lookup did not establish reliable provenance. Example
syntax only (these IDs are illustrative, not mappings for actual user data):

```properties
1=MOVIE
2=TV
3=ANIME
```

Configure `app.catalog-migration.mapping-file=/absolute/path/reviewed.properties`
when starting the backend. Values describe verified app classification; ANIME
maps to provider TV identity, while a legacy anime film must be mapped MOVIE.
Never generate these assignments from numeric provider IDs or legacy type alone.
The migrator reports unmapped catalog IDs and stops before any schema/data change.
It preserves catalog keys, ratings, notes and all foreign-key relationships,
removes both legacy unique constraints and standalone untyped indexes, establishes
typed uniqueness, and invalidates disposable caches. H2 DDL auto-commits, so an
interrupted non-ambiguity failure blocks startup and can resume with the identical
mapping fingerprint. The ledger is completed only after invariant checks; completed
reruns verify the schema and retain rebuilt caches. Fixture tests cover successful
conversion, ambiguity with no writes, completed rerun and interrupted resume.

No actual user database was migrated in this task. Production migration operations,
backup/restore and restart/release retention remain deferred. H2 fixture persistence
proves only the local schema/transaction and migration boundaries agreed above.
