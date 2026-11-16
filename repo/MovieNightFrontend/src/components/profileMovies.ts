import { listsApi } from "../api/lists"
import type { ApiMovieResponse } from "../api/movies"
import type { Movie } from "../store/data"
import { titleId } from "../store/titleIdentity"

/** Map a catalog title from a friend or list response to the grid's Movie shape. */
export function movieFromApi(m: ApiMovieResponse): Movie {
  return {
    id: titleId(m.tmdbId, m.mediaType ?? "", m.id),
    catalogMovieId: m.id,
    tmdbId: m.tmdbId,
    title: m.title,
    year: m.releaseYear ?? null,
    posterSeed: null,
    posterUrl: m.posterUrl ?? null,
    imdb: m.imdbRating ?? null,
    rt: m.rottenTomatoesRating ?? null,
    tmdbRating: m.tmdbVoteAverage ?? null,
    overview: m.overview ?? "",
    genres: m.genres ? m.genres.split(",").map((g) => g.trim()) : [],
    director: m.director,
    trailerKey: m.trailerKey,
    mediaType: (m.mediaType ?? "MOVIE") as Movie["mediaType"],
  }
}

/** A custom-list profile tab: the list's titles, captioned by year. Used by owner and friend views (#33). */
export async function loadCustomListTab(listId: number | string): Promise<{ movies: Movie[]; captionFor: (movie: Movie) => string }> {
  const list = await listsApi.getListById(listId)
  return {
    movies: list.entries.map((entry) => movieFromApi(entry.movie)),
    captionFor: (movie) => (movie.year == null ? "" : String(movie.year)),
  }
}
