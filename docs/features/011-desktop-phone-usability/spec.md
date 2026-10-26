# Desktop and phone usability

Status: agreed unpublished local contract, confirmed 2026-10-25. Implementation
is uncommitted; required browser validation is incomplete; not integrated.
Roadmap: 9a (Desktop and phone usability). Product requirements: P15, with
representative regressions of P01–P12; no deployment certification.
GitHub issue: not published.
Fixed specification base: `3e6a7dac45368240a83e3bfdb38de6a27d456e02` on
`feat/009-durable-storage`. Existing modified `roadmap.md` and `spec.md` supplied
the current product direction and are preserved. No remote fetch.

Fixed implementation base: `5b0e9d77cdc91a8f16fc7575daecabf7304ea794` on
`feat/011-desktop-phone-usability`; implementation started with a clean worktree.
The specification-session changes above were already committed at this base.
Concurrent roadmap/logo edits during implementation are excluded; see the
[implementation evidence](validation.md).

## Outcome

A person can use MovieNight's existing core flows on desktop and phone through
reachable touch and keyboard controls, without clipped forms or page-level
horizontal overflow. In particular, desktop account creation keeps every field,
validation message and submit action inside its panel. Preserve the current
visual identity and product semantics. Compact layouts omit background and
character customization controls while continuing to display saved selections.

## Acceptance criteria

These IDs remain stable if wording is clarified; do not renumber existing IDs.
The coverage matrix and execution allocation below apply to this table.

| ID | Given / when | Expected result |
| --- | --- | --- |
| UI01 | Switch between sign-in and signup; enter invalid input, a taken username, mismatching passwords and server errors; submit successfully | Every active field, feedback message and submit/mode-switch action fits inside the active panel and is reachable by scrolling when necessary. No content spills below its panel or causes page-level horizontal overflow. Hidden form controls cannot receive keyboard focus or appear as active controls to accessibility navigation. Pending submission prevents duplicate actions; failures remain visible and usable. |
| UI02 | Navigate Home, Explore Movies/TV/Anime TV, library, custom lists, Friends, both recommendation sources and Settings using compact and desktop navigation | All destinations and search are reachable by touch and keyboard without hover. Content and essential controls remain clear of fixed navigation; menus fit the viewport and can scroll. Navigation changes neither product rules nor catalog/library state. |
| UI03 | Browse categories, search and open details for movie, TV and anime TV, including missing posters/metadata, long titles and descriptions | Content reflows without page-level horizontal overflow or unreachable actions. Intentional horizontal poster shelves remain usable by touch and keyboard. Opening details/browsing does not add library or custom-list membership; typed identities and anime classification remain unchanged. |
| UI04 | Save a title to watchlist repeatedly; mark it watched; edit/clear ratings including unrated, 0 and 7.5; edit a private note; reload and re-login | Existing actions are usable in the responsive layouts and recover confirmed state through the real API. One library entry per typed title, exclusive watchlist/watched states, exact optional ratings and owner-only notes remain intact. Pending/failure feedback is reachable; failed writes never appear as confirmed success. |
| UI05 | Create/rename a custom list, add a title to two lists, repeat a membership, remove it from one list and delete that list, including an inline create/popover near a viewport edge | List controls, inputs, feedback and dismissal remain reachable. Confirmed list changes recover after reload/re-login; remaining membership and library state are unchanged. Long names and errors do not push controls outside the viewport. Lists stay owner-only. |
| UI06 | Use separate accounts to invite, accept and remove a friendship; open friend profiles and both recommendation sources, including empty/error states | Existing permitted actions and source/limitation messages remain usable and readable. Pending invitations grant no friend access; accepted friends see only permitted status/ratings; removal revokes access on the next read. Account switching does not display the prior account's private state. No scoring, source or coverage rules change. |
| UI07 | Operate essential controls and open/close navigation, filters, list pickers and dialogs by touch and keyboard | Essential controls have at least 44×44 CSS-pixel interactive targets, visible keyboard focus and accessible names. Tab order is usable; modal overlays contain focus while open, support appropriate Escape dismissal and return focus to their trigger when it remains present. Nonmodal popovers provide usable focus entry/dismissal/return. Essential actions do not depend on hover, and hidden/inactive controls are not focusable. |
| UI08 | Rotate representative phone viewports; resize around the navigation breakpoint; zoom desktop to 200%; show long content, loading, empty, validation and request-failure states | No page-level horizontal overflow, clipped panel content or essential controls hidden by fixed UI. Vertical page/panel scrolling is allowed. Phone viewport/keyboard scenarios keep the focused field, feedback and submit action reachable; emulation evidence explicitly retains the physical-keyboard/safe-area limitation below. User input survives validation/request failure where appropriate; confirmed data is retained. |
| UI09 | Visit Settings or use the displayed character below 1024 CSS pixels, including phone landscape | Background and character Settings pickers and the character quick-cycle button are absent from visual, keyboard and accessibility navigation. The saved background and character continue to display, subject to the existing disabled-character choice. The character cannot obstruct navigation or essential content/actions. Other core Settings access remains available. |
| UI10 | Select background/character on desktop, resize below 1024 CSS pixels, reload there, then return to 1024 or above | Compact mode does not overwrite saved preferences. Desktop customization controls return with the saved selections; existing browser-local preference persistence remains. At exactly 1024 CSS pixels customization is available. No account/device synchronization or new preference storage is introduced. |
| UI11 | Complete the agreed browser coverage and engineering checks against a fixed implementation revision | Evidence maps every ID to passed/failed/blocked/not run, identifies browser/version, viewport, input mode and real-API versus fixture boundary, and records repairs/rechecks and limitations. Required unavailable coverage is blocked, never silently passed. Physical-phone checks are optional and separately reported. |

