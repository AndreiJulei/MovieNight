/**
 * Cold-start handling for the free-tier backend, which sleeps when idle and needs 30–60 s or more
 * to wake. A read slower than SLOW_READ_MS marks the server as waking, which shows a non-blocking
 * notice until every slow read settles.
 */
export const SLOW_READ_MS = 4000;

let slowReads = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function isServerWaking(): boolean {
  return slowReads > 0;
}

export function subscribeServerWaking(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Count one read as slow; the returned release is idempotent. */
export function beginSlowRead(): () => void {
  slowReads++;
  if (slowReads === 1) notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    slowReads--;
    if (slowReads === 0) notify();
  };
}

/** Longest wait for a waking server before the read's single cold-start retry goes ahead anyway. */
export const WAKE_TIMEOUT_MS = 120_000;

let healthUrl: string | null = null;
let wakeInFlight: Promise<boolean> | null = null;

export function configureServerWake(url: string | null): void {
  healthUrl = url;
}

/**
 * Request the health endpoint once (single flight). Resolves true when the server answered 2xx,
 * false on any failure or when no health URL is configured. Never rejects.
 */
export function wakeServer(): Promise<boolean> {
  if (!healthUrl) return Promise.resolve(false);
  if (!wakeInFlight) {
    const url = healthUrl;
    const ping = (async () => {
      try {
        const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(WAKE_TIMEOUT_MS) });
        return res.ok;
      } catch {
        return false;
      }
    })();
    wakeInFlight = ping;
    void ping.then(() => {
      if (wakeInFlight === ping) wakeInFlight = null;
    });
  }
  return wakeInFlight;
}

/** Wait for the in-flight (or a new) health ping; rejects with an AbortError when the read is cancelled. */
export function waitForServer(signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const err = new Error("Request cancelled.");
      err.name = "AbortError";
      (err as any).isUserAbort = true;
      reject(err);
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    void wakeServer().then((awake) => {
      signal.removeEventListener("abort", onAbort);
      resolve(awake);
    });
  });
}
