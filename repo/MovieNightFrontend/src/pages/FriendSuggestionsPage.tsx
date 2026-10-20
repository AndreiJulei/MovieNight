import AppShell from "../components/AppShell";
import { MovieCard } from "../components/MovieGrid";
import useFriendSuggestions from "../hooks/useFriendSuggestions";
import { mapApiMovie } from "../hooks/useSuggestions";
import useWatchlistSave from "../hooks/useWatchlistSave";
import { Link } from "../router";
import { useStore } from "../store/MovieStore";

export default function FriendSuggestionsPage() {
  const store = useStore();
  const suggestions = useFriendSuggestions();
  const { saveWatchlist, error: saveError } = useWatchlistSave();
  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Friend suggestions</h1>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">Movies from accepted friends, excluding your watchlist and watched history. Rated choices and watchlist plans are separate sources.</p>
        </div>
        <button type="button" onClick={suggestions.reload} disabled={suggestions.loading}
          className="rounded-md border border-white/15 px-3 py-2 text-sm text-text-primary hover:bg-surface-raised disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-accent">Reload suggestions</button>
      </div>
      {suggestions.loading && <p role="status" className="py-6 text-text-muted">Loading friend suggestions…</p>}
      {suggestions.error && <p role="alert" className="py-6 text-danger">{suggestions.error}</p>}
      {saveError && <p role="alert" className="mb-4 text-danger">{saveError}</p>}
      {suggestions.data && <div className="space-y-10">
        {suggestions.data.categories.map((category) => (
          <section key={category.id} aria-labelledby={`${category.id}-heading`}>
            <h2 id={`${category.id}-heading`} className="text-lg font-semibold text-text-primary">{category.id === "friends" ? "Rated by friends" : "On friends’ watchlists"}</h2>
            <p className="mt-1 mb-5 text-sm text-text-muted">{category.id === "friends" ? "Ranked by average personal rating × distinct friends who rated. Zero counts; unrated titles do not." : "Plans to watch, ordered by the number of friends. Movies in the rated section appear only there."}</p>
            {category.movies.length === 0 ? <p className="text-sm text-text-muted">{category.id === "friends" ? "No eligible rated movies from accepted friends. Accept a friendship or return after friends rate watched movies." : "No additional movies on accepted friends’ watchlists."}</p> : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {category.movies.map((item) => {
                  const movie = mapApiMovie(item, store);
                  return <div key={item.tmdbId}>
                    <MovieCard movie={movie} referrerOverride="/suggestions/friends" />
                    <p className="nums mt-2 text-sm text-text-primary">{item.reason}</p>
                    {category.id === "friends" && <p className="nums mt-1 text-sm text-text-muted">Score {item.score}</p>}
                    <button type="button" onClick={() => { void saveWatchlist(movie.id, movie); }}
                      disabled={store.isWatchlistSaving(movie.id)}
                      aria-label={`Add ${movie.title} to watchlist`}
                      className="mt-3 rounded-md border border-white/15 px-3 py-2 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-accent">{store.isWatchlistSaving(movie.id) ? "Saving…" : "Add to watchlist"}</button>
                  </div>;
                })}
              </div>
            )}
          </section>
        ))}
        <Link to="/friends" className="inline-block text-sm text-accent hover:underline">Manage friendships</Link>
      </div>}
    </AppShell>
  );
}
