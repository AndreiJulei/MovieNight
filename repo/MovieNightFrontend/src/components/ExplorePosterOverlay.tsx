import type { Movie } from "../store/data";
import { formatExploreMetadata } from "./ratingEvidence";

interface ExplorePosterOverlayProps {
  movie: Movie;
  className?: string;
  ratingId?: string;
}

export function ExplorePosterOverlay({
  movie,
  className = "",
  ratingId,
}: ExplorePosterOverlayProps) {
  const metadata = formatExploreMetadata(movie);

  return (
    <div
      className={`explore-poster-overlay absolute inset-0 bg-gradient-to-t from-[#05070d]/95 via-[#05070d]/60 to-transparent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-hover/poster:opacity-100 group-focus-visible/poster:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-2.5 sm:p-3 pointer-events-none ${className}`}
    >
      <h4 className="text-[13px] font-bold text-white leading-snug line-clamp-2 drop-shadow-sm break-words">
        {movie.title}
      </h4>
      {metadata && (
        <p
          id={ratingId}
          className="explore-poster-metadata nums mt-1 text-xs font-medium text-text-muted leading-tight whitespace-nowrap"
        >
          {metadata}
        </p>
      )}
      <span className="mt-1.5 text-[11px] font-semibold text-accent">
        View details →
      </span>
    </div>
  );
}

export default ExplorePosterOverlay;
