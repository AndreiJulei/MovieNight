import { useEffect } from "react";
import { matchPath, RouterProvider, useRouter } from "./router";
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

function Routes() {
  const { path, navigate } = useRouter();
  const { currentUser } = useStore();

  // Auth guard + default landing.
  useEffect(() => {
    if (!currentUser && path !== "/login") {
      navigate("/login", { replace: true });
    } else if (currentUser && path === "/explore") {
      navigate("/explore/movies", { replace: true });
    }
  }, [currentUser, path, navigate]);

  if (path === "/login") return <LoginPage />;
  if (!currentUser) return null;

  if (path === "/" || path === "/home") return <HomePage />;
  if (matchPath("/movies/add", path)) return <AddMoviePage />;
  if (matchPath("/movies/:id", path)) return <MovieDetailPage />;
  if (path === "/movies") return <MoviesPage />;
  if (matchPath("/lists/:id", path)) return <CustomListDetailPage />;
  if (path === "/lists") return <CustomListsIndexPage />;
  if (path === "/suggestions/friends") return <FriendSuggestionsPage />;
  if (matchPath("/suggestions/:category", path)) return <SuggestionCategoryPage />;
  if (path === "/suggestions") return <SuggestionsPage />;
  if (matchPath("/explore/:type/:rowId", path)) return <ExploreContentPage />;
  if (matchPath("/explore/:type", path)) return <ExploreContentPage />;
  if (matchPath("/friends/:id", path)) return <FriendProfilePage />;
  if (path === "/friends") return <FriendsPage />;
  if (path === "/settings") return <SettingsPage />;

  return <HomePage />;
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
