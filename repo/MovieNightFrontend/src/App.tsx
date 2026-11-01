import { useEffect, useRef, type ComponentType } from "react";
import { Link, matchPath, RouterProvider, useRouter } from "./router";
import { MovieStoreProvider, useStore } from "./store/MovieStore";
import { PosterTransitionProvider } from "./components/PosterTransitionContext";
import { ToastProvider } from "./components/Toast";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import MoviesPage from "./pages/MoviesPage";
import MovieDetailPage from "./pages/MovieDetailPage";
import AddMoviePage from "./pages/AddMoviePage";
import SuggestionsPage from "./pages/SuggestionsPage";
import FriendSuggestionsPage from "./pages/FriendSuggestionsPage";
import SuggestionCategoryPage from "./pages/SuggestionCategoryPage";
import ExploreContentPage from "./pages/ExploreContentPage";
import FriendsPage from "./pages/FriendsPage";
import FriendProfilePage from "./pages/FriendProfilePage";
import SettingsPage from "./pages/SettingsPage";
import CustomListsIndexPage from "./pages/CustomListsIndexPage";
import CustomListDetailPage from "./pages/CustomListDetailPage";
import PixelCompanion from "./components/PixelCompanion";

const routeDefinitions: {
  matches: (path: string) => boolean;
  title: string;
  component: ComponentType;
}[] = [
  { matches: path => path === "/" || path === "/home", title: "Home", component: HomePage },
  { matches: path => path === "/login", title: "Sign in", component: LoginPage },
  { matches: path => path === "/movies/add", title: "Add title", component: AddMoviePage },
  { matches: path => Boolean(matchPath("/movies/:id", path)), title: "Title details", component: MovieDetailPage },
  { matches: path => path === "/movies", title: "Library", component: MoviesPage },
  { matches: path => Boolean(matchPath("/lists/:id", path)), title: "Lists", component: CustomListDetailPage },
  { matches: path => path === "/lists", title: "Lists", component: CustomListsIndexPage },
  { matches: path => path === "/suggestions/friends", title: "Suggestions", component: FriendSuggestionsPage },
  { matches: path => Boolean(matchPath("/suggestions/:category", path)), title: "Suggestions", component: SuggestionCategoryPage },
  { matches: path => path === "/suggestions", title: "Suggestions", component: SuggestionsPage },
  { matches: path => path === "/explore" || /^\/explore\/(movies|tv|anime)(?:\/[^/]+)?$/.test(path), title: "Explore", component: ExploreContentPage },
  { matches: path => Boolean(matchPath("/friends/:id", path)), title: "Friends", component: FriendProfilePage },
  { matches: path => path === "/friends", title: "Friends", component: FriendsPage },
  { matches: path => path === "/settings", title: "Settings", component: SettingsPage },
];

function Routes() {
  const { path, search, navigate, action, entryKey, fromUrl } = useRouter();
  const { currentUser, authHydrated, authError, retryAuth } = useStore();
  const route = routeDefinitions.find(candidate => candidate.matches(path));
  const validRoute = Boolean(route);
  const title = route?.title ?? "Page not found";
  const previousPath = useRef(path);

  useEffect(() => {
    if (!authHydrated || authError) return;
    if (!currentUser && validRoute && path !== "/login") {
      navigate(`/login?returnTo=${encodeURIComponent(path + search)}`, { replace: true });
    } else if (currentUser && path === "/explore") {
      navigate("/explore/movies", { replace: true });
    }
  }, [authHydrated, authError, currentUser, validRoute, path, search, navigate]);

  useEffect(() => {
    const sameScreen = previousPath.current === path;
    previousPath.current = path;
    // Query history updates keep the user's focus in the current screen.
    // Initial effects may replay in StrictMode before their scheduled focus runs.
    if (sameScreen && action !== "initial") return;
    document.title = `${title} · Movie Night`;
    let settled = false;
    const focusRoute = () => {
      if (settled) return;
      const heading = document.querySelector<HTMLElement>("main h1, h1");
      if (heading?.textContent?.trim()) document.title = `${heading.textContent.trim()} · Movie Night`;
      if (action === "pop") {
        if (!fromUrl?.startsWith("/movies/")) { settled = true; return; }
        const titleLink = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
          .find((link) => link.getAttribute("href") === fromUrl);
        if (!titleLink) return;
        titleLink.focus({ preventScroll: true });
        settled = true;
        return;
      }
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        settled = true;
      }
    };
    const frame = requestAnimationFrame(focusRoute);
    const observer = new MutationObserver(focusRoute);
    observer.observe(document.getElementById("root") ?? document.body, { childList: true, subtree: true, characterData: true });
    const timeout = window.setTimeout(() => {
      if (!settled && action !== "pop") {
        const main = document.querySelector<HTMLElement>("main");
        if (main) {
          main.tabIndex = -1;
          main.setAttribute("aria-label", title);
          main.focus({ preventScroll: true });
        }
      }
      settled = true;
      observer.disconnect();
    }, 2000);
    return () => { settled = true; cancelAnimationFrame(frame); clearTimeout(timeout); observer.disconnect(); };
  }, [entryKey, path, action, fromUrl, title]);

  if (!authHydrated) return <p role="status">Loading your session…</p>;
  if (authError) return <main className="mx-auto max-w-xl px-6 py-20 text-text-primary"><h1 className="text-2xl font-bold">Session unavailable</h1><p role="alert" className="mt-3 text-text-muted">{authError}</p><button type="button" onClick={retryAuth} className="quiet-action mt-5 inline-flex min-h-8 items-center text-sm text-link">Retry session</button></main>;
  if (!route) return <main className="mx-auto max-w-xl px-6 py-20 text-text-primary"><h1 className="text-2xl font-bold">Page not found</h1><p className="mt-3 text-text-muted">This address does not match a Movie Night screen.</p><Link to="/" className="prose-link mt-5 inline-block">Go to Home</Link></main>;
  const Page = route.component;
  if (path === "/login") return <Page />;
  if (!currentUser) return <p role="status">Opening sign in…</p>;
  return <Page />;
}

export default function App() {
  return (
    <RouterProvider>
      <MovieStoreProvider>
        <PosterTransitionProvider>
          <ToastProvider>
            <Routes />
            {/* Global Pixel Companion stays permanently mounted across all page navigations */}
            <PixelCompanion />
          </ToastProvider>
        </PosterTransitionProvider>
      </MovieStoreProvider>
    </RouterProvider>
  );
}
