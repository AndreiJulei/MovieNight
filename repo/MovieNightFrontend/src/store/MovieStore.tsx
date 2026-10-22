import { titleId, resourceType } from "./titleIdentity";
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
import { moviesApi, type ApiMovieResponse, type ApiUserMovieEntryResponse } from "../api/movies";
import { friendsApi, type ApiFriendProfile, type ApiFriendInvitation } from "../api/friends";
import { listsApi, type ApiCustomListResponse } from "../api/lists";
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

export type FriendRating = { user: User; rating: number };
export type Stats = { count: number; avg: number | null };

export type AddMovieInput = {
  catalogMovieId?: number;
  tmdbId?: number;
  title: string;
  year?: number;
  posterSeed?: number | null;
  posterUrl?: string | null;
  imdb?: number | null;
  rt?: number | null;
  overview?: string;
  status: "watched";
  rating?: number | null;
  description?: string;
  existingMovieId?: string; // when adding a canonical movie you don't own yet
  mediaType?: MediaType;
  seasonsCount?: number;
  episodesCount?: number;
};

type SaveResult = { ok: boolean; error?: string; status?: Status };
type FriendshipResult = SaveResult & { warning?: string };

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
  listsLoading: boolean;
  listsError: string | null;
  listsSaving: boolean;
  refreshLists: () => Promise<void>;
  createList: (title: string, initialMovie?: Movie) => Promise<CustomList>;
  renameList: (listId: string, title: string) => Promise<CustomList>;
  deleteList: (listId: string) => Promise<void>;
  toggleMovieInList: (listId: string, movie: Movie) => Promise<void>;
  isMovieInList: (listId: string, movie: Movie) => boolean;
  listsContainingMovie: (userId: string, movie: Movie) => CustomList[];

  // mutations
  addMovie: (input: AddMovieInput) => Promise<SaveResult>;
  markWatched: (entryId: string, rating: number | null, description?: string) => Promise<SaveResult>;
  updateDescription: (entryId: string, description: string) => Promise<SaveResult>;
  removeEntry: (entryId: string) => Promise<SaveResult>;
  addToWatchlist: (movieId: string, movieObj?: Movie, notes?: string) => Promise<{ ok: boolean; error?: string; status?: Status }>;
  isWatchlistSaving: (movieId: string) => boolean;
  libraryLoading: boolean;
  libraryError: string | null;
  removeFromWatchlist: (movieId: string) => void;
  friendProfiles: ApiFriendProfile[];
  invitations: ApiFriendInvitation[];
  friendsLoading: boolean;
  friendsError: string | null;
  friendsSaving: boolean;
  refreshFriends: () => Promise<boolean>;
  addFriend: (identifier: string) => Promise<FriendshipResult>;
  acceptFriend: (senderId: string) => Promise<FriendshipResult>;
  removeFriend: (friendId: string) => Promise<FriendshipResult>;
  changePassword: (oldPw: string, newPw: string) => Promise<{ ok: boolean; error?: string }>;
  changeDisplayName: (newName: string) => Promise<{ ok: boolean; error?: string }>;

  // selectors for suggestions
  allEntries: () => Entry[];
  refreshLibrary: () => Promise<void>;
  upsertMovie: (movie: Movie) => void;
};

const StoreContext = createContext<StoreValue | null>(null);



// Keep provider identities distinct from catalog-only movies, even when IDs collide.
function listMovieKey(movie: Movie) {
  const resource = movie.tmdbId != null ? `tmdb:${movie.tmdbId}` : `catalog:${movie.catalogMovieId ?? movie.id}`;
  return `${resourceType(movie.mediaType)}:${resource}`;
}

async function resolveListMovie(movie: Movie) {
  if (movie.tmdbId != null) return listsApi.resolveCatalogMovie(movie.tmdbId, resourceType(movie.mediaType));
  if (movie.catalogMovieId) return movie.catalogMovieId;
  throw new Error("Could not resolve this movie's catalog identity. Reload the movie and try again.");
}

