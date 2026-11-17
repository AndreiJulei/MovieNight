import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

export type NavigateOptions = {
  replace?: boolean;
  preserveScroll?: boolean;
  state?: Record<string, unknown>;
};

type EntryState = {
  key: string;
  previousUrl?: string;
  previousKey?: string;
  scrollY: number;
  data?: Record<string, unknown>;
};
type LocationState = {
  url: string;
  entry: EntryState;
  action: "initial" | "push" | "replace" | "pop";
  fromUrl?: string;
};
type RouterState = {
  path: string;
  search: string;
  state?: Record<string, unknown>;
  entryKey: string;
  action: LocationState["action"];
  previousUrl?: string;
  fromUrl?: string;
  navigate: (to: string, opts?: NavigateOptions) => void;
  back: () => void;
  /** The shared Back rule (see `backTarget`); `fallback` opens when history cannot return there. */
  goBack: (fallback?: string) => void;
};

const RouterContext = createContext<RouterState | null>(null);

/** Info about a browser Back/Forward step, for an optional animated update (#29). */
export type PopTransitionInfo = {
  fromUrl: string;
  toUrl: string;
  scrollY: number;
  /** The browser already animates this step (e.g. an iOS swipe-back), so the app must not. */
  hasUAVisualTransition: boolean;
};
type PopTransitionHandler = (update: () => void, info: PopTransitionInfo) => void;
const applyImmediately: PopTransitionHandler = (update) => update();
let popTransitionHandler: PopTransitionHandler = applyImmediately;

/** Lets the poster transition wrap Back/Forward updates; `null` restores instant updates. */
export function setPopTransitionHandler(handler: PopTransitionHandler | null) {
  popTransitionHandler = handler ?? applyImmediately;
}
let entrySequence = 0;
const generateEntryKey = () => {
  const bytes = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else { bytes[0] = Math.floor(Math.random() * 2 ** 32); bytes[1] = Date.now(); }
  return `${bytes[0].toString(36)}-${bytes[1].toString(36)}-${++entrySequence}`;
};
const currentUrl = () => window.location.pathname + window.location.search + window.location.hash;
const historyEntry = (): EntryState | null => {
  const entry = window.history.state?.movieNight;
  return entry && typeof entry.key === "string" ? entry as EntryState : null;
};

import { safeInternalUrl, matchPath, backTarget } from "./routerUtils";
export { safeInternalUrl, matchPath, backTarget };

