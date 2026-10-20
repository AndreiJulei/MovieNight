# Accepted friendships and privacy

Unpublished local contract for roadmap milestone 4; product P06, P07, P12.
Original feature base: `3fc94fd941b5b94f1499c7cb125855fc11e32d72`.
Existing implementation commit: `b94cb818e0033fc61e5d2621f5497068a0e39fe5`.
Review fix committed as `75597e5`. Both commits are present on
`feat/005-friend-suggestions`, ahead of local `main` at `3fc94fd`
(checked 2026-10-21). Review checkpoints below are historical.
GitHub issue list (all states, 2026-10-19) returned no issues.

## Outcome and scope

Invite another account, explicitly accept an incoming invitation, and revoke
friend-only access. Friends may see viewing status and ratings; notes and custom
lists remain owner-only. Keep the existing visual system and in-memory router.
Recommendation ranking, onboarding, deployment, and production migrations are
excluded. Existing recommendation/rating reads must obey accepted-friend access.

## Acceptance

| ID | Scenario | Expected result |
| --- | --- | --- |
| AC01 | Invite an account; reload both accounts | Outgoing/incoming pending invitation; no profile, library, rating, or suggestion access before acceptance |
| AC02 | Recipient accepts; reload | Both accounts list the accepted friend; profile, watchlist/watched status, unrated/zero/7.5 ratings available |
| AC03 | Read friend library or title ratings, including forged friend IDs | Server checks accepted relationships; private notes absent; owner still recovers notes; private lists remain inaccessible |
| AC04 | Cancel/decline an invitation or remove an accepted friend; reload | Both directions disappear; future friend-only reads denied and ratings/suggestion sources exclude that account |
| AC05 | Repeat/cross invites, accept as sender/outsider, invite self/missing account, anonymous requests | No implicit acceptance, duplicate pair, unauthorized transition, or access grant; failures do not change saved state |
| AC06 | Load/write fails, is pending, or account/route changes during request | Visible loading/error/retry; no local fallback or premature success; duplicate writes disabled; obsolete responses do not restore private data |

## Decisions

Invitations do not expire in this slice. Lookup supports the existing username,
display-name and email identifiers, with whitespace trimming and optional leading
`@` for usernames. Repeating the same invitation is idempotent; a crossed invite
requires explicit acceptance in the incoming section. Either participant can
end a pending pair (cancel/decline), or remove an accepted friendship. A later
invitation is allowed. Only the recipient can accept. Unknown pairs cannot be
accepted. Pair writes serialize by locking both account rows in ID order.

Retain the existing directional friendship table, adding explicit consent;
only accepted links are used by friend-only queries. Historical links have no
recorded consent and must be explicitly accepted before granting access. This
is a local development schema change, not proof of a production migration.
Friend library responses use a dedicated public-field DTO without a notes field;
title-rating responses likewise have no notes field. Caller-supplied rating IDs
are intersected with the authenticated user's accepted friends on the server.

## Test boundary

User confirmed API integration tests only: JWT-authenticated HTTP requests
with real services/repositories and isolated H2, observed through API reads.
No new automated browser tests. UI behavior requires human review; API tests
do not establish browser outcomes or live provider connectivity. Run strict TypeScript, production build, focused
checks during implementation, and the full backend test suite at the end.

## Historical validation and human review — 2026-10-19

The following records the earlier working-tree review. At the start of the
2026-10-20 session, Git was clean and commit `b94cb81` already contained these
changes, including the feature-003 document edit described below as excluded.
The historical statements about uncommitted work and proposed scope do not
describe the current Git state. See the fresh review checkpoint at the end.

Tested the uncommitted working tree against base
`3fc94fd941b5b94f1499c7cb125855fc11e32d72` on
`feat/004-accepted-friendships-privacy`. No staging, commit, push, merge,
publication, or deployment. The pre-existing change to
`docs/features/003-private-custom-lists/spec.md` was preserved and is excluded
from this proposed commit scope. No deletions. All 24 feature files below are
proposed together.

### Acceptance evidence

