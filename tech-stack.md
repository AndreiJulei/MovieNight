# MovieNight engineering stack

This records declarations observed in the repo, not verified installed versions
or successful test results. Consult the manifests when versions change.

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
was found during this exploration. Establish one in a feature spec if browser
behavior needs automated coverage; record manual checks until then.

From `repo/MovieNightBackend/`:

```sh
./mvnw test
```

For a focused existing test:

```sh
./mvnw -Dtest=MovieCatalogLookupServiceTest test
```

Commands are documented here but have not been run as part of creating these
documents. Prerequisites and provider credentials must be configured separately;
never include secret values in specs, tickets, or validation reports.

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
