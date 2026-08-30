# Movie Night — Frontend Design Prompt

Use this as the build brief for the frontend. It assumes the workflow and API mapping from the refactor spec — this document focuses on *how each screen should look and read*, on both phone and desktop, and ties every visual decision back to a workflow step.

---

## Design tokens

**Color** — dark blue, restrained, one accent, one meaning-carrying second accent:

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0B1220` | App background |
| `surface` | `#141E33` | Cards, modals, input backgrounds |
| `surface-raised` | `#1B2740` | Hover/active state on cards, the detail-page poster panel |
| `border` | `#26314D` | Hairline dividers, card outlines — used sparingly, not on every element |
| `text-primary` | `#E5E9F0` | Titles, ratings, body copy |
| `text-muted` | `#8B95AC` | Secondary labels, timestamps, placeholder text |
| `accent` | `#3B82F6` | Add button, active tab, links, focus ring |
| `success` | `#22C55E` | **Reserved exclusively** for the "Mark as Watched" button — nowhere else, so it keeps reading as a milestone action |

No gradients. No shadows beyond a 1px border or a faint elevation (`box-shadow: 0 1px 3px rgba(0,0,0,0.4)` at most) on cards.

**Type** — two weights carry almost everything:
- Display/UI face: a clean geometric sans (e.g. Inter) for titles, buttons, nav.
- Tabular-nums variant for ratings and counts, so `8.5` and `10.0` align wherever they appear.
- Weights: Regular (body), Medium (labels/buttons), Bold (movie titles and the app wordmark only).

**Spacing/shape**: 8px base unit. 8px radius on cards/inputs, 6px on buttons. No icons except `+` (add), a small back-arrow, and the nav glyphs described below — everything else is text.

**Wordmark**: "Movie Night" — set in Bold, `text-primary`, no logomark/icon needed. It appears once, at the top of the nav rail (desktop) or is simply implied by the app itself (mobile keeps the top bar clean and skips repeating it there — see below).

---

## Responsive layout: the core structural decision

