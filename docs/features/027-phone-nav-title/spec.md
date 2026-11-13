# Phone bottom bar, title page and hero

Status: locally validated 2026-11-14. Pending review checkpoint approval.
Roadmap: part of #16. GitHub issues (the authority for acceptance and status):
[#27 PD-11 phone bottom bar](https://github.com/AndreiJulei/MovieNight/issues/27),
[#28 PD-12 phone title page and hero](https://github.com/AndreiJulei/MovieNight/issues/28).
Base/branch: `f4ee4d8` on `perf/explore-read-cache` (uncommitted at validation).

## Outcome

On phones, the bottom bar shows three items (the MN monogram, the menu and
Settings). The menu opens from the bar without raising the keyboard. Title
pages and the main-page hero use portrait posters, and title-page actions fit
on one row. Acceptance criteria live in the issues above.

## Decisions and scope changes (2026-11-14)

- **Phones only.** The poster title page and poster home hero apply below
  768px (`usePhoneLayout`). Tablets (768–1023px) keep the wide backdrop
  layouts, as #28 asks ("Desktop layouts are unchanged"). The bottom bar keeps
  the existing 1023px navigation breakpoint.
- **Non-modal menu.** The phone menu is a non-modal dialog without a focus
  trap, because the bottom bar stays usable while it is open. Tapping ☰ again,
  tapping outside, Esc, MN and navigating close it. This replaces the earlier
  "Tab stays in modal navigation" check in `responsive-usability.cjs`.
- **One trailer control.** The trailer action is the ▶ on the phone poster, and
  Close under the video ends it. The action row holds Watchlist, Watched/rating
  and List, so there is no second "Trailer" button.
- **Phone design exceptions.** These are recorded in
  [DESIGN.md](../../../repo/MovieNightFrontend/DESIGN.md): `rounded-xl` on the
  phone posters, the trailer frame and the action buttons; `text-xl` for the
  phone hero title; 11px action labels; and a 10px poster badge.
- **Supporting changes.** Menu items are 44px tall (tap target). Changing page
  closes both the phone menu and the desktop dropdown. Menu items animate
  colours only, with no transform (PB03). The bar turns solid while the menu
  is open, so the panel and bar read as one surface.
- "Hero content follows #25": #25 covers the hero's pick sources and labels,
  and the phone slides keep the same slides and badges. Phone slides show the
  title as text below the poster rather than a title logo.

## Validation (2026-11-14, `f4ee4d8` + uncommitted changes)

| Acceptance ID | Result | Check / evidence |
| --- | --- | --- |
| PB01 | Passed | `phone-nav-title.cjs bottom-bar`: three bar items; MN goes home |
| PB02 | Passed (emulation) | Opening the menu focuses no text field. **Physical-device check: not run** |
| PB03 | Passed | The panel's bottom edge touches the bar; full width; no transform; fade ≤100ms |
| PB04 | Passed | Undimmed when open, dimmed while searching; ☰, outside tap, Esc, MN and navigation close it |
| PT01 | Passed | `title-page`: portrait poster at ~55% width, centred, at 390px |
| PT02 | Passed | ▶ plays a 16:9 inline trailer at full content width; Close restores the poster (controlled player fixture) |
| PT03 | Passed | One row and ≥44px targets at 360, 375, 390, 412 and 430px; no overflow; a single trailer control |
| PT04 | Passed | `home-hero`: hero ≤70vh with a portrait poster and the title below it at 360, 390 and 430px |

Commands, from `repo/MovieNightFrontend/` with
`MOVIENIGHT_PLAYWRIGHT_MODULE` set:

```sh
npx tsc --noEmit -p .
npm run build
for f in tests/unit/*.test.cjs; do node --test "$f"; done
node tests/browser/phone-nav-title.cjs
node tests/browser/responsive-usability.cjs
node tests/browser/movie-detail-redesign.cjs
node tests/browser/hero-banner.cjs
node tests/browser/issue-4-navigation.cjs
```

Results:
- The type check, the build and all 16 unit test files pass.
- `phone-nav-title`, `movie-detail-redesign` and `hero-banner` pass.
- `phone-nav-title` also checks that tablets keep the wide title hero and the
  wide home hero, and that the menu is non-modal.
- `responsive-usability` passes up to `controls`, then fails in the next test
  waiting for the seeded "Demo Seed" title.
- `issue-4-navigation` times out at BN04, waiting for
  `/api/movies/explore/movies`.
- Both failures reproduce identically on an unmodified `f4ee4d8` checkout, so
  they predate this change (missing demo seed data; Explore read cache).

Review: `/code-review` (Standards and Spec), with findings resolved as
recorded above.

Limitations:
- The keyboard behaviour on iOS Safari and Android Chrome (PB02), and the menu
  staying above the keyboard, still need a physical-device check.
- Only the `visualViewport` arithmetic is unit-tested
  (`tests/unit/phone-menu.test.cjs`).
