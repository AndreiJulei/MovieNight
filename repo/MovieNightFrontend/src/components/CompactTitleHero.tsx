import type { ReactNode } from "react";
import TrailerEmbed from "./TrailerEmbed";

/**
 * Phone title-page top (#44, IMDb-style; replaces the #28 centred poster): title and
 * `year · certification · runtime`, then a full-width 16:9 trailer box (the backdrop, with a
 * ▶ that plays the trailer inside the box when there is one), then the portrait poster beside
 * scrollable genre chips and the overview. Tablets and desktop keep the wide hero.
 */
export default function CompactTitleHero({
  title,
  meta,
  posterUrl,
  backdropUrl,
  trailerKey,
  genres,
  overview,
  isTrailerPlaying,
  onToggleTrailer,
  backLink,
  posterAction,
  children,
}: {
  title: string;
  meta: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  trailerKey?: string | null;
  genres: string[];
  overview?: string | null;
  isTrailerPlaying: boolean;
  onToggleTrailer: () => void;
  backLink: ReactNode;
  /** The add-to-watchlist toggle laid over the poster's corner. */
  posterAction?: ReactNode;
  /** Shown below the poster row (rating badges). */
  children?: ReactNode;
}) {
  const playing = isTrailerPlaying && Boolean(trailerKey);

  return (
    <section
      role="region"
      aria-label={`${title} hero banner`}
      className="relative w-full overflow-hidden bg-[#05070d] select-none"
    >
      <div className="relative px-5 pb-2 pt-4">
        {backLink}

        <h1 className="mt-4 break-words text-3xl font-bold leading-tight tracking-tight text-white">{title}</h1>
        {meta && (
          <p data-testid="title-meta" className="nums mt-1.5 text-sm text-text-muted">
            {meta}
          </p>
        )}

        <div
          data-testid="trailer-box"
          className="relative mt-4 aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black"
        >
          {playing ? (
            <TrailerEmbed title={title} trailerKey={trailerKey} />
          ) : (
            <>
              {backdropUrl ? (
                <img
                  data-testid="trailer-backdrop"
                  src={backdropUrl}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  data-testid="trailer-backdrop"
                  aria-hidden="true"
                  className="h-full w-full bg-gradient-to-tr from-[#05070d] via-[#090e1c] to-[#12192e]"
                />
              )}
              {trailerKey && (
                <button
                  type="button"
                  onClick={onToggleTrailer}
                  aria-label="Play trailer"
                  className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white shadow-xl backdrop-blur-sm transition-colors hover:bg-black/70"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <polygon points="7 4 20 12 7 20 7 4" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
        {playing && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onToggleTrailer}
              aria-label="Close trailer"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/20 bg-black/50 px-3 text-xs font-semibold text-text-primary hover:text-white"
            >
              <span aria-hidden="true">✕</span> Close
            </button>
          </div>
        )}

        <div className="mt-4 flex items-start gap-3">
          {/* #29: the poster a card morphs into (and back out of) */}
          <div
            data-testid="compact-title-poster"
            className="poster-hero-target relative aspect-[2/3] w-[30%] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-surface shadow-xl"
          >
            {posterUrl ? (
              <img src={posterUrl} alt={`${title} poster`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs font-semibold text-text-muted">
                {title}
              </div>
            )}
            {posterAction}
          </div>

          <div className="min-w-0 flex-1">
            {genres.length > 0 && (
              <div
                data-testid="title-genres"
                className="-mr-5 flex gap-1.5 overflow-x-auto pr-5"
                style={{ scrollbarWidth: "none" }}
              >
                {genres.map((genre) => (
                  <span
                    key={genre}
                    className="shrink-0 whitespace-nowrap rounded-md border border-white/15 px-2.5 py-1 text-xs font-medium text-text-primary"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
            {overview && (
              <p
                data-testid="title-overview"
                className={`line-clamp-5 text-sm leading-relaxed text-text-primary/90 ${genres.length > 0 ? "mt-2.5" : ""}`}
              >
                {overview}
              </p>
            )}
          </div>
        </div>

        {children && <div className="mt-4">{children}</div>}
      </div>
    </section>
  );
}