The app has exactly one piece of chrome that moves between breakpoints: the **navigation rail** (what's been called "the bottom sidebar" so far). Everything else — top bar, grid, detail page, add page — keeps the same structure and just reflows.

**Breakpoint**: treat anything ≥ 1024px wide as desktop, below that as phone. No dedicated tablet layout — tablets in portrait get the phone treatment, landscape gets the desktop treatment; this avoids a third layout to maintain for a personal-scale app.

### Phone (< 1024px) — nav rail on the bottom

```
┌───────────────────────────────┐
│  TOP BAR (count, filters, +Add)│
├───────────────────────────────┤
│                                 │
│         MAIN CONTENT            │
│                                 │
├───────────────────────────────┤
│  Watched   Watchlist   Friends  │  ← bottom rail, thin strip
└───────────────────────────────┘
```
- Bottom rail is fixed, thin (roughly 56px), three plain text tabs, no icons needed since there are only three and text reads faster than guessing at glyphs at this size.
- Top bar's filter dropdowns collapse into a single "Filters" text button that opens a small sheet from the bottom, rather than three dropdowns crowding a narrow bar. Sort/Rating/Date all live in that one sheet.

### Desktop (≥ 1024px) — nav rail on the left

```
┌───────────┬─────────────────────────────────────────┐
│           │  TOP BAR (count, sort, rating, date)  [+Add]│
│  Movie    ├─────────────────────────────────────────┤
│  Night    │                                           │
│           │                                           │
│  Watched  │              MAIN CONTENT                 │
│  Watchlist│                                           │
│  Friends  │                                           │
│           │                                           │
└───────────┴─────────────────────────────────────────┘
```
- Left rail is a fixed-width column (roughly 220px), `surface` background, full height, with a `border` only on its right edge to separate it from the content area — no drop shadow.
- The wordmark **"Movie Night"** sits at the top of this rail, Bold, `text-primary` — this is the one and only place it appears, since desktop has the vertical space for it and phone doesn't need to spend a top-bar row on branding.
- Below it, the same three destinations as phone — `Watched`, `Watchlist`, `Friends` — stacked vertically instead of side-by-side, each showing its count inline (e.g. `Watched · 38`) in `text-muted` next to the label. Active item: `accent` text plus a 2px left-edge bar in `accent`, matching the same "underline/tick" logic the phone version uses, just rotated to fit a vertical list.
- Top bar keeps all three filter dropdowns inline (no collapsing into a sheet) since there's room — this is the only piece of chrome that actually differs in *content*, not just position, between the two breakpoints.
- The `+ Add` button stays in the top bar on both breakpoints, top-right — it's a *content-area* action tied to whichever list you're viewing, not a nav-rail destination, so it never moves into the rail even on desktop.

This gives you one component (`NavRail`) that takes an `orientation` prop (`horizontal` / `vertical`) rather than two separate implementations — worth specifying that constraint up front so the eventual build doesn't fork into two maintained versions of the same three links.

---

## Screen-by-screen

### 1. Login / Sign up

- Centered card, `surface` background, max-width ~360px, vertically centered on `bg` — identical on phone and desktop, since a centered card at a fixed max-width already behaves responsively without special-casing.
- Login: Username, Password, `Log in` button (accent fill, white text). Error: one muted-red line, plain language — *"That username or password isn't right."*
- Sign-up adds a **Display name** field between Username and Password — this is what friends search for and see everywhere (friend list, ratings), so it must be unique and non-blank.
  - Helper text below the field, `text-muted`: *"This is what your friends will see. Letters and numbers only, no spaces."*
  - Validated on blur: empty or whitespace-only → *"Display name can't be empty."* Taken → *"That name's already in use — try another."* (needs a server round-trip, e.g. `GET /api/users/check-name?name=...`).
  - Valid state: the word *"Available"* in `accent` blue next to the field, plain text, no icon — deliberately not green, since green stays reserved for the Watched button alone.
- **Connects to workflow**: successful login stores the auth header in session; before landing on `/movies`, a short animated sequence plays (see below).

**Login success animation:**
1. The login card fades out; pixelated poster-shaped thumbnails (16-bit style, abstract silhouettes — see copyright note) fly in from the edges toward the center, starting slow.
2. Each subsequent poster arrives faster than the last — the interval between arrivals shrinks (e.g. ~600ms apart at first, decaying toward ~80ms), so it reads as genuinely *accelerating* rather than looping at a fixed speed.
3. The last few blur past almost too fast to register, then the screen snaps to solid `bg` black for a short beat (~300ms).
4. The main page fades in from that black, landing on the Watched grid.
- Target total duration: 1.5–2 seconds — a flourish, not an obstacle. Respect `prefers-reduced-motion`: skip straight to the fade-in if set, no exceptions, since this is a pure delight-feature with a real accessibility cost if forced on everyone. Plays once per login, not on every navigation.
- **Copyright note**: don't use real movie poster art here, even blurred or fast-moving — that's still reproducing copyrighted images. Generate abstract pixel-art poster placeholders instead (colored rectangles with vague pixel silhouettes — a rocket, a face, a gun, a heart — nothing referencing a specific real film). This is actually more in keeping with the retro-pixel aesthetic than real posters would be, and it means the animation never breaks if a studio's poster art changes or an image host goes down.

---

### 2. Top bar (persistent across `/movies*`)

```
Phone:    42 movies · avg 7.8                     [Filters ▾] [+ Add]
Desktop:  42 movies · avg 7.8    Sort ▾  Rating ▾  Date ▾     [+ Add]
```
- Left: plain text, `text-muted`, small — *"42 movies · avg 7.8"*, updating live.
- Middle: three dropdowns on desktop, one "Filters" sheet-trigger on phone (see layout section above) — same underlying state either way (`sortBy`, rating threshold, date range).
- Right: the **Add button** — the one solid `accent` fill in the top bar. `+ Add`, Medium weight, white text, 6px radius.
- **Connects to workflow**: sort → `sortBy` query param; rating filter → client-side or future `minRating` param; date filter → client-side range over `addedAt`; `+ Add` → routes to `/movies/add`.

---

### 3. Main grid (Watched or Watchlist, selected via nav rail)

- Responsive poster grid — no table chrome. Poster fills most of the card; title sits directly below in Bold, `text-primary`, truncated with ellipsis if long. Grid column count scales with viewport width (more columns on desktop, fewer on phone) but the card itself never changes shape between breakpoints.
- Card shows **poster + title only** — no rating badge, no status pill on the grid itself; that stays on the detail page.
- Hover/press state: a subtle lift (`surface-raised` bleeding a few px past the poster, or a slight scale on the poster only).
- Empty state: centered, one line — *"Nothing here yet. Add a movie to get started."* — pointing at the existing `+ Add` button rather than adding a second one.
- Poster load failure or missing `posterUrl`: a flat `surface` rectangle at the same aspect ratio with the title centered on it in `text-muted` — a first-class look, not an error icon, since manual adds without a poster will hit this often.
- **Connects to workflow**: `GET /api/movies?status=...&sortBy=...`; clicking a card routes to `/movies/:id`.

---

### 4. Movie detail page

```
Phone (stacked):              Desktop (side-by-side):
┌─────────────┐               ┌───────────┬───────────────────────────┐
│   POSTER     │               │           │  Movie Title (Bold)        │
│  (2:3 ratio) │               │  POSTER   │  ★ 8.5/10  (yours)         │
├─────────────┤               │  (large,  │  IMDb 8.8 · RT 87%         │
│ Movie Title  │               │  2:3)     │  ───────────────────────  │
│ ★ 8.5/10     │               │           │  Description               │
│ IMDb 8.8·RT87%│              │           │                            │
│ ─────────────│               │           │  [context-dependent button]│
│ Description  │               │           │  ───────────────────────  │
│[context button]│             │           │  Friends' ratings          │
│ ─────────────│               │           │   Friends' avg: 7.6        │
│ Friends' avg 7.6│            │           │   Alice · 8                │
│  Alice · 8   │               │           │   Ben · 7                  │
│  Ben · 7     │               └───────────┴───────────────────────────┘
└─────────────┘
```

**External ratings (IMDb / Rotten Tomatoes)**: one small line, `text-muted`, directly under your own rating — *"IMDb 8.8 · RT 87%"*. Sourced via OMDb at add-time (search mode) and cached on the canonical `Movie` record, not re-fetched every page view. If a score is missing (RT isn't always populated), omit just that segment rather than showing "RT: —" — *"IMDb 8.8"* alone reads cleaner than a dash. These scores show **only on this page**, never on grid cards or list rows — the grid stays poster+title everywhere, no exceptions, including on friends' profile grids.

**Your own rating**: shown directly under the title if you've added this movie yourself (to either list) — absent entirely if you haven't, or if it's on your own Watchlist (unrated by definition).

**Friends' ratings — always visible, not collapsible.** This sits as its own section at the *bottom* of the page, below the description/action button, not tucked into a dropdown near the title. Reasoning: your own rating and the external scores are the things you want at a glance the moment the page opens, so they stay up top near the title; friends' opinions are secondary content you scroll to, the way you'd scroll to reviews on any other page — matching your instinct that "below" reads more naturally than a click-to-expand.
- Header line: *"Friends' avg: 7.6"* — omitted entirely (the whole section is skipped) if no friend has rated this movie, and if you have zero friends added yet, this section simply doesn't render at all rather than showing an empty state — no need to explain an absent feature.
- Below that header, a plain list: each friend's display name beside their rating, one per line, `text-primary` name / `text-muted` or tabular-num rating, no avatars — same restrained row style used on the Friends list page.

**Description**: a single box, tied to *your* list entry for this movie, editable only by you. If you're viewing this page without having added the movie yourself (arrived via a friend's profile), there's no description box for you at all — it's not "read-only," it simply isn't your entry to describe. You'll see the friends' ratings section regardless, since that's about the movie, not about your list.

**Context-dependent action button** — this is the one element on the page that changes based on *why* you're looking at this movie:

| Context | Button shown |
|---|---|
| Your own Watchlist item | Green **Mark as Watched** (opens the rating+description panel, as before) |
| Your own Watched item | No action button — just a small **Delete** link (see below) |
| A movie you don't have on either list yet (arrived via a friend's profile) | Outline **Add to Watchlist** button, `accent` |
| A movie a friend has, that you *also* already have | No add button (you already have it) — your own rating shows highlighted alongside theirs in the friends'-ratings expansion, so the connection is visible without a redundant button |

