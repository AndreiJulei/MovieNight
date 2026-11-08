## Outcome
Redesign the `/movies/:id` title detail page into an immersive, cinematic layout matching reference screenshots (Trainspotting on Movy), featuring a full-bleed backdrop hero with trailer play action, custom watchlist/watched action buttons with the rating slider, an actor cast photo row, original MovieNight notes preservation, and a "You may like" similarity shelf.

## Requirements and scope
1. **Cinematic hero header:**
   - Full-bleed key-art/backdrop presentation with dark bottom and side gradient vignettes.
   - Title typography, rating badges (★ IMDb / TMDb), release year, runtime (hours/minutes), quality tag (`4K`), and genres.
   - Clamped overview synopsis (2–3 lines).
2. **Action button row:**
   - **Play button:** Prominently launches the trailer modal (YouTube embed).
   - **Watchlist button:** `+ Add to Watchlist` / `✓ In Watchlist` toggling library state without page reload.
   - **Watched button:** `Mark Watched` (or `✓ Watched (X.X)`) which reveals the inline rating slider directly below the action row.
   - **Add to List button:** Opens popover to assign movie to custom lists.
3. **Actor cast section:**
   - Horizontal scrollable or flex row displaying key cast members with circular or rounded photo crops, actor name, and character name.
4. **Original MovieNight features preservation:**
   - Private personal notes editor visible for watched titles.
   - Friends' notes section displaying notes from accepted friends (visible even if current user has not yet watched the title).
5. **"You may like" similarity shelf:**
   - Horizontal poster shelf at the bottom of the page showing related titles fetched from the similarity endpoint (Ticket 5).

## Acceptance Criteria
- **DP01 — Visual alignment:** Detail page layout mirrors the reference architecture (cinematic backdrop, left-aligned metadata, primary actions, cast gallery, recommendations).
- **DP02 — Trailer playback:** Clicking Play opens the trailer modal and begins video playback without navigating away.
- **DP03 — Inline rating slider:** Clicking Watched expands the rating slider inline.
- **DP04 — Cast photo gallery:** Key cast members display with profile photos and character names.
- **DP05 — Notes preservation:** User's personal notes and friends' notes remain functional and accessible.
- **DP06 — You may like shelf:** Displays similar titles retrieved from the similarity API.

## Verification
- Unit test for page state handling (trailer open, inline slider toggle).
- Playwright browser test verifying layout hierarchy, cast row rendering, and trailer modal launch.

