export class RequestTimeoutError extends Error {
  isTimeout = true;
  constructor(message = "Request timed out.") {
    super(message);
    this.name = "TimeoutError";
  }
}

export interface BoundedReadOptions {
  signal?: AbortSignal;
  userScope?: string;
  coalesceKey?: string;
  _delays?: number[];
  _timeoutMs?: number;
}

export const RETRY_DELAYS = [500, 1500];

export function parseRetryAfter(header: string | null | undefined): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return seconds;
  }
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    const diff = Math.ceil((date - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  }
  return null;
}

export function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof Error && err.name === "AbortError") return true;
  if ((err as any)?.name === "AbortError") return true;
  return false;
}

export function isTransientError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof Error && (err as any).isUserAbort) {
    return false;
  }
  if (
    (err as any)?.isTimeout ||
    (err instanceof Error && (err.name === "TimeoutError" || err.message.toLowerCase().includes("timed out") || err.message.toLowerCase().includes("timeout")))
  ) {
    return true;
  }
  const status = (err as any)?.status;
  if (typeof status === "number") {
    if (status === 429 || status === 502 || status === 503 || status === 504) {
      const retryAfter = (err as any)?.retryAfter;
      const seconds = parseRetryAfter(retryAfter);
      if (seconds !== null && seconds > 5) {
        return false; // Bounded Retry-After: > 5s fails contextual without retry
      }
      return true;
    }
    return false;
  }
  if (err instanceof TypeError) {
    return true; // Network / connection drop
  }
  if (err instanceof Error) {
    if (err.name === "AbortError" && !(err as any).isUserAbort) return true;
    const msg = err.message.toLowerCase();
    if (msg.includes("network") || msg.includes("connection")) {
      return true;
    }
  }
  return false;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error("Request cancelled.");
      err.name = "AbortError";
      (err as any).isUserAbort = true;
      return reject(err);
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      const err = new Error("Request cancelled.");
      err.name = "AbortError";
      (err as any).isUserAbort = true;
      reject(err);
    };

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

interface Subscriber<T> {
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface CoalescedRead<T> {
  subscribers: Set<Subscriber<T>>;
  underlyingController: AbortController;
}

export const pendingReads = new Map<string, CoalescedRead<any>>();

let defaultScopeResolver: (() => string | null | undefined) | null = null;

export function setDefaultScopeResolver(resolver: () => string | null | undefined): void {
  defaultScopeResolver = resolver;
}

function cleanPending(key: string, targetEntry: CoalescedRead<any>): void {
  if (pendingReads.get(key) === targetEntry) {
    pendingReads.delete(key);
  }
}

/**
 * Shared bounded read recovery policy:
 * - Initial attempt + at most 2 transient retries (attempt 1 wait 500ms, attempt 2 wait 1500ms).
 * - Coalesces in-flight reads with identical identity using reference-counted subscribers.
 * - Stops immediately without retrying on user cancellation (navigation, account change).
 * - Caller-abort safe: aborting one subscriber does not reject or cancel other active subscribers.
 * - Safe entry cleanup: cleaning up an aborted request only deletes its own pending entry, never a replacement.
 * - Respects bounded Retry-After headers up to 5s.
 */
export async function boundedRead<T>(
  actionKey: string,
  fn: (signal: AbortSignal) => Promise<T>,
  options?: BoundedReadOptions,
): Promise<T> {
  const callerSignal = options?.signal;
  if (callerSignal?.aborted) {
    const err = new Error("Request cancelled.");
    err.name = "AbortError";
    (err as any).isUserAbort = true;
    throw err;
  }

  const scope = options?.userScope ?? defaultScopeResolver?.() ?? "anon";
  const coalesceKey = options?.coalesceKey ?? `${scope}:${actionKey}`;
  const delays = options?._delays ?? RETRY_DELAYS;
  const timeoutMs = options?._timeoutMs ?? 15000;

  let existing = pendingReads.get(coalesceKey) as CoalescedRead<T> | undefined;

  if (!existing) {
    const underlyingController = new AbortController();
    const subscribers = new Set<Subscriber<T>>();
    const entry: CoalescedRead<T> = { subscribers, underlyingController };
    pendingReads.set(coalesceKey, entry);

    // Start background execution
    (async () => {
      let attempt = 0;
      while (true) {
        if (underlyingController.signal.aborted) {
          cleanPending(coalesceKey, entry);
          return;
        }

        const timeoutController = new AbortController();
        let timedOut = false;
        const timeoutTimer = setTimeout(() => {
          timedOut = true;
          timeoutController.abort(new RequestTimeoutError("Request timed out."));
        }, timeoutMs);

        const onUnderlyingAbort = () => {
          timeoutController.abort(underlyingController.signal.reason);
        };
        underlyingController.signal.addEventListener("abort", onUnderlyingAbort, { once: true });

        try {
          const result = await fn(timeoutController.signal);
          clearTimeout(timeoutTimer);
          underlyingController.signal.removeEventListener("abort", onUnderlyingAbort);

          cleanPending(coalesceKey, entry);
          for (const sub of subscribers) {
            if (sub.signal && sub.onAbort) {
              sub.signal.removeEventListener("abort", sub.onAbort);
            }
            sub.resolve(result);
          }
          return;
        } catch (rawErr: unknown) {
          clearTimeout(timeoutTimer);
          underlyingController.signal.removeEventListener("abort", onUnderlyingAbort);

          let err = rawErr;
          if (timedOut) {
            err = new RequestTimeoutError("Request timed out.");
          }

          if (underlyingController.signal.aborted) {
            cleanPending(coalesceKey, entry);
            return;
          }

          const transient = isTransientError(err);
          if (!transient || attempt >= delays.length) {
            cleanPending(coalesceKey, entry);
            for (const sub of subscribers) {
              if (sub.signal && sub.onAbort) {
                sub.signal.removeEventListener("abort", sub.onAbort);
              }
              sub.reject(err);
            }
            return;
          }

          let delayMs = delays[attempt];
          const retryAfterSeconds = parseRetryAfter((err as any)?.retryAfter);
          if (retryAfterSeconds !== null && retryAfterSeconds <= 5) {
            delayMs = Math.max(delayMs, retryAfterSeconds * 1000);
          }

          attempt++;
          try {
            await sleep(delayMs, underlyingController.signal);
          } catch {
            cleanPending(coalesceKey, entry);
            return;
          }
        }
      }
    })();

    existing = entry;
  }

  // Subscribe this caller to the coalesced request
  return new Promise<T>((resolve, reject) => {
    const currentEntry = existing!;
    const subscriber: Subscriber<T> = { resolve, reject, signal: callerSignal };

    if (callerSignal) {
      subscriber.onAbort = () => {
        currentEntry.subscribers.delete(subscriber);
        const err = new Error("Request cancelled.");
        err.name = "AbortError";
        (err as any).isUserAbort = true;
        reject(err);

        // If all subscribers cancelled, abort underlying request and clean up only our own entry
        if (currentEntry.subscribers.size === 0) {
          cleanPending(coalesceKey, currentEntry);
          currentEntry.underlyingController.abort();
        }
      };
      callerSignal.addEventListener("abort", subscriber.onAbort, { once: true });
    }

    currentEntry.subscribers.add(subscriber);
  });
}