**Delete**: a small, quiet text link — *"Remove from list"*, `text-muted`, not a button — appears **only on your own entries**, tucked at the bottom of the page near the description box rather than up near the title where it could be mis-tapped next to the primary content. Clicking it opens a lightweight inline confirm ("Remove *Inception* from your list? [Remove] [Cancel]") rather than a full modal, consistent with how the Watched-confirmation panel works. Never appears when viewing a friend's copy of a movie — there's nothing of yours to remove in that context.

- **Connects to workflow**: `GET /api/movies/{id}` plus a friends'-ratings read (`GET /api/movies/{id}/friends-ratings`) on load; `DELETE /api/movies/{id}` (existing endpoint) wired to the Remove link, gated client-side (and re-checked server-side) to the entry's owner; "Add to Watchlist" from a friend's context hits `POST /api/movies` referencing the canonical movie so poster/title/external ratings carry over without a re-search.

---

### 5. Add movie page

Two modes via a plain text toggle at the top — **Search** / **Manual** (underline on the active one, not styled as buttons, since this is a mode switch).

**Search mode**: one large input, placeholder *"Search for a movie…"*. Results list below: thumbnail, title, year, external average rating in `text-muted` labeled clearly (e.g. "avg 7.2") so it's never confused with a personal rating. Selecting a result pre-fills poster/title/year and reveals the same fields as manual mode.

