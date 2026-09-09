import { mockPosters, type CastMember } from "../assets/posters";
export type { CastMember };

export type Status = "watched" | "watchlist";
export type MediaType = "MOVIE" | "TV" | "ANIME";

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
  mediaType: MediaType;
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

export type Friendship = { a: string; b: string };
export type Settings = Record<string, never>;

export const users: User[] = [
  { id: "u1", username: "you", displayName: "You", password: "password" },
  { id: "u2", username: "alice", displayName: "Alice", password: "password" },
  { id: "u3", username: "ben", displayName: "Ben", password: "password" },
  { id: "u4", username: "priya", displayName: "Priya", password: "password" },
  { id: "u5", username: "marcus", displayName: "Marcus", password: "password" },
];

const movieEntries: Movie[] = mockPosters.map((p) => ({
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
  mediaType: "MOVIE" as MediaType,
}));

/* ── Mock TV Series ── */
const tvSeries: Movie[] = [
  {
    id: "tv-breaking-bad",
    title: "Breaking Bad",
    year: 2008,
    posterSeed: null,
    posterUrl: "https://image.tmdb.org/t/p/w500/ztkUQFLlC19CCMYHW73WFnlGBmQ.jpg",
    imdb: 9.5,
    rt: 96,
    overview: "A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine with a former student to secure his family's future.",
    genres: ["Drama", "Crime", "Thriller"],
    mediaType: "TV",
  },
  {
    id: "tv-the-sopranos",
    title: "The Sopranos",
    year: 1999,
    posterSeed: null,
    posterUrl: "https://image.tmdb.org/t/p/w500/6MKr3KgOLmzaBcbCpGeqOczap3X.jpg",
    imdb: 9.2,
    rt: 92,
    overview: "New Jersey mob boss Tony Soprano deals with personal and professional issues in his home and business life that affect his mental state, which he discusses with a psychiatrist.",
    genres: ["Drama", "Crime"],
    mediaType: "TV",
  },
  {
    id: "tv-chernobyl",
    title: "Chernobyl",
    year: 2019,
    posterSeed: null,
    posterUrl: "https://image.tmdb.org/t/p/w500/hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg",
    imdb: 9.4,
    rt: 96,
    overview: "In April 1986, an explosion at the Chernobyl nuclear power plant in the Union of Soviet Socialist Republics becomes one of the world's worst man-made catastrophes.",
    genres: ["Drama", "History"],
    mediaType: "TV",
  },
  {
    id: "tv-true-detective",
    title: "True Detective",
    year: 2014,
    posterSeed: null,
    posterUrl: "https://image.tmdb.org/t/p/w500/aowr4xpLP5sRCL50TkuADomJ14Z.jpg",
    imdb: 8.9,
    rt: 85,
    overview: "Seasonal anthology series in which police investigations unearth the personal and professional secrets of those involved, both combatants and victims of crime.",
    genres: ["Drama", "Crime", "Mystery"],
    mediaType: "TV",
  },
  {
    id: "tv-the-wire",
    title: "The Wire",
    year: 2002,
    posterSeed: null,
    posterUrl: "https://image.tmdb.org/t/p/w500/4lbclFySvugI51fwsyxBTOm4DqK.jpg",
    imdb: 9.3,
    rt: 94,
    overview: "The Baltimore drug scene, as seen through the eyes of drug dealers and law enforcement.",
    genres: ["Drama", "Crime"],
    mediaType: "TV",
  },
  {
    id: "tv-better-call-saul",
    title: "Better Call Saul",
    year: 2015,
    posterSeed: null,
    posterUrl: "https://image.tmdb.org/t/p/w500/fC2HDm5t0kHagfiTRq2Kp9C7sAz.jpg",
    imdb: 9.0,
    rt: 98,
    overview: "The trials and tribulations of criminal lawyer Jimmy McGill in the time before he established his strip-mall law office in Albuquerque, New Mexico.",
    genres: ["Drama", "Crime"],
    mediaType: "TV",
  },
];

