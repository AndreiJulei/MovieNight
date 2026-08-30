# Movie Night — Login Screen Redesign Prompt

Redesign the login screen as a split-screen cinematic scene: a dark 3D character panel with a flythrough of movie posters on the left, and the login form on the right. Also revise the pixel companion to a fixed, always-on corner sprite. Build using the existing Spline/shadcn component patterns already in the codebase (`SplineScene`, `Spotlight`, `Card`) and the CSS-driven parallax/lighting technique from the poem-animation reference (`@keyframes` for translate, blur, brightness, zoom — not the 3D cube rotation itself).

---

## 1. Overall layout

- Full-viewport split, 50/50 on desktop: **left half = 3D scene panel**, **right half = login form**.
- On phone: stack vertically, scene panel collapses to a shorter band (roughly 35vh) above the form, same content, simplified to reduce GPU load (see §4).
- Background of both halves: near-black navy (`#05070D`, darker than the app's normal `bg` — this screen is meant to feel like a distinct cinematic moment, not the regular app chrome), so the scene panel and the form panel read as one continuous dark environment rather than two separate boxes.

---

## 2. Left panel: 3D character

**Base**: reuse the existing `SplineScene` + `Spotlight` + `Card` pattern. `Card` becomes the panel container (`w-full h-full bg-black/[0.97] relative overflow-hidden`), `Spotlight` provides a soft ambient glow that tracks pointer movement within the panel only (not the whole page), and the Spline scene renders the character.

**Character design** — built from the attached reference image (dark helmeted profile, glossy black surface, angular jaw/vents, cool rim-lit highlights against near-black background):
- A dark, high-detail helmeted bust — Vader-inspired: matte-to-glossy black helmet and shoulder armor, angular mouth-vents, no visible eyes (dark lens slits only), cape/collar suggested at the shoulder line fading into shadow at the bottom of frame.
- **Mirror the reference's facing direction**: the reference profile looks left; this model must look **right**, toward the login form, so the character visually "faces" the person logging in.
- Framing: **close, chest-up to head**, not full body — fill roughly 60–70% of the panel height, centered vertically, positioned slightly left-of-center within the panel so there's breathing room between the jaw and the panel's right edge (where the poster flythrough happens, see §3).
- **Idle animation, not cursor-follow**: a slow breathing loop, not a following/tracking behavior. Subtle chest/shoulder rise-and-fall (very small scale/translate-Y, under 2% amplitude) on a 4–5 second cycle, paired with an occasional slower head micro-tilt (a few degrees, every 8–10 seconds, eased in/out — not a snap) so it reads as "alive but still," not idle-loop robotic. No large movements, no cursor tracking — this is the "barely moving, looking at the screen" version, not the "follows user movement" alternative.

**Lighting** — matched to the reference image's single top-down source:
- One key directional light from directly above and slightly in front, angled down at roughly 60–70° — this is what carves the reference image's highlight across the top of the dome and the cheek/vent area while leaving the lower jaw and neck in near-total shadow.
- Cool white-to-pale-blue color temperature (not warm) so it reads as cold, artificial, cinematic light rather than sunlight — this also ties it back to the app's blue palette without breaking the near-black scene.
- Falloff should be sharp, not soft/diffused — hard-edged highlight transitioning quickly to deep shadow is what makes the reference photo read as dramatic rather than flat; avoid ambient/fill light that would wash this out.
- No secondary/backlight — let the unlit side of the helmet go fully into the panel's near-black background so the silhouette blends at the edges.

---

## 3. Poster flythrough (same left panel, midground layer)

This is a **2.5D CSS effect, not a second 3D model** — flat poster images with a perspective tilt, not additional geometry in the Spline scene. It occupies the same left panel as the character, layered in front of the character bust (character stays anchored center/back, posters move through the space in front of/around it).

**Source images**: real movie poster files the user uploads by hand — this is not a placeholder-art system anymore. Pull from a poster mock-data array so the same assets can seed the app's actual movie grid, not just this animation:

```ts
const mockPosters = [
  { title: "…", posterUrl: "/posters/upload-1.jpg" },
  { title: "…", posterUrl: "/posters/upload-2.jpg" },
  // ...user's own uploaded files
];
```

**Motion**: each poster spawns small and far-back near the left edge of the panel, then moves diagonally toward the viewer — growing in scale and shifting rightward — before exiting past the panel's right edge (the boundary nearest the login form) with a slight motion-blur as it exits, giving the sensation that the viewer is moving *forward past* a lineup of posters rather than the posters sliding across a flat plane.
- Apply a 3D tilt via CSS `perspective` + `rotateY` on each poster card (roughly 15–25°, tilted so the "far" edge of the poster points back into the scene) — this is the "3D shape" without needing true 3D geometry.
- Reuse/adapt the reference keyframe set rather than the cube rotation: `zoom-in` (scale 1 → ~2.2 as it approaches) and `blur` (0 → ~3px right as it exits past the edge) map directly; drop `filter-animation`'s hue-rotate (not needed, keep colors true to the uploaded posters) and drop the cube's `left/back/right` margin-scroll keyframes (those were for the infinite-scroll background image, not individual card motion).
- Stagger posters on a loop, one entering as the previous is roughly halfway through its arc — same "starts slow, accelerates" easing logic as the earlier login-success concept, but here it's a continuous ambient loop rather than a one-time transition (~2.5–3.5s per poster's full arc, easing from `ease-in` at spawn to `ease-in` again at exit so it snaps past rather than decelerating like it's stopping).
- Each poster catches the same overhead light from §2 as it crosses the upper third of the panel — apply the `brightness` keyframe (brightness 1 → ~1.3, contrast up slightly) timed to peak exactly as the poster passes through that band, so the light source feels shared between the character and the posters rather than being two unrelated effects.

**On successful login**: this ambient loop can serve as the transition too — on submit, spawn posters at a faster interval and larger scale for ~1s (echoing the original "accelerating flythrough" idea), then cut the whole panel to black for ~300ms before the main app fades in. This reuses the same components rather than building a separate one-off animation.

---

## 4. Phone fallback

Full Spline + perspective-tilted poster flythrough is too GPU-heavy for the collapsed mobile band. Replace with:
- The character bust only, static (no breathing loop, or a much cheaper opacity-pulse instead of a 3D animation), rendered as a pre-baked image/video loop rather than live Spline.
- Posters: drop the 3D tilt and flythrough; use a simple horizontal auto-scrolling strip of flat poster thumbnails behind/beside the character, translateX-looping at constant speed — visually related but far cheaper to render.

---

## 5. Pixel companion — revised

- **Fixed position, bottom-right corner of the viewport**, on both desktop and phone — no cursor-following, no corner-switching, same spot always.
- **More detailed sprite**: move up from flat/blocky pixel art to a higher-resolution pixel sprite with shading passes (multiple tones per surface, subtle dithering at edges) rather than single-flat-color blocks — same silhouette concept as before (dark suited figure with remote, or mohawked figure with revolver), just rendered with more visual depth.
- Idle loop in place (small breathing/blink-equivalent animation), and the existing click-reaction gesture still plays from this fixed position rather than at the cursor location.
- **No user-facing settings or toggle** — remove the companion on/off control from the Settings page entirely; the companion is always present, hardcoded on, for every user, every session.