import { Link } from "../router";
import type usePersonalRecommendations from "../hooks/usePersonalRecommendations";

const states: Record<string, string> = {
  NO_HISTORY: "Mark a movie watched to get personal recommendations. No watched movies with usable provider IDs are available yet.",
  INSUFFICIENT_COVERAGE: "There is not enough recommendation coverage for your watched movies and preferences yet.",
  LIBRARY_EXHAUSTED: "The available recommendations are already in your watchlist or watched history.",
  MISSING_METADATA: "Recommendations were found, but their movie information is missing.",
};
const limitations: Record<string, string> = {
  TMDB_UNCONFIGURED: "The optional TMDB recommendation source is not configured; MovieLens coverage is limited.",
  PARTIAL_COVERAGE: "Some watched movies have no recommendation data.",
  METADATA_OMITTED: "Some candidates were omitted because movie information was missing.",
  LIBRARY_EXCLUDED: "Movies already in your watchlist or watched history are excluded.",
};
export default function PersonalRecommendationStatus({ suggestions }: { suggestions: ReturnType<typeof usePersonalRecommendations> }) {
  return <div className="mb-6 space-y-3 text-sm text-text-muted">
    <p>Based on your watched movies, influenced by your personal ratings. Unrated watched movies also contribute.</p>
    <button type="button" onClick={suggestions.reload} disabled={suggestions.loading}
      className="rounded-md border border-white/15 px-3 py-2 text-text-primary hover:bg-surface-raised disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-accent">
      {suggestions.loading ? "Loading personal movies…" : suggestions.error ? "Retry personal movies" : "Reload personal movies"}
    </button>
    {suggestions.loading && <p role="status">Loading current recommendations…</p>}
    {suggestions.error && <p role="alert" className="text-danger">{suggestions.error}</p>}
    {suggestions.category && <div role="status" className="space-y-2">
      {states[suggestions.category.state ?? ""] && <p>{states[suggestions.category.state ?? ""]}</p>}
      {suggestions.category.limitations?.map((limitation) => <p key={limitation}>{limitations[limitation]}</p>)}
    </div>}
    <Link to="/explore/movies" className="inline-block text-accent hover:underline">Explore movies — general discovery</Link>
  </div>;
}
