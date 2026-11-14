import { useEffect, useRef, useState } from "react";
import { useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import { moviesApi, isAbortError } from "../api/movies";
import type { Movie } from "../store/data";
import AppShell from "../components/AppShell";
import MovieGrid from "../components/MovieGrid";
import SegmentedRadio from "../components/SegmentedRadio";
import { POSTER_GRID_CLASS } from "../components/layout";
import {
  SEARCH_TABS,
  appendWithoutDuplicates,
  mediaTypeLabel,
  parseSearchLocation,
  searchResultsUrl,
  searchTabType,
  toSearchMovie,
  type SearchTab,
} from "../components/searchResultsLogic";

const EMPTY_NOUN: Record<SearchTab, string> = {
  all: "titles",
  movies: "movies",
  tv: "TV series",
  anime: "anime titles",
};

interface LoadedResults {
  key: string;
  movies: Movie[];
  /** Provider pages consumed per request, so reload/back replays the same requests. */
  pages: number[];
  hasMore: boolean;
}

/** #30 (PD-14): `/search?q=…&tab=…`, the full results for a query. */
export default function SearchResultsPage() {
  const { search, state, navigate, path } = useRouter();
  const store = useStore();
  const userScope = store.currentUser?.id;
  const { query, tab } = parseSearchLocation(search);
  const type = searchTabType(tab);
  const key = `${type}:${query.toLowerCase()}`;

  // How many requests were loaded lives in this history entry, so back and reload restore them.
  const restoredRequests = typeof state?.searchRequests === "number" && state.searchKey === key
    ? Math.max(1, Math.min(state.searchRequests, 25))
    : 1;

  const [results, setResults] = useState<LoadedResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const moreController = useRef<AbortController | null>(null);

  useEffect(() => {
    moreController.current?.abort();
    setLoadMoreError(null);
    if (!query) {
      setResults(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        let movies: Movie[] = [];
        const pages: number[] = [];
        let nextPage = 1;
        let hasMore = true;
        for (let i = 0; i < restoredRequests && hasMore; i++) {
          const response = await moviesApi.searchPage(query, nextPage, type, { signal: controller.signal, userScope });
          if (controller.signal.aborted) return;
          movies = appendWithoutDuplicates(movies, response.results.map(toSearchMovie));
          pages.push(response.page);
          hasMore = response.hasMore;
          nextPage = response.page + 1;
        }
        setResults({ key, movies, pages, hasMore });
      } catch (err) {
        if (controller.signal.aborted || isAbortError(err)) return;
        setResults(null);
        setError(err instanceof Error ? err.message : "Could not search. Retry.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
    // restoredRequests is read once per query/tab; later Load more updates it without refetching.
  }, [key, query, type, userScope, retry]);

  const current = results?.key === key ? results : null;

  const loadMore = async () => {
    if (!current || !current.hasMore || loadingMore) return;
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const nextPage = current.pages[current.pages.length - 1] + 1;
      const response = await moviesApi.searchPage(query, nextPage, type, { signal: controller.signal, userScope });
      if (controller.signal.aborted) return;
      const next: LoadedResults = {
        key,
        movies: appendWithoutDuplicates(current.movies, response.results.map(toSearchMovie)),
        pages: [...current.pages, response.page],
        hasMore: response.hasMore,
      };
      setResults(next);
      navigate(`${path}${search}`, {
        replace: true,
        preserveScroll: true,
        state: { ...state, searchKey: key, searchRequests: next.pages.length },
      });
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return;
      setLoadMoreError(err instanceof Error ? err.message : "Could not load more results. Retry.");
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  };

  const changeTab = (next: SearchTab) => {
    // A history entry per tab, so Back returns to the previous tab (SR03).
    if (next !== tab) navigate(searchResultsUrl(query, next));
  };

  return (
    <AppShell width="wide">
      <div>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            {query ? <>Results for &ldquo;{query}&rdquo;</> : "Search"}
          </h1>
          {query && (
            <SegmentedRadio
              name="search-type"
              value={tab}
              options={SEARCH_TABS.map(({ value, label }) => ({ value, label }))}
              onChange={changeTab}
            />
          )}
        </div>

        {!query ? (
          <p className="py-16 text-center text-text-muted">
            Type a title in the search field and press Enter to see every match.
          </p>
        ) : error ? (
          <div className="my-8 rounded-lg border border-danger/20 bg-danger/5 p-8 text-center">
            <p role="alert" className="text-sm font-medium text-danger">{error}</p>
            <button
              type="button"
              onClick={() => setRetry((n) => n + 1)}
              className="mt-4 inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
            >
              Retry search
            </button>
          </div>
        ) : !current || (loading && current.movies.length === 0) ? (
          <div aria-busy="true" aria-label="Loading results" className={POSTER_GRID_CLASS}>
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-lg bg-white/[0.04]" />
            ))}
          </div>
        ) : (
          <>
            <MovieGrid
              movies={current.movies}
              empty={`No ${EMPTY_NOUN[tab]} match “${query}”. Try another spelling or tab.`}
              referrerOverride={`${path}${search}`}
              captionFor={(movie) => [movie.year, mediaTypeLabel(movie.mediaType)].filter(Boolean).join(" · ")}
            />
            {loadMoreError && (
              <p role="alert" className="mt-6 text-center text-sm text-danger">{loadMoreError}</p>
            )}
            {current.hasMore && (
              <div className="mt-8 flex justify-center pb-8">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                  className="inline-flex min-h-11 items-center rounded-lg border border-white/15 bg-white/[0.04] px-5 text-sm font-semibold text-text-primary transition-colors hover:border-white/30 hover:bg-white/[0.08] disabled:opacity-60"
                >
                  {loadingMore ? "Loading…" : loadMoreError ? "Retry load more" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
