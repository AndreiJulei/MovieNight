# MovieLens ml-latest similarity upgrade

Status: Implemented on feat/015-movielens-latest-similarity; test suite passing; human review checkpoint pending.
GitHub contract: [issue #7](https://github.com/AndreiJulei/MovieNight/issues/7).
Review base: `7a93437` on `feat/014-frontend-reliability-navigation`.
Roadmap: milestone 6 follow-up. Product boundaries: P09/P10/P20; preserve P16's
separate Explore policy.

## Outcome and contract authority

Upgrade the movie-similarity backbone with reproducible full MovieLens inputs,
bounded training and safe backend activation, while preserving personal scoring.
Demonstrate increased similarity coverage; do not claim proven relevance gains,
universal coverage or elimination of empty recommendations.

GitHub #7 is published and authoritative. The draft proposal has been consolidated
and published to GitHub issue #7, and this local record retains the essential
decisions, summary, and implementation/validation evidence.

## Essential decisions

- Q1–Q4: preserve personal-rating weights, raw-rating cosine, top-30/0.10 neighbor
  rules and configured watched-seed TMDB contributions. Record exact inputs and
  settings, use verified HTTPS, and keep raw data outside Git. Safe activation
  includes all affected caches. Full-data training/import evidence is required;
  trainer budget is at most 8 GiB peak process memory and two hours on the
  declared reference machine.
- Q5–Q8: no new rating-value, per-title count or shared-rater cutoff. Deduplicate
  community-user/TMDB ratings by latest timestamp then smallest MovieLens movie
  ID; collapse exact duplicates and reject remaining conflicts. Deterministic
  unrounded neighbor selection precedes four-decimal serialization. Incomplete,
  malformed or interrupted inputs/generation fail without overwriting usable data.
- Q9–Q11: retain classpath artifacts and generate → build → restart → explicit
  secret-protected activation. Reject invalid/empty replacements and never log
  secrets. Compare small/full models using the same revised pipeline and settings;
  report gained/lost/shared coverage and verify actual recommendation behavior.
- Q12–Q14: supplement H2 regressions with full-model import/replacement against
  isolated local PostgreSQL. Version the derived CSV, provenance manifest and
  attribution. Activate during a documented maintenance window with recommendation
  traffic and recomputation paused; replacement and cache invalidation are atomic,
  with lazy recomputation afterward. No zero-downtime/multi-instance promise.

Explore's TMDB vote floors/confidence-adjusted Top Rated score concern audience
support for one title. MovieLens pair confidence would concern users who rated
both movies. It is not currently a filter and is not introduced here; niche
personal matches remain eligible as feature 012 specifies.

## Inspection evidence, not implementation validation

Read-only inspection during this review found:

- The trainer still uses `ml-latest-small`, disables download TLS verification,
  builds the whole similarity product and accumulates output dictionaries.
- The local full snapshot README dates it to July 20, 2023: 33,832,162 ratings,
  86,537 movies and 330,975 users. A links-file scan found 126 missing TMDB IDs,
  86,374 distinct positive TMDB IDs and 37 duplicate mappings. These figures
  describe inspected inputs, not guaranteed future `ml-latest` contents.
- Startup skips any populated similarity table. Reload reads a classpath resource,
  deletes before checking for missing input, and silently skips malformed rows.
- The webhook refreshes only already-dirty users and can report success after
  individual refresh failures. It logs rejected secret values. Those behaviors
  must change under the proposed contract; they were not repaired in this review.
- The currently tracked CSV has 290,728 neighbor rows and is 5,142,350 bytes.
  Full-data computation, memory, coverage and import performance were not measured.

## Validation

| Acceptance | Result | Evidence boundary |
| --- | --- | --- |
| MLS01 | PASS | Local input reuse verified (`repo/ml/data/ml-latest/` read directly without download); HTTPS TLS fallback implemented in `train_similarity.py`; raw datasets kept out of git via `.gitignore`; SHA-256 provenance manifest and attribution written. 15 unit tests pass in `test_train_similarity.py`. |
| MLS02 | PASS | Full MovieLens `ml-latest` uncentered cosine similarity trained on reference machine (Apple M1 Pro, 10 cores, 16 GB RAM, macOS 26.6.2, Python 3.12.12). Runtime: 172.55s (2.87 min, budget ≤ 2 hours). Peak process memory: 4,235.67 MiB (4.14 GiB, budget ≤ 8 GiB). Scale: 33,832,162 ratings, 86,537 links → 33,826,378 retained ratings across 83,080 distinct positive TMDB IDs and 330,975 users. |
| MLS03 | PASS | Top 30 nonself neighbors per source TMDB ID with unrounded score ≥ 0.10; deterministic tie-breaking (unrounded score descending, neighbor TMDB ID ascending, source TMDB ID ascending); four-decimal rounding on serialization only; duplicate ratings deduplicated by latest timestamp and smallest `movieId`, differing ratings rejected. |
| MLS04 | PASS | Generated UTF-8 CSV at `repo/MovieNightBackend/src/main/resources/data/movie_similarity.csv` (48.6 MB, 2,443,981 neighbor pairs across 82,941 source movies); accompanying SHA-256 manifest `movie_similarity.manifest.json` and `MOVIELENS_ATTRIBUTION.txt`. Verified candidate validation before atomic replacement. |
| MLS05 | PASS | Backend validation of SHA-256 and data boundaries (non-positive IDs, self-similarity, scores < 0.10 or > 1.0, duplicate pairs, >30 neighbors, empty artifacts); transactional atomic replacement and bulk cache invalidation (`UserRepository.invalidateAllPersonalRecommendationCaches()`); safe fresh startup; existing populated DB preserved on restart; ReentrantLock synchronization; secret-sanitized logging; maintenance window controls returning HTTP 503, pausing scheduled suggestion recalculation, draining in-flight recomputations; lazy recomputation on subsequent authenticated read. |
| MLS06 | PARTIAL / BLOCKED | Model coverage comparison: small (9,715 source movies, 290,728 pairs) vs full (82,941 source movies, 2,443,981 pairs) shows +73,226 source movies (+753.7%) and +2,153,253 pairs (+740.6%). Behavioral verification passes in `MovieSimilarityDataLoaderIntegrationTest` (clean accounts, watched-only seeds, zero/unrated weights, ranking, exclusions, isolation, lazy reads). Full-model isolated PostgreSQL verification is BLOCKED because PostgreSQL is not on PATH and the local Docker daemon is unreachable. |

### Model Coverage Comparison Details

- **Legacy Small Model (`ml-latest-small`)**:
  - Source movies with similarity pairs: 9,715
  - Total similarity pairs: 290,728
  - File size: 5,142,350 bytes (~5.1 MB)
- **Full Model (`ml-latest`)**:
  - Source movies with similarity pairs: 82,941
  - Total similarity pairs: 2,443,981
  - File size: 50,967,393 bytes (~48.6 MB)
- **Coverage Difference**:
  - Net source movies gained: +73,226 (+753.7% increase)
  - Net similarity pairs gained: +2,153,253 (+740.6% increase)
  - Common source movies retained: 9,715 (100% of small model source movies present in full dataset)

### Reference Machine & Resource Bounds

- **Reference Machine**: Apple M1 Pro (10 cores: 8 performance, 2 efficiency), 16 GB unified RAM, macOS 26.6.2 (Darwin 24.6.0 arm64), Python 3.12.12.
- **Resource Measurement**:
  - Training duration: 172.55 seconds (limit: 7,200 seconds / 2 hours).
  - Peak process RSS: 4,235.67 MiB (limit: 8,192 MiB / 8 GiB).

### Maintenance Window Operational Guide

1. **Enter Maintenance Mode**: Send `POST /api/webhooks/incoming/maintenance?enable=true` with header `X-MovieNight-Secret: <configured-secret>`. Recommendation reads now return HTTP 503 `503 Service Unavailable: Movie recommendations temporarily unavailable for maintenance`.
2. **Reload Similarity Dataset**: Send `POST /api/webhooks/incoming/similarity-sync` with header `X-MovieNight-Secret: <configured-secret>`. The loader drains active in-flight recomputations (up to 30s), validates the candidate CSV against its manifest, atomically clears and inserts similarity pairs, and marks all user recommendation caches dirty (`needs_recommendation_refresh = true`).
3. **Exit Maintenance Mode**: Send `POST /api/webhooks/incoming/maintenance?enable=false` with header `X-MovieNight-Secret: <configured-secret>`. Recommendation reads resume, lazily refreshing each user's personalized recommendations upon their next authenticated read. Scheduled background recalculations also resume.

## Review scope and existing worktree

This review updates `GLOSSARY.md`, this new feature record, its unpublished issue
proposal, the pending feature 006 cross-reference and the pending `tech-stack.md`
row. Existing `.gitignore` edits, deletion of `ml-latest-small.zip`, local full
inputs and `.vscode/settings.json` are preserved; none is validation or an approved
implementation change. No ADR is needed for the retained pipeline/delivery shape;
the bounded maintenance choice is recorded here without introducing a new platform.
