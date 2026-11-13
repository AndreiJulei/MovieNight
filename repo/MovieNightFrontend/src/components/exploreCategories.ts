import type { MediaType } from "../store/data"

/** The Explore category in a route, e.g. /explore/anime. */
export type ExploreCategory = "movies" | "tv" | "anime"

/** Each Explore category's media type and display name (the spotlight hero's label, #26). */
export const EXPLORE_CATEGORIES: Record<
  ExploreCategory,
  { mediaType: MediaType; title: string }
> = {
  movies: { mediaType: "MOVIE", title: "Movies" },
  tv: { mediaType: "TV", title: "TV Series" },
  anime: { mediaType: "ANIME", title: "Anime" },
}
