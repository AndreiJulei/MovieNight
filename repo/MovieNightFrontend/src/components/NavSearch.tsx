import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import { moviesApi } from "../api/movies";
import type { Movie } from "../store/data";
import { SearchIcon, CloseIcon } from "./NavRail.icons";
import { useEscapeKey } from "../hooks/useOverlay";

interface NavSearchProps {
  className?: string;
  onNavigate?: () => void;
}

export default function NavSearch({ className = "", onNavigate }: NavSearchProps) {
  const { navigate } = useRouter();
  const store = useStore();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [backendResults, setBackendResults] = useState<Movie[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on Escape
  useEscapeKey(isOpen, () => {
    setIsOpen(false);
    inputRef.current?.blur();
  });

  // Close on click outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  // Keyboard shortcut: "/" or "Cmd+K" / "Ctrl+K" focuses search
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (
        (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Debounced live backend search to complement local store results
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setBackendResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const apiMovies = await moviesApi.search(trimmed);
        if (apiMovies && apiMovies.length > 0) {
          const mapped: Movie[] = apiMovies.map((m) => ({
            id: String(m.id || m.tmdbId),
            tmdbId: m.tmdbId,
            title: m.title,
            year: m.releaseYear || new Date().getFullYear(),
            director: m.director || "Unknown",
            overview: m.overview || "",
            posterUrl: m.posterUrl || null,
            imdb: m.imdbRating != null ? Number(m.imdbRating) : undefined,
            rt: m.rottenTomatoesRating != null ? Number(m.rottenTomatoesRating) : undefined,
            mediaType: ((m.mediaType || "MOVIE").toUpperCase()) as any,
            seasonsCount: m.seasonsCount,
            episodesCount: m.episodesCount,
          }));
          setBackendResults(mapped);
        } else {
          setBackendResults([]);
        }
      } catch {
        setBackendResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query]);

  // Display backend results directly from live TMDB search
  const displayedResults = backendResults.slice(0, 8);

  const handleSelect = useCallback(
    (movie: Movie) => {
      store.upsertMovie(movie);
      try {
        sessionStorage.setItem("last_selected_movie", JSON.stringify(movie));
      } catch {
        /* ignore */
      }
      setIsOpen(false);
      setQuery("");
      setSelectedIndex(-1);
      inputRef.current?.blur();
      onNavigate?.();
      const targetUrl = `/movies/${movie.id}${movie.mediaType ? `?type=${encodeURIComponent(movie.mediaType)}` : ""}`;
      navigate(targetUrl);
    },
    [navigate, onNavigate, store],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || displayedResults.length === 0) {
      if (e.key === "Enter" && query.trim()) {
        navigate(`/movies/add?q=${encodeURIComponent(query.trim())}`);
        setIsOpen(false);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < displayedResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : displayedResults.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < displayedResults.length) {
        handleSelect(displayedResults[selectedIndex]);
      } else if (displayedResults.length > 0) {
        handleSelect(displayedResults[0]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const clearSearch = () => {
    setQuery("");
    setBackendResults([]);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Sleek IMDb/Modern-inspired glowing pill search container */}
      <div
        className="group relative flex items-center h-9 w-48 sm:w-60 lg:w-64 focus-within:w-64 sm:focus-within:w-72 lg:focus-within:w-80 rounded-[10px] border-2 border-white/10 bg-[#0e1320]/90 px-2.5 transition-all duration-300 ease-out hover:border-[#4a9dec]/60 focus-within:border-[#4a9dec] focus-within:bg-[#131b2e] focus-within:shadow-[0px_0px_0px_6px_rgba(74,157,236,0.22)]"
      >
        <SearchIcon className="h-4 w-4 shrink-0 text-text-muted transition-colors group-focus-within:text-[#4a9dec]" />
        
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search movies, TV, anime..."
          className="ml-2 h-full w-full bg-transparent text-[13px] font-medium text-white placeholder:text-text-muted/60 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 ring-0 border-none select-text"
          style={{ outline: "none", boxShadow: "none" }}
          aria-label="Search titles"
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />

        {query.trim() ? (
          <button
            type="button"
            onClick={clearSearch}
            className="shrink-0 p-1 text-text-muted hover:text-white transition-colors"
            title="Clear search"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="hidden lg:inline-flex items-center rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-medium text-text-muted/70 select-none">
            /
          </span>
        )}
      </div>

      {/* Floating Live Search Popover */}
      {isOpen && query.trim().length > 0 && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-2 w-72 sm:w-80 lg:w-96 max-h-[420px] overflow-y-auto rounded-xl border border-white/15 bg-[#0e1320]/95 p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150"
          style={{ scrollbarWidth: "thin" }}
        >
          {displayedResults.length > 0 ? (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                <span>Titles</span>
                {isSearching && (
                  <span className="flex items-center gap-1 text-[10px] text-accent animate-pulse font-normal">
                    Searching...
                  </span>
                )}
              </div>

              {displayedResults.map((movie, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={movie.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => handleSelect(movie)}
                    className={`flex items-center gap-3 rounded-lg p-2 cursor-pointer transition-colors ${
                      isSelected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    {/* Poster Thumbnail */}
                    <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-surface border border-white/10">
                      {movie.posterUrl ? (
                        <img
                          src={movie.posterUrl}
                          alt={movie.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-white/5 text-[9px] text-text-muted">
                          🎬
                        </div>
                      )}
                    </div>

                    {/* Movie Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-white">
                          {movie.title}
                        </span>
                        {movie.mediaType && movie.mediaType !== "MOVIE" && (
                          <span className="rounded bg-accent/20 px-1 py-0.2 text-[9px] font-bold text-accent">
                            {movie.mediaType === "ANIME" ? "Anime" : "TV"}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-muted">
                        <span>{movie.year}</span>
                        {movie.imdb != null && (
                          <span className="nums font-semibold text-amber-400">
                            ★ {movie.imdb.toFixed(1)}
                          </span>
                        )}
                        {movie.director && movie.director !== "Unknown" && (
                          <span className="truncate text-text-muted/70">
                            · {movie.director}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="border-t border-white/[0.08] pt-1.5 mt-1 px-2 pb-1 flex items-center justify-between text-[11px] text-text-muted">
                <span>Navigate with <kbd className="rounded border border-white/20 px-1 text-[9px]">↑</kbd> <kbd className="rounded border border-white/20 px-1 text-[9px]">↓</kbd></span>
                <button
                  type="button"
                  onClick={() => {
                    navigate(`/movies/add?q=${encodeURIComponent(query.trim())}`);
                    setIsOpen(false);
                  }}
                  className="font-semibold text-accent hover:text-white transition-colors"
                >
                  Full Search →
                </button>
              </div>
            </div>
          ) : (
            <div className="py-6 px-4 text-center">
              {isSearching ? (
                <p className="text-xs text-text-muted animate-pulse">Searching catalog...</p>
              ) : (
                <>
                  <p className="text-xs font-medium text-text-muted">
                    No results for &ldquo;{query}&rdquo;
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      navigate(`/movies/add?q=${encodeURIComponent(query.trim())}`);
                      setIsOpen(false);
                    }}
                    className="mt-2 text-xs font-semibold text-accent hover:underline"
                  >
                    Search full online catalog →
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