| ID | Result | Evidence / boundary |
| --- | --- | --- |
| AC01 | Passed at API boundary | Fresh authenticated reads recover incoming/outgoing invitations, with no profile/library/rating access. Accepted-only repository queries also govern both existing suggestion callers. Pending suggestions with a populated library were not separately asserted. |
| AC02 | Passed at API boundary | Recipient acceptance creates two accepted directions; independent reads recover both friend lists, profiles, watched/watchlist entries, unrated, zero, and 7.5. |
| AC03 | Passed | Friend library and title-rating JSON have no notes key; forged IDs return no ratings; owner GET retains notes; accepted friend cannot read private custom list. |
| AC04 | Passed | Sender cancel, recipient decline, either-direction friendship removal; both accounts lose relationship/access. Ratings and populated suggestion results disappear after revocation. |
| AC05 | Passed for executed cases | Repeated and crossed invites stay pending; sender/outsider accept denied; outsider deletion cannot modify another pair; self/missing/blank identifiers rejected; concurrent crossed invites leave one pair; anonymous friend/rating reads and mutation requests denied. |
| AC06 | Partially validated | API invalid/unauthorized writes preserve relationships. UI has explicit loading/error/reload states, confirmed writes, duplicate guards, account/sequence guards, and no local friendship fallback. Browser pending/failure/retry/account/route behavior was not exercised, per API-only test boundary. |

### Actual checks

- Baseline strict frontend TypeScript passed; existing FriendshipServiceTest and
  FriendshipControllerTest passed **11 tests**. No full pre-change backend suite.
- New real JWT/API/H2 suite: **6 tests passed**, no mocked application services
  or live provider calls. Existing affected fixtures were updated rather than
  adding tests at another seam.
- Focused lifecycle run: **12 tests passed**; focused privacy/controller/service
  run: **25 tests passed**.
- Full clean backend suite: **105 tests, 0 failures, 0 errors, 0 skipped**.
  After review's accepted-query rename, full suite rerun: **105 passed**.
- Final strict frontend TypeScript and production Vite build passed.
- `git diff --check` passed. No new automated browser tests and no manual browser
  or screenshot validation was performed.
- Impeccable mechanical detector attempted once: unavailable, `bundled detector
  not found`. Existing Vite native-config warnings remain (`__dirname`, missing
  JSON import attributes).

Observed red → green: the first lifecycle test recovered an immediately granted
friend instead of an empty accepted-friend list; the privacy test recovered
ratings for a forged nonfriend ID; expanded anonymous checks got 500 on title
ratings because a public catalog matcher admitted the request. Pending consent,
server-filtered rating IDs, note-free DTOs, and an explicit security matcher
resolve those failures. An intermediate formatter run removed an inline type
member separator; TypeScript caught it, the type was corrected to multiline,
and final checks passed.

Commands actually used (from the respective app directories):

```sh
# repo/MovieNightFrontend
./node_modules/.bin/tsc --noEmit
npm run build
# repo/MovieNightBackend
./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar -Dtest=AcceptedFriendshipsPersistenceTest test
./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar clean test
./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar test
```

Final logs: `/tmp/movienight-004-final-backend.log`,
`/tmp/movienight-004-final-build.log`. Focused evidence:
`/tmp/movienight-004-api.log`, `/tmp/movienight-004-green-lifecycle.log`,
`/tmp/movienight-004-green-privacy.log`. Temporary logs are not tracked artifacts.
Retained integration suite:
[AcceptedFriendshipsPersistenceTest.java](../../../repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/AcceptedFriendshipsPersistenceTest.java).

### Demonstrated before/after behavior

Before: Add immediately created two friendship rows; pending consent did not
exist. Library and title-rating responses exposed private notes, and caller IDs
could bypass friendship authorization. UI could invent a friend locally on a
failed server call and remove one before persistence confirmation.

After, exercised with real authenticated API requests:

| Action | Observable result |
| --- | --- |
| Alice POST `/api/friends/add` for Bob | 201; GET accepted friends is empty; each account GET invitations recovers the same pending pair |
| Alice GET Bob's library before acceptance | 403 |
| Alice or outsider POST accept for Bob's pending invitation | 403; invitation remains pending |
| Bob POST `/api/friends/{aliceId}/accept` | 200; both accepted-friend indexes now contain the other account |
| Alice GET Bob's watched library / title ratings | Supplied ratings preserved; notes key absent; Bob's own library still contains notes |
| Alice DELETE `/api/friends/{bobId}` | 200; subsequent friend library/profile reads return 403; rating and suggestion reads exclude Bob |

