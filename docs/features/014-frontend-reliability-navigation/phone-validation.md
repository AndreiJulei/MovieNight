# Same-network phone validation for GitHub #6

## Run the local LAN demo

Use a computer and phone on a network that permits devices to contact one
another. The computer needs Java 21, Node 22, pnpm 10.34.3, Python 3.9+,
OpenSSL and curl. This is the deterministic feature-008 demo: its provider
fixture uses bounded local responses, its signing key is generated at startup,
and H2 data disappears when the demo stops. Do not use real accounts or
provider keys. The default `demo.sh run` remains loopback-only.

From the repository root, find the computer's **IPv4 address on the interface
the phone can reach**. On macOS, `ipconfig getifaddr en0` often reports Wi-Fi;
if empty, inspect `networksetup -listallhardwareports` and use the Wi-Fi
device name there. On Linux, use `ip -4 addr show` and choose the active LAN
interface's address. Example address below is illustrative, not a value to
copy onto another network.

```sh
./docs/features/008-production-readiness/demo.sh check
LAN_IP=192.168.1.23 PORT=8443 ./docs/features/008-production-readiness/demo.sh lan
```

Open `http://192.168.1.23:8443` on the phone, substituting the same `LAN_IP`
and `PORT` used above. The demo launcher makes the frontend listen on all
computer interfaces only in `lan` mode. The backend remains on
`127.0.0.1:8080`, and the deterministic provider remains on
`127.0.0.1:18081`. Vite forwards `/api` to the loopback
backend. The launcher sets `VITE_API_URL` to the exact page origin, so phone
API requests return to the computer through the same origin; the phone never
uses its own `localhost`. The LAN proxy removes the browser's `Origin` header
only when it matches the request's HTTP `Host`; foreign origins pass through
for Spring to reject. The loopback backend retains its
localhost-only CORS policy. Backend CORS and production binding are unchanged.
No wildcard production CORS, public tunnel, hosting, native app or offline
support is part of this path.

Before opening the phone, confirm on the computer that the printed frontend
address loads and `curl -i http://127.0.0.1:18081/__health` reports the
fixture's `success` mode. A request to the frontend's `/api/auth/me` should
reach the backend and return an authentication response, not Vite HTML. Use
the browser's Network panel or remote debugging to check that phone requests
use `http://<LAN_IP>:<PORT>/api/...` and that no `localhost:8080` request
appears. Sign up a fresh demo account, open a title's details, add it to the
watchlist, reload, and confirm the saved Library entry remains visible.

Change `LAN_IP`, `PORT`, or other `VITE_` values by stopping and restarting
the demo; Vite reads these at startup and embeds them in the served browser
code. A production build would need rebuilding with its intended environment.
For failure/Retry checks, switch only the local fixture while the demo runs:

```sh
curl -fsS 'http://127.0.0.1:18081/__mode?value=failure'
curl -fsS 'http://127.0.0.1:18081/__mode?value=success'
```

Restore `success` after the probe. Cached discovery can delay a new provider
request; use a fresh query or the page's contextual Retry when available.
Do not repeat provider requests rapidly to force a failure. End the demo with
Ctrl-C in its terminal. This stops the local fixture, backend and frontend;
the in-memory demo data is discarded. Restart with `./docs/features/008-production-readiness/demo.sh run`
for the original loopback-only mode. No tracked or ignored configuration file
is changed by the launcher.

### Connection troubleshooting

- If the phone cannot load the page, verify the printed IP and port, confirm
  the computer can open that address, and allow inbound TCP traffic to the
  chosen frontend port in the host firewall. Guest Wi-Fi, access-point client
  isolation, VLAN rules and VPN routing can block peer traffic even when both
  devices show the same SSID. Disable the conflicting VPN or use a network
  that permits local peers, subject to local policy.
- Use `http://`, not `https://`; the demo serves plain HTTP. Browser HTTPS-only
  upgrades, stale HTTPS bookmarks or a mixed-up port can cause connection or
  certificate errors. Do not expose this HTTP demo to the internet.
- If the shell loads but API calls fail, inspect the phone's request URL. A
  `localhost:8080` URL points at the phone and means the LAN launcher or Vite
  environment was not applied; stop and restart `lan` mode. A 404 HTML page
  for `/api/...` suggests the proxy is not active. A backend connection error
  suggests the backend failed to start on loopback port 8080; check its log.
- If the address changes after Wi-Fi or VPN changes, discover the current LAN
  IP and restart the demo with the new value. Check that ports 8443, 8080 and
  18081 are free before starting; only 8443 (or the chosen `PORT`) needs
  inbound LAN access.

## Mobile and desktop checklist

Desktop responsive emulation checks layout at chosen CSS viewport sizes and
can simulate touch. It does not certify physical networking, actual touch
accuracy, on-screen keyboard behavior, device zoom, orientation handling or a
mobile browser engine. Record at least one available physical phone and
browser separately. For each row, write Passed, Failed, Blocked or Not run
and a brief observed result; do not infer phone success from emulation.

