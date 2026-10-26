# Feature 011 implementation evidence

Date: 2026-10-25 (Europe/Bucharest).
Fixed implementation base: `5b0e9d77cdc91a8f16fc7575daecabf7304ea794` on
`feat/011-desktop-phone-usability`. Starting worktree was clean. No remote fetch,
commit, tracker publication, provisioning, deployment, push or merge.

**Acceptance remains incomplete.** Chrome automation and engineering checks do
not substitute for the required Safari smoke checks, manual interaction
walkthrough or actual 200% desktop browser zoom. Physical-phone testing is
optional and was not performed. This work is uncommitted and not integrated.

## Tested change boundary

The base plus the 17 changed/new frontend application, lockfile and browser-test
files has SHA-256 digest
`c3c84dd6bd83f6ed5ad0d286d18805a2a4e8919e7ac5bbc0bc3a5a6cee1b28b8`.
Compute it from the repository root with the following algorithm: take the sorted
union of `git diff --name-only <base> -- repo/MovieNightFrontend` and
`git ls-files --others --exclude-standard repo/MovieNightFrontend`; hash each
UTF-8 path, NUL, file bytes, NUL in that order. Documentation is excluded from
this digest to avoid self-reference. Final evidence applies to this working-tree
boundary, not to an implementation commit or release.

Concurrent unrelated work appeared after the clean starting inventory:
`roadmap.md` and untracked `mainPageLogo/test_*.png` files. These are
preserved and excluded from the proposed feature change set and reviews.
Feature 010, product/domain contracts and backend application code are unchanged.

## Acceptance results

The required manual walkthrough was not executed. A fully automated real-account
Chrome walkthrough did execute the corresponding flows at every agreed Chrome
size. Results below keep that distinction and required missing coverage visible.

| ID | Result | Actual evidence and remaining boundary |
| --- | --- | --- |
| UI01 | Blocked; Chrome automation passed | Signup containment and inactive-form accessibility at desktop/phone sizes; mismatch, taken username, pending duplicate-action prevention, controlled server failure and retained input. Real signup/sign-in throughout matrix. Required Safari/manual smoke remains unrun. |
| UI02 | Blocked; Chrome automation passed | Click/touch-emulated and keyboard navigation; open-menu focus containment/return and breakpoint scroll-lock cleanup. All core destinations reached. Required Safari/manual navigation remains unrun. |
| UI03 | Blocked; Chrome automation passed | Real movie/TV/anime discovery, search/details and missing-poster fixtures; independent reads prove browsing adds no library entry. Controlled long title/description/genre data fits narrow layout; no-hover keyboard shelf arrows work. Safari/manual details remains unrun. |
| UI04 | Blocked; automated real-API checks passed | At 360, 390, 844, 1280 and 1440 widths: watchlist → watched; null/0/7.5/cleared ratings; private note; equal-ID movie/TV independence; reload and re-login readback. Controlled pending/failed save never claims confirmed membership and explicit retry succeeds. Manual walkthrough remains unrun. |
| UI05 | Blocked; automated real-API checks passed | At all five Chrome sizes: two list memberships, removal from one, rename/delete and reload/re-login; custom-list-only candidate stays outside library. Edge-safe focused picker and keyboard-only deletion regressions pass. Required Safari/manual forms/overlays remain unrun. |
| UI06 | Blocked; automated real-account checks passed | At all five Chrome sizes: separate browser-created accounts invite/accept, view accepted profile, omit owner private-note text, remove and switch accounts through real sign-out/sign-in. New account has empty library/lists; source pages remain reachable. Manual walkthrough remains unrun; these probes are not exhaustive server authorization/race certification. |
| UI07 | Blocked; Chrome automation passed | Navigation target measured ≥44×44; shared control floor and visible input focus implemented. Phone navigation, landscape filters, list picker, removal modal and controlled trailer-frame keyboard entry/containment/return checked. Required Safari/manual interaction and comprehensive control-by-control measurement remain unrun. |
| UI08 | Blocked | Automated portrait/landscape, 1023/1024/1025 boundaries, long-content/error states and reduced-height 360×400 signup checks pass. Actual 200% browser zoom and physical keyboard/safe-area behavior are unverified; physical testing is optional. Required manual orientation/keyboard interaction remains unrun. |
| UI09 | Passed within Chrome automated boundary | At 360/390/844/1023, Settings pickers and quick-cycle button are absent from accessibility queries. Character remains in a reserved non-overlapping compact footer; selection is retained. No physical-device claim. |
| UI10 | Passed within Chrome automated boundary | Select black background/Courage on desktop, resize compact, reload, return at 1024/1025/1440: semantic pressed states recover; no preference reset. |
| UI11 | Blocked | Required Safari, manual walkthrough and actual desktop zoom evidence are missing. Engineering checks and independent reviews are recorded below; no full acceptance or integration claim. |

