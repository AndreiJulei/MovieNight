## Outcome
Anime TV discovery uses AniList metadata (format, demographic tags, genres, mean score, adult flag) to keep curated Explore anime shelves meaningful, so kids/family and low-signal shows do not appear. TMDB stays the identity and catalog source; AniList only enriches and filters.

Status: unpublished local draft. Follows the TMDB-only filter tightening (anime shelves exclude Kids/Family genres, require Japanese original language, higher vote floors).

## Background
- Anime is a classification of a TMDB TV title (feature 007; GLOSSARY: Title). It is not a separate resource identity and must not become one.
- TMDB genre 16 (Animation) alone admits kids franchises. The TMDB-only filter removes most of them but TMDB has no demographic signal (Shounen, Seinen, Josei, Kids) and no anime-specific quality score.
- AniList GraphQL (`https://graphql.anilist.co`) needs no key for public reads; rate limit is roughly 90 requests/min (verify current terms and limits before building).

## Requirements and scope

1. **AniList client (backend):** Add a server-side `AniListClient` (GraphQL POST). Query by title/year/format and return `id`, `idMal`, `format`, `isAdult`, `genres`, `tags` (name, rank), `meanScore`, `popularity`, `episodes`, `seasonYear`. Honour `Retry-After` on HTTP 429. Provider failures must not break shelves (keep existing "cached data unchanged, retry" behaviour); no silent substitution of invented metadata.
2. **TMDB to AniList mapping:** Resolve each candidate TMDB TV title to at most one AniList entry (title and year match, `format` TV/ONA). Persist the mapping, including "no confident match", so lookups are not repeated. Never infer identity from numeric IDs. Unmatched titles use the TMDB-only rules and are not shown as AniList-enriched.
3. **Shelf filtering:** Use AniList data only to curate anime shelves: exclude `isAdult`, exclude titles with a Kids demographic tag or Children-targeted tags above a rank threshold, and require a minimum AniList `meanScore`/`popularity` for Popular and Top Rated. Thresholds live in constants/config and are tested.
4. **Ranking:** Top Rated may blend TMDB weighted rating with AniList `meanScore`. The ranking stays a Discovery ranking score, not an Audience rating. If AniList `meanScore` is ever shown, label the provider and its scale (GLOSSARY: Audience rating).
5. **Caching:** Cache AniList responses and the mapping in the disposable discovery cache layer. Rebuilding must not alter user library entries, lists, ratings or notes.
6. **Out of scope:** Replacing TMDB, an AniList account or watchlist sync, anime recommendations from AniList (feature 005/006 recommendations stay movie-only; a taste-based anime shelf needs its own spec), anime films.

## Open decisions
- Confirm AniList terms of use for this deployment (non-commercial vs commercial) before shipping.
- Choose the kids/tag exclusion rule: demographic tag only, or also tags above a rank threshold.
- Decide whether an unmatched title may appear on curated shelves.
- Spec: feature 007 fixes anime as a TMDB TV classification. This ticket adds a second provider, so it needs an addendum or a new ADR for the provider boundary.

## Acceptance sketch
| ID | Given / when | Expected result |
| --- | --- | --- |
| AL01 | Kids/Family-tagged or adult AniList match on a TMDB anime candidate | Excluded from Popular, Top Rated and Current Season shelves; remains searchable and openable by identity |
| AL02 | No confident AniList match | Mapping stored as unmatched; title follows the documented fallback rule |
| AL03 | AniList returns 429, empty, or fails | Existing published shelves unchanged; clear retry state; no invented metadata |
| AL04 | Rebuild shelves twice | Mapping reused; no duplicate catalog rows; user data unchanged |
| AL05 | Equal numeric TMDB movie and TV IDs | Typed identity unaffected |

## Likely files
`client/AniListClient.java` (new), mapping entity and repository, `SuggestionScheduler`, `SuggestionService`, `ExploreSessionManager`, config properties, backend tests with a stubbed provider (isolated H2, as in `MeaningfulDiscoveryPersistenceTest`), feature 007 spec addendum or ADR.