Human UI scenario (not executed by this session): sign into two separate
accounts; send an invitation from Friends; verify pending sections and absence
of friend-library access; accept as recipient; reload and open the accepted
profile, switch Watched/Watchlist, inspect zero/unrated/7.5 ratings; remove the
friend and retry access in both accounts. Reject a write in browser devtools:
input/prior state should stay, success must not be claimed, and the action can be
retried. Reload after uncertain timeouts. A confirmed write followed by failed
reload explicitly says the change saved and asks to reload before another action.

### Code review

Applied the code-review skill with independent read-only Standards and Spec
agents. Boundary: `git diff 3fc94fd -- repo/MovieNightBackend
repo/MovieNightFrontend` plus new DTOs/test/feature record, excluding the existing
feature-003 document edit; no feature commits exist yet.

- Standards: no documented breaches. Resolved one nonblocking naming heuristic
  by explicitly naming accepted-only queries, including suggestion callers.
  Recheck found no outstanding findings.
- Spec: resolved follow-up reload warning, post-await account guard, conflicting
  empty states, and missing loading feedback while accepted friends load. No
  additional backend consent/privacy findings. UI behavior remains unverified.

### Limitations

Node **25.3.0**, Java **25**, npm, and a cached Mockito Java agent were used;
declared Node 22 / Java 21 / pnpm are unverified. Isolated fresh H2 tests prove
API transaction persistence across independent reads, not database upgrades,
application restart/release retention, production migrations, deployment, live
provider connectivity, browser outcomes, responsive layout, or accessibility.
Legacy links lose access until explicit acceptance; existing bidirectional legacy
links may appear as invitations in both directions. This intentional consent
reset requires human review. No push notifications/polling are introduced;
other-account changes become visible on reload, navigation, or a subsequent
server read. Previously downloaded data cannot be recalled. Recommendation
ranking/source semantics remain feature 5 work; only accepted-friend filtering
changed here.

### Every affected file and proposed commit scope

Paths are relative to the repository root. **New** identifies untracked additions.

