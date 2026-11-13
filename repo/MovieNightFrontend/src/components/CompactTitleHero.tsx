import type { ReactNode } from "react";
import TrailerEmbed from "./TrailerEmbed";

/**
 * Phone title-page hero (#28): a centered portrait poster over a dimmed,
 * blurred backdrop. ▶ swaps the poster for the inline 16:9 trailer at full
 * content width; closing restores the poster. Desktop keeps the wide hero.
 */
export default function CompactTitleHero({
  title,
  posterUrl,
  backdropUrl,
  trailerKey,
  isTrailerPlaying,
  onToggleTrailer,
  backLink,
  children,
}: {
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  trailerKey?: string | null;
  isTrailerPlaying: boolean;
  onToggleTrailer: () => void;
  backLink: ReactNode;
  children: ReactNode;
}) {
  const background = backdropUrl || posterUrl;
  const artwork = posterUrl || backdropUrl;

  return (
    <section
      role="region"
      aria-label={`${title} hero banner`}
      className="relative w-full overflow-hidden bg-[#05070d] select-none"
    >
      {background && (
        <img
          src={background}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl"
        />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#05070d]/40 via-[#05070d]/70 to-[#05070d]" />

      <div className="relative z-10 px-5 pb-2 pt-4">
        {backLink}

        <div className="mt-4">
          {isTrailerPlaying ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-2xl">
              <TrailerEmbed title={title} trailerKey={trailerKey} />
            </div>
          ) : (
            <div
              data-testid="compact-title-poster"
              className="relative mx-auto aspect-[2/3] w-[55%] max-w-[300px] overflow-hidden rounded-xl border border-white/10 bg-surface shadow-2xl"
            >
              {artwork ? (
                <img src={artwork} alt={`${title} poster`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-3 text-center text-sm font-semibold text-text-muted">
                  {title}
                </div>
              )}
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
            </div>
          )}
          {isTrailerPlaying && (
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
        </div>

        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}
