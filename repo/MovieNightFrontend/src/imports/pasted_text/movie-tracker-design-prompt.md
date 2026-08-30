# Movie Tracker — Frontend Design Prompt

Use this as the build brief for the frontend (handoff to a designer, or paste as a prompt into a code-gen tool). It assumes the workflow and API mapping from the refactor spec — this document focuses on *how each screen should look and read*, and ties every visual decision back to a workflow step.

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
| `success` | `#22C55E` | **Reserved exclusively** for the "Mark as Watched" button — this is what makes it read as an action, not decoration |

No gradients. No shadows beyond a 1px border or a very faint elevation (`box-shadow: 0 1px 3px rgba(0,0,0,0.4)` at most) on cards to lift them off the background.

**Type** — two families, three weights total:
- Display/UI face: a clean geometric sans (e.g. Inter or similar) — used for titles, buttons, nav.
- Numeric/data face: same family, tabular-nums variant for ratings and counts, so `8.5` and `10.0` align visually wherever they appear.
- Weights: Regular (body), Medium (labels/buttons), Bold (movie titles only — this is the one place bold appears, so it stays meaningful).

**Spacing/shape**: 8px base unit. Border radius: 8px on cards and inputs, 6px on buttons — consistent, not decorative variety. No icons except: `+` (add), the two bottom-sidebar glyphs, and a star or numeric badge for rating. Everything else is text.

---

## Screen-by-screen

### 1. Login

**What it needs to say**: this is a private, single-purpose tool, not a product with a sales pitch. No hero copy, no logo animation.

- Centered card, `surface` background, max-width ~360px, vertically centered on `bg`.
- Two fields: Username, Password — plain labeled inputs, `accent` focus ring.
- One button: "Log in" (accent fill, white text).
- Error state (bad credentials): a single line below the button in a muted red, plain language — *"That username or password isn't right."* No modal, no icon.
- **Connects to workflow**: successful login stores the Basic Auth header in session and routes to `/movies` (Watched list, the default landing view).

