import { useMemo } from "react";
import { Link, matchPath, useRouter } from "../router";
import AppShell from "../components/AppShell";
import PosterShelf from "../components/PosterShelf";
import { useStore } from "../store/MovieStore";
import type { Movie, MediaType } from "../store/data";

type ExploreMediaType = "movies" | "tv" | "anime";

const CONFIG: Record<
  ExploreMediaType,
  {
    mediaType: MediaType;
    title: string;
    subtitle: string;
  }
> = {
  movies: {
    mediaType: "MOVIE",
    title: "Explore Movies",
    subtitle: "Discover top-rated films, popular picks, and upcoming releases.",
  },
  tv: {
    mediaType: "TV",
    title: "Explore TV Series",
    subtitle: "Find acclaimed shows, trending series, and what's airing next.",
  },
  anime: {
    mediaType: "ANIME",
    title: "Explore Anime",
    subtitle: "Top anime, seasonal favorites, and timeless classics.",
  },
};

interface SuggestionRow {
  id: string;
  title: string;
  movies: Movie[];
}

/**
 * Shared explore page for Movies, TV, and Anime.
 * Shows suggestion rows (Top Rated, Popular, For You, Friends') filtered
 * by the media type passed via the route.
 */
export default function ExploreContentPage() {
  const { path } = useRouter();
  const params = matchPath("/explore/:type", path);
  const type = (params?.type ?? "movies") as ExploreMediaType;
  const config = CONFIG[type] ?? CONFIG.movies;

  const store = useStore();

  const rows = useMemo<SuggestionRow[]>(() => {
    const user = store.currentUser;
    if (!user) return [];

    const targetType = config.mediaType;

    // All items of this media type
    const allOfType = store.movies.filter((m) => m.mediaType === targetType);

    // User's own movie IDs (to exclude from suggestions)
    const myMovieIds = new Set<string>();
    const watchedEntries = store.entriesFor(user.id, "watched");
    const watchlistEntries = store.entriesFor(user.id, "watchlist");
    for (const e of watchedEntries) myMovieIds.add(e.movieId);
    for (const e of watchlistEntries) myMovieIds.add(e.movieId);

    // Friends data
    const friends = store.friendsOf(user.id);
    const friendIds = new Set(friends.map((f) => f.id));
    const allEntries = store.allEntries();

    // 1. Top Rated — sorted by IMDb/rating
    const topRated = [...allOfType]
      .sort((a, b) => (b.imdb ?? 0) - (a.imdb ?? 0));

    // 2. Popular — weighted by rating + RT score
    const popular = [...allOfType]
      .sort(
        (a, b) =>
          (b.imdb ?? 0) + (b.rt ? b.rt / 10 : 0) -
          ((a.imdb ?? 0) + (a.rt ? a.rt / 10 : 0)),
      );

    // 3. Personalized — friend ratings ≥ 7 for this type, not in your library
    const forYouMap = new Map<string, number>();
    for (const e of allEntries) {
      if (
        friendIds.has(e.userId) &&
        e.status === "watched" &&
        e.rating != null &&
        e.rating >= 7 &&
        e.mediaType === targetType &&
        !myMovieIds.has(e.movieId)
      ) {
        const current = forYouMap.get(e.movieId) ?? 0;
        forYouMap.set(e.movieId, Math.max(current, e.rating));
      }
    }
    const forYouMovies = [...forYouMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => store.movieById(id))
      .filter((m): m is Movie => m != null);

    // 4. Friends' Watchlists — of this type
    const friendWatchlistIds = new Set<string>();
    for (const e of allEntries) {
      if (
        friendIds.has(e.userId) &&
        e.status === "watchlist" &&
        e.mediaType === targetType &&
        !myMovieIds.has(e.movieId)
      ) {
        friendWatchlistIds.add(e.movieId);
      }
    }
    const friendsSuggestions = [...friendWatchlistIds]
      .map((id) => store.movieById(id))
      .filter((m): m is Movie => m != null);

    // 5. Recent — newest by year
    const recent = [...allOfType].sort((a, b) => b.year - a.year);

    const result: SuggestionRow[] = [];

    // Always show Top Rated and Popular
    result.push({ id: "top-rated", title: "Top Rated", movies: topRated });
    result.push({ id: "popular", title: "Popular", movies: popular });

    // Show personalized only if there are results
    if (forYouMovies.length > 0) {
      result.push({
        id: "for-you",
        title: "Suggested for You",
        movies: forYouMovies,
      });
    }

    // Show friends' suggestions only if there are results
    if (friendsSuggestions.length > 0) {
      result.push({
        id: "friends",
        title: "Friends' Picks",
        movies: friendsSuggestions,
      });
    }

    // Recent releases
    result.push({
      id: "recent",
      title: "New & Recent",
      movies: recent,
    });

    return result;
  }, [store, config.mediaType]);

  return (
    <AppShell>
      <div className="mb-4">
        <Link
          to="/explore"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-white"
        >
          ← Back to Explore
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          {config.title}
        </h1>
        <p className="mt-1 text-sm text-text-muted">{config.subtitle}</p>
      </div>

      <div className="space-y-12 pb-16">
        {rows.map((row) => (
          <section key={row.id} className="relative">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-base font-semibold tracking-wide text-text-primary">
                {row.title}
              </h2>
              {row.movies.length > 8 && (
                <Link
                  to={`/explore/${type}/${row.id}`}
                  className="group flex items-center gap-1 text-xs font-semibold text-accent transition-colors hover:text-white"
                >
                  <span>View all</span>
                  <span className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              )}
            </div>
            <PosterShelf
              movies={row.movies.slice(0, 20)}
              referrer={`/explore/${type}`}
            />
          </section>
        ))}

        {rows.length === 0 && (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-text-muted">
              No content available yet. Check back soon.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