| File | Reason / acceptance |
| --- | --- |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/config/SecurityConfig.java` | Authenticate title ratings before public catalog matching (AC03, AC05). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/controller/FriendshipController.java` | Invitation index/accept routes and safe friend library DTO (AC01–AC04). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/controller/MovieController.java` | Pass authenticated viewer to rating authorization (AC03). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/dto/FriendRatingResponse.java` | Remove notes from friend rating JSON (AC03). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/dto/FriendInvitationResponse.java` | **New** identity-only pending response without library statistics (AC01). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/dto/FriendLibraryEntryResponse.java` | **New** allowlisted library response without notes (AC03). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/model/Friendship.java` | Persist explicit consent; legacy default grants no access (AC01–AC02). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/repository/FriendshipRepository.java` | Separate pending and accepted queries; accepted-only rating/suggestion IDs (AC01–AC04). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/repository/UserRepository.java` | Ordered account locks serialize pair mutations (AC05). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/service/FriendshipService.java` | Invite, accept, cancel/decline/revoke, enforce access, emit existing friend events only for accepted transitions (AC01–AC05). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/service/SuggestionService.java` | Both existing suggestion paths explicitly use accepted-friend query (AC01, AC04). |
| `repo/MovieNightBackend/src/main/java/com/movienight/backend/service/UserMovieService.java` | Intersect requested rating IDs with accepted friends; omit notes and deferred statuses (AC03–AC04). |
| `repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/FriendshipControllerTest.java` | Adapt existing fixtures to pending invitation / safe library response (AC01, AC03). |
| `repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/AcceptedFriendshipsPersistenceTest.java` | **New** real JWT/API/H2 lifecycle, privacy, ownership, edge and concurrency checks (AC01–AC05). |
| `repo/MovieNightBackend/src/test/java/com/movienight/backend/service/FriendshipServiceTest.java` | Update existing invite/lock/accepted-query/privacy fixtures (AC01–AC05). |
| `repo/MovieNightBackend/src/test/java/com/movienight/backend/service/SuggestionServiceTest.java` | Update accepted-friend query fixture (AC04). |
| `repo/MovieNightBackend/src/test/java/com/movienight/backend/service/UserMovieServiceTest.java` | Update authenticated rating fixture and remove obsolete shared-note assertion (AC03). |
| `repo/MovieNightFrontend/src/api/friends.ts` | Bounded explicit-error reads/writes, invitation/accept API, note-free friend types (AC01–AC06). |
| `repo/MovieNightFrontend/src/api/movies.ts` | Remove friend notes type; expose rating read failures rather than empty success (AC03, AC06). |
| `repo/MovieNightFrontend/src/store/MovieStore.tsx` | Server-authoritative invitations/accepted friends; confirmed writes, reload warnings, duplicate/account/sequence guards (AC01–AC06). |
| `repo/MovieNightFrontend/src/pages/FriendsPage.tsx` | Incoming/outgoing/accepted UI, accept/decline/cancel, recovery and pending feedback; remove local fallback (AC01–AC06). |
| `repo/MovieNightFrontend/src/pages/FriendProfilePage.tsx` | Server-only access, error/retry, explicit personal ratings, confirmed removal (AC02–AC04, AC06). |
| `repo/MovieNightFrontend/src/pages/MovieDetailPage.tsx` | Remove note/local-rating fallback; preserve zero/unrated; rating failure/loading/retry (AC03, AC06). |
| `docs/features/004-accepted-friendships-privacy/spec.md` | **New** local contract, decisions, evidence, limits and complete human-review inventory. |

Unrelated preserved file: `docs/features/003-private-custom-lists/spec.md`.
Exclude it from any feature-004 commit. No files deleted; four new files above.
Roadmap integration status was not advanced.

Inspect from the repository root before staging:

```sh
git status --short --untracked-files=all
git diff --stat
git diff -- repo/MovieNightBackend repo/MovieNightFrontend
# Inspect each new file; regular git diff does not include untracked contents:
cat docs/features/004-accepted-friendships-privacy/spec.md
cat repo/MovieNightBackend/src/main/java/com/movienight/backend/dto/FriendInvitationResponse.java
cat repo/MovieNightBackend/src/main/java/com/movienight/backend/dto/FriendLibraryEntryResponse.java
cat repo/MovieNightBackend/src/test/java/com/movienight/backend/controller/AcceptedFriendshipsPersistenceTest.java
# Confirm the preserved, unrelated change remains outside the proposed scope:
git diff -- docs/features/003-private-custom-lists/spec.md
```

Wait for explicit approval of this reviewed feature change set before committing,
per [the project human-review checkpoint](../../movienight-workflow.md).

## Fresh human-review checkpoint — 2026-10-20

Starting revision: `b94cb818e0033fc61e5d2621f5497068a0e39fe5`, clean working
tree. Created `feat/004-accepted-friendships-privacy-review` from that revision.
The user confirmed retaining this contract and the API-only automated test seam.
No new domain decision was needed: the existing glossary's definition of Friend
already requires acceptance. No glossary or ADR changes were made.

### Outcome and exact new change set

The feature already existed in the starting commit. This session fixes one
review finding and reconciles the evidence with the actual Git state. Only
these two tracked files are proposed for a new commit; no additions/deletions,
unrelated working-tree changes, staging, commits, push, merge, or deployment:

| File | Reason / acceptance |
| --- | --- |
| `repo/MovieNightFrontend/src/store/MovieStore.tsx` | Refresh server state after failed/uncertain friendship writes, retaining account guards, so invalidated reads cannot leave loading and Reload stuck (AC06). |
| `docs/features/004-accepted-friendships-privacy/spec.md` | Identify the existing feature commit and new branch; distinguish historical evidence from this validation and record the complete new review scope. |

The earlier 24-file inventory describes the original feature delta against
`3fc94fd`, not new uncommitted work. Commit `b94cb81` also includes the unrelated
feature-003 record. That historical inclusion is reported, not rewritten.
Recommendations, onboarding, deployment, migrations, and the visual system
remain outside this follow-up's scope.

Before this fix: sending an invitation during an initial friend load invalidated
that read. If the write failed, neither the invalidated read nor the write cleared
loading, leaving Reload disabled. After: a failed write starts a fresh authorized
read, which settles loading on success or failure. The original write still
returns failure, preserves input, and makes no success claim. A timeout likewise
refreshes actual state before allowing another attempt; this can add up to the
existing 15-second read timeout. Account changes discard obsolete results.

### Actual validation

Validated the uncommitted two-file change against `b94cb81` on 2026-10-20:

| Check | Result |
| --- | --- |
| Focused real JWT/HTTP/H2 feature suite, clean compile | 6 tests passed, 0 failures/errors/skipped. |
| Full backend suite after recovery fix | 105 tests passed, 0 failures/errors/skipped. |
| Strict frontend TypeScript | Passed before and after the fix. |
| Production frontend build | Passed before and after the fix. |
| Whitespace diff check | Passed. |
| Browser failure/retry/account-change scenarios | Not run; API-only automated seam reconfirmed. Recovery fix verified by source trace, typecheck and build, not a browser regression test. |

The first focused run failed during application-context startup with
`ClassFormatError: Invalid method Code length 0` for `CustomListEntry` in existing
compiled output. A clean compile resolved it without source changes; it was
not an assertion failure. No new tests or new TDD red/green claim in this session.

Commands actually run from the respective app directories:

```sh
# repo/MovieNightBackend
./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar -Dtest=AcceptedFriendshipsPersistenceTest test
./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar -Dtest=AcceptedFriendshipsPersistenceTest clean test
./mvnw -DargLine=-javaagent:/Users/juv/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar test
# repo/MovieNightFrontend
./node_modules/.bin/tsc --noEmit
npm run build
# repository root
git diff --check
```

Logs: `/tmp/movienight-004-review-focused.log` (clean rerun replaced the initial
failure log), `/tmp/movienight-004-review-full.log`, and
`/tmp/movienight-004-review-build.log`. Node 25.3.0, Java 25, npm and the cached
Mockito agent were used; declared Node 22/Java 21/pnpm were not validated.
Existing Vite native-config warnings remain. Earlier limitations on browser
outcomes, legacy consent reset, live providers, restart retention, deployment
and production migration still apply.

### Acceptance and behavior demonstration

AC01–AC05 passed at the existing API boundary in the six-test clean rerun.
AC06 remains partial: backend failures preserve consent state; UI recovery is
implemented and statically reviewed, with browser validation outstanding.
The earlier acceptance table's detailed coverage limits still apply, including
the absence of a dedicated populated pending-suggestions assertion.

The executed lifecycle test performs independent authenticated API reads:

| Action | Observed assertion |
| --- | --- |
| Alice invites Bob | 201; both accepted-friend lists empty; pending pair recovered. |
| Read library/profile while pending | 403. |
| Bob explicitly accepts Alice | 200; both friend lists include the other account. |
| Read accepted friend's library/ratings | Zero, unrated and 7.5 preserved; notes key absent; owner notes retained; private list denied. |
| Remove accepted friendship | 200; future library/profile reads 403; ratings and populated suggestions exclude the account. |

Human scenario for the new recovery fix: throttle initial Friends reads, send an
invitation, and reject its POST. Let the subsequent GETs finish or fail. Loading
must settle, the write failure must remain visible, input must remain, and Reload
must become available. Repeat with an account change during recovery; the old
response must not repopulate friends. This scenario was not executed here.

### Independent review and inspection

Code-review used separate read-only Standards and Spec agents against
`git diff 3fc94fd..b94cb81` for the original feature, then a Spec recheck of the
new working-tree fix. Standards: no findings. Spec: one loading/retry defect
identified and addressed by the recovery refresh described above. Independent
Spec recheck confirmed the fix and found no new blocking issues; browser behavior
remains unverified.

Inspect the exact new proposed commit scope:

```sh
git branch --show-current
git status --short --untracked-files=all
git diff --stat
git diff -- repo/MovieNightFrontend/src/store/MovieStore.tsx docs/features/004-accepted-friendships-privacy/spec.md
# Review the already-existing feature separately:
git show --stat b94cb81
git diff 3fc94fd..b94cb81 -- repo/MovieNightBackend repo/MovieNightFrontend docs/features/004-accepted-friendships-privacy/spec.md
git show b94cb81 -- docs/features/003-private-custom-lists/spec.md
```

Stop here for explicit approval of this two-file change set before committing.
