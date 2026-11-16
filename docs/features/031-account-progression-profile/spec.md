# Account settings, levels and profile page

Status: locally validated 2026-11-16. Pending review checkpoint approval.
Roadmap: part of #16. GitHub issues (the authority for acceptance and status):
[#31 PD-15 account settings](https://github.com/AndreiJulei/MovieNight/issues/31),
[#32 PD-16 levels, rank badges and avatar unlocks](https://github.com/AndreiJulei/MovieNight/issues/32),
[#33 PD-17 profile page with friend-visible lists](https://github.com/AndreiJulei/MovieNight/issues/33).
Base/branch: `c55c4d7` on `perf/explore-read-cache` (uncommitted at validation).

## Outcome

Settings becomes an account page: users change their display name, username,
email and password. Watched history drives a level, a rank badge and avatar
unlocks. The profile page shows the avatar, rank, the owner's XP bar and the
lists the owner shares with accepted friends. Acceptance criteria live in the
issues above (ST01–ST04, LV01–LV04, PF01–PF05).

## Decisions and scope changes (2026-11-16)

- **Display names stay unique.** #31 says "free text, 1–50 characters". Display
  names were already unique, and friend invites look people up by display name,
  so a taken name is still rejected. The 1–50 length from #31 applies.
- **Username rules.** A changed username must match `[A-Za-z0-9._-]{2,50}` (no
  spaces and no `@`, so it cannot collide with an email). Signup keeps its
  existing rule, where the typed name is both username and display name and may
  contain spaces. Both now check uniqueness case-insensitively, as sign-in does.
- **Avatar picker in Settings › Account.** It comes from #32 and is kept there.
- **Friend profile data.** Besides level, rank and avatar (#32), the friend
  profile returns the two sharing flags (needed for #33's tabs) and `createdAt`.
  Level and rank use the full watched count even when Watched is hidden, so a
  friend can estimate that count to within 10. Accepted.
- **Shared, not public.** The `custom_lists.is_public` column is renamed to
  `shared` in V9 (GLOSSARY: Shared list), along with the API field, the
  `list.created` / `list.updated` event payload key and the frontend.
  `/api/lists/public` stays as a compatibility endpoint and always returns an
  empty list. V9 also sets every existing list to unshared.
- **#29 work is separate.** The poster transition and Animations work in the
  same working tree belongs to #29 and is not part of this change set.

## Validation (2026-11-16, `c55c4d7` + uncommitted changes)

| Acceptance ID | Result | Check / evidence |
| --- | --- | --- |
| ST01 | Passed | `AccountSettingsPersistenceTest.ST01_…`: fresh token; friends see the new username |
| ST02 | Passed | `ST02_emailChangeRequiresTheCurrentPassword` |
| ST03 | Passed | `ST03_duplicateUsernameOrEmailIsRejectedWithASpecificMessage`; signup case-insensitive check in `signupRejectsAUsernameThatDiffersFromAnExistingOneOnlyByCase` |
| ST04 | Passed | `ST04_signInWorksImmediatelyWithTheNewUsernameOrEmail` |
| LV01 | Passed | `ProgressionTest` thresholds |
| LV02 | Passed | `ProgressionPersistenceTest.LV02_…` |
| LV03 | Passed | `ProgressionPersistenceTest.LV03_…` |
| LV04 | Passed | `ProgressionPersistenceTest.LV04_…`; `FriendshipServiceTest` |
| PF01 | Not run | No browser check for owner vs friend controls |
| PF02 | Passed | `SharedListsPersistenceTest.PF02_…` |
| PF03 | Passed | `SharedListsPersistenceTest.PF03_…` |
| PF04 | Passed | `SharedListsPersistenceTest.PF04_…` |
| PF05 | Passed | `SharedListsPersistenceTest.PF05_…` |

Commands:

```sh
cd repo/MovieNightBackend && ./mvnw -q test
cd repo/MovieNightFrontend && npx tsc --noEmit -p . && npm run build
for f in tests/unit/*.test.cjs; do node --test "$f"; done
```

Review: a two-axis code review (standards and spec) was run on 2026-11-16, and
its findings were fixed in the same change set.

Limitations: the V9 migration was not run against Postgres. A local Postgres
database that already applied the earlier V9 fails Flyway's checksum and needs
`flyway repair` or a reset. Browser checks for the profile and Settings pages
were not run.
