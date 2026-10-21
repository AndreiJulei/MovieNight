import AppShell from "../components/AppShell";
import MovieGrid from "../components/MovieGrid";
import PersonalRecommendationStatus from "../components/PersonalRecommendationStatus";
import usePersonalRecommendations, { mapPersonalMovie } from "../hooks/usePersonalRecommendations";
import useWatchlistSave from "../hooks/useWatchlistSave";
import { useStore } from "../store/MovieStore";

export default function SuggestionsPage() {
  const store = useStore();
  const suggestions = usePersonalRecommendations();
  const { saveWatchlist, error } = useWatchlistSave();
  const movies = suggestions.category?.movies.map(mapPersonalMovie) ?? [];
  return <AppShell>
    <h1 className="mb-3 text-2xl font-bold tracking-tight text-text-primary">Personal movie recommendations</h1>
    <PersonalRecommendationStatus suggestions={suggestions} />
    {error && <p role="alert" className="mb-4 text-danger">{error}</p>}
    {movies.length > 0 && <MovieGrid movies={movies} referrerOverride="/suggestions"
      showAddToWatchlist onAddToWatchlist={saveWatchlist}
      userHasMovie={(id) => !!store.currentUser && store.allEntries().some((entry) =>
        entry.userId === store.currentUser?.id && entry.movieId === id && entry.mediaType === "MOVIE")} />}
  </AppShell>;
}
