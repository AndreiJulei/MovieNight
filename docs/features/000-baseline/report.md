# MovieNight baseline audit

Date: 2026-10-13, Europe/Bucharest. Audit committed as `a775f3c`, included in
local `main` at `3fc94fd` (ancestry checked 2026-10-21). Findings below are historical.
Audited commit: `891b5078416ee754bd1293314e15eeb940884691` on `main`.
Product contract: [root spec](../../../spec.md). No GitHub issue was published.

## Purpose and boundary

Establish engineering health and product gaps before reliable watchlist saving.
The audit changed documentation only. Its initial Git inventory was clean;
committed application behavior still contained the gaps below.

Audit criteria B01–B05 were recorded as passed: inventory Git state, attempt the
existing checks, distinguish source findings from runtime evidence, recheck the
product contract, and identify the next slice while preserving unrelated work.
The product acceptance examples P01–P14 were not run by this audit.

## Environment

Installed: Node 25.3.0, npm 11.6.2, TypeScript 5.9.3, Vite 8.2.2, React 19.2.8,
Java 25 compiling release 21, Maven 3.9.16, and Mockito 5.23.0.
The declared Node 22 / Java 21 toolchains were not verified; pnpm/mise were absent.
Installed dependencies, Maven caches, ignored frontend `.figma/make/site.json`,
and ignored backend `application.properties` were already present.

## Commands and recorded results

Frontend working directory: `repo/MovieNightFrontend/`.
Backend working directory: `repo/MovieNightBackend/`.

| Directory | Command | Actual result |
| --- | --- | --- |
| Frontend | `pnpm exec tsc --noEmit` | Exit 127: pnpm not found; typecheck did not run |
| Frontend | `pnpm build` | Exit 127: pnpm not found; build did not run |
| Frontend | `npm exec --offline -- pnpm --version` | Exit 1: pnpm unavailable in npm cache; no installation |
| Frontend | `./node_modules/.bin/tsc --noEmit` | Exit 0: typecheck passed with installed TypeScript |
| Frontend | `npm run build` | Exit 0: Vite production build passed, 163 modules transformed |
| Backend | `./mvnw test` | Exit 1: 77 tests, 0 assertion failures, 76 errors, 0 skipped; context test passed, Mockito tests could not initialize |
| Backend | Explicit-agent clean test command below | Exit 0: 77 tests, 0 failures, 0 errors, 0 skipped |

The successful backend invocation was:

```sh
./mvnw -DargLine="-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar" clean test > /tmp/movienight-task-0-backend-agent.log 2>&1
```

The absolute agent path is specific to this machine; locate the resolved jar
in your Maven cache for another environment. No POM change was made.

The first backend run failed because Byte Buddy could not self-attach to the
current JVM using an external process. Loading Mockito at JVM startup avoided
that failure. The successful run compiled 91 main source files and 16 test
source files with release 21, so it did not rely on stale compiled classes.

Surefire reports confirmed 77 passing tests after a clean rebuild. Vite's future
native-config-loader warnings remain. The backend used in-memory H2 and logged
TMDB I/O errors; live discovery was not established by the passing suite.

## Source findings at the audited commit

These findings come from source inspection unless explicitly identified as
runtime evidence above. They are existing gaps, not regressions from this audit.
Paths below are relative to `repo/`.

| Area / product examples | Current evidence | Follow-up |
| --- | --- | --- |
| Discovery and library ownership, P01 | Backend `MovieCatalogLookupService` persists catalog metadata separately; frontend details use catalog upserts. Source separation exists; browse/details/reload flow not run | Validate no implicit library add in milestone 1 |
| Watchlist save, P02/P12 | Frontend `MovieStore.addToWatchlist` changes local entries before the POST completes; `MovieDetailPage` emits a success toast immediately. API non-OK responses become null; no failure rollback in this path. Library refresh retains unmatched local entries and skips replacement for empty results | Milestone 1: confirmed persistence, duplicates, pending/failure/retry behavior |
| Watched state and ratings, P03/P04 | Frontend `addMovie` omits zero through a truthiness check and rounds fractions; `markWatched` rounds too. Backend request/response/model ratings are integers. `UserMovieService.updateMovieEntry` ignores a null rating, so that request cannot clear an existing rating | Milestone 2: optional half-point values, zero, clear-rating contract, reload |
| Custom-list identity, P05/P06 | Frontend `createList`/`toggleMovieInList` send numeric frontend title IDs, commonly provider IDs. Backend `CustomListService` resolves catalog primary keys. Local optimistic lists are also kept in localStorage | Milestone 3: explicit catalog identity and owner-only persistence |
| Existing public lists, P06 | Backend supports `isPublic`, public enumeration, and non-owner reads of public lists. Frontend creation sends false; server capabilities still exceed the owner-only release contract | Milestone 3 and deployment: reconcile deferred sharing with server rules |
| Friendship consent and notes, P06/P07 | `FriendshipService.addFriend` saves two friendship rows immediately; `getFriendLibrary` returns the owner's ordinary response, including notes. No invitation/acceptance state exists in this path | Milestone 4: consent lifecycle and private-field filtering |
| Friend-ratings authorization, P06/P07 | `MovieController.getFriendsRatings` accepts caller-supplied user IDs without requester identity; `UserMovieService.getFriendsRatings` returns notes. `SecurityConfig` permits GET `/api/movies/{numericId}/**`, which includes this endpoint | Milestone 4 and deployment: server access control, including anonymous and non-friend reads |
| Friend ranking, P08/P09 | Repository consensus query uses watched, non-null ratings and average times distinct raters; separate watchlist query exists. Frontend `useSuggestions` has a separate fallback using high ratings/watchlists | Milestone 5: verify scoring/exclusions across all paths with fixtures |
| Personal recommendations, P09/P10 | Backend recommendation seeds include watched **or rated** entries. `SuggestionService.getSuggestions` substitutes popular titles into a row titled Personal Recommendations; frontend hooks also compute fallbacks | Milestone 6: watched-history seeds and honest source/limitation states |
| Provider identity, P11 | Backend `Movie` uniquely constrains raw `tmdbId`; catalog lookup can overwrite media type on that same record. Frontend store keys titles by numeric provider ID, without resource type | Milestone 7, or earlier if a slice exposes collisions |
| Persistence and onboarding, P13/P14 | Context run used `jdbc:h2:mem:movienightdb`; no restart/release persistence demonstrated. `UserService` returns a development reset code; H2 console is permitted. Tracked properties example contains hardcoded JWT/provider credential defaults; values intentionally omitted here | Milestones 9–10: durable persistence, supported recovery, secret configuration, operational validation |

## Follow-up and limitations

Feature 001 addresses watchlist saves; the other findings remain assigned to
their roadmap milestones. This is a dated baseline, not a current defect list.
See the [feature record](../001-reliable-watchlist-save/spec.md) for its later
implementation and validation evidence.

Fresh-checkout reproducibility still requires resolving the toolchain, Mockito
startup, and ignored Figma configuration prerequisites. Provider connectivity,
authenticated product flows, restart retention, and deployment need their own
checks. Preserve failed attempts when recording successful workarounds.

Documentation reconciliation on 2026-10-19 corrected the roadmap's deployment
deferral to match the mission and product spec, and aligned the frontend design
notes with public access and explanatory states. Earlier imported design prompts
and `specEg.md` remain historical context. No product decision was changed by
this reconciliation. No consequential trade-off required an ADR.

The original audit recorded passing diff/link checks. No commit, PR, or merge
was performed as part of that audit; integration remains pending.