## Decisions and test boundary

### Agreed decisions

The user accepted Q1–Q6, added the compact-customization exclusion, accepted
Q7–Q8 and confirmed the complete agreement in Q9 on 2026-10-25. There are no
unresolved product questions blocking implementation. This local record governs
until deliberate publication under [the workflow](../../movienight-workflow.md).

Use the [mission](../../../mission.md), [product contract](../../../spec.md),
[roadmap](../../../roadmap.md) and [glossary](../../../GLOSSARY.md). Preserve
existing explicit saves, typed movie/TV identity, anime classification, rating
semantics, list independence, accepted-friend privacy and recommendation rules.
Reuse the [local-demo contract](../008-production-readiness/spec.md) and
[walkthrough](../008-production-readiness/walkthrough.md) for real-account setup
and representative flows. Its historical evidence does not certify this slice.
Feature [010 remains staging](../010-staging-release/spec.md); this browser
contract neither changes its API-only boundary nor claims deployed readiness.

This is responsive mobile web support, with bounded usability repairs across
the existing core flows. Preserve cinematic styling and visual identity. The
signup panel/page may grow and scroll; adapt or simplify the flip transition if
necessary for correct containment and inactive-form focus behavior. Never shrink
fields or suppress feedback merely to fit. Modal focus containment is distinct
from nonmodal popover behavior; implementation mechanics remain flexible.

The customization restriction follows viewport width, not user-agent or physical
device detection: below 1024 CSS pixels, including narrow tablet/windows, hide
both Settings pickers and the companion quick-cycle control. At 1024 and above,
restore desktop controls. Continue rendering the selected background/character;
do not force a plain background or disable the character on phone. Preserve
browser-local preferences through resize/reload. Remove hidden controls from
focus/accessibility navigation and keep the character clear of essential UI.
This does not affect the separate main-page logo rotation milestone.

No new domain term needs a glossary entry. These reversible presentation and
verification choices do not warrant an ADR; keep them in this feature record.

### Source facts and likely implementation seams

Read-only inspection at the fixed base found:

