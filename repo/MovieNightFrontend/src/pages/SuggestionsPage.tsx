import { Link } from "../router";
import AppShell from "../components/AppShell";
import PosterShelf from "../components/PosterShelf";
import { useSuggestions } from "../hooks/useSuggestions";

export default function SuggestionsPage() {
  const rows = useSuggestions();

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Suggestions
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Curated movie discovery across your friends, top ratings, and upcoming releases.
        </p>
      </div>

      <div className="space-y-12 pb-16">
        {rows.map((row) => (
          <section key={row.id} className="relative">
            {/* Row Header with Title & View All */}
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

            {/* Overlapping Poster Fan Shelf */}
            <PosterShelf movies={row.movies} referrer="/suggestions" />
          </section>
        ))}
      </div>
    </AppShell>
  );
}
