import { Link } from "../router";
import AppShell from "../components/AppShell";

const categories = [
  {
    key: "movies",
    title: "Movies",
    subtitle: "Top rated, popular, and upcoming films",
    to: "/explore/movies",
    icon: "🎬",
  },
  {
    key: "tv",
    title: "TV Series",
    subtitle: "Acclaimed shows, trending, and new seasons",
    to: "/explore/tv",
    icon: "📺",
  },
  {
    key: "anime",
    title: "Anime",
    subtitle: "Top anime, seasonal picks, and classics",
    to: "/explore/anime",
    icon: "⛩️",
  },
] as const;

export default function ExplorePage() {
  return (
    <AppShell>
      <div className="mb-10">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Explore
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Browse curated picks across movies, TV series, and anime.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <Link
            key={cat.key}
            to={cat.to}
            className="group relative flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-surface-raised/60 p-6 transition-all duration-200 hover:border-white/[0.15] hover:bg-surface-raised"
          >
            <span className="text-3xl">{cat.icon}</span>
            <div>
              <h2 className="text-lg font-semibold text-text-primary transition-colors group-hover:text-white">
                {cat.title}
              </h2>
              <p className="mt-0.5 text-sm text-text-muted">
                {cat.subtitle}
              </p>
            </div>
            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-text-muted transition-all group-hover:translate-x-1 group-hover:text-white">
              →
            </span>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