- `repo/MovieNightFrontend/src/pages/LoginPage.tsx`: signup is an absolute
  `inset-0` back face, while the shorter sign-in face establishes container
  height. The root uses `min-h-screen` and `overflow-hidden`. This is a likely
  explanation for the reported overflow, requiring browser reproduction.
- `src/components/AppShell.tsx` and `NavRail.tsx`: existing fixed desktop top
  and compact bottom navigation switch at `lg`; menus already have click
  toggles as well as hover behavior. `src/hooks/useOverlay.ts` provides Escape
  and body scroll locking, without shared focus containment/return handling.
- `src/components/AddToListPopover.tsx`: an absolute fixed-width popover needs
  viewport-edge checks. `MovieGrid.tsx` has a 24×24 save control; `PosterShelf.tsx`
  has hover presentation and horizontal scrolling to verify.
- `src/pages/SettingsPage.tsx`, `src/components/AmbientBackground.tsx` and
  `PixelCompanion.tsx`: preferences are browser-local; the character has its own
  quick-cycle button and a fixed bottom-right presentation that may overlap UI.
- `src/index.css` removes focused input/textarea outlines and shadows after
  global focus styling; actual focus visibility needs browser verification.
- Existing `tests/browser/*.cjs` scripts use external Playwright/Chrome, inject
  identities and intercept the app API. They provide fixture-check patterns,
  not real signup, persistence, Safari or physical-device evidence. No package
  browser-test runner is declared.

Paths abbreviated as `src/` or `tests/` above are relative to
`repo/MovieNightFrontend/`. Likely later files include these shared components,
`LoginPage.tsx`, `SettingsPage.tsx`, affected core pages/controls, responsive CSS,
browser checks and a linked walkthrough/evidence record. Add minimal test tooling
where necessary. Backend changes are not planned; demonstrate and flag any
business-logic blocker or scope expansion before editing. Inventory exact paths,
state the intended outcome/scope and establish affected baselines before later
implementation under the human-review workflow. These source observations are
risk candidates, not runtime defect findings or test passes.

### Required browser coverage

All dimensions are CSS pixels. Record exact browser versions during execution.

| Browser / boundary | Coverage |
| --- | --- |
| Chrome, required core walkthrough | 360×800 and 390×844 portrait; 844×390 landscape; 1280×720 and 1440×900 desktop. Exercise UI01–UI10 across this matrix with touch/no-hover phone emulation and desktop keyboard use. |
| Safari, required smoke checks | Representative phone and desktop auth, navigation, details and forms/overlays; use 390×844 and 1440×900 as representative dimensions. State whether Safari runs through responsive simulation or a device; browser-engine substitutes alone are not a Safari pass. |
| Focused responsive/state checks | Around 1024 (1023/1024/1025), desktop 200% browser zoom, long content, validation/loading/empty/error states and representative phone viewport/keyboard scenarios. Repeat each distinct shared layout/control pattern and every repaired path; do not require the full Cartesian product of states and viewports. |
| Physical phone, optional | If performed, record device, OS, browser, orientation, software-keyboard and safe-area observations. Without it, physical-device behavior remains unverified and does not block this slice. |

Phone emulation alone does not establish actual software-keyboard resizing,
browser chrome, safe areas, device performance or physical touch behavior.
Exercise reduced-height/focus/scroll scenarios locally and label their limits.
Missing required Safari or Chrome evidence blocks full acceptance; do not replace
it with source inspection or report a required check as passed because a device
is unavailable.

### Real app, fixture and engineering boundaries

The required successful core-flow walkthrough uses the running real frontend,
Spring API, authentication and isolated disposable persistence. Reuse feature
008's deterministic external-provider fixtures and controlled similarity data;
only external services are substituted for this evidence. Create/sign in with
real synthetic accounts through supported forms, including separate accounts for
friendship and account-switching checks. Do not inject identities or intercept
successful app API responses to establish authentication or persistence. Observe
confirmed saves through reload/re-login and independent real API reads where
useful; use in-app navigation after reload because router restoration is outside
scope. This proves the selected running-app persistence boundary, not restart,
release, migration, hosted access or comprehensive server-authorization coverage.

