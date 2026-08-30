import { useRef, useState, useCallback, type MouseEvent } from "react";
import type { Movie } from "../store/data";
import { useRouter } from "../router";
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
    <div className="group/shelf relative my-1">
      {/* Left Centered Arrow */}
      <button
        type="button"
        onClick={() => scrollBy(-1)}
        className={`absolute -left-2 top-1/2 z-40 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/85 text-xl font-light text-text-muted backdrop-blur-md transition-all duration-200 hover:border-white/30 hover:bg-black hover:text-white hover:scale-105 shadow-xl ${
          canScrollLeft
            ? "opacity-0 group-hover/shelf:opacity-100"
            : "opacity-0 group-hover/shelf:opacity-40 pointer-events-none"
        }`}
        aria-label="Scroll left"
      >
        ‹
      </button>

      {/* Poster Row: Crammed / Overlapping fan shelf */}
      <div
        ref={scrollRef}
        onScroll={updateArrows}
        className="flex items-center overflow-x-auto overflow-y-visible px-3 py-4"
        style={{ scrollbarWidth: "none" }}
      >
        {movies.map((movie, i) => (
          <ShelfPoster
            key={movie.id}
            movie={movie}
            index={i}
            referrer={referrer}
          />
        ))}
      </div>

      {/* Right Centered Arrow */}
      <button
        type="button"
        onClick={() => scrollBy(1)}
        className={`absolute -right-2 top-1/2 z-40 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/85 text-xl font-light text-text-muted backdrop-blur-md transition-all duration-200 hover:border-white/30 hover:bg-black hover:text-white hover:scale-105 shadow-xl ${
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
  index,
  referrer,
}: {
  movie: Movie;
  index: number;
  referrer?: string;
}) {
  const posterRef = useRef<HTMLDivElement>(null);
  const { startTransition } = usePosterTransition();
  const { navigate } = useRouter();
  const [isHovered, setIsHovered] = useState(false);

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
        referrer: referrer ?? "/suggestions",
      });
    }
    navigate(`/movies/${movie.id}`);
  };

  return (
    <a
      href={`/movies/${movie.id}`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={movie.title}
      className="group/poster relative shrink-0 cursor-pointer outline-none transition-all duration-200"
      style={{
        marginLeft: index === 0 ? "0px" : "-32px",
        zIndex: isHovered ? 50 : 10 + index,
        transform: isHovered ? "translateY(-6px) scale(1.08)" : "none",
      }}
      aria-label={movie.title}
    >
      <div
        ref={posterRef}
        className="overflow-hidden rounded-lg border border-white/[0.12] bg-surface shadow-[0_6px_16px_rgba(0,0,0,0.8)] transition-all duration-200 group-hover/poster:border-white/30 group-hover/poster:shadow-[0_12px_28px_rgba(0,0,0,0.95)]"
        style={{
          width: "135px",
        }}
      >
        <div className="aspect-[2/3] w-full overflow-hidden bg-surface">
          {movie.posterUrl ? (
            <img
              src={movie.posterUrl}
              alt={movie.title}
              loading="lazy"
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-surface p-2">
              <span className="text-center text-xs font-medium text-text-muted line-clamp-3">
                {movie.title}
              </span>
            </div>
          )}
        </div>
      </div>
    </a>
  );
}