function initialLocation(): LocationState {
  const url = currentUrl();
  const entry = historyEntry() ?? { key: generateEntryKey(), scrollY: 0 };
  try { window.history.replaceState({ ...window.history.state, movieNight: entry }, "", url); }
  catch { /* Embedded previews can deny the History API. */ }
  return { url, entry, action: "initial" };
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<LocationState>(initialLocation);
  const [previewFallback, setPreviewFallback] = useState(false);
  const fallbackEntries = useRef<LocationState[]>([location]);
  const locationRef = useRef(location);
  locationRef.current = location;

  const navigate = useCallback((to: string, opts?: NavigateOptions) => {
    const target = safeInternalUrl(to);
    if (!target) return;
    const before = previewFallback ? location.url : currentUrl();
    const previous = previewFallback ? location.entry : historyEntry() ?? location.entry;
    const next: EntryState = opts?.replace
      ? { ...previous, data: opts?.state, scrollY: opts?.preserveScroll ? previous.scrollY : 0 }
      : { key: generateEntryKey(), previousUrl: before, previousKey: previous.key, scrollY: 0, data: opts?.state };
    if (!previewFallback) {
      try {
        window.history.replaceState({ ...window.history.state, movieNight: { ...previous, scrollY: window.scrollY } }, "", before);
        window.history[opts?.replace ? "replaceState" : "pushState"]({ movieNight: next }, "", target);
      } catch {
        // Embedded previews can deny the History API. Scope local history to that preview.
        setPreviewFallback(true);
      }
    }
    if (previewFallback || currentUrl() !== target) {
      const nextLocation: LocationState = { url: target, entry: next, action: opts?.replace ? "replace" : "push" };
      if (opts?.replace) fallbackEntries.current[fallbackEntries.current.length - 1] = nextLocation;
      else fallbackEntries.current.push(nextLocation);
    }
    setLocation({ url: target, entry: next, action: opts?.replace ? "replace" : "push" });
    if (!opts?.preserveScroll) window.scrollTo(0, 0);
  }, [location, previewFallback]);

  const back = useCallback(() => {
    if (!previewFallback) { window.history.back(); return; }
    if (fallbackEntries.current.length > 1) {
      fallbackEntries.current.pop();
      const previous = fallbackEntries.current.at(-1)!;
      setLocation({ ...previous, action: "pop", fromUrl: location.url });
    }
  }, [previewFallback, location.url]);

  const goBack = useCallback((fallback?: string) => {
    const target = backTarget(location.entry.previousUrl, fallback);
    if (target.kind === "history") back();
    else navigate(target.to);
  }, [location.entry.previousUrl, back, navigate]);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const entry = historyEntry() ?? { key: generateEntryKey(), scrollY: 0 };
      const toUrl = currentUrl();
      const update = () => setLocation((previous) => ({ url: toUrl, entry, action: "pop", fromUrl: previous.url }));
      try {
        popTransitionHandler(update, {
          fromUrl: locationRef.current.url,
          toUrl,
          scrollY: entry.scrollY,
          hasUAVisualTransition: Boolean((event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition),
        });
      } catch {
        update();
      }
    };
    window.addEventListener("popstate", onPop);
    (window as Window & { __navigate?: typeof navigate }).__navigate = navigate;
    if (!previewFallback) window.history.scrollRestoration = "manual";
    return () => window.removeEventListener("popstate", onPop);
  }, [navigate, previewFallback]);

  useEffect(() => {
    if (location.action !== "pop") return;
    const target = location.entry.scrollY;
    const currentKey = location.entry.key;
    if (!target) {
      if (previewFallback || historyEntry()?.key === currentKey) window.scrollTo(0, 0);
      return;
    }

    let cancelled = false;
    let frame: number | undefined;

    const tryScroll = () => {
      frame = undefined;
      if (cancelled) return;
      if (!previewFallback && historyEntry()?.key !== currentKey) return;
      window.scrollTo(0, target);
      if (window.scrollY >= target || Math.abs(window.scrollY - target) <= 2) {
        cancelled = true;
        observer.disconnect();
        resizeObserver.disconnect();
      }
    };

    const scheduleScroll = () => {
      if (!cancelled && frame === undefined) frame = requestAnimationFrame(tryScroll);
    };
    // Once the user scrolls, clicks or types, their position wins: late content
    // (images, hero slides) must not yank the page back to the restored spot.
    const userInputEvents = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    const stopOnUserInput = () => {
      cancelled = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      userInputEvents.forEach((type) => window.removeEventListener(type, stopOnUserInput, true));
    };
    userInputEvents.forEach((type) => window.addEventListener(type, stopOnUserInput, { capture: true, passive: true }));
    // Async route content and image layout may arrive long after navigation.
    // Wait for those changes without polling or imposing a network deadline.
    const observer = new MutationObserver(scheduleScroll);
    const resizeObserver = new ResizeObserver(scheduleScroll);
    const root = document.getElementById("root") ?? document.body;
    observer.observe(root, { childList: true, subtree: true });
    resizeObserver.observe(root);
    scheduleScroll();

    return () => {
      cancelled = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      userInputEvents.forEach((type) => window.removeEventListener(type, stopOnUserInput, true));
    };
  }, [location, previewFallback]);

  const value = useMemo<RouterState>(() => {
    const url = new URL(location.url, window.location.origin);
    return {
      path: url.pathname,
      search: url.search,
      state: location.entry.data,
      entryKey: location.entry.key,
      action: location.action,
      previousUrl: location.entry.previousUrl,
      fromUrl: location.fromUrl,
      navigate,
      back,
      goBack,
    };
  }, [location, navigate, back, goBack]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used within RouterProvider");
  return ctx;
}

export function useQuery() {
  const { search } = useRouter();
  return new URLSearchParams(search);
}


export function Link({ to, className, children, onClick, ...rest }: {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  const { navigate } = useRouter();
  return <a href={to} className={className} {...rest} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || rest.target || rest.download) return;
    event.preventDefault();
    navigate(to);
  }}>{children}</a>;
}
