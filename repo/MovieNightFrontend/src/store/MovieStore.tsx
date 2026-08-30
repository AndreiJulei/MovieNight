import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authApi } from "../api/auth";
import {
  entries as seedEntries,
  friendships as seedFriendships,
  freshId,
  movies as seedMovies,
  searchCatalog,
  users as seedUsers,
  type Entry,
  type Friendship,
  type Movie,
  type Status,
  type User,
} from "./data";

// In-memory mock store. The pixel companion is always-on, so there are no
// persisted settings here anymore.
const AUTH_KEY = "movienight.currentUser";

export type FriendRating = { user: User; rating: number };

export type Stats = { count: number; avg: number | null };

type StoreValue = {
  currentUser: User | null;
  users: User[];
  movies: Movie[];

  // auth
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (u: {
    username: string;
    displayName: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  checkName: (name: string) => Promise<boolean>; // true = available

  // selectors
  movieById: (id: string) => Movie | undefined;
  entryFor: (userId: string, movieId: string) => Entry | undefined;
  entriesFor: (userId: string, status: Status) => Entry[];
  friendsOf: (userId: string) => User[];
  friendRatings: (movieId: string) => FriendRating[];
  stats: (userId: string, status?: Status) => Stats;
  searchMovies: (q: string) => Movie[];

  // mutations
  addMovie: (input: AddMovieInput) => string; // returns movie id
  markWatched: (entryId: string, rating: number, description: string) => void;
  updateDescription: (entryId: string, description: string) => void;
  removeEntry: (entryId: string) => void;
  addToWatchlist: (movieId: string) => void;
  addFriend: (userId: string) => void;
  removeFriend: (friendId: string) => void;
  changePassword: (oldPw: string, newPw: string) => { ok: boolean; error?: string };
  changeDisplayName: (newName: string) => { ok: boolean; error?: string };

  // selectors for suggestions
  allEntries: () => Entry[];
};

export type AddMovieInput = {
  title: string;
  year?: number;
  posterSeed?: number | null;
  posterUrl?: string | null;
  imdb?: number | null;
  rt?: number | null;
  overview?: string;
  status: Status;
  rating?: number | null;
  description?: string;
  existingMovieId?: string; // when adding a canonical movie you don't own yet
};

// Single context instance for the whole app.
const StoreContext = createContext<StoreValue | null>(null);

function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

export function MovieStoreProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>(seedUsers);
  const [movies, setMovies] = useState<Movie[]>(seedMovies);
  const [entries, setEntries] = useState<Entry[]>(seedEntries);
  const [friendships, setFriendships] = useState<Friendship[]>(seedFriendships);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const raw = sessionStorage.getItem(AUTH_KEY);
      if (raw) {
        const id = JSON.parse(raw) as string;
        return seedUsers.find((u) => u.id === id) ?? null;
      }
    } catch {
      /* ignore */
    }
    return null;
  });

  const login = useCallback<StoreValue["login"]>(
    async (username, password) => {
      const res = await authApi.login(username, password);
      if (!res.ok || !res.user) {
        return { ok: false, error: res.error || "Invalid credentials." };
      }
      const u: User = {
        id: String(res.user.id),
        username: res.user.username,
        displayName: res.user.displayName,
        password: "",
      };
      setCurrentUser(u);
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(u.id));
      return { ok: true };
    },
    [],
  );

  const signup = useCallback<StoreValue["signup"]>(
    async ({ username, displayName, password }) => {
      const res = await authApi.signup({ username, displayName, password });
      if (!res.ok || !res.user) {
        return { ok: false, error: res.error || "Unable to create account." };
      }
      // Automatically log the user in upon successful registration
      const loginRes = await authApi.login(username, password);
      if (loginRes.ok && loginRes.user) {
        const u: User = {
          id: String(loginRes.user.id),
          username: loginRes.user.username,
          displayName: loginRes.user.displayName,
          password: "",
        };
        setCurrentUser(u);
        sessionStorage.setItem(AUTH_KEY, JSON.stringify(u.id));
      }
      return { ok: true };
    },
    [],
  );

  const logout = useCallback(() => {
    authApi.logout();
    setCurrentUser(null);
    sessionStorage.removeItem(AUTH_KEY);
  }, []);

  const checkName = useCallback<StoreValue["checkName"]>(
    async (name) => {
      return await authApi.checkDisplayName(name);
    },
    [],
  );

  const movieById = useCallback(
    (id: string) => movies.find((m) => m.id === id),
    [movies],
  );

  const entryFor = useCallback(
    (userId: string, movieId: string) =>
      entries.find((e) => e.userId === userId && e.movieId === movieId),
    [entries],
  );

  const entriesFor = useCallback(
    (userId: string, status: Status) =>
      entries.filter((e) => e.userId === userId && e.status === status),
    [entries],
  );

  const friendsOf = useCallback(
    (userId: string) => {
      const ids = new Set<string>();
      for (const f of friendships) {
        if (f.a === userId) ids.add(f.b);
        if (f.b === userId) ids.add(f.a);
      }
      return users.filter((u) => ids.has(u.id));
    },
    [friendships, users],
  );

  const friendRatings = useCallback<StoreValue["friendRatings"]>(
    (movieId) => {
      if (!currentUser) return [];
      const friendIds = new Set(friendsOf(currentUser.id).map((u) => u.id));
      return entries
        .filter(
          (e) =>
            e.movieId === movieId &&
            friendIds.has(e.userId) &&
            e.status === "watched" &&
            e.rating != null,
        )
        .map((e) => ({
          user: users.find((u) => u.id === e.userId)!,
          rating: e.rating as number,
        }));
    },
    [currentUser, entries, friendsOf, users],
  );

  const stats = useCallback<StoreValue["stats"]>(
    (userId, status = "watched") => {
      const rows = entries.filter(
        (e) => e.userId === userId && e.status === status,
      );
      const rated = rows.filter((e) => e.rating != null);
      const avg =
        rated.length > 0
          ? rated.reduce((s, e) => s + (e.rating as number), 0) / rated.length
          : null;
      return { count: rows.length, avg };
    },
    [entries],
  );

  const searchMovies = useCallback<StoreValue["searchMovies"]>((q) => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return searchCatalog
      .filter((m) => m.title.toLowerCase().includes(query))
      .slice(0, 8);
  }, []);

  const addMovie = useCallback<StoreValue["addMovie"]>(
    (input) => {
      if (!currentUser) return "";
      let movieId = input.existingMovieId;
      if (!movieId) {
        // Reuse a catalog movie if the title/year matches, else create one.
        const match = movies.find(
          (m) =>
            m.title.toLowerCase() === input.title.trim().toLowerCase() &&
            (!input.year || m.year === input.year),
        );
        if (match) {
          movieId = match.id;
        } else {
          const m: Movie = {
            id: freshId("m"),
            title: input.title.trim(),
            year: input.year ?? new Date().getFullYear(),
            posterSeed: null,
            posterUrl: input.posterUrl ?? null,
            imdb: input.imdb ?? null,
            rt: input.rt ?? null,
            overview: input.overview ?? "",
          };
          setMovies((prev) => [...prev, m]);
          movieId = m.id;
        }
      }
      const existing = entries.find(
        (e) => e.userId === currentUser.id && e.movieId === movieId,
      );
      const entry: Entry = {
        id: existing?.id ?? freshId("e"),
        userId: currentUser.id,
        movieId: movieId!,
        status: input.status,
        rating: input.status === "watched" ? input.rating ?? null : null,
        description: input.description ?? "",
        addedAt: new Date().toISOString(),
      };
      setEntries((prev) =>
        existing
          ? prev.map((e) => (e.id === existing.id ? entry : e))
          : [...prev, entry],
      );
      return movieId!;
    },
    [currentUser, entries, movies],
  );

  const markWatched = useCallback<StoreValue["markWatched"]>(
    (entryId, rating, description) => {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, status: "watched", rating, description }
            : e,
        ),
      );
    },
    [],
  );

  const updateDescription = useCallback<StoreValue["updateDescription"]>(
    (entryId, description) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, description } : e)),
      );
    },
    [],
  );

  const removeEntry = useCallback<StoreValue["removeEntry"]>((entryId) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }, []);

  const addToWatchlist = useCallback<StoreValue["addToWatchlist"]>(
    (movieId) => {
      if (!currentUser) return;
      if (entries.some((e) => e.userId === currentUser.id && e.movieId === movieId))
        return;
      setEntries((prev) => [
        ...prev,
        {
          id: freshId("e"),
          userId: currentUser.id,
          movieId,
          status: "watchlist",
          rating: null,
          description: "",
          addedAt: new Date().toISOString(),
        },
      ]);
    },
    [currentUser, entries],
  );

  const addFriend = useCallback<StoreValue["addFriend"]>(
    (userId) => {
      if (!currentUser || userId === currentUser.id) return;
      const key = pairKey(currentUser.id, userId);
      if (friendships.some((f) => pairKey(f.a, f.b) === key)) return;
      setFriendships((prev) => [...prev, { a: currentUser.id, b: userId }]);
    },
    [currentUser, friendships],
  );

  const removeFriend = useCallback<StoreValue["removeFriend"]>(
    (friendId) => {
      if (!currentUser) return;
      setFriendships((prev) =>
        prev.filter((f) => {
          const key = pairKey(f.a, f.b);
          const targetKey = pairKey(currentUser.id, friendId);
          return key !== targetKey;
        }),
      );
    },
    [currentUser],
  );

  const changePassword = useCallback<StoreValue["changePassword"]>(
    (oldPw, newPw) => {
      if (!currentUser) return { ok: false, error: "Not logged in." };
      if (currentUser.password !== oldPw) {
        return { ok: false, error: "Current password is incorrect." };
      }
      if (!newPw || newPw.length < 3) {
        return { ok: false, error: "New password must be at least 3 characters." };
      }
      const updated = { ...currentUser, password: newPw };
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? updated : u)));
      setCurrentUser(updated);
      return { ok: true };
    },
    [currentUser],
  );

  const changeDisplayName = useCallback<StoreValue["changeDisplayName"]>(
    (newName) => {
      if (!currentUser) return { ok: false, error: "Not logged in." };
      const dn = newName.trim();
      if (!dn) return { ok: false, error: "Display name can't be empty." };
      if (users.some((x) => x.id !== currentUser.id && x.displayName.toLowerCase() === dn.toLowerCase())) {
        return { ok: false, error: "That name's already in use." };
      }
      const updated = { ...currentUser, displayName: dn };
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? updated : u)));
      setCurrentUser(updated);
      return { ok: true };
    },
    [currentUser, users],
  );

  const allEntries = useCallback(() => entries, [entries]);

  const value = useMemo<StoreValue>(
    () => ({
      currentUser,
      users,
      movies,
      login,
      signup,
      logout,
      checkName,
      movieById,
      entryFor,
      entriesFor,
      friendsOf,
      friendRatings,
      stats,
      searchMovies,
      addMovie,
      markWatched,
      updateDescription,
      removeEntry,
      addToWatchlist,
      addFriend,
      removeFriend,
      changePassword,
      changeDisplayName,
      allEntries,
    }),
    [
      currentUser,
      users,
      movies,
      login,
      signup,
      logout,
      checkName,
      movieById,
      entryFor,
      entriesFor,
      friendsOf,
      friendRatings,
      stats,
      searchMovies,
      addMovie,
      markWatched,
      updateDescription,
      removeEntry,
      addToWatchlist,
      addFriend,
      removeFriend,
      changePassword,
      changeDisplayName,
      allEntries,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within MovieStoreProvider");
  return ctx;
}
