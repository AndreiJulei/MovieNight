import { Link } from "../router";
import AppShell from "../components/AppShell";
import PosterShelf from "../components/PosterShelf";
import { usePersonalRecommendations } from "../hooks/useSuggestions";

export default function SuggestionsPage() {
  const rows = usePersonalRecommendations();

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Personal Recommendations
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Custom recommendations tailored to your taste across Movies, TV Series, and Anime.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-surface/30 px-6 py-20 text-center backdrop-blur-sm">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
            <svg
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text-primary">
            No Personal Recommendations Yet
          </h2>
          <p className="mt-2 max-w-md text-sm text-text-muted">
            Mark titles as Watched and add personal star ratings to unlock curated recommendations for Movies, TV Series, and Anime.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/explore/movies"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-accent-hover"
            >
              <span>Explore Movies</span>
              <span>→</span>
            </Link>
            <Link
              to="/explore/tv"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface px-4 py-2 text-xs font-semibold text-text-primary transition hover:border-white/20 hover:bg-surface-hover"
            >
              <span>Explore TV Series</span>
            </Link>
            <Link
              to="/explore/anime"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface px-4 py-2 text-xs font-semibold text-text-primary transition hover:border-white/20 hover:bg-surface-hover"
            >
              <span>Explore Anime</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-12 pb-16">
          {rows.map((row) => (
            <section key={row.id} className="relative">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-base font-semibold tracking-wide text-text-primary">
                  {row.title}
                </h2>
                <Link
                  to={`/suggestions/${row.id}`}
                  className="group flex items-center gap-1 text-xs font-semibold text-accent transition-colors hover:text-white"
                >
                  <span>View all</span>
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </Link>
              </div>

              <PosterShelf movies={row.movies} referrer="/suggestions" />
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