**Manual mode**: Title (required). Poster: toggle between "Upload from device" (dashed drop-zone) and "Paste image URL" (plain input) — one visible at a time. Rating 0–10: a slider with the number displayed (not stars — a 5-star widget misrepresents a 0–10 scale), enabled only when target list is Watched. Description: optional textarea, same styling as the detail page's box.

Target list toggle — **Watched** / **Watchlist** — gates the rating field exactly as the detail page gates its display. Primary action: `Add movie`, accent fill.

- **Connects to workflow**: `POST /api/movies`; layout is identical on phone and desktop, just narrower/wider — this page doesn't need a breakpoint-specific treatment since it's a single-column form either way.

---

### 6. Friends list page (`/friends`)

- Search input at top, placeholder *"Add a friend by display name…"*. Exact match shows their name plus an `Add` button (`accent` outline, not filled, since it's secondary to the app's one primary `+ Add`). Adding is immediate and mutual — no request/accept step, kept simple for a small personal-use app. No match: one muted line, *"No one found with that name."*
- Below the search: a plain vertical list of current friends, hairline `border` between rows, `surface` background, no avatars. Each row now shows, in `text-muted`:
  - *"32 watched · 5 to watch"* (their list counts)
  - **their average rating**, plainly labeled, e.g. *"avg 7.6"* — this is new: friends' overall taste is visible right in the list, not just per-movie.
- Clicking a row routes to `/friends/:id`.
- **Connects to workflow**: search hits `GET /api/users/search?name=...`; add hits `POST /api/friends`; counts and average come from a scoped read of that friend's `UserMovieEntry` rows.

---

### 7. Friend's profile page (`/friends/:id`)

Reuses the main-grid layout, stripped of anything implying you can edit their data — but each card now carries one more piece of information and one more action than your own grid does.

