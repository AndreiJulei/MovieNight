import { useId, useRef, type MouseEvent } from "react";
import type { Movie } from "../store/data";
import { useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import { usePosterTransition } from "./PosterTransitionContext";
import PixelPoster from "./PixelPoster";
import { ratingEvidence, formatExploreMetadata } from "./ratingEvidence";
import { ExplorePosterOverlay } from "./ExplorePosterOverlay";
import { POSTER_GRID_CLASS, VIEW_COMPACT_CLASS, VIEW_COMPACT_EXPLORE_CLASS, VIEW_GRID_CLASS } from "./layout";
import { listRowMeta, listRowRating, type ViewMode } from "./viewMode";
import { openTitleWithTransition, POSTER_ID_ATTRIBUTE, titlePrefetchHandlers } from "./posterTransition";
import NotInterestedButton, { dismissFromList } from "./NotInterestedButton";
import type { DismissRecommendation } from "../hooks/recommendationDismissals";

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

/** Opening a title from a card or list row, with the poster transition and prefetch. */
function useTitleOpener(movie: Movie, referrerOverride?: string) {
  const posterRef = useRef<HTMLDivElement>(null);
  const { startTransition } = usePosterTransition();
  const { navigate, path, search } = useRouter();
  const store = useStore();
  const targetUrl = `/movies/${movie.id}${movie.mediaType ? `?type=${encodeURIComponent(movie.mediaType)}` : ""}`;

  const handleClick = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    store.upsertMovie(movie);
    try {
      sessionStorage.setItem("last_selected_movie", JSON.stringify(movie));
    } catch {
      /* ignore */
    }
    if (posterRef.current) {
      const rect = posterRef.current.getBoundingClientRect();
      const ref = referrerOverride ?? `${path}${search}`;
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
        referrer: ref,
        movie,
      });
    }
    openTitleWithTransition({ source: posterRef.current, movieId: movie.id, url: targetUrl, navigate });
  };
  const prefetch = titlePrefetchHandlers(movie.id, store.currentUser?.id);
  return { posterRef, handleClick, prefetch, targetUrl };
}

export function MovieCard({
  movie,
  referrerOverride,
  compact,
  explorePresentation = false,
  wrapMetadata = false,
  caption,
}: {
  movie: Movie;
  referrerOverride?: string;
  compact?: boolean;
  explorePresentation?: boolean;
  /** Let the hover metadata wrap on narrow Compact posters (#42). */
  wrapMetadata?: boolean;
  /** Replaces the year/ratings/reason lines with one fixed-height line (#22 PG02). */
  caption?: string;
}) {
  const ratingId = useId();
  const { posterRef, handleClick, prefetch, targetUrl } = useTitleOpener(movie, referrerOverride);
  const hasExploreMetadata = explorePresentation && Boolean(formatExploreMetadata(movie));

  return (
    <a
      href={targetUrl}
      onClick={handleClick}
      {...prefetch}
      title={movie.year == null ? movie.title : `${movie.title} (${movie.year})`}
      className="group block cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded-lg"
      aria-label={movie.title}
      aria-describedby={hasExploreMetadata ? ratingId : undefined}
    >
      <div
        ref={posterRef}
        {...{ [POSTER_ID_ATTRIBUTE]: movie.id }}
        className={`relative overflow-hidden ${
          compact ? "rounded-[5px]" : "rounded-lg"
        } border border-white/[0.07] bg-surface shadow-sm transition-all duration-200 ease-out group-hover:scale-[1.03] group-hover:shadow-lg group-hover:border-white/20 group-focus-visible:scale-[1.03] group-focus-visible:shadow-lg`}
      >
        <div className="aspect-[2/3] w-full overflow-hidden bg-surface">
          <Poster movie={movie} />
        </div>

        {explorePresentation && (
          <ExplorePosterOverlay movie={movie} ratingId={ratingId} wrapMetadata={wrapMetadata} />
        )}
      </div>

      {!compact && (
        <div className="mt-2.5 px-0.5">
          <h3 className="max-w-full truncate text-[14px] font-semibold text-text-primary transition-colors group-hover:text-white">
            {movie.title}
          </h3>
          {caption !== undefined ? (
            <p className="nums mt-0.5 h-4 truncate text-xs leading-4 text-text-muted">
              {caption}
            </p>
          ) : !explorePresentation && (
            <>
              <p className="nums mt-0.5 text-xs text-text-muted">
                {movie.year}
                {ratingEvidence(movie) ? ` · ${ratingEvidence(movie)}` : ""}
              </p>
              {movie.reason && <p className="mt-1 text-xs text-text-muted line-clamp-2">{movie.reason}</p>}
            </>
          )}
        </div>
      )}
    </a>
  );
}

