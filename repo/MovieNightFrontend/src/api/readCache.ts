/**
 * Small in-memory stale-while-revalidate cache for read-only API calls.
 *
 * - Younger than `freshMs`: the cached value is returned with no network request.
 * - Younger than `maxAgeMs`: the cached value is returned immediately and refreshed in the
 *   background, so the next visit is current.
 * - Older, or never loaded: wait for `load`.
 *
 * Only successful results are stored, so an error is never replayed. Values are cloned on the
 * way in and out so callers cannot mutate what other visits will receive.
 */
export interface CacheWindow {
  freshMs: number;
  maxAgeMs: number;
}

interface Entry {
  value: unknown;
  at: number;
}

const MAX_ENTRIES = 80;
const entries = new Map<string, Entry>();
const refreshing = new Set<string>();
let epoch = 0;

export interface CachedReadOptions {
  /** Injectable clock for tests. */
  now?: () => number;
}

/**
 * @param load Performs the real request. `background` is true when refreshing a value the caller
 *   already received, so it must not be tied to that caller's cancellation signal.
 */
export async function cachedRead<T>(
  key: string,
  window: CacheWindow,
  load: (background: boolean) => Promise<T>,
  options: CachedReadOptions = {},
): Promise<T> {
  const now = options.now ?? Date.now;
  const hit = entries.get(key);
  if (hit) {
    const age = now() - hit.at;
    if (age < window.freshMs) return structuredClone(hit.value) as T;
    if (age < window.maxAgeMs) {
      if (!refreshing.has(key)) {
        refreshing.add(key);
        const startedInEpoch = epoch;
        void load(true)
          .then((value) => {
            // A write happened while this was in flight: the result may predate it, so drop it.
            if (startedInEpoch === epoch) store(key, value, now());
          })
          .catch(() => { /* keep serving the stale value; the next visit retries */ })
          .finally(() => { refreshing.delete(key); });
      }
      return structuredClone(hit.value) as T;
    }
    entries.delete(key);
  }
  const startedInEpoch = epoch;
  const value = await load(false);
  if (startedInEpoch === epoch) store(key, value, now());
  return value;
}

function store(key: string, value: unknown, at: number): void {
  entries.delete(key);
  entries.set(key, { value: structuredClone(value), at });
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/** Drop everything, e.g. after the user changes their library or lists. */
export function invalidateReadCache(): void {
  epoch++;
  entries.clear();
}