Additionally use explicitly labelled controlled browser API responses to
reproduce delayed/pending, failed, empty and long-content UI states. Check repeat
submits, visible retry/failure and retained input/confirmed state. These fixture
checks do not prove real server persistence or provider behavior. Reuse existing
scripts where helpful and add repeatable automated checks for signup containment
and shared responsive interactions, including customization visibility/preference
retention and essential focus/touch/overflow assertions. Supplement automation
with the manual core-flow and Safari walkthrough; screenshots alone do not prove
interaction behavior. Link reproducible commands/scripts and sanitized artifacts
from validation rather than embedding logs or sensitive account data.

Establish affected baselines during implementation using declared Java 21,
Node 22 and pnpm 10.34.3 and explicit isolated configuration. Planned engineering
commands from their respective directories, following [tech-stack.md](../../../tech-stack.md):

```sh
# repo/MovieNightFrontend
pnpm exec tsc --noEmit
pnpm build
# repo/MovieNightBackend, with isolated test/provider configuration
./mvnw clean test
# repository root
git diff --check
```

Run focused checks for each repair and required full checks at completion.
Record actual browser commands after selecting runner/setup details; no newly
implemented runner is claimed here. Record any environment blockers and
pre-existing failures separately. Obtain independent Standards/Spec reviews
against this contract and the fixed implementation base, accurately stating
their comparison boundary. Complete the workflow human-review checkpoint before
any commit; publication remains excluded; implementation was separately authorized by the user.

## Out of scope

- Tracker publication, provisioning, deployment, commit, push or merge. The
  original specification-only session also excluded implementation/runtime work;
  the user separately authorized implementation and verification on 2026-10-25.
- Visual redesign, native app, installation/offline support, browser history or
  deep-link restoration, and new account/device preference synchronization.
- Ranking/quality changes (9b), additional results/pagination (9c), main-page logo
  rotation (9d), infrastructure/release work and changes to feature 010.
- New recommendation categories, altered friendship/privacy rules, new business
  behavior, unrelated business-logic repairs or expansion of recovery/onboarding.
- Webhook functionality and other capabilities outside the initial product
  contract, comprehensive accessibility certification, exhaustive browser/device
  coverage and numerical performance or provider-quality guarantees.
- Required physical-device testing; unexecuted hardware/keyboard/safe-area
  coverage must remain explicitly unverified.

## Validation

See [implementation evidence](validation.md) for the fixed base and working-tree
digest, per-ID actual results, commands, red/green regressions, independent
reviews and limitations. Chrome automated real-account flows and engineering
checks passed within their stated boundaries. Required Safari, manual interaction
and actual desktop 200% browser-zoom evidence remain missing; this is not a full
acceptance pass or an integrated feature. Physical-phone checks remain optional
and unverified. No product ambiguity blocks implementation; execution coverage
blocks declaring acceptance complete.

The original specification session ran only document/source inspection, Git
inventory, template/ID/link and whitespace checks. Historical specification-only
Not run results are superseded by the explicit current mapping in validation.md;
no historical runtime pass was inferred.

## Human review checkpoint — implementation, uncommitted

Before: signup could exceed its panel; phone customization controls were offered;
small controls, menu interactions and overlays had demonstrated keyboard/touch
blockers. After: active auth panels grow with content; compact customization
controls disappear without resetting saved presentation; essential targets have a
shared 44px floor; navigation, overlays, lists and long metadata have bounded
responsive repairs. Product rules and the visual identity are preserved.

Every proposed changed/new file and its reason:

