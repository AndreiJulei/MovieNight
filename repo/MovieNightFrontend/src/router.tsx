import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";

export type NavigateOptions = {
  replace?: boolean;
  preserveScroll?: boolean;
  state?: Record<string, any>;
};

type RouterState = {
  path: string; // pathname only, e.g. "/movies"
  search: string; // raw query string, e.g. "?status=watchlist"
  state?: Record<string, any>;
  navigate: (to: string, opts?: NavigateOptions) => void;
};

const RouterContext = createContext<RouterState | null>(null);

/**
 * In-memory router. Deliberately does NOT touch window.history/location — the
 * app runs inside a sandboxed preview iframe where the History API can throw,
 * and we don't need shareable URLs here.
 */
export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState("/");
  const [navState, setNavState] = useState<Record<string, any> | undefined>(undefined);

  const navigate = useCallback((to: string, opts?: NavigateOptions) => {
    setLoc(to);
    setNavState(opts?.state);
    if (typeof window !== "undefined") {
      (window as any).__navigate = navigate;
      if (!opts?.preserveScroll) {
        window.scrollTo(0, 0);
      }
      if (!opts?.state?.fromDetails) {
        try {
          sessionStorage.removeItem("details_return_target");
        } catch {
          /* ignore */
        }
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__navigate = navigate;
    }
  }, [navigate]);

  const value = useMemo(() => {
    const [path, query = ""] = loc.split("?");
    return { path, search: query ? `?${query}` : "", state: navState, navigate };
  }, [loc, navState, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used within RouterProvider");
  return ctx;
}

/** Query params for the current in-memory location. */
export function useQuery() {
  const { search } = useRouter();
  return new URLSearchParams(search);
}

/**
 * Match `pattern` (e.g. "/movies/:id") against a path.
 * Returns extracted params, or null if it doesn't match.
 */
export function matchPath(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const pp = pattern.split("/").filter(Boolean);
  const ap = path.split("/").filter(Boolean);
  if (pp.length !== ap.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(":")) {
      params[pp[i].slice(1)] = decodeURIComponent(ap[i]);
    } else if (pp[i] !== ap[i]) {
      return null;
    }
  }
  return params;
}

export function Link({
  to,
  className,
  children,
  onClick,
  ...rest
}: {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onClick?.();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