```
Phone:                          Desktop (rail stays on the left,
┌───────────────────────────┐   this is just the content area):
│ ← Back      Alice · avg 7.6│  ┌────────────────────────────────┐
├───────────────────────────┤  │ ← Back to Friends   Alice · avg 7.6│
│ Watched (32)  Watchlist (5)│  ├────────────────────────────────┤
├───────────────────────────┤  │ Watched (32)      Watchlist (5)   │
│ [poster]      [poster]     │  ├────────────────────────────────┤
│  Title         Title       │  │        [read-only poster grid]    │
└───────────────────────────┘  └────────────────────────────────┘
```
- Header: `← Back to Friends` link stands in for the `+ Add` button's spot — there's no "add a movie" action on someone else's profile.
- Two inline tabs (Watched / Watchlist) local to this page — separate from the nav rail's own Watched/Watchlist, which still control *your* lists. This avoids the two levels of navigation colliding.
- The grid itself is **identical to your own grid** — poster and title only, nothing else. No rating badge, no `+ Add` button on the card. This keeps the one visual rule ("grids show poster+title, everything else lives on the detail page") true everywhere in the app, with zero exceptions to remember.
- Clicking a poster routes to the shared `/movies/:id` detail page — same page as always, just arrived at from a different starting point. That page is where the friend's rating, the external IMDb/RT scores, and the **Add to Watchlist** button (if you don't already have this movie) all live, per §4's context-dependent button table.
- **No Mark as Watched button, no Delete link, and no description box appear anywhere on this page** — those only exist on your own entries, and per §4 they're gated on the detail page itself, not here.
- **Connects to workflow**: `GET /api/movies?userId={friendId}&status=...` for the grid; all the interesting actions (add-to-watchlist, viewing ratings) happen after navigating into `/movies/:id`, not from the grid.

---

### 8. Settings page (`/settings`)

New page, reachable from a small text link in the nav rail (bottom of the vertical list on desktop; a plain row inside the phone's Filters-style sheet, or its own small entry point — a gear glyph is fine here, it's the one icon exception since "settings" is genuinely a universal symbol). Kept sparse, matching the rest of the app: a short list of toggles, not a settings *dashboard*.

- **Desktop companion** — on/off toggle, plus a picker between a couple of original pixel-art characters (see below) when enabled. Off by default on first use, since it's a delight-feature, not core functionality.
- (Room here later for a theme toggle or similar, if you ever want one — not needed now per your "essentials only" direction, just noting the page is built to hold more than one toggle.)

---

### 9. Desktop pixel companion (optional, off by default)

A small pixel-art character, roughly 48–64px, that follows the cursor around the screen with a slight lag/easing (so it trails rather than snapping exactly to the pointer — that lag is what makes it read as "alive" rather than a cursor replacement). On click anywhere in the app, it plays a quick reaction animation — a couple of frames, under 300ms — then returns to idle.

**On the character designs**: rather than recreating specific copyrighted movie characters (their exact likenesses belong to the studios that made those films), design **original characters in a similar spirit** — the vibe you're going for, not a 1:1 recreation:
- A nameless suited figure with an earpiece, pixel-art remote in hand, that gives a small "click" gesture with the remote on each app-click.
- A separate mohawked figure in a worn jacket, pixel revolver in hand, that does a quick draw-and-recoil animation (no muzzle flash needed to read as "shooting" — a snap of the wrist and a tiny puff-of-smoke sprite is enough, and keeps it cartoonish rather than graphic).
- Both live as small sprite sheets (a handful of frames each: idle, walk/follow, click-reaction) — simple enough to hand-draw or generate as pixel art without needing a full animation rig.
- Users pick one (or neither) in Settings; the choice persists per-user.

**On phone**: a cursor-follower doesn't translate — there's no persistent pointer to trail on a touchscreen. Rather than forcing the same mechanic, give it a **phone-appropriate equivalent**:
- The character sits fixed in a bottom corner of the screen (small, out of the way of the nav rail) and plays its "reaction" animation on tap — either on any tap anywhere in the app, or (simpler, less distracting during normal use) specifically when you tap the `+ Add` button or confirm a "Mark as Watched" action, so it reads as celebrating an action rather than firing on every incidental tap.
- No dragging/following animation needed on phone — just idle-and-react, which is a much smaller animation budget and won't interfere with touch scrolling or tap targets.
- Same Settings toggle controls both platforms; the *behavior* differs by platform but the on/off state is shared.