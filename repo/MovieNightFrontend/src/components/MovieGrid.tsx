import { useRef, type MouseEvent } from "react";
import type { Movie } from "../store/data";
import { useRouter } from "../router";
import { usePosterTransition } from "./PosterTransitionContext";
import PixelPoster from "./PixelPoster";

export function Poster({ movie }: { movie: Movie }) {
  if (movie.posterUrl) {
    return (
      <img
        src={movie.posterUrl}
        alt={movie.title}
        loading="lazy"
        className="h-full w-full bg-surface object-cover"
      />
    );
  }
  if (movie.posterSeed == null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface p-4">
        <span className="line-clamp-4 text-center text-xs font-medium text-text-muted">
          {movie.title}
        </span>
      </div>
    );
  }
  return <PixelPoster seed={movie.posterSeed} />;
}

export function MovieCard({
  movie,
  referrerOverride,
  compact,
}: {
  movie: Movie;
  referrerOverride?: string;
  compact?: boolean;
}) {
  const posterRef = useRef<HTMLDivElement>(null);
  const { startTransition } = usePosterTransition();
  const { navigate, path, search } = useRouter();

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    if (posterRef.current) {
      const rect = posterRef.current.getBoundingClientRect();
      startTransition({
        movieId: movie.id,
        startRect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
        posterUrl: movie.posterUrl,
        posterSeed: movie.posterSeed,
        title: movie.title,
        referrer: referrerOverride ?? `${path}${search}`,
      });
    }
    navigate(`/movies/${movie.id}`);
  };

  return (
    <a
      href={`/movies/${movie.id}`}
      onClick={handleClick}
      title={`${movie.title} (${movie.year})`}
      className="group block cursor-pointer focus:outline-none"
      aria-label={movie.title}
    >
      <div
        ref={posterRef}
        className={`relative overflow-hidden ${
          compact ? "rounded-[5px]" : "rounded-lg"
        } border border-white/[0.07] bg-surface shadow-sm transition-all duration-200 ease-out group-hover:scale-[1.03] group-hover:shadow-lg group-hover:border-white/20 group-focus-visible:scale-[1.03] group-focus-visible:shadow-lg`}
      >
        <div className="aspect-[2/3] w-full overflow-hidden bg-surface">
          <Poster movie={movie} />
        </div>
      </div>

      {!compact && (
        <div className="mt-2.5 px-0.5">
          <h3 className="max-w-full truncate text-[14px] font-semibold text-text-primary transition-colors group-hover:text-white">
            {movie.title}
          </h3>
          <p className="nums mt-0.5 text-xs text-text-muted">
            {movie.year}
            {movie.imdb != null ? ` · ${movie.imdb.toFixed(1)}` : ""}
          </p>
        </div>
      )}
    </a>
  );
}

export default function MovieGrid({
  movies,
  empty,
  referrerOverride,
  showAddToWatchlist,
  onAddToWatchlist,
  userHasMovie,
  compact = false,
}: {
  movies: Movie[];
  empty?: string;
  referrerOverride?: string;
  showAddToWatchlist?: boolean;
  onAddToWatchlist?: (movieId: string) => void;
  userHasMovie?: (movieId: string) => boolean;
  compact?: boolean;
}) {
  if (movies.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 text-center">
        <p className="text-text-muted">
          {empty ?? "Nothing here yet. Add a movie to get started."}
        </p>
      </div>
    );
  }

  const gridClasses = compact
    ? "grid grid-cols-4 gap-1.5 sm:grid-cols-5 sm:gap-2 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-10"
    : "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

  return (
    <div className={gridClasses}>
      {movies.map((m) => (
        <div key={m.id} className="relative">
          <MovieCard movie={m} referrerOverride={referrerOverride} compact={compact} />
          {showAddToWatchlist && onAddToWatchlist && userHasMovie && !userHasMovie(m.id) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddToWatchlist(m.id);
              }}
              className="absolute top-1.5 right-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black/70 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-accent hover:border-accent"
              title="Add to your watchlist"
            >
              +
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
