import { useRef, useState, useCallback, type MouseEvent } from "react";
import type { Movie } from "../store/data";
import { useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import { usePosterTransition } from "./PosterTransitionContext";

interface PosterShelfProps {
  movies: Movie[];
  referrer?: string;
}

export default function PosterShelf({ movies, referrer }: PosterShelfProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 6);
  }, []);

  const scrollBy = (dir: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const pageWidth = el.clientWidth * 0.75;

    if (dir > 0 && el.scrollLeft >= el.scrollWidth - el.clientWidth - 6) {
      el.scrollTo({ left: 0, behavior: "smooth" });
    } else if (dir < 0 && el.scrollLeft <= 6) {
      el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    } else {
      el.scrollBy({ left: dir * pageWidth, behavior: "smooth" });
    }

    setTimeout(updateArrows, 400);
  };

  if (movies.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center">
        <p className="text-sm text-text-muted">No suggestions yet.</p>
      </div>
    );
  }

  return (
    <div className="group/shelf relative -mt-6 my-1">
      {/* Styles for smooth wave magnifying dock effect with overlapping cards */}
      <style>{`
        .shelf-track {
          transform-style: preserve-3d;
          perspective: 1000px;
        }
        .shelf-card {
          transform-origin: center bottom;
          transition: transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 280ms ease-out, border-color 200ms ease-out;
          will-change: transform;
        }
        .shelf-card + .shelf-card {
          margin-left: -32px;
        }
        .shelf-card:hover {
          transform: scale(1.18) translateY(-12px);
          z-index: 50;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.96);
          border-color: rgba(255, 255, 255, 0.45);
        }
        .shelf-card:hover + .shelf-card {
          transform: scale(1.09) translateY(-6px);
          z-index: 40;
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.85);
          border-color: rgba(255, 255, 255, 0.25);
        }
        .shelf-card:hover + .shelf-card + .shelf-card {
          transform: scale(1.04) translateY(-2px);
          z-index: 30;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.7);
        }
        .shelf-card:has(+ .shelf-card:hover) {
          transform: scale(1.09) translateY(-6px);
          z-index: 40;
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.85);
          border-color: rgba(255, 255, 255, 0.25);
        }
        .shelf-card:has(+ .shelf-card + .shelf-card:hover) {
          transform: scale(1.04) translateY(-2px);
          z-index: 30;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.7);
        }
      `}</style>

      {/* Left Centered Arrow */}
      <button
        type="button"
        onClick={() => scrollBy(-1)}
        className={`absolute -left-2 top-[56%] z-40 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/85 text-2xl font-light text-text-muted backdrop-blur-md transition-all duration-200 hover:border-white/30 hover:bg-black hover:text-white hover:scale-105 shadow-xl ${
          canScrollLeft
            ? "opacity-0 group-hover/shelf:opacity-100"
            : "opacity-0 group-hover/shelf:opacity-40 pointer-events-none"
        }`}
        aria-label="Scroll left"
      >
        ‹
      </button>

      {/* Poster Row: Overlapping wave shelf with ample top clearance to prevent cutoff */}
      <div
        ref={scrollRef}
        onScroll={updateArrows}
        className="shelf-track flex items-end overflow-x-auto px-6 pt-20 pb-8"
        style={{ scrollbarWidth: "none" }}
      >
        {movies.map((movie) => (
          <ShelfPoster
            key={movie.id}
            movie={movie}
            referrer={referrer}
          />
        ))}
      </div>

      {/* Right Centered Arrow */}
      <button
        type="button"
        onClick={() => scrollBy(1)}
        className={`absolute -right-2 top-[56%] z-40 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/85 text-2xl font-light text-text-muted backdrop-blur-md transition-all duration-200 hover:border-white/30 hover:bg-black hover:text-white hover:scale-105 shadow-xl ${
          canScrollRight
            ? "opacity-0 group-hover/shelf:opacity-100"
            : "opacity-0 group-hover/shelf:opacity-40 pointer-events-none"
        }`}
        aria-label="Scroll right"
      >
        ›
      </button>
    </div>
  );
}

function ShelfPoster({
  movie,
  referrer,
}: {
  movie: Movie;
  referrer?: string;
}) {
  const posterRef = useRef<HTMLAnchorElement>(null);
  const { startTransition } = usePosterTransition();
  const { navigate } = useRouter();
  const store = useStore();

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    store.upsertMovie(movie);
    try {
      sessionStorage.setItem("last_selected_movie", JSON.stringify(movie));
    } catch {
      /* ignore */
    }
    if (posterRef.current) {
      const rect = posterRef.current.getBoundingClientRect();
      const currentReferrer = referrer ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/explore/movies");
      try {
        sessionStorage.setItem("last_movie_referrer", currentReferrer);
      } catch {
        /* ignore */
      }
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
        referrer: currentReferrer,
        movie,
      });
    }
    const targetUrl = `/movies/${movie.id}${movie.mediaType ? `?type=${encodeURIComponent(movie.mediaType)}` : ""}`;
    navigate(targetUrl);
  };

  const targetUrl = `/movies/${movie.id}${movie.mediaType ? `?type=${encodeURIComponent(movie.mediaType)}` : ""}`;

  return (
    <a
      ref={posterRef}
      href={targetUrl}
      onClick={handleClick}
      title={movie.title}
      aria-label={movie.title}
      className="shelf-card group/poster relative shrink-0 h-[252px] w-[168px] overflow-hidden rounded-xl border border-white/[0.12] bg-surface shadow-md cursor-pointer outline-none select-none"
    >
      {/* Poster image */}
      {movie.posterUrl ? (
        <img
          src={movie.posterUrl}
          alt={movie.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover/poster:scale-105"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface p-3">
          <span className="text-center text-xs font-medium text-text-muted line-clamp-3">
            {movie.title}
          </span>
        </div>
      )}

      {/* Hover detail overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#05070d]/95 via-[#05070d]/60 to-transparent opacity-0 group-hover/poster:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3.5 pointer-events-none">
        <h4 className="text-[13px] font-bold text-white leading-snug line-clamp-2 drop-shadow-sm">
          {movie.title}
        </h4>
        <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
          <span>{movie.year}</span>
          {movie.imdb != null && (
            <span className="nums font-semibold text-accent">
              ★ {movie.imdb.toFixed(1)}
            </span>
          )}
        </div>
        <span className="mt-1.5 text-[11px] font-semibold text-accent">
          View details →
        </span>
      </div>
    </a>
  );
}