| File (relative to repo/MovieNightFrontend unless stated) | Reason / acceptance |
| --- | --- |
| pnpm-lock.yaml | Restore the existing ogl declaration's missing lock entry so demo setup can proceed; UI11. |
| src/components/AddToListPopover.tsx | Focus entry/return, viewport/keyboard-aware placement and portal above navigation; UI05/UI07/UI08. |
| src/components/AppShell.tsx | Mount only the active navigation layout; UI02/UI08. |
| src/components/NavRail.tsx | Reliable click/keyboard toggles, contained Explore options and modal focus; UI02/UI07/UI08. |
| src/components/PixelCompanion.tsx | Hide compact quick-cycle control; reserve compact display space; UI09/UI10. |
| src/components/PosterShelf.tsx | No-hover/keyboard arrows and focus presentation; UI03/UI07. |
| src/components/TopBar.tsx | Scrollable focused filter sheet/dropdowns and breakpoint cleanup; UI07/UI08. |
| src/hooks/useOverlay.ts | Shared focus entry/containment/return, including iframe boundaries; UI07. |
| src/hooks/useCompactLayout.ts (new) | Subscribe to the agreed 1024px navigation boundary; UI02/UI08. |
| src/index.css | Shared touch-target floor, visible input focus and long-content/form constraints; UI01/UI07/UI08. |
| src/pages/CustomListsIndexPage.tsx | Keep nested keyboard Delete actions from triggering card navigation; UI05/UI07. |
| src/pages/FriendProfilePage.tsx | Focused scrollable removal confirmation; UI06/UI07. |
| src/pages/HomePage.tsx | Use shared trailer focus/return and a cross-frame Tab boundary; UI07. |
| src/pages/LoginPage.tsx | Active form controls establish panel height; inactive controls are hidden/inert; UI01/UI08. |
| src/pages/MovieDetailPage.tsx | Accessible private-note input and wrapped long genre labels; UI03/UI04/UI07/UI08. |
| src/pages/SettingsPage.tsx | Hide compact customization pickers, expose selection and field labels; UI07/UI09/UI10. |
| tests/browser/responsive-usability.cjs (new) | Repeatable rendered-browser and real-account regression evidence; UI01–UI11. |
| docs/features/011-desktop-phone-usability/spec.md (root-relative) | Current implementation status and this review checkpoint. |
| docs/features/011-desktop-phone-usability/validation.md (new, root-relative) | Actual results, commands, reviews and unverified boundaries. |

There are no proposed deletions. Concurrent unrelated `roadmap.md` and untracked
`mainPageLogo/test_*.png` files are preserved and excluded. No backend application
changes, feature-010 edits, product/glossary/ADR changes or integration updates.

Try locally using the demo commands in validation.md: open Create Account at
1280×720, trigger validation, then resize to 390×844. Create/sign in, open Settings
and confirm customization is absent; return to desktop and confirm controls and
saved selections remain. Navigate details, save/reload and open list/filter
controls using keyboard. This is a review scenario, not a claim that the missing
manual/Safari/zoom checks have been executed.

Inspect the complete proposed scope from the root, including new files:

```sh
git status --short --untracked-files=all
git diff --stat 5b0e9d77cdc91a8f16fc7575daecabf7304ea794 -- repo/MovieNightFrontend docs/features/011-desktop-phone-usability
git diff 5b0e9d77cdc91a8f16fc7575daecabf7304ea794 -- repo/MovieNightFrontend docs/features/011-desktop-phone-usability
cat repo/MovieNightFrontend/src/hooks/useCompactLayout.ts
cat repo/MovieNightFrontend/tests/browser/responsive-usability.cjs
cat docs/features/011-desktop-phone-usability/validation.md
# New-file diffs return 1 for expected differences:
git diff --no-index -- /dev/null repo/MovieNightFrontend/src/hooks/useCompactLayout.ts
git diff --no-index -- /dev/null repo/MovieNightFrontend/tests/browser/responsive-usability.cjs
git diff --no-index -- /dev/null docs/features/011-desktop-phone-usability/validation.md
# Inspect excluded concurrent work separately:
git diff -- roadmap.md
```

The exact proposed commit scope is the 19 files named above, excluding concurrent
work. No staging/commit is part of this handoff. Wait for explicit approval of the
reviewed change set under [the workflow](../../movienight-workflow.md).