| ID | Viewport/device | Action and expected observable result | Actual/result |
| --- | --- | --- | --- |
| PV02-A | Actual phone/browser, portrait | Load HTTP page, sign up and log in; required fields and invalid input show useful validation; no account data leaks after sign-out | Not run (requires physical phone) |
| PV02-B | Actual phone/browser, portrait | Explore movie/TV/anime and search; open title details; metadata loads, retry follows a controlled failure, and API requests use same-origin `/api` | Not run (requires physical phone) |
| PV02-C | Actual phone/browser, portrait | Add title to watchlist, reload and return; save is recovered. Mark watched, set/clear rating, edit note, reload and check confirmed values | Not run (requires physical phone) |
| PV04-A | Actual phone/browser, portrait | Create/edit a custom list; invite, accept and remove a friend; confirm private notes/lists stay owner-only and friend views respect acceptance | Not run (requires physical phone) |
| PV04-B | Actual phone/browser, portrait and landscape | Navigate forward/back, reload a deep link, inspect long titles/notes, zoom to 200%, tap controls, and use search/forms with the on-screen keyboard | Not run (requires physical phone) |
| PV04-C | 360 × 800 CSS px, emulated | Repeat Explore/search/details, library save, navigation, failure/Retry; check clipping, touch targets and keyboard obstruction | Passed in automated suite (`responsive-usability.cjs`); verified Explore, search, title details, save, failure/retry, no horizontal page overflow, and touch targets >= 44px |
| PV04-D | 390 × 844 CSS px, emulated | Repeat the 360 px checks; rotate to landscape and inspect long text/zoom | Passed in automated suite (`responsive-usability.cjs`, `issue-3-5-controls-search.cjs`); verified portrait and landscape (844×390), search focus ring, touch targets >= 44px, and 200% zoom reflow (640px) with explicit per-control clipping checks |
| PV04-E | 430 × 932 CSS px, emulated | Repeat the 360 px checks; inspect lists/friends and form validation | Passed in automated suite (`responsive-usability.cjs`); verified primary flows, lists, friends, form validation, and zero horizontal page overflow |
| PV04-F | 1280 × 720 CSS px, desktop | Inspect the same primary flows, navigation and reload | Passed in automated suite (`responsive-usability.cjs`, `issue-3-5-controls-search.cjs`); verified desktop walkthrough, navigation, deep link reload, and zero horizontal overflow |
| PV04-G | 1440 × 900 CSS px, desktop | Inspect the same primary flows, navigation and reload | Passed in automated suite (`responsive-usability.cjs`, `issue-3-5-controls-search.cjs`, `issue-4-navigation.cjs`); verified full desktop primary flows, navigation history, and reload |

## Evidence on 2026-10-31

Base revision: `278ebb48222fff6dbb9157dd93083f3d033c83ec`, with uncommitted
Issue #6 changes. Environment: macOS host; available Node 25.3.0 and Java 25,
but declared Node 22, Java 21 and pnpm 10.34.3 were absent. `demo.sh check`
runs unit test discovery across both fixture and LAN launcher. Physical device,
phone browser and phone viewport: unavailable; no physical run was performed.

| Acceptance | Result | Direct evidence and limit |
| --- | --- | --- |
| PV01 | Passed for configuration and HTTP proxy; full declared-runtime launcher not run | `node --test repo/MovieNightFrontend/tests/http/lan-proxy.test.cjs` forwards authenticated POST, strips a matching simulated phone Origin, retains a foreign Origin, preserves upstream 404, and serves direct Vite dev deep links on ephemeral loopback ports. Built Vite preview returned 200 HTML for `/settings` and `/explore/movies/popular?sort=rating`. `python3 -m unittest discover -s docs/features/008-production-readiness -p 'test_*.py'` checks required/non-loopback IP and provider fixtures; `bash -n docs/features/008-production-readiness/demo.sh` passes. Setup and cleanup above are reproducible with declared prerequisites. |
| PV02 | Partially passed over HTTP; not run on physical phone | Against the disposable real demo backend via ephemeral Vite LAN proxy, matching synthetic phone Host/Origin `check-name` returned 200 JSON, signup 201, login 200 with a token present (not logged). A foreign Origin received 403. Title read and persisted save on a physical phone remain unverified. |
| PV03 | Passed as documented guidance | Emulation/physical distinction and network troubleshooting are recorded above; no network connectivity was inferred from the SSID. |
| PV04 | Passed in automated emulation for 360/390/430/1280/1440px; physical phone runs left unverified | Automated browser suites (`responsive-usability.cjs`, `issue-3-5-controls-search.cjs`, `issue-4-navigation.cjs`) passed across all 5 responsive viewports with zero horizontal page overflow and touch targets >= 44px; explicit per-control clipping assertions verified at 640px 200% zoom reflow. Physical phone checklist rows PV02-A–C and PV04-A–B remain unverified pending physical device testing. |
| PV05 | Passed for honest evidence recording; physical validation not run | Date, base revision, environment, missing physical browser/device and individual statuses recorded here. `tsc --noEmit`, `npm run build` and `git diff --check` passed; Vite emitted its existing native-config and bundle-size warnings. |
| PV06 | Passed for configuration boundary | Local deterministic provider and unchanged loopback backend/CORS prevent new direct phone access to provider or backend. No production configuration was edited. |

This document is a runnable validation record, not a claim that an actual phone
has passed PV02 or PV04. Record the tested revision, date, phone model, browser
version, viewport/orientation, network and per-row results when the physical
run becomes available.
