## Outcome
Expose a dedicated REST endpoint `GET /api/movies/{tmdbId}/similar` that queries the precomputed item-item cosine similarity table (`movie_similarity`), returning top similar titles for the entry detail page without requiring heavy ML recomputation.

## Requirements and scope
1. **Backend endpoint:**
   - Route: `GET /api/movies/{tmdbId}/similar` with optional `limit` query param (default 10, max 30).
   - Controller: `MovieCatalogController.java` (or new endpoint in suggestion controller).
   - Service: Query `MovieSimilarityRepository` by `tmdbId` ordered by `score DESC`.
   - Enrichment: Map neighbor TMDB IDs to catalog `MovieResponse` objects (title, year, posterUrl, backdropUrl, tmdbVoteAverage).
   - If no similar items exist in the local table, fall back to TMDB's recommendations endpoint (`/movie/{id}/recommendations`).
2. **Frontend client & caching:**
   - Add `moviesApi.getSimilarTitles(tmdbId, mediaType)` in `src/api/movies.ts`.
   - Store responses in `sessionStorage` keyed by `similar_movies_${tmdbId}` to prevent redundant API queries when navigating between screens in the same session.

## Acceptance Criteria
- **SIM01 — Endpoint contract:** `GET /api/movies/{tmdbId}/similar?limit=10` returns HTTP 200 with a list of up to 10 movie objects.
- **SIM02 — Low latency:** Queries the indexed `movie_similarity` database table; response time under 50ms for cached database lookups.
- **SIM03 — Fallback resilience:** Returns empty list or TMDB fallback gracefully if the title ID has no precomputed neighbors.
- **SIM04 — Client caching:** Repeatedly visiting the same movie detail page retrieves the similar titles from session storage without re-requesting the network.

## Verification
- Spring Boot controller unit and integration tests (`MovieSimilarityControllerTest.java`).
- Frontend API test verifying session storage caching.

