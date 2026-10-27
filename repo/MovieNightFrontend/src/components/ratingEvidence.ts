import type { Movie } from "../store/data";

export function ratingEvidence(movie: Movie): string | null {
  const labels: string[] = [];
  if (movie.tmdbRating != null) labels.push(`TMDB audience ${movie.tmdbRating.toFixed(1)}/10${movie.tmdbVotes != null ? ` (${movie.tmdbVotes.toLocaleString()} votes)` : ""}`);
  if (movie.imdb != null) labels.push(`IMDb ${movie.imdb.toFixed(1)}/10`);
  if (movie.rt != null) labels.push(`Rotten Tomatoes critics ${movie.rt}% approval`);
  return labels.length ? labels.join(" · ") : null;
}
