# Feature 008 manual local demo

Run this against a fresh checkout with Java 21, Node 22, pnpm 10.34.3 and
Python 3.9+ installed. The application stays on loopback. No provider account or
credential is required. Use a new private browser profile with cleared
`127.0.0.1:8443` site data. Record the browser name/version, revision and date.
This checklist deliberately uses the real app API and real browser sign-up.

## Start, check and reset

From the repository root:

```sh
./docs/features/008-production-readiness/demo.sh check
./docs/features/008-production-readiness/demo.sh run
```

`run` installs frontend dependencies from the tracked pnpm lockfile, generates
an ephemeral signing key, starts a deterministic loopback provider on port 18081,
the real backend on 8080 and the frontend on 8443. It selects the tracked demo
configuration explicitly, avoiding ignored local application properties and
Figma site settings. H2 is in memory and belongs only to this demo process.
Open `http://127.0.0.1:8443`. Use Ctrl-C in the run terminal to stop the demo.
Check/reset guidance is available with `./docs/features/008-production-readiness/demo.sh reset`.
For the second clean run, stop the demo, close the browser profile, restart with
`run`, use a fresh profile and new accounts. No reset command deletes a file or
touches a personal database.

The provider starts in `success` mode. Change it while the demo runs:

```sh
curl -fsS 'http://127.0.0.1:18081/__mode?value=success'
curl -fsS 'http://127.0.0.1:18081/__mode?value=empty'
curl -fsS 'http://127.0.0.1:18081/__mode?value=failure'
curl -fsS 'http://127.0.0.1:18081/__health'
```

The modes affect *new* provider requests; cached discovery may need the app's
explicit refresh. `success` serves movie 862 (Demo Seed), movie 863 (Demo
Candidate), movie 137 (Demo Friend Pick), TV 862 (Demo Series), and TV 900 (Demo
Anime). Demo Anime carries Animation and Japanese origin/language metadata.
Watched movie 862 has a controlled movie recommendation of 863; the tracked
similarity CSV also contains 862→863. `empty` returns valid empty results;
`failure` returns 503. Restore `success` before retry. Missing posters exercise
the app's fallback. Use a deliberately invalid rating to observe a rejected
write without changing confirmed library data; do not stop the backend or alter
its database to create a write failure.

## Connected browser walkthrough

Mark each row Passed, Failed, Blocked or Not run, with a short actual result.
Use three fresh demo accounts A, B and C; record aliases only. All sign-ups and
sign-ins occur through the browser UI. Keep the provider in `success` mode unless
the step says otherwise. After reload the in-memory router returns to Home;
navigate back through the app to inspect saved state.

| IDs | Account/action | Expected result | Actual/result |
| --- | --- | --- | --- |
| DEMO03 | Sign up A, B and C through the UI; sign out/in and switch accounts | Each authenticates normally; no prior account's personal data appears | To record |
| DEMO04 | As A, search Demo Seed, Demo Series and Demo Anime; open each details page, then inspect library/lists | No personal membership; movie 862 and TV 862 have distinct details; Anime appears only in Anime TV category | To record |
| DEMO05 | As A, add movie 862 and TV 862 to watchlist; repeat; mark watched unrated, then 0, then 7.5; clear rating; reload/sign in again | Typed independent entries and exact confirmed values persist in the running app | To record |
| DEMO06 | As A, note a watched title, create two lists, add Demo Candidate to both without a library save, repeat an add, remove from one and delete it | Remaining list and library state are unchanged; candidate remains outside library | To record |
| DEMO07 | A invites B. Check B's access before acceptance, after accepting, and after removal. Check C throughout | Only accepted B sees permitted status/ratings; notes/lists stay private; removal revokes access | To record |
| DEMO08 | As B, rate watched Demo Friend Pick and put Demo Candidate on watchlist; as A read friend suggestions after acceptance | Rated and watchlist sources are labelled separately; pending/C data supplies none | To record |
| DEMO09 | With A's watched movie 862, read Home/personal movie results, save movie 863, reload; also check C with no watched history | 863 is a personal movie candidate before saving and excluded after confirmed save; C sees history explanation | To record |
| DEMO10 | Set `empty`, refresh discovery/recommendations; set `failure`, retry; restore `success`, retry. Attempt invalid rating | Empty differs from failure, explicit retry recovers, confirmed saves remain intact, rejected write is not shown as success | To record |
| DEMO11 | Stop, reset and repeat with new accounts/profile | Second run starts clean and completes the connected path | To record |

Where a workflow does not expose a visible control for an exact probe, record
the gap against its acceptance ID. Do not call the whole row Passed based on
typechecking or source review. Use the existing backend suites to cover more
rating, duplicate and concurrency cases than this representative walkthrough.

## Targeted authorization probes

Use account sessions issued by the browser login, with no seeded users or JWTs.
Obtain A, B and C tokens from their own browser sessions (`movienight_token` in
local storage), paste each into a masked shell variable, and avoid shell history
or saved logs containing tokens. Record only HTTP statuses and redacted response
shapes. Take list and friend IDs from the UI or observed network responses.

```sh
read -rsp 'A token: ' token_a; echo
read -rsp 'B token: ' token_b; echo
read -rsp 'C token: ' token_c; echo
curl -sS -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $token_b" 'http://127.0.0.1:8080/api/lists/LIST_ID_OWNED_BY_A'
curl -sS -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $token_c" 'http://127.0.0.1:8080/api/lists/LIST_ID_OWNED_BY_A'
curl -sS -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $token_b" 'http://127.0.0.1:8080/api/friends/A_USER_ID/library'
unset token_a token_b token_c
```

Replace placeholders before running. Probe list read and a non-destructive
mutation attempt with B/C tokens; expect forbidden or not found. Probe A's
friend-library endpoint with B's token before acceptance, after acceptance and
after removal, and C's throughout. Expect permitted status/ratings only during
the accepted period. Confirm private notes and lists never appear in friend
response bodies, with values redacted from recorded evidence. Also probe an
anonymous personal endpoint and expect denial. Record status/body shape for each
state, including unexpected errors; do not assume one precise denial status.

## Evidence template

Record the fixed implementation revision, date, Java/Node/pnpm/Python/browser
versions, fixture mode, aliases, actual result and status for each DEMO ID in
the feature spec. Keep credentials, tokens, private text and full personal
responses out of the repository. Record focused/full backend tests, typecheck,
build, fixture contract checks and independent review findings separately.
Distinguish first and second clean runs. This local check does not establish
retention across backend restart or deployment.