/** One List-view row (#42): poster left, title, `year · ★ rating`, overview. */
export function MovieListRow({
  movie,
  referrerOverride,
  rating,
}: {
  movie: Movie;
  referrerOverride?: string;
  rating: number | null;
}) {
  const { posterRef, handleClick, prefetch, targetUrl } = useTitleOpener(movie, referrerOverride);
  const meta = listRowMeta({ year: movie.year, rating });
  const overview = movie.overview?.trim();

  return (
    <a
      href={targetUrl}
      onClick={handleClick}
      {...prefetch}
      aria-label={movie.title}
      className="group flex cursor-pointer gap-3 rounded-lg py-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:gap-4"
    >
      <div
        ref={posterRef}
        {...{ [POSTER_ID_ATTRIBUTE]: movie.id }}
        className="w-24 shrink-0 self-start overflow-hidden rounded-md border border-white/[0.07] bg-surface shadow-sm transition-colors group-hover:border-white/20"
      >
        <div className="aspect-[2/3] w-full overflow-hidden bg-surface">
          <Poster movie={movie} />
        </div>
      </div>
      <div className="min-w-0 max-w-3xl flex-1 pt-0.5">
        <h3 className="line-clamp-2 break-words text-[15px] font-semibold leading-snug text-text-primary transition-colors group-hover:text-white">
          {movie.title}
        </h3>
        {meta && (
          <p data-list-meta className="nums mt-1 text-xs leading-4 text-text-muted">
            {meta}
          </p>
        )}
        {overview && (
          <p data-list-overview className="mt-1.5 line-clamp-3 break-words text-sm leading-5 text-text-muted">
            {overview}
          </p>
        )}
      </div>
    </a>
  );
}

function gridClassFor(view: ViewMode | undefined, compact: boolean, explorePresentation: boolean): string {
  if (view === "grid") return VIEW_GRID_CLASS;
  if (view === "compact") return explorePresentation ? VIEW_COMPACT_EXPLORE_CLASS : VIEW_COMPACT_CLASS;
  // No view switcher: Compact stays denser than the shared poster grid (#22).
  if (!compact) return POSTER_GRID_CLASS;
  return explorePresentation
    ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))] gap-1.5 sm:gap-2"
    : VIEW_COMPACT_CLASS;
}

export default function MovieGrid({
  movies,
  empty,
  referrerOverride,
  showAddToWatchlist,
  onAddToWatchlist,
  userHasMovie,
  compact = false,
  view,
  explorePresentation = false,
  captionFor,
  onDismiss,
  listRatingFor = listRowRating,
}: {
  movies: Movie[];
  empty?: string;
  referrerOverride?: string;
  showAddToWatchlist?: boolean;
  onAddToWatchlist?: (movieId: string, movie?: Movie) => void;
  userHasMovie?: (movieId: string) => boolean;
  compact?: boolean;
  /** Pages with the TopBar view switcher (#42) pass the chosen view; it overrides `compact`. */
  view?: ViewMode;
  explorePresentation?: boolean;
  captionFor?: (movie: Movie) => string;
  /** Personal recommendations (#40): each card gets a "Not interested" control. */
  onDismiss?: DismissRecommendation;
  /** The rating on a List row; defaults to the audience rating. */
  listRatingFor?: (movie: Movie) => number | null;
}) {
  const store = useStore();
  const gridRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  if (movies.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 text-center">
        <p className="text-text-muted">
          {empty ?? "Nothing here yet. Add a movie to get started."}
        </p>
      </div>
    );
  }

  const addButton = (m: Movie, position: string) =>
    showAddToWatchlist && onAddToWatchlist && userHasMovie && !userHasMovie(m.id) && (
      <button
        type="button"
        disabled={store.isWatchlistSaving(m.id)}
        aria-label={store.isWatchlistSaving(m.id) ? `Saving ${m.title}` : `Add ${m.title} to watchlist`}
        aria-busy={store.isWatchlistSaving(m.id)}
        onClick={(e) => {
          e.stopPropagation();
          onAddToWatchlist(m.id, m);
        }}
        className={`absolute ${position} z-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black/70 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-accent hover:border-accent disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-accent`}
        title="Add to your watchlist"
      >
        {store.isWatchlistSaving(m.id) ? "…" : "+"}
      </button>
    );

  if (view === "list") {
    return (
      <ul ref={listRef} data-poster-list className="flex flex-col" tabIndex={onDismiss ? -1 : undefined}>
        {movies.map((m, index) => (
          <li key={m.id} className="group/card relative border-t border-white/[0.08] first:border-t-0">
            <MovieListRow movie={m} referrerOverride={referrerOverride} rating={listRatingFor(m)} />
            {/* Inside the poster's top-right corner: 12px row padding + 4px; 96px poster − 4px − 44px touch target. */}
            {addButton(m, "top-4 left-12")}
            {/* Personal recommendations (#40) keep "Not interested" in List view, at the poster's top-left corner. */}
            {onDismiss && (
              <NotInterestedButton
                title={m.title}
                className="left-1.5 top-1.5"
                onActivate={(keyboard) => dismissFromList(onDismiss, m, listRef, index, keyboard)}
              />
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div ref={gridRef} data-poster-grid className={gridClassFor(view, compact, explorePresentation)} tabIndex={onDismiss ? -1 : undefined}>
      {movies.map((m, index) => (
        <div key={m.id} className="group/card relative">
          <MovieCard
            movie={m}
            referrerOverride={referrerOverride}
            compact={view ? view === "compact" : compact}
            explorePresentation={explorePresentation}
            wrapMetadata={view === "compact"}
            caption={captionFor?.(m)}
          />
          {addButton(m, "top-1.5 right-1.5")}
          {onDismiss && (
            <NotInterestedButton
              title={m.title}
              className="-left-1.5 -top-1.5"
              onActivate={(keyboard) => dismissFromList(onDismiss, m, gridRef, index, keyboard)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
