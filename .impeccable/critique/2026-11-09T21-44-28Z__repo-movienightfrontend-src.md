---
target: whole frontend
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-11-09T21-44-28Z
slug: repo-movienightfrontend-src
---
# Critique: repo/MovieNightFrontend/src (whole frontend)
Method: dual-agent (A design review, B detector+browser). Browser limited to /login (no backend).

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 2 | Watched/Watchlist has no heading (MoviesPage.tsx:124) |
| 2 | Match real world | 2 | HMAC/CSV jargon in Settings; "Add a movie" for TV/anime |
| 3 | User control | 3 | Unskippable 6s+ post-login ceremony |
| 4 | Consistency | 1 | 3 reload-button styles, 2 suggestion grids, off-palette colors |
| 5 | Error prevention | 3 | Webhook delete has no confirm |
| 6 | Recognition | 1 | All destinations behind hamburger on desktop |
| 7 | Flexibility | 2 | No library search, no bulk actions |
| 8 | Minimalism | 1 | Companion, ambient bg, logo banner, marketing essay, dev console |
| 9 | Error recovery | 3 | Specific errors + per-shelf retry |
| 10 | Help | 2 | No first-run guidance |
| Total | | 20/40 | Acceptable |

## Design specificity
Core system specific and coherent; overlaid decorative layer (CursorGrid default magenta, GradientBlinds, PixelCompanion+EvilEye, CharacterLogoBanner, 12-video login, webhook console) contradicts DESIGN.md. Detector: 24 findings (18 color, 5 radius, 1 font); misses Tailwind arbitrary values. Skill detector/ folder missing in .claude install.

## Priority issues
1. [P1] Decorative layer contradicts DESIGN.md, runs everywhere, ignores reduced motion, carries third-party IP -> distill, quieter
2. [P1] Navigation hides IA (hamburger-only desktop; mobile Search opens menu) -> layout, clarify
3. [P1] Duplicate recommendation routes (/suggestions vs /suggestions/for-you), FriendSuggestions hand-rolled cards, duplicated shelf headers -> distill, extract
4. [P2] Cold-start Home repeats Explore; ends on marketing copy -> onboard
5. [P2] Settings embeds ML webhook console (no dialog role, unlabeled close, no delete confirm) -> distill, harden

## Persona red flags
Alex: 2 clicks to Watched every time; ceremony on every login; no library search.
Sam: rotating hero title is the h1; Watched has no h1; role=menu without roving; companion announces "JOHN WICK".
Casey: companion in-flow on mobile and its toggle is desktop-only; hover-only shelf metadata; 65vh hero.

## Minor
Naming drift across suggestion pages; placeholder year in loading entry; dropdown triggers not h-8.

## Questions
Who would miss the decorative layer? What does cold-start Home add over Explore? Would you sit through the login ceremony on the 50th sign-in?

## Audit companion (same run): 10/20
A11y 2, Perf 2, Responsive 3, Theming 2, Integrity 1. 77 MB unreferenced tracked assets, 25 MB duplicates (public/ copies dead), unused three/@react-three deps, dead RetroTvLogo.tsx and curtainRise keyframes, single 551 KB chunk, ~13 MB login video without preload control.
