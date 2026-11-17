import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { Link, useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import { moviesApi } from "../api/movies";
import type { Movie } from "../store/data";
import { SearchIcon, CloseIcon } from "./NavRail.icons";
import { useEscapeKey } from "../hooks/useOverlay";
import {
  DROPDOWN_RESULT_LIMIT,
  mediaTypeLabel,
  searchResultsUrl,
  toSearchMovie,
} from "./searchResultsLogic";
import { openTitleWithTransition, POSTER_ID_ATTRIBUTE, titlePrefetchHandlers } from "./posterTransition";

interface NavSearchProps {
  className?: string;
  onNavigate?: () => void;
  /** Reports whether the field is focused or showing results (#27 dims the page only then). */
  onActiveChange?: (active: boolean) => void;
}

const movieUrl = (movie: Movie) =>
  `/movies/${movie.id}${movie.mediaType ? `?type=${encodeURIComponent(movie.mediaType)}` : ""}`;

const addSearchUrl = (q: string) => `/movies/add?q=${encodeURIComponent(q.trim())}`;

export default function NavSearch({ className = "", onNavigate, onActiveChange }: NavSearchProps) {
  const [searchError, setSearchError] = useState<string | null>(null);
  const { navigate } = useRouter();
  const store = useStore();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [backendResults, setBackendResults] = useState<Movie[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [focused, setFocused] = useState(false);
  const interactionModeRef = useRef<"pointer" | "keyboard">("keyboard");
  /** Whether selectedIndex came from the arrow keys (Enter opens it) or from hovering (it does not). */
  const arrowSelectionRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = focused || (isOpen && query.trim().length > 0);
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

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

  // Track pointer vs keyboard interaction modality and shortcuts
  useEffect(() => {
    const handlePointerDown = () => {
      interactionModeRef.current = "pointer";
    };
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      interactionModeRef.current = "keyboard";
      if (
        (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        setKeyboardFocus(true);
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Debounced live backend search to complement local store results
  useEffect(() => {
    let active = true;
    setBackendResults([]);
    setSearchError(null);
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
        if (!active) return;
        setBackendResults(apiMovies.map(toSearchMovie));
      } catch (error) {
        if (!active) return;
        setSearchError(error instanceof Error ? error.message : "Could not search. Retry.");
        setBackendResults([]);
      } finally {
        if (active) setIsSearching(false);
      }
    }, 280);

    return () => { active = false; clearTimeout(timer); };
  }, [query, store.currentUser?.id]);

  // #30: up to six larger rows; the full list is one Enter away.
  const displayedResults = backendResults.slice(0, DROPDOWN_RESULT_LIMIT);

  const handleSelect = useCallback(
    (movie: Movie, source: HTMLElement | null = null) => {
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
      openTitleWithTransition({ source, movieId: movie.id, url: movieUrl(movie), navigate });
    },
    [navigate, onNavigate, store],
  );

  /** #30 SR01: Enter (or the phone keyboard's Go/Search key) opens the full results page. */
  const openResultsPage = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
    onNavigate?.();
    navigate(searchResultsUrl(trimmed));
  }, [navigate, onNavigate, query]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && (!isOpen || !arrowSelectionRef.current || selectedIndex < 0 || selectedIndex >= displayedResults.length)) {
      e.preventDefault();
      openResultsPage();
      return;
    }
    if (!isOpen || displayedResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      arrowSelectionRef.current = true;
      setSelectedIndex((prev) => (prev < displayedResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      arrowSelectionRef.current = true;
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : displayedResults.length - 1));
    } else if (e.key === "Enter") {
      // An arrow-key selection opens that title; otherwise Enter was handled above.
      e.preventDefault();
      handleSelect(
        displayedResults[selectedIndex],
        document.querySelector<HTMLElement>(`#nav-search-result-${selectedIndex} [${POSTER_ID_ATTRIBUTE}]`),
      );
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
      <div
        onPointerDown={() => setKeyboardFocus(false)}
        className={`nav-search-field group relative flex h-11 lg:h-9 w-full min-w-0 items-center rounded-[10px] border border-white/[0.08] bg-[#0e1320]/90 px-2.5 transition-colors hover:border-white/[0.18] lg:w-64 ${keyboardFocus ? "nav-search-keyboard" : ""}`}
      >
        <SearchIcon className="h-4 w-4 shrink-0 text-text-muted transition-colors group-focus-within:text-text-primary" />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(-1);
            arrowSelectionRef.current = false;
          }}
          onFocus={() => {
            setFocused(true);
            setIsOpen(true);
            setKeyboardFocus(interactionModeRef.current === "keyboard");
          }}
          onBlur={() => {
            setFocused(false);
            setKeyboardFocus(false);
          }}
          onKeyDown={handleKeyDown}
          // #34: search needs a connection.
          disabled={store.isOffline}
          placeholder={store.isOffline ? "Search needs a connection" : "Search movies, TV, anime..."}
          className="ml-2 h-full min-h-0 min-w-0 flex-1 border-0 bg-transparent text-base font-medium text-white placeholder:text-text-muted outline-none select-text lg:text-[13px]"
          aria-label="Search titles"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="nav-search-results"
          aria-activedescendant={selectedIndex >= 0 ? `nav-search-result-${selectedIndex}` : undefined}
        />

        {query.trim() ? (
          <button
            type="button"
            onClick={clearSearch}
            className="flex shrink-0 items-center justify-center rounded-md p-1 text-text-muted transition-colors hover:text-white"
            title="Clear search"
            aria-label="Clear search"
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
          id="nav-search-popover"
          className="absolute left-0 top-full z-50 mt-2 max-h-[min(680px,70dvh)] w-[min(28rem,calc(100vw-2.5rem))] overflow-y-auto rounded-xl border border-white/15 bg-[#0e1320]/95 p-1.5 shadow-2xl backdrop-blur-xl lg:w-[28rem]"
          style={{ scrollbarWidth: "thin" }}
        >
          {searchError && (
            <p role="alert" className="mb-2 px-2.5 py-1 text-xs text-danger">
              {searchError} Change the search to retry.
            </p>
          )}
          {displayedResults.length > 0 ? (
            <div className="space-y-0.5">
              <div id="nav-search-results" role="listbox" aria-label="Search results">
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
                const prefetch = titlePrefetchHandlers(movie.id, store.currentUser?.id);
                return (
                  <a
                    key={movie.id}
                    id={`nav-search-result-${idx}`}
                    href={movieUrl(movie)}
                    role="option"
                    aria-selected={isSelected}
                    {...prefetch}
                    onMouseEnter={() => {
                      arrowSelectionRef.current = false;
                      setSelectedIndex(idx);
                      prefetch.onMouseEnter();
                    }}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                      event.preventDefault();
                      handleSelect(movie, event.currentTarget.querySelector<HTMLElement>(`[${POSTER_ID_ATTRIBUTE}]`));
                    }}
                    aria-label={`${movie.title}${movie.year != null ? ` (${movie.year})` : ""}, ${mediaTypeLabel(movie.mediaType)}`}
                    className={`flex items-center gap-3 rounded-lg p-2 cursor-pointer transition-colors ${
                      isSelected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    {/* Poster Thumbnail (#30 SR04: 56×84) */}
                    <div
                      {...{ [POSTER_ID_ATTRIBUTE]: movie.id }}
                      className="h-[84px] w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-surface"
                    >
                      {movie.posterUrl ? (
                        <img
                          src={movie.posterUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-white/5 p-1 text-center text-xs leading-tight text-text-muted">
                          No poster
                        </div>
                      )}
                    </div>

                    {/* Title, year and type */}
                    <div className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-white">
                        {movie.title}
                      </span>
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-text-muted">
                        {movie.year != null && <span className="nums">{movie.year}</span>}
                        <span className="rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-xs font-medium text-text-primary">
                          {mediaTypeLabel(movie.mediaType)}
                        </span>
                      </div>
                    </div>
                  </a>
                );
              })}
              </div>

              <div className="border-t border-white/[0.08] pt-2 mt-1 px-2 pb-1 flex items-center justify-between gap-3 text-xs text-text-muted">
                <span className="hidden shrink-0 lg:inline">Navigate with <kbd className="rounded border border-white/20 px-1 text-[9px]">↑</kbd> <kbd className="rounded border border-white/20 px-1 text-[9px]">↓</kbd></span>
                <Link
                  to={searchResultsUrl(query)}
                  onClick={() => { setIsOpen(false); onNavigate?.(); }}
                  className="prose-link min-w-0 truncate text-link font-semibold transition-colors hover:text-white"
                >
                  See all results for &ldquo;{query.trim()}&rdquo;
                </Link>
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
                  <Link
                    to={addSearchUrl(query)}
                    onClick={() => setIsOpen(false)}
                    className="prose-link text-link mt-2 text-xs font-semibold"
                  >
                    Search full online catalog →
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
