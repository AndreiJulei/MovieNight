/**
 * Read-only offline library (#34): the signed-in user's watched history, watchlist and custom
 * lists as of their last successful online load. Nothing here is ever written back to the server.
 */
import type { CustomList, Entry, Movie, User } from "../store/data";

const SNAPSHOT_VERSION = 1;

export type LibrarySnapshot = {
  version: typeof SNAPSHOT_VERSION;
  userId: string;
  /** Binds the snapshot to the sign-in that saved it; see `sessionKeyFor`. */
  sessionKey: string;
  user: User;
  savedAt: string;
  movies: Movie[];
  entries: Entry[];
  lists: CustomList[];
};

export type RestoredLibrary = Pick<LibrarySnapshot, "user" | "savedAt" | "movies" | "entries" | "lists">;

/**
 * A short, non-reversible fingerprint of the sign-in token (two FNV-1a passes). It only ties a
 * snapshot to the sign-in that saved it; it is not a secret, and works without `crypto.subtle`
 * on plain-HTTP LAN origins.
 */
export function sessionKeyFor(token: string): string {
  const fnv = (seed: number) => {
    let hash = seed >>> 0;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  };
  return fnv(0x811c9dc5) + fnv(0x050c5d1f);
}

/** Keeps only the owner's library and lists, and only the titles they reference. */
export function buildLibrarySnapshot(input: RestoredLibrary & { sessionKey: string }): LibrarySnapshot {
  const userId = String(input.user.id);
  const entries = input.entries.filter((e) => String(e.userId) === userId);
  const lists = input.lists.filter((l) => String(l.userId) === userId);
  const referenced = new Set<string>([...entries.map((e) => e.movieId), ...lists.flatMap((l) => l.movieIds)]);
  return {
    version: SNAPSHOT_VERSION,
    userId,
    sessionKey: input.sessionKey,
    // A stored password field is always blank, but never persist one.
    user: { ...input.user, password: "" },
    savedAt: input.savedAt,
    movies: input.movies.filter((m) => referenced.has(m.id)),
    entries,
    lists,
  };
}

/** The snapshot's library if it belongs to `userId` and this sign-in, with the expected shape; otherwise null. */
export function restoreLibrarySnapshot(snapshot: unknown, userId: string, sessionKey: string): RestoredLibrary | null {
  const s = snapshot as Partial<LibrarySnapshot> | null | undefined;
  if (!s || s.version !== SNAPSHOT_VERSION || String(s.userId) !== String(userId)) return null;
  if (s.sessionKey !== sessionKey) return null;
  if (!s.user || String(s.user.id) !== String(userId) || typeof s.savedAt !== "string") return null;
  if (!Array.isArray(s.movies) || !Array.isArray(s.entries) || !Array.isArray(s.lists)) return null;
  return { user: s.user, savedAt: s.savedAt, movies: s.movies, entries: s.entries, lists: s.lists };
}

/** Where a snapshot lives. The app uses IndexedDB; tests use memory. */
export type SnapshotBackend = {
  get(): Promise<unknown>;
  put(snapshot: LibrarySnapshot): Promise<void>;
  delete(): Promise<void>;
};

export type SnapshotStore = {
  /** Changes on every clear; pass the value seen when a load started to `save`. */
  generation(): number;
  save(snapshot: LibrarySnapshot, options?: { generation?: number }): Promise<void>;
  /** Restores only a snapshot saved under `sessionKey`; without `userId`, the snapshot's own account. */
  load(userId: string | undefined, sessionKey: string): Promise<RestoredLibrary | null>;
  clear(): Promise<void>;
};

/**
 * Serializes storage operations so a sign-out's clear always lands after any save already
 * requested, and drops saves whose data was loaded before the last clear. Storage failures
 * (private mode, quota) are swallowed: the offline view is a convenience, never a blocker.
 */
export function createSnapshotStore(backend: SnapshotBackend): SnapshotStore {
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>, fallback: T): Promise<T> => {
    const next = queue.then(operation).catch(() => fallback);
    queue = next;
    return next;
  };
  return {
    generation: () => generation,
    save(snapshot, options = {}) {
      const requestedIn = options.generation ?? generation;
      return enqueue(async () => {
        if (requestedIn !== generation) return;
        await backend.put(snapshot);
      }, undefined);
    },
    load(userId, sessionKey) {
      return enqueue(async () => {
        const raw = await backend.get();
        const owner = userId ?? (raw as Partial<LibrarySnapshot> | undefined)?.userId;
        return owner == null ? null : restoreLibrarySnapshot(raw, String(owner), sessionKey);
      }, null);
    },
    clear() {
      generation += 1;
      return enqueue(() => backend.delete(), undefined);
    },
  };
}

/** Screens that work from the snapshot. Settings stays open so the user can still sign out. */
export function isOfflineReadOnlyPath(path: string): boolean {
  return path === "/movies" || path === "/lists" || /^\/lists\/[^/]+$/.test(path) || path === "/settings";
}

export const OFFLINE_WRITE_MESSAGE = "You're offline. Reconnect to make changes; nothing was saved.";

/** The gateway statuses a sleeping or unreachable server answers with on its behalf. */
const NO_ANSWER_STATUSES = new Set([502, 503, 504]);

/**
 * True when a failed session check got no answer from the MovieNight server: no connection, a
 * timeout, or a gateway error. Any other failure (500, 429, a malformed profile) is the server
 * answering, so it never opens the snapshot (ADR 0002).
 */
export function serverGaveNoAnswer(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const { status, isTimeout, isUserAbort } = err as Error & { status?: unknown; isTimeout?: boolean; isUserAbort?: boolean };
  if (typeof status === "number") return NO_ANSWER_STATUSES.has(status);
  if (err instanceof TypeError || isTimeout || err.name === "TimeoutError") return true;
  return err.name === "AbortError" && !isUserAbort;
}

/** `savedAt` is null when this visit went offline before its first save. */
export function offlineBannerText(savedAt: string | null, format: { locale?: string; timeZone?: string } = {}): string {
  const when = new Date(savedAt ?? Number.NaN);
  const time = Number.isNaN(when.getTime())
    ? "your last visit"
    : new Intl.DateTimeFormat(format.locale, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: format.timeZone,
      }).format(when);
  return `Offline: showing your library as of ${time}`;
}
