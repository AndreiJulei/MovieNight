import { mockPosters, type CastMember } from "../assets/posters";

export type Status = "watched" | "watchlist";

export type User = {
  id: string;
  username: string;
  displayName: string;
  password: string;
};

export type Movie = {
  id: string;
  tmdbId?: number;
  title: string;
  year: number;
  posterSeed: number | null;
  posterUrl: string | null;
  imdb: number | null;
  rt: number | null;
  overview: string;
  genres?: string[];
  cast?: CastMember[];
  trailerKey?: string;
  director?: string;
};

export type Entry = {
  id: string;
  userId: string;
  movieId: string;
  status: Status;
  rating: number | null; // 0–10
  description: string;
  addedAt: string; // ISO date
};

export type Friendship = { a: string; b: string };
export type Settings = Record<string, never>;

export const users: User[] = [
  { id: "u1", username: "you", displayName: "You", password: "password" },
  { id: "u2", username: "alice", displayName: "Alice", password: "password" },
  { id: "u3", username: "ben", displayName: "Ben", password: "password" },
  { id: "u4", username: "priya", displayName: "Priya", password: "password" },
  { id: "u5", username: "marcus", displayName: "Marcus", password: "password" },
];

export const movies: Movie[] = mockPosters.map((p) => ({
  id: p.id,
  title: p.title,
  year: p.year,
  posterSeed: null,
  posterUrl: p.posterUrl,
  imdb: p.imdb,
  rt: p.rt,
  overview: p.overview,
  genres: p.genres,
  cast: p.cast,
  trailerKey: p.trailerKey,
}));

type SeedEntry = [userId: string, movieId: string, status: Status, rating: number | null, days: number, description?: string];

const seed: SeedEntry[] = [
  // You
  ["u1", "p-goodfellas", "watched", 10, 8, "As good as the medium gets. Every scene is doing three things at once."],
  ["u1", "p-there-will-be-blood", "watched", 9, 14, "I drink your milkshake. A towering, terrifying performance."],
  ["u1", "p-2001", "watched", 9, 60, "Best seen big and loud. The cut from bone to spacecraft still floors me."],
  ["u1", "p-dark-knight", "watched", 9, 30, "Heath Ledger's performance is legendary."],
  ["u1", "p-schindlers-list", "watched", 10, 45, "Heart-wrenching and essential cinema."],
  ["u1", "p-oldboy", "watched", 9, 12, "One of the greatest revenge thrillers ever made."],
  ["u1", "p-casino", "watchlist", null, 4, "Been meaning to revisit this one."],
  ["u1", "p-american-psycho", "watchlist", null, 6, ""],
  ["u1", "p-mom", "watchlist", null, 2, "Bong Joon-ho's masterpiece."],
  ["u1", "p-donnie-darko", "watchlist", null, 5, ""],
  // Alice
  ["u2", "p-goodfellas", "watched", 9, 40],
  ["u2", "p-dark-knight", "watched", 8, 21],
  ["u2", "p-casino", "watched", 8, 33],
  ["u2", "p-mom", "watched", 10, 10],
  ["u2", "p-2001", "watchlist", null, 5],
  // Ben
  ["u3", "p-dark-knight", "watched", 10, 12],
  ["u3", "p-apocalypse-now", "watched", 9, 25],
  ["u3", "p-2001", "watched", 8, 55],
  ["u3", "p-american-psycho", "watched", 7, 18],
  ["u3", "p-goodfellas", "watchlist", null, 2],
  // Priya
  ["u4", "p-there-will-be-blood", "watched", 9, 9],
  ["u4", "p-goodfellas", "watched", 10, 20],
  ["u4", "p-oldboy", "watched", 10, 15],
  ["u4", "p-dark-knight", "watched", 9, 33],
  ["u4", "p-casino", "watchlist", null, 2],
  // Marcus
  ["u5", "p-american-psycho", "watched", 7, 50],
  ["u5", "p-donnie-darko", "watched", 9, 40],
  ["u5", "p-2001", "watched", 8, 80],
  ["u5", "p-casino", "watched", 6, 120],
];

let counter = 0;
export const entries: Entry[] = seed.map(([userId, movieId, status, rating, days, description]) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return {
    id: `e${++counter}`,
    userId,
    movieId,
    status,
    rating,
    description: description ?? "",
    addedAt: d.toISOString(),
  };
});

export const friendships: Friendship[] = [
  { a: "u1", b: "u2" },
  { a: "u1", b: "u3" },
  { a: "u1", b: "u4" },
  { a: "u2", b: "u3" },
];

export const searchCatalog: Movie[] = [...movies];

let nextId = 1000;
export function freshId(prefix: string): string {
  return `${prefix}${nextId++}`;
}
