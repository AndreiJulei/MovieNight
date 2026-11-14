import type { ApiMovieResponse } from "../api/movies";
import type { MediaType, Movie } from "../store/data";
import { titleId } from "../store/titleIdentity";

/** #30 (PD-14): the full search results page, its tabs and its URL. */
export type SearchTab = "all" | "movies" | "tv" | "anime";

export const SEARCH_TABS: readonly { value: SearchTab; label: string; type: "ALL" | MediaType }[] = [
  { value: "all", label: "All", type: "ALL" },
  { value: "movies", label: "Movies", type: "MOVIE" },
  { value: "tv", label: "TV", type: "TV" },
  { value: "anime", label: "Anime", type: "ANIME" },
];

/** Dropdown rows shown before the "See all results" footer. */
export const DROPDOWN_RESULT_LIMIT = 6;

export function parseSearchLocation(search: string): { query: string; tab: SearchTab } {
  const params = new URLSearchParams(search);
  const query = (params.get("q") ?? "").trim();
  const tabParam = params.get("tab");
  const tab = SEARCH_TABS.some((t) => t.value === tabParam) ? (tabParam as SearchTab) : "all";
  return { query, tab };
}

/** `/search?q=…` with the tab only when it is not the default, so shared links stay short. */
export function searchResultsUrl(query: string, tab: SearchTab = "all"): string {
  const params = new URLSearchParams({ q: query.trim() });
  if (tab !== "all") params.set("tab", tab);
  return `/search?${params.toString()}`;
}

export function searchTabType(tab: SearchTab): "ALL" | MediaType {
  return SEARCH_TABS.find((t) => t.value === tab)?.type ?? "ALL";
}

export function mediaTypeLabel(mediaType: MediaType | undefined): string {
  return mediaType === "ANIME" ? "Anime" : mediaType === "TV" ? "TV" : "Movie";
}

/** Map a search API row to the store's title shape (shared by the dropdown and the results page). */
export function toSearchMovie(m: ApiMovieResponse): Movie {
  const mediaType = (m.mediaType || "MOVIE").toUpperCase() as MediaType;
  return {
    id: titleId(m.tmdbId, mediaType, m.id),
    catalogMovieId: m.id,
    tmdbId: m.tmdbId,
    title: m.title,
    year: m.releaseYear ?? null,
    director: m.director || "Unknown",
    overview: m.overview || "",
    posterUrl: m.posterUrl || null,
    imdb: m.imdbRating != null ? Number(m.imdbRating) : undefined,
    rt: m.rottenTomatoesRating != null ? Number(m.rottenTomatoesRating) : undefined,
    tmdbRating: m.tmdbVoteAverage ?? null,
    tmdbVotes: m.tmdbVoteCount ?? null,
    mediaType,
    seasonsCount: m.seasonsCount,
    episodesCount: m.episodesCount,
  };
}

/** Append a page, dropping titles already shown (TMDB can repeat a title across pages). */
export function appendWithoutDuplicates(existing: Movie[], incoming: Movie[]): Movie[] {
  const seen = new Set(existing.map((m) => m.id));
  const added = incoming.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
  return added.length ? [...existing, ...added] : existing;
}