### Chrome execution

Browser: Google Chrome `155.0.8059.86`, driven by externally installed Playwright.
Node `22.20.0`; pnpm `10.34.3`; Temurin Java `21.0.13+9`; Maven wrapper `3.9.16`.
Core contexts: 360×800, 390×844, 844×390 with touch/mobile emulation; 1280×720
and 1440×900 desktop. All use reduced motion. Normal-motion interactions remain
unverified beyond source preservation. Targeted tests also resize the viewport
through the agreed boundary and reduced-height cases.

The [browser script](../../../repo/MovieNightFrontend/tests/browser/responsive-usability.cjs)
creates real disposable accounts through signup forms. Successful core flows use
real Spring controllers/services/JWT/JPA and the isolated demo H2 database.
Only external catalog/similarity inputs come from feature 008 fixtures. Tokens
are read from the legitimate browser session for independent authenticated GETs;
no identity/token is injected. The suite also exercises account switching in the
same browser session and isolated second-account contexts.

Explicitly separate controlled UI-state tests (`states`, `auth-states`,
`trailer-focus`) intercept selected app API responses or the embedded player.
They establish layout/focus/failure behavior only, not server persistence,
provider quality, accepted-friend scoring or live video playback. Real API
reads separately confirm that a controlled failed save created no membership.
The successful explicit retry uses the real API after interception is removed.

The final complete Chrome run passed **all 16 cases**, including all five core
viewport walkthroughs and both review regressions. It ran after both application
repairs against the digest above. Earlier red/failing runs informed repairs and
are not counted as final passes.

Screenshots are temporary artifacts under `/private/tmp/mn011/`:
`core-{360,390,844,1280,1440}.png` and matching `friends-*.png`.
Desktop and phone screenshots were visually inspected together. The final
capture waits for both content and poster entrance transitions; early captures
before poster settlement were discarded as incomplete visual evidence.
Screenshots supplement executed assertions; they do not prove interaction on
their own, and temporary artifacts may disappear when the system cleans `/tmp`.

### Reproduction commands

Run the tracked isolated [demo launcher](../008-production-readiness/demo.sh)
using Java 21, Node 22 and pnpm 10.34.3 on PATH:

```sh
./docs/features/008-production-readiness/demo.sh check
./docs/features/008-production-readiness/demo.sh run
```

The first setup attempt failed because the lockfile omitted the already-declared
`ogl` dependency. The lockfile repair adds only its importer/package/snapshot;
no dependency version policy or manifest changed. Actual local browser execution
used the existing installed frontend dependencies with the equivalent Vite demo,
provider fixture and Maven API processes while the lockfile was repaired. The API
used explicit `application-demo.properties`, synthetic signing material and
in-memory H2. This is not a fresh-checkout dependency-install certification.

From the root, with an installed Playwright module and installed Google Chrome:

```sh
MOVIENIGHT_PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
MOVIENIGHT_BROWSER_URL=http://127.0.0.1:8443 \
MOVIENIGHT_API_URL=http://127.0.0.1:8080 \
MOVIENIGHT_BROWSER_ARTIFACTS=/private/tmp/mn011 \
node repo/MovieNightFrontend/tests/browser/responsive-usability.cjs
```

Pass a case name to run a focused regression, such as `signup`, `preferences`,
`navigation-focus`, `controls`, `list-popover`, `core-390`, `states`, `friendship`,
`search-shelves`, `auth-states`, `keyboard-delete` or `trailer-focus`.
The default command executes all five `core-<width>` cases and the other cases.
The module path used here was
`/Users/juv/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`.
No new package runner or global dependency installation is required.
The temporary Vite, provider, API and Safari-driver services were stopped after
verification; the normal Safari app and unrelated processes were left running.

Engineering commands actually run (application directories as indicated):

```sh
# Frontend; Node 22/pnpm 10.34.3
pnpm exec tsc --noEmit
pnpm build
pnpm install --frozen-lockfile --lockfile-only --offline
# Backend; Java 21, explicit isolated configuration, no real provider keys
SPRING_CONFIG_LOCATION=classpath:/application-regression.properties \
TMPDIR=/private/tmp ./mvnw clean test \
 '-DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar -Djava.io.tmpdir=/private/tmp'
# Root
node --check repo/MovieNightFrontend/tests/browser/responsive-usability.cjs
git diff --check
```

