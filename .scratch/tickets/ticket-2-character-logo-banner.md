## Outcome
Render a rotating decorative character banner between the recommendations section and the editorial narrative at the bottom of the home page, randomly selecting from transparent character art assets on each page load.

## Requirements and scope
1. **Asset management:**
   - Migrate/copy the transparent character variants (`*_transparent*.png`) from `mainPageLogo/` into `repo/MovieNightFrontend/public/mainPageLogo/`:
     - `bvs_vertical_transparent.png`
     - `fightclub_transparent_pink.png`
     - `fightclub_transparent_violet.png`
     - `killbill_transparent_violet.png`
     - `killbill_transparent_yellow.png`
     - `spidey_vertical_transparent.png`
     - `spidey_vertical_transparent_violet.png`
     - `vader_crossed_transparent.png`
     - `vader_marvel_transparent.png`
   - Add the root `mainPageLogo/` directory to `.gitignore` so large generation scripts and alternate assets remain untracked.
2. **Component & placement:**
   - Create a `CharacterLogoBanner.tsx` component.
   - Insert it on `HomePage.tsx` strictly between the recommendations section (`#recommendations`) and the editorial narrative section (`A single, deliberate space for everything you watch`).
   - On component mount / page refresh, randomly pick one asset from the list of transparent logo assets.
   - Display the asset centered, with responsive height (e.g. `max-h-[320px] sm:max-h-[400px]`), clean opacity/contrast against the `#05070d` background, and `pointer-events-none` (purely decorative, no link).

## Acceptance Criteria
- **CL01 — Placement:** Character banner renders below the recommendations grid and above the editorial narrative section.
- **CL02 — Rotation:** Refreshing the page randomly chooses among the configured transparent character assets.
- **CL03 — Styling & responsiveness:** Image is centered, transparent, non-clickable, does not cause horizontal overflow on mobile viewports (< 768px), and scales gracefully up to desktop.

## Verification
- Unit test verifying random selection picks valid asset paths.
- Playwright browser test verifying vertical positioning (`recommendationsBox.y < bannerBox.y < narrativeBox.y`) and zero horizontal scroll.

