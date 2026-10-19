import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { authApi } from "../api/auth";
import { moviesApi, type ApiUserMovieEntryResponse } from "../api/movies";
import { friendsApi, type ApiFriendProfile } from "../api/friends";
import { listsApi } from "../api/lists";
import {
  freshId,
  searchCatalog,
  type Entry,
  type Friendship,
  type CustomList,
  type Movie,
  type Status,
  type MediaType,
  type User,
} from "./data";

const AUTH_KEY = "movienight.currentUser";
const CUSTOM_LISTS_KEY = "movienight.customLists";

export type FriendRating = { user: User; rating: number };
export type Stats = { count: number; avg: number | null };

export type AddMovieInput = {
  tmdbId?: number;
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
  mediaType?: MediaType;
  seasonsCount?: number;
  episodesCount?: number;
};

type StoreValue = {
  currentUser: User | null;
  users: User[];
  movies: Movie[];

  // auth
  login: (emailOrUser: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (u: {
    email: string;
    username: string;
    displayName?: string;
    password: string;
    confirmPassword?: string;
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

  // custom lists
  customLists: CustomList[];
  listsFor: (userId: string) => CustomList[];
  listById: (listId: string) => CustomList | undefined;
  createList: (title: string, initialMovieId?: string) => CustomList;
  deleteList: (listId: string) => void;
  toggleMovieInList: (listId: string, movieId: string) => void;
  isMovieInList: (listId: string, movieId: string) => boolean;
  listsContainingMovie: (userId: string, movieId: string) => CustomList[];

  // mutations
  addMovie: (input: AddMovieInput) => string; // returns movie id
  markWatched: (entryId: string, rating: number, description: string) => void;
  updateDescription: (entryId: string, description: string) => void;
  removeEntry: (entryId: string) => void;
  addToWatchlist: (movieId: string, movieObj?: Movie, notes?: string) => Promise<{ ok: boolean; error?: string; status?: Status }>;
  isWatchlistSaving: (movieId: string) => boolean;
  libraryLoading: boolean;
  libraryError: string | null;
  removeFromWatchlist: (movieId: string) => void;
  addFriend: (userId: string) => void;
  removeFriend: (friendId: string) => void;
  changePassword: (oldPw: string, newPw: string) => Promise<{ ok: boolean; error?: string }>;
  changeDisplayName: (newName: string) => Promise<{ ok: boolean; error?: string }>;

  // selectors for suggestions
  allEntries: () => Entry[];
  refreshLibrary: () => Promise<void>;
  upsertMovie: (movie: Movie) => void;
};

const StoreContext = createContext<StoreValue | null>(null);

function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

function fromLibraryResponse(item: ApiUserMovieEntryResponse, userId: string) {
  const m = item.movie;
  const movieId = String(m.tmdbId ?? m.id);
  const mediaType = (m.mediaType as MediaType) ?? "MOVIE";
  const movie: Movie = {
    id: movieId,
    tmdbId: m.tmdbId,
    title: m.title,
    year: m.releaseYear ?? new Date().getFullYear(),
    posterSeed: null,
    posterUrl: m.posterUrl ?? null,
    imdb: m.imdbRating ?? null,
    rt: m.rottenTomatoesRating ?? null,
    overview: m.overview ?? "",
    genres: m.genres?.split(",").map((g) => g.trim()) ?? [],
    director: m.director,
    trailerKey: m.trailerKey,
    mediaType,
    seasonsCount: m.seasonsCount,
    episodesCount: m.episodesCount,
  };
  const entry: Entry = {
    id: String(item.id),
    userId,
    movieId,
    status: item.status === "WATCHED" ? "watched" : "watchlist",
    rating: item.personalRating ?? null,
    description: item.notes ?? "",
    addedAt: item.createdAt ?? new Date().toISOString(),
    mediaType,
  };
  return { movie, entry };
}

export function MovieStoreProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);

  const [customLists, setCustomLists] = useState<CustomList[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_LISTS_KEY);
      if (raw) {
        return JSON.parse(raw) as CustomList[];
      }
    } catch {
      /* ignore */
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_LISTS_KEY, JSON.stringify(customLists));
    } catch {
      /* ignore */
    }
  }, [customLists]);

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const stored = sessionStorage.getItem("movienight_current_user") || localStorage.getItem("movienight_current_user");
      if (stored) {
        const u = JSON.parse(stored) as User;
        if (u.id === "u1" || u.username === "you") {
          sessionStorage.removeItem("movienight_current_user");
          localStorage.removeItem("movienight_current_user");
          sessionStorage.removeItem(AUTH_KEY);
          return null;
        }
        return u;
      }
      const raw = sessionStorage.getItem(AUTH_KEY);
      if (raw && (raw === "u1" || raw === '"u1"')) {
        sessionStorage.removeItem(AUTH_KEY);
        return null;
      }
    } catch {
      /* ignore */
    }
    return null;
  });

  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [pendingWatchlist, setPendingWatchlist] = useState<Set<string>>(new Set());
  const watchlistRequests = useRef(new Map<string, ReturnType<StoreValue["addToWatchlist"]>>());
  const libraryRevision = useRef(0);
  const authGeneration = useRef(0);
  const refreshSequence = useRef(0);
  const activeUser = useRef(currentUser?.id);
  activeUser.current = currentUser?.id;

  const isWatchlistSaving = useCallback((movieId: string) => {
    const movie = movies.find((m) => m.id === movieId || String(m.tmdbId) === movieId);
    return pendingWatchlist.has(`${authGeneration.current}:${currentUser?.id}:${movie?.tmdbId ?? movieId}`);
  }, [currentUser, movies, pendingWatchlist]);

  /**
   * Sync library and friends data from Spring Boot backend.
   */
  const refreshLibrary = useCallback(async () => {
    const token = authApi.getToken();
    if (!currentUser) return;
    if (!token) {
      setLibraryError("Sign in again to load your library.");
      setLibraryLoading(false);
      return;
    }

    const userId = String(currentUser.id);
    const sequence = ++refreshSequence.current;
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      let backendEntries: ApiUserMovieEntryResponse[];
      // Retry a read that overlapped a confirmed save so the whole library is
      // recovered, without letting an older snapshot erase the saved entry.
      while (true) {
        const revision = libraryRevision.current;
        backendEntries = await moviesApi.getLibrary();
        if (activeUser.current !== userId || sequence !== refreshSequence.current) return;
        if (revision === libraryRevision.current) break;
      }
      const loaded = backendEntries
        .filter((item) => item.status === "WATCHLIST" || item.status === "WATCHED")
        .map((item) => fromLibraryResponse(item, userId));
      setMovies((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const { movie } of loaded) map.set(movie.id, movie);
        return Array.from(map.values());
      });
      setEntries((prev) => [
        ...prev.filter((e) => String(e.userId) !== userId),
        ...loaded.map(({ entry }) => entry),
      ]);
    } catch (err) {
      if (activeUser.current === userId && sequence === refreshSequence.current) {
        setLibraryError(err instanceof Error ? err.message : "Could not load your library. Please try again.");
      }
    } finally {
      if (activeUser.current === userId && sequence === refreshSequence.current) setLibraryLoading(false);
    }

    if (activeUser.current !== userId || sequence !== refreshSequence.current) return;
    try {
      // 2. Fetch user's friends list
      const backendFriends: ApiFriendProfile[] = await friendsApi.getFriends();
      if (backendFriends && backendFriends.length > 0) {
        const newFriends: User[] = backendFriends.map((f) => ({
          id: String(f.id),
          username: f.username,
          displayName: f.displayName,
          password: "",
        }));

        setUsers((prev) => {
          const map = new Map(prev.map((u) => [u.id, u]));
          for (const u of newFriends) {
            map.set(u.id, u);
          }
          return Array.from(map.values());
        });

        const newFriendships: Friendship[] = backendFriends.map((f) => ({
          a: String(currentUser.id),
          b: String(f.id),
        }));

        setFriendships((prev) => {
          const map = new Map(prev.map((f) => [pairKey(f.a, f.b), f]));
          for (const f of newFriendships) {
            map.set(pairKey(f.a, f.b), f);
          }
          return Array.from(map.values());
        });
      }

      // 3. Fetch user's custom lists
      const backendLists = await listsApi.getUserLists();
      if (backendLists && backendLists.length > 0) {
        const fullLists = await Promise.all(
          backendLists.map((bl) => listsApi.getListById(bl.id))
        );
        const validLists = fullLists.filter((l): l is NonNullable<typeof l> => l != null);
        if (validLists.length > 0) {
          setCustomLists((prev) => {
            const mapped: CustomList[] = validLists.map((vl) => ({
              id: String(vl.id),
              userId: String(vl.userId),
              title: vl.title,
              movieIds: vl.entries.map((e) => String(e.movie.id || e.movie.tmdbId)),
              createdAt: vl.createdAt,
            }));
            const mappedIds = new Set(mapped.map((m) => m.id));
            const retained = prev.filter((p) => !mappedIds.has(p.id));
            return [...mapped, ...retained];
          });
        }
      }
    } catch (err) {
      console.warn("Failed to sync library and friends with backend:", err);
    }
  }, [currentUser]);

  // Sync library on login / user change
  useEffect(() => {
    if (currentUser) {
      refreshLibrary();
    }
  }, [currentUser, refreshLibrary]);

  const login = useCallback<StoreValue["login"]>(
    async (emailOrUser, password) => {
      const res = await authApi.login(emailOrUser, password);
      if (!res.ok || !res.user) {
        return { ok: false, error: res.error || "Invalid credentials." };
      }
      const u: User = {
        id: String(res.user.id),
        username: res.user.username,
        displayName: res.user.displayName,
        email: res.user.email,
        password: "",
      };
      authGeneration.current += 1;
      refreshSequence.current += 1;
      activeUser.current = u.id;
      libraryRevision.current += 1;
      setEntries([]);
      setCurrentUser(u);
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(u.id));
      sessionStorage.setItem("movienight_current_user", JSON.stringify(u));
      localStorage.setItem("movienight_current_user", JSON.stringify(u));
      return { ok: true };
    },
    [],
  );

  const signup = useCallback<StoreValue["signup"]>(
    async ({ email, username, displayName, password, confirmPassword }) => {
      const res = await authApi.signup({
        email,
        username,
        displayName: displayName || username,
        password,
        confirmPassword: confirmPassword || password,
      });
      if (!res.ok || !res.user) {
        return { ok: false, error: res.error || "Unable to create account." };
      }
      const loginRes = await authApi.login(email, password);
      if (loginRes.ok && loginRes.user) {
        const u: User = {
          id: String(loginRes.user.id),
          username: loginRes.user.username,
          displayName: loginRes.user.displayName,
          email: loginRes.user.email,
          password: "",
        };
        authGeneration.current += 1;
        refreshSequence.current += 1;
        activeUser.current = u.id;
        libraryRevision.current += 1;
        setEntries([]);
        setCurrentUser(u);
        sessionStorage.setItem(AUTH_KEY, JSON.stringify(u.id));
        sessionStorage.setItem("movienight_current_user", JSON.stringify(u));
      }
      return { ok: true };
    },
    [],
  );

  const logout = useCallback(() => {
    authApi.logout();
    authGeneration.current += 1;
    activeUser.current = undefined;
    libraryRevision.current += 1;
    refreshSequence.current += 1;
    setEntries([]);
    setLibraryError(null);
    setCurrentUser(null);
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem("movienight_current_user");
    localStorage.removeItem("movienight_current_user");
  }, []);

  const checkName = useCallback<StoreValue["checkName"]>(
    async (name) => {
      return await authApi.checkDisplayName(name);
    },
    [],
  );

  const upsertMovie = useCallback((movie: Movie) => {
    if (!movie || !movie.id) return;
    setMovies((prev) => {
      const idx = prev.findIndex(
        (m) =>
          m.id === movie.id ||
          (movie.tmdbId != null && m.tmdbId === movie.tmdbId) ||
          (m.title.toLowerCase() === movie.title.toLowerCase() && m.year === movie.year),
      );
      if (idx >= 0) {
        if (prev[idx] === movie) return prev;
        const next = [...prev];
        next[idx] = { ...prev[idx], ...movie };
        return next;
      }
      return [...prev, movie];
    });
  }, []);

  const movieById = useCallback(
    (id: string) => movies.find((m) => m.id === id || String(m.tmdbId) === id || (m.id && String(m.id) === id)),
    [movies],
  );

  const isPrimaryUser = useCallback(
    (userId: string) =>
      Boolean(currentUser && userId === currentUser.id),
    [currentUser],
  );

  const entryFor = useCallback(
    (userId: string, movieId: string) => {
      const targetMovie = movies.find(
        (m) =>
          m.id === movieId ||
          (m.tmdbId != null && String(m.tmdbId) === movieId) ||
          (m.tmdbId != null && !isNaN(Number(movieId)) && m.tmdbId === Number(movieId)),
      );
      return entries.find((e) => {
        if (String(e.userId) !== String(userId)) return false;
        if (e.movieId === movieId) return true;
        if (targetMovie) {
          if (e.movieId === targetMovie.id) return true;
          if (targetMovie.tmdbId != null && e.movieId === String(targetMovie.tmdbId)) return true;
        }
        return false;
      });
    },
    [entries, movies],
  );

  const entriesFor = useCallback(
    (userId: string, status: Status) => {
      return entries.filter(
        (e) => String(e.userId) === String(userId) && e.status === status,
      );
    },
    [entries],
  );

  const friendsOf = useCallback(
    (userId: string) => {
      const ids = new Set<string>();
      for (const f of friendships) {
        if (f.a === userId) ids.add(f.b);
        if (f.b === userId) ids.add(f.a);
      }
      return users.filter((u) => ids.has(u.id) && u.id !== userId);
    },
    [friendships, users],
  );

  const friendRatings = useCallback<StoreValue["friendRatings"]>(
    (movieId) => {
      if (!currentUser) return [];
      const targetMovie = movies.find(
        (m) =>
          m.id === movieId ||
          (m.tmdbId != null && String(m.tmdbId) === movieId) ||
          (m.tmdbId != null && !isNaN(Number(movieId)) && m.tmdbId === Number(movieId)),
      );
      const friendIds = new Set(friendsOf(currentUser.id).map((u) => String(u.id)));
      return entries
        .filter(
          (e) =>
            (e.movieId === movieId ||
              (targetMovie && (e.movieId === targetMovie.id || (targetMovie.tmdbId != null && e.movieId === String(targetMovie.tmdbId))))) &&
            friendIds.has(String(e.userId)) &&
            e.status === "watched" &&
            e.rating != null,
        )
        .map((e) => ({
          user: users.find((u) => String(u.id) === String(e.userId))!,
          rating: e.rating as number,
        }))
        .filter((r) => r.user != null);
    },
    [currentUser, entries, friendsOf, users, movies],
  );

  const stats = useCallback<StoreValue["stats"]>(
    (userId, status = "watched") => {
      const rows = entries.filter(
        (e) => String(e.userId) === String(userId) && e.status === status,
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
      const targetTmdbId = input.tmdbId;
      let targetId = input.existingMovieId || (targetTmdbId ? String(targetTmdbId) : undefined);

      let found = movies.find(
        (m) =>
          (targetId && m.id === targetId) ||
          (targetTmdbId && m.tmdbId === targetTmdbId) ||
          (m.title.toLowerCase() === input.title.trim().toLowerCase() &&
            (!input.year || m.year === input.year)),
      );

      const resolvedId = found?.id || targetId || (targetTmdbId ? String(targetTmdbId) : freshId("m"));

      const movieToSave: Movie = {
        id: resolvedId,
        tmdbId: targetTmdbId ?? found?.tmdbId,
        title: input.title.trim(),
        year: input.year ?? found?.year ?? new Date().getFullYear(),
        posterSeed: found?.posterSeed ?? null,
        posterUrl: input.posterUrl ?? found?.posterUrl ?? null,
        imdb: input.imdb ?? found?.imdb ?? null,
        rt: input.rt ?? found?.rt ?? null,
        overview: input.overview ?? found?.overview ?? "",
        mediaType: input.mediaType || found?.mediaType || "MOVIE",
        seasonsCount: input.seasonsCount ?? found?.seasonsCount,
        episodesCount: input.episodesCount ?? found?.episodesCount,
      };

      setMovies((prev) => {
        const idx = prev.findIndex(
          (m) => m.id === resolvedId || (targetTmdbId && m.tmdbId === targetTmdbId),
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...prev[idx], ...movieToSave };
          return next;
        }
        return [...prev, movieToSave];
      });

      const existing = entries.find(
        (e) =>
          e.userId === currentUser.id &&
          (e.movieId === resolvedId || (targetTmdbId && e.movieId === String(targetTmdbId))),
      );

      const entry: Entry = {
        id: existing?.id ?? freshId("e"),
        userId: currentUser.id,
        movieId: resolvedId,
        status: input.status,
        rating: input.status === "watched" ? input.rating ?? null : null,
        description: input.description ?? "",
        addedAt: new Date().toISOString(),
        mediaType: input.mediaType || found?.mediaType || "MOVIE",
      };

      setEntries((prev) =>
        existing
          ? prev.map((e) => (e.id === existing.id ? entry : e))
          : [...prev, entry],
      );

      // Async backend call
      moviesApi
        .addMovie({
          tmdbId: input.tmdbId,
          title: input.title.trim(),
          releaseYear: input.year,
          posterUrl: input.posterUrl ?? undefined,
          overview: input.overview,
          imdbRating: input.imdb ?? undefined,
          rottenTomatoesRating: input.rt ?? undefined,
          mediaType: input.mediaType,
          seasonsCount: input.seasonsCount,
          episodesCount: input.episodesCount,
          status: input.status === "watched" ? "WATCHED" : "WATCHLIST",
          personalRating: input.rating ? Math.round(input.rating) : undefined,
          notes: input.description,
        })
        .then((res) => {
          if (res) refreshLibrary();
        })
        .catch((err) => console.warn("Background movie save error:", err));

      return resolvedId;
    },
    [currentUser, entries, movies, refreshLibrary],
  );

  const markWatched = useCallback<StoreValue["markWatched"]>(
    (entryId, rating, description) => {
      setEntries((prev) => {
        const entry = prev.find((e) => e.id === entryId);
        if (entry) {
          moviesApi.updateEntry(entry.movieId, {
            status: "WATCHED",
            personalRating: Math.round(rating),
            notes: description,
          }).then(() => refreshLibrary()).catch((err) => console.warn("Update entry error:", err));
        }
        return prev.map((e) =>
          e.id === entryId
            ? { ...e, status: "watched", rating, description }
            : e,
        );
      });
    },
    [refreshLibrary],
  );

  const updateDescription = useCallback<StoreValue["updateDescription"]>(
    (entryId, description) => {
      setEntries((prev) => {
        const entry = prev.find((e) => e.id === entryId);
        if (entry) {
          moviesApi.updateEntry(entry.movieId, {
            notes: description,
          }).then(() => refreshLibrary()).catch((err) => console.warn("Update note error:", err));
        }
        return prev.map((e) => (e.id === entryId ? { ...e, description } : e));
      });
    },
    [refreshLibrary],
  );

  const removeEntry = useCallback<StoreValue["removeEntry"]>((entryId) => {
    setEntries((prev) => {
      const entry = prev.find((e) => e.id === entryId);
      if (entry) {
        moviesApi.removeMovie(entry.movieId).then(() => refreshLibrary()).catch((err) => console.warn("Remove movie error:", err));
      }
      return prev.filter((e) => e.id !== entryId);
    });
  }, [refreshLibrary]);

  const addToWatchlist = useCallback<StoreValue["addToWatchlist"]>(
    (movieId, movieObj, notes) => {
      if (!currentUser || !authApi.getToken()) {
        return Promise.resolve({ ok: false, error: "Sign in to save to your watchlist." });
      }
      const userId = String(currentUser.id);
      const targetMovie = movieObj || movies.find((m) => m.id === movieId || String(m.tmdbId) === movieId);
      if (!targetMovie) {
        return Promise.resolve({ ok: false, error: "Could not find this title. Reopen its details and try again." });
      }
      const tmdbId = targetMovie.tmdbId;
      const generation = authGeneration.current;
      const key = `${generation}:${userId}:${tmdbId ?? movieId}`;
      const inFlight = watchlistRequests.current.get(key);
      if (inFlight) return inFlight;
      setPendingWatchlist((prev) => new Set(prev).add(key));
      const request = (async () => {
        try {
          const response = await moviesApi.saveWatchlist({
            tmdbId,
            title: targetMovie.title,
            releaseYear: targetMovie.year,
            posterUrl: targetMovie.posterUrl ?? undefined,
            overview: targetMovie.overview,
            imdbRating: targetMovie.imdb ?? undefined,
            rottenTomatoesRating: targetMovie.rt ?? undefined,
            mediaType: targetMovie.mediaType || "MOVIE",
            seasonsCount: targetMovie.seasonsCount,
            episodesCount: targetMovie.episodesCount,
            status: "WATCHLIST",
            notes,
          });
          if (activeUser.current !== userId || authGeneration.current !== generation) {
            return { ok: false, error: "Your account changed. Reload your library to check the save." };
          }
          const { movie, entry } = fromLibraryResponse(response, userId);
          libraryRevision.current += 1;
          setMovies((prev) => [...prev.filter((m) => m.id !== movie.id && m.id !== targetMovie.id), movie]);
          setEntries((prev) => [...prev.filter((e) => String(e.userId) !== userId ||
            (e.movieId !== movie.id && e.movieId !== targetMovie.id)), entry]);
          return { ok: true, status: entry.status };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : "Could not confirm the save. Please try again." };
        } finally {
          watchlistRequests.current.delete(key);
          setPendingWatchlist((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      })();
      watchlistRequests.current.set(key, request);
      return request;
    },
    [currentUser, movies],
  );

  const removeFromWatchlist = useCallback<StoreValue["removeFromWatchlist"]>(
    (movieId) => {
      if (!currentUser) return;
      const targetMovie = movies.find(
        (m) =>
          m.id === movieId ||
          (m.tmdbId != null && String(m.tmdbId) === movieId),
      );
      setEntries((prev) => {
        const entry = prev.find(
          (e) =>
            e.userId === currentUser.id &&
            e.status === "watchlist" &&
            (e.movieId === movieId ||
              (targetMovie && (e.movieId === targetMovie.id || (targetMovie.tmdbId != null && e.movieId === String(targetMovie.tmdbId))))),
        );
        if (entry) {
          moviesApi.removeMovie(entry.movieId).then(() => refreshLibrary()).catch((err) => console.warn("Remove error:", err));
        }
        return prev.filter(
          (e) =>
            !(
              e.userId === currentUser.id &&
              e.status === "watchlist" &&
              (e.movieId === movieId ||
                (targetMovie && (e.movieId === targetMovie.id || (targetMovie.tmdbId != null && e.movieId === String(targetMovie.tmdbId)))))
            ),
        );
      });
    },
    [currentUser, movies, refreshLibrary],
  );

  const addFriend = useCallback<StoreValue["addFriend"]>(
    (userIdOrIdentifier) => {
      if (!currentUser || userIdOrIdentifier === currentUser.id) return;
      
      // Call backend
      friendsApi.addFriend(userIdOrIdentifier).then((res) => {
        if (res.ok && res.friend) {
          const newFriend: User = {
            id: String(res.friend.id),
            username: res.friend.username,
            displayName: res.friend.displayName,
            password: "",
          };
          setUsers((prev) => [...prev.filter((u) => u.id !== newFriend.id), newFriend]);
          setFriendships((prev) => [
            ...prev.filter((f) => pairKey(f.a, f.b) !== pairKey(currentUser.id, newFriend.id)),
            { a: currentUser.id, b: newFriend.id },
          ]);
        }
      }).catch((err) => console.warn("Could not add friend on backend:", err));

      const key = pairKey(currentUser.id, userIdOrIdentifier);
      if (friendships.some((f) => pairKey(f.a, f.b) === key)) return;
      setFriendships((prev) => [...prev, { a: currentUser.id, b: userIdOrIdentifier }]);
    },
    [currentUser, friendships],
  );

  const removeFriend = useCallback<StoreValue["removeFriend"]>(
    (friendId) => {
      if (!currentUser) return;
      friendsApi.removeFriend(friendId).catch((err) => console.warn("Could not remove friend on backend:", err));
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
    async (oldPw, newPw) => {
      if (!currentUser) return { ok: false, error: "Not logged in." };
      if (!oldPw) return { ok: false, error: "Current password is required." };
      if (!newPw || newPw.length < 6) {
        return { ok: false, error: "New password must be at least 6 characters." };
      }

      const res = await authApi.changePassword(oldPw, newPw);
      if (!res.ok) {
        return { ok: false, error: res.error || "Could not change password." };
      }

      return { ok: true };
    },
    [currentUser],
  );

  const changeDisplayName = useCallback<StoreValue["changeDisplayName"]>(
    async (newName) => {
      if (!currentUser) return { ok: false, error: "Not logged in." };
      const dn = newName.trim();
      if (!dn) return { ok: false, error: "Display name can't be empty." };

      const res = await authApi.updateDisplayName(dn);
      if (!res.ok) {
        return { ok: false, error: res.error || "Could not update display name." };
      }

      const updated = { ...currentUser, displayName: dn };
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? updated : u)));
      setCurrentUser(updated);
      return { ok: true };
    },
    [currentUser],
  );

  const allEntries = useCallback(() => entries, [entries]);

  const listsFor = useCallback(
    (userId: string) => customLists.filter((l) => l.userId === userId),
    [customLists]
  );

  const listById = useCallback(
    (listId: string) => customLists.find((l) => l.id === listId),
    [customLists]
  );

  const createList = useCallback(
    (title: string, initialMovieId?: string) => {
      if (!currentUser) throw new Error("Must be logged in to create a list");
      const localId = freshId("list-");
      const newList: CustomList = {
        id: localId,
        userId: currentUser.id,
        title: title.trim() || "Untitled List",
        movieIds: initialMovieId ? [initialMovieId] : [],
        createdAt: new Date().toISOString(),
      };
      setCustomLists((prev) => [newList, ...prev]);

      // Sync with backend API
      const numMovieId = initialMovieId && !isNaN(Number(initialMovieId)) ? [Number(initialMovieId)] : [];
      listsApi.createList({
        title: newList.title,
        isPublic: false,
        initialMovieIds: numMovieId,
      }).then((res) => {
        if (res) {
          setCustomLists((prev) =>
            prev.map((l) => (l.id === localId ? { ...l, id: String(res.id) } : l))
          );
        }
      }).catch((err) => console.warn("Failed to persist custom list to backend:", err));

      return newList;
    },
    [currentUser]
  );

  const deleteList = useCallback((listId: string) => {
    setCustomLists((prev) => prev.filter((l) => l.id !== listId));
    if (!isNaN(Number(listId))) {
      listsApi.deleteList(Number(listId)).catch((err) =>
        console.warn("Failed to delete list from backend:", err)
      );
    }
  }, []);

  const toggleMovieInList = useCallback((listId: string, movieId: string) => {
    setCustomLists((prev) =>
      prev.map((l) => {
        if (l.id !== listId) return l;
        const exists = l.movieIds.includes(movieId);
        const updated = {
          ...l,
          movieIds: exists
            ? l.movieIds.filter((id) => id !== movieId)
            : [...l.movieIds, movieId],
        };

        if (!isNaN(Number(listId)) && !isNaN(Number(movieId))) {
          if (exists) {
            listsApi.removeMovieFromList(Number(listId), Number(movieId)).catch(() => {});
          } else {
            listsApi.addMovieToList(Number(listId), Number(movieId)).catch(() => {});
          }
        }
        return updated;
      })
    );
  }, []);

  const isMovieInList = useCallback(
    (listId: string, movieId: string) => {
      const l = customLists.find((c) => c.id === listId);
      return l ? l.movieIds.includes(movieId) : false;
    },
    [customLists]
  );

  const listsContainingMovie = useCallback(
    (userId: string, movieId: string) => {
      return customLists.filter(
        (l) => l.userId === userId && l.movieIds.includes(movieId)
      );
    },
    [customLists]
  );

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
      customLists,
      listsFor,
      listById,
      createList,
      deleteList,
      toggleMovieInList,
      isMovieInList,
      listsContainingMovie,
      addMovie,
      markWatched,
      updateDescription,
      removeEntry,
      addToWatchlist,
      isWatchlistSaving,
      libraryLoading,
      libraryError,
      removeFromWatchlist,
      addFriend,
      removeFriend,
      changePassword,
      changeDisplayName,
      allEntries,
      refreshLibrary,
      upsertMovie,
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
      customLists,
      listsFor,
      listById,
      createList,
      deleteList,
      toggleMovieInList,
      isMovieInList,
      listsContainingMovie,
      addMovie,
      markWatched,
      updateDescription,
      removeEntry,
      addToWatchlist,
      isWatchlistSaving,
      libraryLoading,
      libraryError,
      removeFromWatchlist,
      addFriend,
      removeFriend,
      changePassword,
      changeDisplayName,
      allEntries,
      refreshLibrary,
      upsertMovie,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within MovieStoreProvider");
  return ctx;
}