/* ── Mock Anime ── */
const animeEntries: Movie[] = [
  {
    id: "anime-aot",
    title: "Attack on Titan",
    year: 2013,
    posterSeed: null,
    posterUrl: "https://image.tmdb.org/t/p/w500/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg",
    imdb: 9.1,
    rt: 95,
    overview: "After his hometown is destroyed and his mother is killed, young Eren Jaeger vows to cleanse the earth of the giant humanoid Titans that have brought humanity to the brink of extinction.",
    genres: ["Animation", "Action", "Fantasy"],
    mediaType: "ANIME",
  },
  {
    id: "anime-death-note",
    title: "Death Note",
    year: 2006,
    posterSeed: null,
    posterUrl: "https://image.tmdb.org/t/p/w500/g8fclFuA1ckICdUPGlnNvkWmETy.jpg",
    imdb: 9.0,
    rt: null,
    overview: "An intelligent high school student goes on a secret crusade to eliminate criminals from the world after discovering a notebook capable of killing anyone whose name is written into it.",
    genres: ["Animation", "Mystery", "Thriller"],
    mediaType: "ANIME",
  },
  {
    id: "anime-steins-gate",
    title: "Steins;Gate",
    year: 2011,
    posterSeed: null,
    posterUrl: "https://image.tmdb.org/t/p/w500/nWpFzMKEMBPChHqQOOiGiRLaNts.jpg",
    imdb: 8.8,
    rt: null,
    overview: "A self-proclaimed mad scientist and his team of friends discover a method of time travel through modifying a microwave with a cell phone, inadvertently causing a shift in world lines.",
    genres: ["Animation", "Sci-Fi", "Thriller"],
    mediaType: "ANIME",
  },
  {
    id: "anime-fmab",
    title: "Fullmetal Alchemist: Brotherhood",
    year: 2009,
    posterSeed: null,
    posterUrl: "https://image.tmdb.org/t/p/w500/6IFfMxoN88iAc1bAIphWI0PjnEn.jpg",
    imdb: 9.2,
    rt: 100,
    overview: "Two brothers search for a Philosopher's Stone after an pointless attempt to use alchemy to bring their deceased mother back to life results in them losing parts of their bodies.",
    genres: ["Animation", "Action", "Adventure"],
    mediaType: "ANIME",
  },
  {
    id: "anime-bebop",
    title: "Cowboy Bebop",
    year: 1998,
    posterSeed: null,
    posterUrl: "https://image.tmdb.org/t/p/w500/mOhKxL9xABubIrInmYmcfFw2Epj.jpg",
    imdb: 8.9,
    rt: 100,
    overview: "The futuristic misadventures and tragedies of an pointless crew of bounty hunters trying to make a living in space.",
    genres: ["Animation", "Action", "Sci-Fi"],
    mediaType: "ANIME",
  },
  {
    id: "anime-demon-slayer-movie",
    title: "Demon Slayer: Mugen Train",
    year: 2020,
    posterSeed: null,
    posterUrl: "https://image.tmdb.org/t/p/w500/h8Rb9gBr48ODIwYUttZNYeMweEG.jpg",
    imdb: 8.2,
    rt: 98,
    overview: "Tanjiro and his comrades embark on a new mission aboard the Mugen Train, on track to despair. More than 40 people have disappeared on this train.",
    genres: ["Animation", "Action", "Fantasy"],
    mediaType: "ANIME",
    // This is an anime MOVIE — it should also show under Movies filter
  },
];

export const movies: Movie[] = [...movieEntries, ...tvSeries, ...animeEntries];

type SeedEntry = [userId: string, movieId: string, status: Status, rating: number | null, days: number, description?: string];

const seed: SeedEntry[] = [
  // You — Movies
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
  // You — TV
  ["u1", "tv-breaking-bad", "watched", 10, 15, "The best TV series ever made. Every season raises the stakes."],
  ["u1", "tv-the-sopranos", "watched", 9, 30, "Tony Soprano is one of the greatest characters in fiction."],
  ["u1", "tv-true-detective", "watchlist", null, 3, "S1 is legendary, need to finally start it."],
  // You — Anime
  ["u1", "anime-aot", "watched", 9, 20, "The final season delivered. Absolutely devastating."],
  ["u1", "anime-death-note", "watched", 10, 40, "Light vs L is peak fiction."],
  ["u1", "anime-demon-slayer-movie", "watchlist", null, 7, "Heard it's incredible."],
  // Alice
  ["u2", "p-goodfellas", "watched", 9, 40],
  ["u2", "p-dark-knight", "watched", 8, 21],
  ["u2", "p-casino", "watched", 8, 33],
  ["u2", "p-mom", "watched", 10, 10],
  ["u2", "p-2001", "watchlist", null, 5],
  ["u2", "tv-chernobyl", "watched", 10, 12],
  ["u2", "anime-fmab", "watched", 10, 18],
  // Ben
  ["u3", "p-dark-knight", "watched", 10, 12],
  ["u3", "p-apocalypse-now", "watched", 9, 25],
  ["u3", "p-2001", "watched", 8, 55],
  ["u3", "p-american-psycho", "watched", 7, 18],
  ["u3", "p-goodfellas", "watchlist", null, 2],
  ["u3", "tv-the-wire", "watched", 10, 35],
  ["u3", "anime-bebop", "watched", 9, 50],
  // Priya
  ["u4", "p-there-will-be-blood", "watched", 9, 9],
  ["u4", "p-goodfellas", "watched", 10, 20],
  ["u4", "p-oldboy", "watched", 10, 15],
  ["u4", "p-dark-knight", "watched", 9, 33],
  ["u4", "p-casino", "watchlist", null, 2],
  ["u4", "anime-steins-gate", "watched", 9, 22],
  // Marcus
  ["u5", "p-american-psycho", "watched", 7, 50],
  ["u5", "p-donnie-darko", "watched", 9, 40],
  ["u5", "p-2001", "watched", 8, 80],
  ["u5", "p-casino", "watched", 6, 120],
  ["u5", "tv-better-call-saul", "watched", 9, 28],
];

/**
 * Look up the mediaType for a movieId from the global movies array.
 */
function mediaTypeFor(movieId: string): MediaType {
  const m = movies.find((mv) => mv.id === movieId);
  return m?.mediaType ?? "MOVIE";
}

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
    mediaType: mediaTypeFor(movieId),
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
