import type { CastMember } from "../assets/posters";
export type { CastMember };

export type Status = "watched" | "watchlist";
export type MediaType = "MOVIE" | "TV" | "ANIME";

export type User = {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  password?: string;
};

export type Movie = {
  id: string;
  tmdbId?: number;
  title: string;
  year: number;
  posterSeed?: number | null;
  posterUrl: string | null;
  imdb?: number | null;
  rt?: number | null;
  overview?: string;
  genres?: string[];
  cast?: CastMember[];
  trailerKey?: string;
  director?: string;
  mediaType: MediaType;
  isAiring?: boolean;
  seasonsCount?: number;
  episodesCount?: number;
};

export type Entry = {
  id: string;
  userId: string;
  movieId: string;
  status: Status;
  rating: number | null; // 0–10
  description: string;
  addedAt: string; // ISO date
  mediaType: MediaType;
};

export type CustomList = {
  id: string;
  userId: string;
  title: string;
  movieIds: string[];
  createdAt: string; // ISO date
};

export type Friendship = { a: string; b: string };
export type Settings = Record<string, never>;

export const users: User[] = [];
export const movies: Movie[] = [];
export const entries: Entry[] = [];
export const friendships: Friendship[] = [];
export const seedCustomLists: CustomList[] = [];
export const searchCatalog: Movie[] = [];

let nextId = 1000;
export function freshId(prefix: string): string {
  return `${prefix}${nextId++}`;
}
