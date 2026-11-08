## Outcome
Replace the dropdown select box for marking a movie as watched with an accessible, high-precision slider control (0–10 in 0.5 steps) styled with MovieNight dark theme tokens.

## Requirements and scope
1. **Component refactor:**
   - In `PersonalRatingInput.tsx` (and `MovieDetailPage.tsx`), replace `<select>` dropdown with an `<input type="range">` custom styled slider.
   - Range: `min="0"`, `max="10"`, `step="0.5"`.
   - Default / 0 value indicates "Unrated".
   - Displays real-time numeric value next to the slider thumb (e.g. `★ 7.5`, `★ 8.0`, or `Unrated`).
2. **Visual & accessibility styling:**
   - Dark theme track with accent fill (`bg-accent`), smooth round thumb with subtle glow on hover and focus.
   - Fully keyboard operable: Left/Down arrows decrement by 0.5; Right/Up arrows increment by 0.5; Page Up / Page Down by 1.0; Home/End jumps to 0 and 10.
   - Touch friendly: minimum 44px vertical touch target area around the slider thumb.
3. **Data integration:**
   - Seamlessly updates store via existing rating methods (`store.markWatched(userId, movieId, rating)`).
   - Preserves saved rating on reload.

## Acceptance Criteria
- **RS01 — Slider range & step:** Rating slider supports 0.0 to 10.0 with 0.5 increments.
- **RS02 — Value readout:** A badge or label dynamically reflects the selected rating value (e.g. "★ 8.5") or "Unrated" for 0.
- **RS03 — Keyboard navigation:** Arrow keys increase/decrease the slider by 0.5.
- **RS04 — Persistence:** Setting a rating updates the watched status in the store and survives page reloads.

## Verification
- Unit test for rating slider step calculations and unrated handling.
- Browser test confirming touch drag and keyboard interaction on the slider.

