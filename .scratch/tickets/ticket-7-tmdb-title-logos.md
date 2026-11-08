## Outcome
Extract official movie title logos via TMDB images API in the backend and render the authentic transparent logo overlay in the hero carousel, replacing generic text titles with the film's official branding while maintaining accessible text fallbacks.

## Requirements and scope
1. **Backend TMDB client enhancement:**
   - Extend `TmdbClient.java` detail calls with `append_to_response=...,images`.
   - Parse TMDB's `images.logos` collection. Select the highest-rated transparent PNG logo (preferring English `iso_639_1 == "en"`, or first valid logo asset).
   - Add `logoPath` (or full URL `logoUrl`) to `MovieResponse.java`.
2. **Frontend data mapping:**
   - Update `Movie` type and API interfaces (`src/api/movies.ts`) to include `logoUrl?: string | null`.
   - In `HeroBanner.tsx`, if `slide.logoUrl` exists, render the logo image as an overlaid branding asset with `alt={slide.title}` and `max-h-24 sm:max-h-32 object-contain`.
   - If `logoUrl` is missing or fails to load, gracefully fall back to the bold styled text title.

## Acceptance Criteria
- **LG01 — Backend logo extraction:** `MovieResponse` includes `logoUrl` populated from TMDB images when available.
- **LG02 — Hero logo rendering:** Hero carousel displays the official title logo image when available.
- **LG03 — Text fallback:** Displays clean text typography if no logo is available or if image loading fails.

## Verification
- Backend unit test verifying extraction of `logo_path` from sample TMDB JSON payload.
- Frontend component test verifying image render with text fallback.