function fromCatalogResponse(m: ApiMovieResponse): Movie {
  const movieId = titleId(m.tmdbId, m.mediaType ?? "", m.id);
  const mediaType = (m.mediaType as MediaType) ?? "MOVIE";
  const movie: Movie = {
    id: movieId,
    catalogMovieId: m.id,
    tmdbId: m.tmdbId,
    title: m.title,
    year: m.releaseYear ?? null,
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
  return movie;
}

function fromLibraryResponse(item: ApiUserMovieEntryResponse, userId: string) {
  const m = item.movie;
  const movie = fromCatalogResponse(m);
  const movieId = movie.id;
  const mediaType = movie.mediaType;
  const entry: Entry = {
    id: String(item.id),
    userId,
    movieId,
    catalogMovieId: m.id,
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

  const [customLists, setCustomLists] = useState<CustomList[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [listsError, setListsError] = useState<string | null>(null);
  const [listsSaving, setListsSaving] = useState(false);
  const listWritePending = useRef(false);
  const listRevision = useRef(0);
  const listReadSequence = useRef(0);

  const resetLists = useCallback((loading: boolean) => {
    setCustomLists([]);
    listReadSequence.current += 1;
    listWritePending.current = false;
    setListsSaving(false);
    setListsError(null);
    setListsLoading(loading);
  }, []);

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
  const watchedRequests = useRef(new Map<string, { signature: string; promise: Promise<SaveResult> }>());
  const libraryRevision = useRef(0);
  const authGeneration = useRef(0);
  const refreshSequence = useRef(0);
  const activeUser = useRef(currentUser?.id);
  activeUser.current = currentUser?.id;

  const isWatchlistSaving = useCallback((movieId: string) => {
    return pendingWatchlist.has(`${authGeneration.current}:${currentUser?.id}:${movieId}`);
  }, [currentUser, pendingWatchlist]);

  /**
   * Sync library data from Spring Boot backend.
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
      resetLists(true);
      setCurrentUser(u);
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(u.id));
      sessionStorage.setItem("movienight_current_user", JSON.stringify(u));
      localStorage.setItem("movienight_current_user", JSON.stringify(u));
      return { ok: true };
    },
    [resetLists],
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
        resetLists(true);
        setCurrentUser(u);
        sessionStorage.setItem(AUTH_KEY, JSON.stringify(u.id));
        sessionStorage.setItem("movienight_current_user", JSON.stringify(u));
      }
      return { ok: true };
    },
    [resetLists],
  );

  const logout = useCallback(() => {
    authApi.logout();
    authGeneration.current += 1;
    activeUser.current = undefined;
    libraryRevision.current += 1;
    refreshSequence.current += 1;
    setEntries([]);
    setFriendships([]);
    resetLists(false);
    localStorage.removeItem("movienight.customLists");
    setLibraryError(null);
    setCurrentUser(null);
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem("movienight_current_user");
    localStorage.removeItem("movienight_current_user");
  }, [resetLists]);

  const checkName = useCallback<StoreValue["checkName"]>(
    async (name) => {
      return await authApi.checkDisplayName(name);
    },
    [],
  );

  const upsertMovie = useCallback((movie: Movie) => {
    if (!movie || !movie.id) return;
    setMovies((prev) => {
      const idx = prev.findIndex((m) => m.id === movie.id);
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
    (id: string) => movies.find((m) => m.id === id),
    [movies],
  );

  const isPrimaryUser = useCallback(
    (userId: string) =>
      Boolean(currentUser && userId === currentUser.id),
    [currentUser],
  );

  const entryFor = useCallback(
    (userId: string, movieId: string) => entries.find((e) => String(e.userId) === String(userId) && e.movieId === movieId),
    [entries],
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
      const friendIds = new Set(friendsOf(currentUser.id).map(friend => String(friend.id)));
      return entries
        .filter(
          (e) =>
            e.movieId === movieId &&
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

  // All watched/rating writes apply only the server-confirmed entry.
  const saveWatched = useCallback((target: Movie, rating: number | null,
    notes?: string, catalogMovieId?: number): Promise<SaveResult> => {
    if (!currentUser || !authApi.getToken()) {
      return Promise.resolve({ ok: false, error: "Sign in to save watched history." });
    }
    if (rating != null && (!Number.isFinite(rating) || rating < 0 || rating > 10 || !Number.isInteger(rating * 2))) {
      return Promise.resolve({ ok: false, error: "Choose a rating from 0 to 10 in half-point steps." });
    }
    const userId = String(currentUser.id);
    const generation = authGeneration.current;
    const key = `${generation}:${userId}:${target.id}`;
    const signature = JSON.stringify([rating, notes, catalogMovieId]);
    const pending = watchedRequests.current.get(key);
    if (pending) return pending.signature === signature ? pending.promise
      : Promise.resolve({ ok: false, error: "A save is already pending. Wait and try again." });
    if (watchlistRequests.current.has(key)) {
      return Promise.resolve({ ok: false, error: "A watchlist save is pending. Wait and try again." });
    }
    setPendingWatchlist((prev) => new Set(prev).add(key));
    const promise = (async (): Promise<SaveResult> => {
      try {
        const response = catalogMovieId != null
          ? await moviesApi.saveWatchedRating(catalogMovieId, rating, notes)
          : await moviesApi.addMovie({
              catalogMovieId: target.catalogMovieId, tmdbId: target.tmdbId, title: target.title, releaseYear: target.year ?? undefined,
              posterUrl: target.posterUrl ?? undefined, overview: target.overview,
              imdbRating: target.imdb ?? undefined, rottenTomatoesRating: target.rt ?? undefined,
              mediaType: target.mediaType, seasonsCount: target.seasonsCount,
              episodesCount: target.episodesCount, status: "WATCHED", personalRating: rating, notes,
            });
        if (activeUser.current !== userId || authGeneration.current !== generation) {
          return { ok: false, error: "Your account changed. Reload your library to check the save." };
        }
        const { movie, entry } = fromLibraryResponse(response, userId);
        libraryRevision.current += 1;
        setMovies((prev) => [...prev.filter((m) => m.id !== movie.id && m.id !== target.id), movie]);
        setEntries((prev) => [...prev.filter((e) => String(e.userId) !== userId ||
          (e.movieId !== movie.id && e.movieId !== target.id)), entry]);
        return { ok: true, status: entry.status };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Could not confirm the save. Please try again." };
      } finally {
        watchedRequests.current.delete(key);
        setPendingWatchlist((prev) => { const next = new Set(prev); next.delete(key); return next; });
      }
    })();
    watchedRequests.current.set(key, { signature, promise });
    return promise;
  }, [currentUser]);

  const addMovie = useCallback<StoreValue["addMovie"]>((input) => {
    const movie: Movie = {
      id: input.existingMovieId ?? (input.tmdbId != null ? titleId(input.tmdbId, input.mediaType ?? "MOVIE") : freshId("m")),
      catalogMovieId: input.catalogMovieId,
      tmdbId: input.tmdbId, title: input.title.trim(),
      year: input.year ?? null, posterSeed: input.posterSeed,
      posterUrl: input.posterUrl ?? null, imdb: input.imdb, rt: input.rt,
      overview: input.overview, mediaType: input.mediaType ?? "MOVIE",
      seasonsCount: input.seasonsCount, episodesCount: input.episodesCount,
    };
    return saveWatched(movie, input.rating ?? null, input.description);
  }, [saveWatched]);

  const markWatched = useCallback<StoreValue["markWatched"]>((entryId, rating, description) => {
    const entry = entries.find((e) => e.id === entryId && e.userId === currentUser?.id);
    const movie = entry && movies.find((m) => m.id === entry.movieId);
    if (!entry || !movie || entry.catalogMovieId == null) {
      return Promise.resolve({ ok: false, error: "Reload your library before saving this movie." });
    }
    return saveWatched(movie, rating, description, entry.catalogMovieId);
  }, [currentUser, entries, movies, saveWatched]);

  const entryMutations = useRef(new Set<string>());
  const updateDescription = useCallback<StoreValue["updateDescription"]>(async (entryId, description) => {
    const entry = entries.find(e => e.id === entryId && e.userId === currentUser?.id);
    if (!entry?.catalogMovieId) return { ok: false, error: "Reload the entry before saving notes." };
    if (entryMutations.current.has(entryId)) return { ok: false, error: "An entry save is pending. Retry afterward." };
    entryMutations.current.add(entryId);
    const generation = authGeneration.current;
    try {
      const response = await moviesApi.updateEntry(entry.catalogMovieId, { notes: description });
      if (generation !== authGeneration.current) return { ok: false, error: "Your account changed. Reload your library." };
      if (!response || response.notes !== description) throw new Error("Could not confirm notes. Retry.");
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, description } : e));
      return { ok: true };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not save notes. Retry." }; }
    finally { entryMutations.current.delete(entryId); }
  }, [entries, currentUser]);

  const removeEntry = useCallback<StoreValue["removeEntry"]>(async entryId => {
    const entry = entries.find(e => e.id === entryId && e.userId === currentUser?.id);
    if (!entry?.catalogMovieId) return { ok: false, error: "Reload the entry before removing it." };
    if (entryMutations.current.has(entryId)) return { ok: false, error: "An entry save is pending. Retry afterward." };
    entryMutations.current.add(entryId);
    const generation = authGeneration.current;
    try {
      await moviesApi.removeMovie(entry.catalogMovieId);
      if (generation !== authGeneration.current) return { ok: false, error: "Your account changed. Reload your library." };
      libraryRevision.current += 1;
      setEntries(prev => prev.filter(e => e.id !== entryId));
      return { ok: true };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not remove title. Retry." }; }
    finally { entryMutations.current.delete(entryId); }
  }, [entries, currentUser]);

  const addToWatchlist = useCallback<StoreValue["addToWatchlist"]>(
    (movieId, movieObj, notes) => {
      if (!currentUser || !authApi.getToken()) {
        return Promise.resolve({ ok: false, error: "Sign in to save to your watchlist." });
      }
      const userId = String(currentUser.id);
      const targetMovie = movieObj || movies.find((m) => m.id === movieId);
      if (!targetMovie) {
        return Promise.resolve({ ok: false, error: "Could not find this title. Reopen its details and try again." });
      }
      const tmdbId = targetMovie.tmdbId;
      const generation = authGeneration.current;
      const key = `${generation}:${userId}:${targetMovie.id}`;
      if (watchedRequests.current.has(key)) {
        return Promise.resolve({ ok: false, error: "A watched save is pending. Wait and try again." });
      }
      const inFlight = watchlistRequests.current.get(key);
      if (inFlight) return inFlight;
      setPendingWatchlist((prev) => new Set(prev).add(key));
      const request = (async () => {
        try {
          const response = await moviesApi.saveWatchlist({
            catalogMovieId: targetMovie.catalogMovieId,
            tmdbId,
            title: targetMovie.title,
            releaseYear: targetMovie.year ?? undefined,
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
      const entry = entries.find((e) => e.userId === currentUser.id && e.movieId === movieId && e.status === "watchlist");
      if (entry) removeEntry(entry.id);
    },
    [currentUser, entries, removeEntry],
  );

  const [friendProfiles, setFriendProfiles] = useState<ApiFriendProfile[]>([]);
  const [invitations, setInvitations] = useState<ApiFriendInvitation[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [friendsSaving, setFriendsSaving] = useState(false);
  const friendReadSequence = useRef(0);
  const friendWritePending = useRef(false);

  const refreshFriends = useCallback(async () => {
    const userId = currentUser?.id;
    if (!userId) { setFriendsLoading(false); return false; }
    const generation = authGeneration.current;
    const sequence = ++friendReadSequence.current;
    const active = () => activeUser.current === userId && authGeneration.current === generation && friendReadSequence.current === sequence;
    setFriendsLoading(true);
    setFriendsError(null);
    try {
      const [profiles, pending] = await Promise.all([friendsApi.getFriends(), friendsApi.getInvitations()]);
      if (!Array.isArray(profiles) || !Array.isArray(pending)) throw new Error("Could not read friends. Retry loading.");
      if (!active()) return false;
      setFriendProfiles(profiles);
      setInvitations(pending);
      setUsers((prev) => [...prev.filter((u) => !profiles.some((f) => String(f.id) === u.id)),
        ...profiles.map((f) => ({ id: String(f.id), username: f.username, displayName: f.displayName, password: "" }))]);
      setFriendships(profiles.map((f) => ({ a: userId, b: String(f.id) })));
      return true;
    } catch (error) {
      if (!active()) return false;
      setFriendProfiles([]);
      setInvitations([]);
      setFriendships([]);
      setFriendsError(error instanceof Error ? error.message : "Could not load friends. Retry.");
      return false;
    } finally {
      if (active()) setFriendsLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    setFriendships([]);
    setFriendProfiles([]);
    setInvitations([]);
    setFriendsError(null);
    setFriendsSaving(false);
    friendWritePending.current = false;
    void refreshFriends();
    return () => { friendReadSequence.current += 1; };
  }, [refreshFriends]);

  const writeFriendship = useCallback(async (write: () => Promise<unknown>): Promise<FriendshipResult> => {
    const userId = currentUser?.id;
    if (!userId) return { ok: false, error: "Sign in to manage friends." };
    if (friendWritePending.current) return { ok: false, error: "Wait for the current change to finish." };
    const generation = authGeneration.current;
    const active = () => activeUser.current === userId && authGeneration.current === generation;
    friendWritePending.current = true;
    friendReadSequence.current += 1;
    setFriendsSaving(true);
    try {
      await write();
      if (!active()) return { ok: false, error: "Account changed. Reload friends." };
      // Invalidate reads begun during the mutation, then recover confirmed server state.
      const reloaded = await refreshFriends();
      if (!active()) return { ok: false, error: "Account changed. Reload friends." };
      return reloaded ? { ok: true } : { ok: true, warning: "Change saved, but friends could not reload. Use Reload friends before another action." };
    } catch (error) {
      // The mutation invalidated any pending read. Recover server state even
      // after a failed or uncertain write so loading and retry stay usable.
      if (active()) await refreshFriends();
      if (!active()) return { ok: false, error: "Account changed. Reload friends." };
      return { ok: false, error: error instanceof Error ? error.message : "Could not confirm the change. Retry." };
    } finally {
      if (active()) { friendWritePending.current = false; setFriendsSaving(false); }
    }
  }, [currentUser, refreshFriends]);

  const addFriend = useCallback<StoreValue["addFriend"]>((identifier) =>
    writeFriendship(() => friendsApi.addFriend(identifier)), [writeFriendship]);
  const acceptFriend = useCallback<StoreValue["acceptFriend"]>((id) =>
    writeFriendship(() => friendsApi.acceptFriend(id)), [writeFriendship]);
  const removeFriend = useCallback<StoreValue["removeFriend"]>((id) =>
    writeFriendship(() => friendsApi.removeFriend(id)), [writeFriendship]);

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
    (listId: string) => customLists.find((l) => l.id === listId && l.userId === currentUser?.id),
    [customLists, currentUser]
  );

  const hydrateList = useCallback((response: ApiCustomListResponse): CustomList => {
    const loaded = response.entries.map((entry) => fromCatalogResponse(entry.movie));
    setMovies((prev) => {
      const map = new Map(prev.map((movie) => [movie.id, movie]));
      for (const movie of loaded) map.set(movie.id, movie);
      return Array.from(map.values());
    });
    return {
      id: String(response.id), userId: String(response.userId), title: response.title,
      movieIds: loaded.map((movie) => movie.id),
      catalogMovieIds: Object.fromEntries(response.entries.map((entry, index) => [listMovieKey(loaded[index]), entry.movie.id!])),
      createdAt: response.createdAt,
    };
  }, []);

  const refreshLists = useCallback(async () => {
    if (!currentUser) return;
    const userId = currentUser.id;
    const generation = authGeneration.current;
    const sequence = ++listReadSequence.current;
    const active = () => activeUser.current === userId && authGeneration.current === generation && listReadSequence.current === sequence;
    setListsLoading(true);
    setListsError(null);
    try {
      while (active()) {
        const revision = listRevision.current;
        let responses: ApiCustomListResponse[];
        try {
          const summaries = await listsApi.getUserLists();
          if (!active()) return;
          responses = await Promise.all(summaries.map((list) => listsApi.getListById(list.id)));
        } catch (error) {
          if (active() && revision !== listRevision.current) continue;
          throw error;
        }
        if (!active()) return;
        if (revision !== listRevision.current) continue;
        if (responses.some((list) => String(list.userId) !== userId)) throw new Error("Could not verify ownership of your lists. Sign in again.");
        setCustomLists(responses.map(hydrateList));
        break;
      }
    } catch (error) {
      if (active()) setListsError(error instanceof Error ? error.message : "Could not load your lists. Please try again.");
    } finally {
      if (active()) setListsLoading(false);
    }
  }, [currentUser, hydrateList]);

  useEffect(() => {
    localStorage.removeItem("movienight.customLists");
    if (currentUser) void refreshLists();
  }, [currentUser, refreshLists]);

  const runListWrite = useCallback(async (operation: (assertActive: () => void) => Promise<ApiCustomListResponse | void>, deletedId?: string) => {
    if (!currentUser) throw new Error("Sign in to change your lists.");
    if (listWritePending.current) throw new Error("A list change is still saving. Please wait.");
    const userId = currentUser.id;
    const generation = authGeneration.current;
    const active = () => activeUser.current === userId && authGeneration.current === generation;
    listWritePending.current = true;
    setListsSaving(true);
    try {
      const assertActive = () => {
        if (!active()) throw new Error("Your account changed. Reload your lists before retrying.");
      };
      const response = await operation(assertActive);
      if (!active()) throw new Error("Your account changed. Reload your lists before retrying.");
      if (response && String(response.userId) !== userId) throw new Error("Could not verify list ownership. Reload your lists.");
      listRevision.current += 1;
      const list = response ? hydrateList(response) : undefined;
      setCustomLists((prev) => list
        ? [list, ...prev.filter((existing) => existing.id !== list.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : prev.filter((existing) => existing.id !== deletedId));
      return list;
    } finally {
      if (active()) {
        listWritePending.current = false;
        setListsSaving(false);
      }
    }
  }, [currentUser, hydrateList]);

  const createList = useCallback<StoreValue["createList"]>(async (title, initialMovie) => {
    return (await runListWrite(async (assertActive) => {
      const movieId = initialMovie ? await resolveListMovie(initialMovie) : undefined;
      assertActive();
      return listsApi.createList({ title: title.trim(), initialMovieIds: movieId ? [movieId] : [] });
    }))!;
  }, [runListWrite]);

  const renameList = useCallback<StoreValue["renameList"]>(async (id, title) => {
    return (await runListWrite(() => listsApi.updateList(id, { title: title.trim() })))!;
  }, [runListWrite]);

  const deleteList = useCallback<StoreValue["deleteList"]>(async (id) => {
    await runListWrite(() => listsApi.deleteList(id), id);
  }, [runListWrite]);

  const toggleMovieInList = useCallback<StoreValue["toggleMovieInList"]>(async (id, movie) => {
    const list = customLists.find((list) => list.id === id && list.userId === currentUser?.id);
    if (!list) throw new Error("This list is unavailable. Reload your lists.");
    const identity = listMovieKey(movie);
    const removing = list.catalogMovieIds[identity] != null;
    await runListWrite(async (assertActive) => {
      const catalogId = removing ? list.catalogMovieIds[identity] : await resolveListMovie(movie);
      if (!catalogId) throw new Error("Could not resolve this movie. Reload your lists.");
      assertActive();
      return removing ? listsApi.removeMovieFromList(id, catalogId) : listsApi.addMovieToList(id, catalogId);
    });
  }, [currentUser, customLists, runListWrite]);

  const isMovieInList = useCallback(
    (listId: string, movie: Movie) => {
      const l = customLists.find((c) => c.id === listId);
      return l ? l.catalogMovieIds[listMovieKey(movie)] != null : false;
    },
    [customLists]
  );

  const listsContainingMovie = useCallback(
    (userId: string, movie: Movie) => {
      return customLists.filter(
        (l) => l.userId === userId && l.catalogMovieIds[listMovieKey(movie)] != null
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
      renameList,
      listsLoading,
      listsError,
      listsSaving,
      refreshLists,
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
      friendProfiles, invitations, friendsLoading, friendsError, friendsSaving, refreshFriends,
      addFriend, acceptFriend,
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
      renameList,
      listsLoading,
      listsError,
      listsSaving,
      refreshLists,
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
      friendProfiles, invitations, friendsLoading, friendsError, friendsSaving, refreshFriends,
      addFriend, acceptFriend,
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
