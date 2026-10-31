import type { Movie } from "../store/data";

export function ratingEvidence(movie: Movie): string | null {
  const labels: string[] = [];
  if (movie.tmdbRating != null) labels.push(`TMDB audience ${movie.tmdbRating.toFixed(1)}/10${movie.tmdbVotes != null ? ` (${movie.tmdbVotes.toLocaleString()} votes)` : ""}`);
  if (movie.imdb != null) labels.push(`IMDb ${movie.imdb.toFixed(1)}/10`);
  if (movie.rt != null) labels.push(`Rotten Tomatoes critics ${movie.rt}% approval`);
  return labels.length ? labels.join(" · ") : null;
}

function parseScore(val: unknown): number | null {
  if (typeof val === "number") {
    return Number.isFinite(val) && val >= 0 && val <= 10 ? val : null;
  }
  if (typeof val === "string" && val.trim() !== "") {
    const num = parseFloat(val);
    return Number.isFinite(num) && num >= 0 && num <= 10 ? num : null;
  }
  return null;
}

/**
 * Returns exactly one compact source-labelled rating for Explore cards:
 * - Prefers a valid available IMDb score (e.g. "IMDb 8.0/10")
 * - Otherwise falls back to a valid TMDB score (e.g. "TMDB 8.0/10")
 * - Rotten Tomatoes critic approval is NOT used as fallback score on Explore posters.
 * - Genuine valid zero (0) is preserved as "0.0/10".
 * - Invalid/missing scores return null.
 */
export function compactExploreRating(movie: { imdb?: number | null; tmdbRating?: number | null }): string | null {
  const imdbScore = parseScore(movie.imdb);
  if (imdbScore != null) {
    return `IMDb ${imdbScore.toFixed(1)}/10`;
  }
  const tmdbScore = parseScore(movie.tmdbRating);
  if (tmdbScore != null) {
    return `TMDB ${tmdbScore.toFixed(1)}/10`;
  }
  return null;
}

/**
 * Formats release year and one compact score for Explore poster hover/focus:
 * e.g. "2026 · IMDb 8.0/10", "2026 · TMDB 8.0/10", "2026", "IMDb 8.0/10", or null.
 * Missing/invalid scores and unknown year are omitted cleanly without dangling separators or empty badges.
 */
export function formatExploreMetadata(movie: {
  year?: number | null;
  imdb?: number | null;
  tmdbRating?: number | null;
}): string | null {
  const rawYear = movie.year;
  const numYear = typeof rawYear === "number" ? rawYear : typeof rawYear === "string" ? parseInt(rawYear, 10) : null;
  const hasYear = numYear != null && Number.isFinite(numYear) && numYear > 0;
  const yearStr = hasYear ? String(numYear) : null;
  const ratingStr = compactExploreRating(movie);

  if (yearStr && ratingStr) {
    return `${yearStr} · ${ratingStr}`;
  }
  if (yearStr) {
    return yearStr;
  }
  if (ratingStr) {
    return ratingStr;
  }
  return null;
}
