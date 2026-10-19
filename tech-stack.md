# MovieNight engineering stack

The table records declarations observed in the repo. Actual installed versions
and check outcomes are recorded separately in the
[2026-10-13 baseline validation](docs/features/000-baseline/report.md).
Consult the manifests when versions change.

| Area | Current declaration or implementation | Evidence |
| --- | --- | --- |
| Browser app | React ^19, TypeScript ^5.7, Vite ^8, Tailwind ^4 | `repo/MovieNightFrontend/package.json` |
| Frontend tools | Node 22, pnpm 10.34.3 | `repo/MovieNightFrontend/.mise.toml` |
| Navigation | Custom in-memory router; scaffold intentionally omits browser history | Frontend `AGENTS.md`, `CLAUDE.md`, and app shell |
| API | Java 21, Spring Boot 4.1.1, Spring MVC | `repo/MovieNightBackend/pom.xml` |
| Persistence | Spring Data JPA and H2 | Backend manifest and models |
| Authentication | Spring Security, BCrypt, JWT | Backend security and user service |
| Backend tools | Maven wrapper, Maven 3.9.16 | Backend wrapper configuration |
| Discovery | TMDB catalog, optional OMDb enrichment, remote image URLs | Backend provider clients and catalog service |
| Personal movie recommendations | MovieLens item similarity; Python with pandas, NumPy, SciPy, scikit-learn; generated CSV consumed by Java | `repo/ml/train_similarity.py`, similarity loader |
| Work tracking | GitHub Issues and `gh` | `docs/agents/issue-tracker.md` |

## Verification commands

From `repo/MovieNightFrontend/`:

```sh
pnpm exec tsc --noEmit
pnpm build
```

The frontend has a strict TypeScript configuration. Its build runs Vite and does
not replace typechecking. No automated frontend test framework or test script
was declared during the baseline audit. Feature 001 subsequently used the
standalone [watchlist browser checks](repo/MovieNightFrontend/tests/browser/watchlist-save.cjs)
with an externally installed Playwright module and Chrome. Its
[feature record](docs/features/001-reliable-watchlist-save/spec.md) documents the
setup and recorded results; no package test runner was added.

From `repo/MovieNightBackend/`:

```sh
./mvnw test
```

For a focused existing test:

```sh
./mvnw -Dtest=MovieCatalogLookupServiceTest test
```

Task 0 attempted the frontend checks and full backend suite. pnpm was
unavailable; the installed TypeScript executable and `npm run build` passed as
fallbacks. `./mvnw test` failed on
Mockito JVM attachment; a clean test run with an explicit cached Mockito agent
passed all 77 tests. See baseline validation for exact commands and versions.
These workarounds do not verify the declared Node 22 / Java 21 setup.

The current Vite config imports ignored `.figma/make/site.json`, and backend
local `application.properties` is ignored. A fresh checkout needs explicit
configuration. The tracked properties example contains credential defaults
that require cleanup before use as a shareable setup template. Prerequisites
and provider credentials must be configured separately; never include secret
values in specs, tickets, or validation reports. Live provider connectivity was
not verified by the baseline test run.

## Constraints and decisions still ahead

Keep the existing stack as the development baseline while building toward a
publicly deployed application. Production persistence, hosting, supported
account onboarding/recovery, browser navigation, operating costs, and deployment
configuration require dedicated feature specs in the required deployment
milestones. H2 and the Figma-oriented navigation are observed development facts,
not automatically selected production choices. Existing development-only
behavior must not be treated as production readiness.

TV/anime recommendations currently use a different path from movie similarity.
MovieLens coverage must not be described as covering every provider title.
