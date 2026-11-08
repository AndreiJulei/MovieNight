# AniList enriches anime shelves; TMDB keeps identity

Status: accepted for ticket 9 (local draft); amends feature 007, where anime is a TMDB TV classification.

## Decision

- Anime stays a classification of a TMDB TV title (glossary: **Title**). AniList never supplies a title's identity, ids, or catalog rows.
- AniList metadata (adult flag, demographic/children tags, mean score, popularity) only curates and ranks the curated ANIME shelves (Popular, Top Rated, Current Season, Upcoming).
- A TMDB title resolves to at most one AniList TV/ONA entry by normalized title and first-air year (±1). Ambiguity or absence is stored as "no confident match" in the disposable `anilist_mappings` cache, keyed by typed TMDB identity (TV), and never inferred from numeric ids.
- Unmatched titles stay on shelves under the TMDB-only rules and are not shown as AniList-enriched.
- AniList failure (429, error, malformed) aborts the shelf rebuild, so the published shelf stays unchanged; earlier mappings are reused, nothing is invented. A `Retry-After` of up to 10 s is waited out once; longer waits are reported.
- AniList `meanScore` only feeds the Discovery ranking score for Top Rated (50% blend with TMDB's weighted rating). It is not displayed; if it ever is, label the provider and its 0-100 scale (glossary: **Audience rating**).
- Thresholds are constants in `AnimeShelfPolicy` and are tested.

## Open before shipping

AniList terms of use for this deployment (non-commercial vs commercial) are unverified. Confirm before enabling in production; `app.anilist.enabled=false` disables enrichment.
