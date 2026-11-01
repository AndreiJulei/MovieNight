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
};

const RouterContext = createContext<RouterState | null>(null);
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

import { safeInternalUrl, matchPath } from "./routerUtils";
export { safeInternalUrl, matchPath };

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

  useEffect(() => {
    const onPop = () => {
      const entry = historyEntry() ?? { key: generateEntryKey(), scrollY: 0 };
      setLocation((previous) => ({ url: currentUrl(), entry, action: "pop", fromUrl: previous.url }));
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
    };
  }, [location, navigate, back]);
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