**Sign-up adds one more field: Display name.** This is the name friends search for and see everywhere in the app (friend list, comments, ratings) — it needs to be unique and non-blank.
- Field sits between Username and Password, labeled plainly *"Display name"* with helper text below it in `text-muted`: *"This is what your friends will see. Letters and numbers only, no spaces."*
- Validation, checked on blur (not just on submit): empty → *"Display name can't be empty."* Whitespace-only → same message (trim before validating, don't just check length). Already taken → *"That name's already in use — try another."* — this needs a server round-trip (e.g. `GET /api/users/check-name?name=...`) since uniqueness can't be checked client-side.
- Valid state: the word *"Available"* in `accent` blue appears next to the field, plain text, no icon. Deliberately not green here — green stays reserved for the Watched button alone, so a second meaning doesn't dilute it.

---

### 2. Top bar (persistent across `/movies*`)

This is the app's only "chrome" beyond the bottom sidebar — it has to carry count, sort, filter, and the primary action without feeling busy.

```
┌──────────────────────────────────────────────────────────┐
│  42 movies · avg 7.8          Sort ▾   Rating ▾   Date ▾   [+ Add]│
└──────────────────────────────────────────────────────────┘
```

- Left: plain text, `text-muted`, small — *"42 movies · avg 7.8"*. Not a stat card, not a badge — just a line of text. It updates live as movies are added/removed/rated.
- Center-right: three plain dropdowns (not pill buttons, not a segmented control) — Sort, Rating filter, Date filter. Each shows its current value inline (e.g. "Sort: Date added ▾") so state is always visible without opening the menu.
- Far right: the **Add button** — the one place `accent` blue appears as a solid fill. `+ Add`, medium weight, white text, 6px radius. This is the visual anchor of the bar; everything else stays quiet so this reads as *the* action.
- **Connects to workflow**:
  - Sort → `sortBy` query param (`title`, `releaseYear`, `personalRating`, `addedAt`).
  - Rating filter → client-side or future `minRating` param; options like "All", "8+", "6+".
  - Date filter → client-side range over `addedAt` (e.g. "All time", "This month", "This year").
  - `+ Add` → routes to `/movies/add`.

---

### 3. Main grid (Watched list, default view)

- A responsive grid of poster cards — no table chrome, no row lines. Poster fills the card top-to-bottom-minus-title; title sits directly below in Bold, `text-primary`, truncated to one line with ellipsis if long.
- Card has **no rating badge, no director, no status pill** on the grid itself — you asked for poster + title only, and that restraint is the point. All secondary info lives on the detail page.
- Hover state: subtle lift (`surface-raised` background bleeds 4px past the poster, or a 1.02 scale on the poster only) — enough to confirm interactivity, nothing theatrical.
- Empty state (no movies yet): centered, one line — *"Nothing here yet. Add a movie to get started."* — with the Add button doing double duty as the call to action (don't add a second button in the empty state; point at the one that already exists in the top bar).
- Poster load failure or missing `posterUrl`: a flat `surface` rectangle in the same aspect ratio, with the movie title centered on it in `text-muted`. This is a real state you'll hit often (manual adds without a poster), so design it as a first-class look, not an error icon.
- **Connects to workflow**: `GET /api/movies?status=WATCHED,REWATCH&sortBy=...`, clicking any card routes to `/movies/:id`.

---

### 4. Movie detail page

```
┌───────────────┬───────────────────────────────┐
│               │  Movie Title (Bold, 28px)      │
│               │  ★ 8.5 / 10   (or hidden)       │
│   POSTER      │  ─────────────────────────────  │
│   (large,     │  Description                     │
│   2:3 ratio)  │  ┌─────────────────────────────┐│
│               │  │ editable textarea, surface   ││
│               │  │ background, autosaves        ││
│               │  └─────────────────────────────┘│
│               │  [ Mark as Watched ]  ← only on watchlist items│
└───────────────┴───────────────────────────────┘
```

- Poster: large, left-aligned, fixed 2:3 ratio, `border` outline. This is the visual weight of the page — everything else is typography on flat background.
- Title: Bold, largest text on the page, sits directly under the top edge of the poster's row (not centered — left-aligned with the text column, per your layout).
- Rating: directly below title, small and quiet — a plain `★ 8.5 / 10` in `text-primary`, tabular numerals. On **Watchlist items this line is entirely absent** — not grayed out, not "—", just not there. Its absence is the signal that this movie hasn't been rated yet.
- Description box: a plain textarea styled to look like part of the page, not a form — `surface` background, no visible border until focused (focus shows the `accent` ring). Autosaves on blur; show a small, temporary `text-muted` "Saved" label near the box, not a toast.
- **Mark as Watched button** — appears *only* when `status` is `WANT_TO_WATCH`/`IN_PROGRESS`. Solid `success` green fill, white bold text, sits below the description box or directly under the rating slot it will soon fill. This is the single green element in the entire app — its rarity is what makes it feel like a milestone action rather than routine UI.
  - Clicking it opens a small inline panel (not a full modal) directly beneath the button: a 0–10 rating input and an optional comment field, with a "Confirm" button.
  - On confirm: `PUT` status → `WATCHED`, `PATCH` rating, optionally update `notes`. The green button disappears and the rating line animates in where the button was — a single, deliberate transition, not a page reload.
- **Connects to workflow**: `GET /api/movies/{id}` on load; `PUT`/`PATCH` on save/watched actions as detailed in the refactor spec §3.3.

---

### 5. Add movie page

Two modes via a simple two-option toggle at the top — **Search** / **Manual** — styled as plain text tabs with an underline on the active one (not buttons; this is a mode switch, not two separate actions).

**Search mode**
- One text input, large, placeholder *"Search for a movie…"* — this is the hero of the page, everything else appears after a result is chosen.
- Results appear as a simple vertical list below the input: small poster thumbnail, title, year, external rating shown in `text-muted` (clearly *not* the user's own rating — label it "avg 7.2" so it's unambiguous).
- Selecting a result collapses the search list and reveals the same fields as manual mode, pre-filled (poster, title, year, director hidden from the UI but carried in the payload) plus the external rating shown as a small reference line above the user's own rating input.

**Manual mode**
- Title (required, plain input).
- Poster: a toggle between "Upload from device" (file input styled as a dashed drop zone in `surface`) and "Paste image URL" (plain input) — only one visible at a time.
- Rating 0–10: only visible/enabled when the target list is **Watched**. Simple numeric slider or stepper, not stars (stars imply a 5-point scale; you're on a 0–10 scale, so a slider with the number displayed reads more honestly).
- Description: optional textarea, same styling as the detail page's description box for consistency.
- Target list: a two-option toggle — **Watched** / **Watchlist** — this determines whether the rating field is active and which `status` gets submitted.
- Primary action: `Add movie`, `accent` fill, bottom of the form.
- **Connects to workflow**: `POST /api/movies` with the assembled payload; the Watched/Watchlist toggle sets `status` and gates the rating field exactly as the detail page gates its display.

---

### 6. Bottom sidebar

- A thin, low-profile strip pinned to the bottom of the viewport — not a tall vertical nav. **Three entries**, in this order:
  - `Watched (38)`
  - `Watchlist (4)`
  - `Friends (6)`
- Active tab: `accent`-colored text with a 2px underline or left-tick mark; inactive tab: `text-muted`. No background fill on tabs, no avatars in the strip itself — keep this quiet since it's secondary to the top bar's primary action. The `Friends` count is the number of friends added, not a notification count — no red badge, no unread-style dot, since nothing in this app needs urgency.
- **Connects to workflow**: `Watched`/`Watchlist` switch the main grid's status filter as before. `Friends` routes to `/friends`, the list described below.

---

### 7. Friends list page (`/friends`)

- Top of page: a plain search input, placeholder *"Add a friend by display name…"* — no icon, no button beside it; pressing Enter (or a debounced live search) shows a single matching result below with an `Add` button (`accent` outline, not filled — this is a secondary action relative to the app's one primary `+ Add`, which stays reserved for movies).
  - No match: one muted line, *"No one found with that name."*
  - Exact match found: show their display name plus an `Add` button. On click, it becomes `Requested` (muted, disabled) or `Friends` immediately, depending on whether you want friend requests to require the other person's acceptance — if you want to keep this simple for v1, skip the request/accept step entirely and make adding immediate and mutual (simplest to build, and fine for a small personal-use app; add approval later only if it actually becomes needed).
- Below the search: a plain vertical list of current friends. Each row: display name (Medium weight), and two small counts beside it in `text-muted` — *"32 watched · 5 to watch"*. No poster thumbnails, no avatars — this list should read the same restrained way as everything else, plain text rows on `surface` background with a hairline `border` between rows.
- Clicking a friend's row routes to `/friends/:id`.
- **Connects to workflow**: search hits `GET /api/users/search?name=...`; add hits a new `POST /api/friends` (see follow-up spec on endpoints); the per-row counts are `GET /api/movies?userId={friendId}&status=...` scoped read-only queries.

---

### 8. Friend's profile page (`/friends/:id`)

This reuses almost the entire main-grid layout — same poster-grid component, same top-bar-style summary line — but stripped of anything that implies you can edit their data.

```
┌──────────────────────────────────────────────────────────┐
│  ← Back to Friends        Alice · 32 watched · avg 7.6     │
├──────────────────────────────────────────────────────────┤
│  Watched (32)     Watchlist (5)          ← tabs, not sidebar│
├──────────────────────────────────────────────────────────┤
│                     [poster grid, read-only]                │
└──────────────────────────────────────────────────────────┘
```

- Header replaces the `+ Add` button entirely with a plain `← Back to Friends` link — there is no add action on someone else's profile, so don't leave an empty space where it would have been; let the back-link anchor that side instead.
- Two tabs (Watched / Watchlist) sit *inline in the page*, not in the bottom sidebar — the bottom sidebar's own tabs still control *your* lists; this page needs its own smaller switch so the two states of navigation don't collide.
- Grid: identical poster+title cards to your own grid. Clicking a card routes to the **same shared movie detail page** described earlier — not a separate "friend's movie" page — since (per the data-model fix) a movie's identity is shared across users, this is just `/movies/:id` opened from a different entry point. This is also what makes the friends'-ratings and comments sections on that page make sense: you're looking at the one shared page for that movie, which happens to now show Alice's rating alongside yours.
- No personal rating shown on Alice's Watchlist tab, same rule as your own Watchlist — you're seeing *her* view of that rule, not a special case.
- **Connects to workflow**: `GET /api/movies?userId={friendId}&status=...` for the grid; tapping into a movie is a normal navigation to `/movies/:id`, where the friends'-ratings/comments sections (from the earlier discussion) do the rest.

---

## Microcopy rules (applies everywhere)

- Buttons say what happens: "Add movie," "Mark as Watched," "Confirm," not "Submit" or "OK."
- No exclamation points, no "Oops!" — errors state what happened plainly: *"Couldn't save — check your connection and try again."*
- The empty grid state and the "Saved" indicator are the only two places the UI "talks" to the user outside of buttons and labels — keep it that way rather than adding tooltips or onboarding hints. The layout should be self-explanatory at a glance, which is the actual test of whether the minimalism is working.