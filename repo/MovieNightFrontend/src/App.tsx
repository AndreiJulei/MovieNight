import { useEffect } from "react";
import { matchPath, RouterProvider, useRouter } from "./router";
import { MovieStoreProvider, useStore } from "./store/MovieStore";
import { PosterTransitionProvider } from "./components/PosterTransitionContext";
import LoginPage from "./pages/LoginPage";
import MoviesPage from "./pages/MoviesPage";
import MovieDetailPage from "./pages/MovieDetailPage";
import AddMoviePage from "./pages/AddMoviePage";
import SuggestionsPage from "./pages/SuggestionsPage";
import SuggestionCategoryPage from "./pages/SuggestionCategoryPage";
import FriendsPage from "./pages/FriendsPage";
import FriendProfilePage from "./pages/FriendProfilePage";
import SettingsPage from "./pages/SettingsPage";
import PixelCompanion from "./components/PixelCompanion";

function Routes() {
  const { path, navigate } = useRouter();
  const { currentUser } = useStore();

  // Auth guard + default landing.
  useEffect(() => {
    if (!currentUser && path !== "/login") {
      navigate("/login", { replace: true });
    } else if (currentUser && path === "/") {
      navigate("/movies", { replace: true });
    }
  }, [currentUser, path, navigate]);

  if (path === "/login") return <LoginPage />;
  if (!currentUser) return null;

  if (matchPath("/movies/add", path)) return <AddMoviePage />;
  if (matchPath("/movies/:id", path)) return <MovieDetailPage />;
  if (path === "/movies") return <MoviesPage />;
  if (matchPath("/suggestions/:category", path)) return <SuggestionCategoryPage />;
  if (path === "/suggestions") return <SuggestionsPage />;
  if (matchPath("/friends/:id", path)) return <FriendProfilePage />;
  if (path === "/friends") return <FriendsPage />;
  if (path === "/settings") return <SettingsPage />;

  return <MoviesPage />;
}

export default function App() {
  return (
    <RouterProvider>
      <MovieStoreProvider>
        <PosterTransitionProvider>
          <Routes />
          {/* Global Pixel Companion stays permanently mounted across all page navigations */}
          <PixelCompanion />
        </PosterTransitionProvider>
      </MovieStoreProvider>
    </RouterProvider>
  );
}