The backend command ran with a cleared environment except HOME, PATH,
JAVA_HOME, TMPDIR and the explicit regression configuration. The cached Mockito
agent is an environment-specific prerequisite, not a portable default. Temporary
runtimes from feature 009 were reused: `/private/tmp/mn009-node/bin` and
`/private/tmp/mn009-java/Contents/Home`. pnpm was invoked through cached Corepack
with `COREPACK_HOME=/private/tmp/mn009-corepack`; the default shell instead has
Node/Java 25 and no pnpm, which is not the certified command environment.

Results: frontend strict typechecking/build, frozen-lockfile metadata consistency
and browser-script syntax passed. Full backend: **133 tests, 0 failures/errors,
2 opt-in live-provider tests skipped** (131 executed), 35.024 seconds.
Baseline frontend typecheck/build and focused authenticated watched-history tests
(8 tests) passed before application edits. No backend application/test edits.
Vite reports its existing `__dirname` configuration warning and a final bundle
size warning (>500 kB); neither was silently treated as an error or performance
certification. The optional Impeccable detector was attempted once but unavailable
(`bundled detector not found`); no detector pass is claimed.

### Missing browser coverage

Safari `26.6.2 (21624.5.1.11.3)` is installed. The local `safaridriver --port 4445`
service rejected session creation: “You must enable 'Allow remote automation' in
the Developer section of Safari Settings to control Safari via WebDriver.”
Native CUA selection worked, but attempted actions were refused with a user-change
state error even after rereading state. The Chrome CUA connector was unavailable.
No security/settings change was made to bypass these limits. Required Safari
390×844 and 1440×900 smoke checks remain blocked; WebKit substitutes were not
reported as Safari passes.

An isolated headed Chrome experiment sent five `Meta+Equal` shortcuts but
measurements stayed at width 1200, devicePixelRatio 2, visualViewport.scale 1.
That did not produce 200% browser zoom, so **actual desktop zoom remains Not run**.
Viewport resizing, high devicePixelRatio and pinch scaling are not relabelled as
browser zoom. The required manual core-flow walkthrough also remains Not run;
scripted browser actions and visual inspection of captures are recorded as such.

To close acceptance, execute and record the agreed Safari smoke checks, manual
core flows with keyboard/touch review, and verified actual desktop 200% browser
zoom. Record exact browser/version/viewports and actual expected/observed results.
Physical-device keyboard/safe-area evidence remains optional and separate.

## Independent code review

Both reviews ran independently against the fixed base, including uncommitted
frontend modifications and the two new frontend files, with the local feature
spec as authority. Concurrent roadmap/logo work was excluded. This deliberately
uses working-tree diffs and explicit new-file reads, not the skill's usual
committed-only three-dot comparison:

```sh
git diff 5b0e9d77cdc91a8f16fc7575daecabf7304ea794 -- \
 repo/MovieNightFrontend docs/features/011-desktop-phone-usability
git ls-files --others --exclude-standard repo/MovieNightFrontend \
 docs/features/011-desktop-phone-usability
```

Standards sources: root/frontend AGENTS.md, frontend CLAUDE.md and DESIGN.md,
tech-stack.md and the workflow, plus the code-review skill's smell baseline.
Initial Standards review: no actionable findings. Initial Spec review: two P2
keyboard findings, both addressed:

1. Nested list Delete/confirmation Enter bubbled into card navigation. Guard the
   card keyboard handler to act only when the card itself is the event target.
   The new `keyboard-delete` regression failed before and passed after repair.
2. Modal focus enumeration omitted iframes, trapping focus on Close. Include
   iframe focus boundaries, retain focus after native cross-frame Tab, and restore
   the trigger. The controlled `trailer-focus` regression failed before and passed
   after repair; the first fixture attempt was invalid and corrected before the
   meaningful red/green test. The test waits for the fixture player to load.

Final independent re-review: Standards reported no actionable findings; Spec
reported both P2 findings resolved and no remaining source-level blockers.
Both reviewed the repairs, added regressions and evidence boundaries. Their
pending-result documentation notes were resolved against the final 16-case
output; concurrent artifact wording was corrected to avoid a stale fixed count.
There were 0 final actionable findings on either axis. Neither review certifies
the unavailable Safari/manual/zoom acceptance.

Final documentation checks: relative links in both feature documents resolve;
UI01–UI11 each has one acceptance row and one validation row; tracked and all
three new-file whitespace checks and browser-script syntax passed. The 17-file
frontend digest was recomputed and matched. The proposed 19-file inventory is
recorded in the spec's human-review checkpoint; concurrent files remain excluded.
