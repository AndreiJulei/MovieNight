# Offline read-only library

Status: locally validated 2026-11-16. Pending review checkpoint approval.
Roadmap: part of #16. GitHub issue (the authority for acceptance and status):
[#34 PD-18 Offline read-only library](https://github.com/AndreiJulei/MovieNight/issues/34).
Base/branch: `8940cb5` on `feat/034-offline-read-only-library` (uncommitted at validation).
`spec.md` already carries the product rule (Desktop and phone access, #34).

## Outcome

After one online visit, a signed-in user can open Watched, Watchlist and their
custom lists without a connection. The content is read-only and comes from the
last online snapshot, with an "Offline: showing your library as of <time>"
banner. Acceptance criteria OF01–OF03 live in the issue.

## Decisions (2026-11-16)

- **Snapshot.** One IndexedDB record (`movienight-offline` / `library`) holds the
  owner's library entries, custom lists and only the titles they reference. It
  is saved 400ms after each successful library load or confirmed change, and
  only when the lists also loaded, so a failed list read never empties the saved
  lists. Code: `src/offline/librarySnapshot.ts` (pure logic, serialized store),
  `src/offline/offlineLibrary.ts` (IndexedDB backend, `useOnline`).
- **Opening offline.** If the browser reports no connection, or the session check
  fails with no answer from the server, a stored sign-in token plus a matching
  snapshot opens the library from the snapshot. "No answer" means a network
  error, a timeout, or a 502/503/504 gateway status (a sleeping Render server);
  `serverGaveNoAnswer` decides. Any other failure, such as a 500, a 429 or a
  malformed profile, is an answer and shows "Could not verify your session"
  with Retry. This deliberately relaxes the
  earlier rule that an unverified session shows no cached data
  ([ADR 0002](../../adr/0002-offline-snapshot-opens-unverified-session.md)). The
  snapshot is bound to the sign-in that saved it by a token fingerprint, so a
  different sign-in never restores it. A server response of 401/403 still signs
  the user out and deletes the snapshot. While the browser is online, a snapshot
  session re-checks the server immediately and then every 30s. Any answer,
  including an error, re-runs the full session check and leaves snapshot mode,
  so a server that has woken up does not leave the user read-only.
- **What stays open offline.** `/movies` (Watched, Watchlist), `/lists`,
  `/lists/:id` and `/settings` (so the user can sign out). Every other screen,
  including title details, profile and friends, shows "This screen needs a
  connection" with links to the library. Nav search is disabled.
- **Writes (OF02).** Every store write (library, notes, lists, friends, account)
  returns or throws "You're offline. Reconnect to make changes; nothing was
  saved." while offline. Result-returning writes are wrapped in one
  `whileOnline` guard; list writes refuse in `runListWrite`. List
  create/rename/delete controls are disabled, with "Lists are read-only offline.
  Reconnect to create, rename or delete them." beside them.
  Settings disables its account and integration sections, whose avatar and
  webhook calls bypass the store, with a disabled `fieldset`. Device preferences
  and Log out stay usable. Nothing is queued.
- **Sign-out (OF03).** Logout, an invalid token, and every new sign-in clear the
  snapshot. The store serializes save/clear and drops saves begun before a
  clear, so a pending save cannot bring the snapshot back. A save is skipped
  when no sign-in token remains, for example after another tab signed out.
- **PWA.** `vite-plugin-pwa` 2.0.0 (auto-update) precaches the built shell
  (JS/CSS/HTML/SVG and the icons, not the login videos) and serves `index.html`
  for app navigations, except `/api/*`. Posters are not cached by the service
  worker (see "Poster caching removed" below). New square icons `public/pwa-192.png` and `pwa-512.png` are
  the existing app icon padded onto the app background.

## Poster caching removed (2026-11-18)

The original `posters` cache-first runtime rule left posters blank after the
first visit. TMDB sends `Access-Control-Allow-Origin` only when the request has
an `Origin`, sends no `Vary: Origin`, and allows caching for about a year. The
first visit loads posters through plain `<img>` (no CORS) before the service
worker controls the page, so the HTTP cache keeps copies without the CORS
header. Later the service worker refetched them in CORS mode, got those copies,
failed the CORS check and had no fallback. Adding `cache: 'reload'` (`7b0d5dd`)
did not fix it in the deployed app.

Decision: drop the runtime rule so posters load as ordinary images, and delete
any leftover `posters` cache at app start (`src/main.tsx`). Cost: posters are no
longer guaranteed offline; the library text still is. OF01's browser check no
longer asserts the offline poster. Alternatives not taken: `crossOrigin` on
every poster `<img>` (easy to miss one), or a custom service-worker handler
with a no-CORS fallback (more code to own).

## Out of scope

- Queued or offline writes, and syncing them later.
- Offline Explore, search, title details, profile and friends.
- Caching API responses (only the app shell is cached).
- Posters offline. They may still appear from the browser's own HTTP cache, but
  nothing guarantees it.
- Library snapshots for more than the last signed-in account on a device.

## Validation (2026-11-16, `8940cb5` + uncommitted changes)

| Acceptance ID | Result | Check / evidence |
| --- | --- | --- |
| OF01 | Passed | `offline-library.cjs`: after one online visit, a network-off reload shows Watched, Watchlist and a custom list with the banner; the poster seen online loads from cache |
| OF02 | Passed | Offline: rename/create disabled with the lists hint, search disabled, Explore and title details show the connection message, Settings account/integration controls disabled with Log out enabled; after reconnecting, zero write requests reached the API. The store guards themselves are covered by code review, not a separate test |
| ADR 0002 | Passed | `offline-library.cjs`: a 500 from the session check shows "Session unavailable" with no library; a 503 opens the snapshot; a 200 leaves it. Unit: `serverGaveNoAnswer` for network, timeout, abort, 429, 500, 502–504 |
| OF03 | Passed | Log out leaves no IndexedDB snapshot; a later offline visit shows no library. Unit: clear lands after an in-flight save, a save begun before sign-out is dropped, and a snapshot from another sign-in is not restored |

Commands, from `repo/MovieNightFrontend/`:

```sh
npx tsc --noEmit -p .                         # passed
for f in tests/unit/*.test.cjs; do node --test "$f"; done   # 188 passed (13 new)
npm test                                      # readCache: 7 passed
node --test tests/http/*.cjs                  # 1 passed
npx vite build                                # passed; precache 17 entries
npx vite build && PORT=8455 npx vite preview &
MOVIENIGHT_BROWSER_URL=http://127.0.0.1:8455 MOVIENIGHT_PLAYWRIGHT_MODULE=<playwright> \
  node tests/browser/offline-library.cjs      # 4 PASS: OF01–OF03 + ADR 0002 (Chrome, controlled API fixtures)
```

Pre-existing failures (also fail on `8940cb5` without these changes):
`watchlist-save.cjs` and `private-custom-lists.cjs` time out waiting for a
"Navigation Menu" button.

## Review (2026-11-16)

Two-axis reviews (standards, spec) shaped the decisions above: what counts as
no answer, sign-in binding, the generation-guarded store, the Settings
`fieldset`, the single write guard and the list hint.
Accepted as is: `librarySnapshot.ts` keeps the snapshot logic, route policy and
copy together because the feature is small; `isOffline` keeps its name though it
also covers an online snapshot session; the offline routes stay listed in
`isOfflineReadOnlyPath` rather than derived from `routeDefinitions`.

## Limitations

- The browser check uses controlled API fixtures and Chrome on desktop. Real
  devices, installation from the browser prompt, iOS Safari's service-worker
  and storage eviction rules, and the deployed Vercel origin were not tested.
- `package-lock.json` was not updated. Vercel builds with pnpm.
- Saving the snapshot depends on both the library and the lists loading. If the
  lists keep failing, the snapshot keeps its previous content.
- The service worker is active only in production builds and `vite preview`, not
  in `vite` dev.
