import { Link, useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import { GearIcon } from "./NavRail.icons";

type Dest = { label: string; to: string; count?: number; key: string };

function isActive(dest: Dest, path: string, search: string): boolean {
  if (dest.key === "watched")
    return path.startsWith("/movies") && !path.startsWith("/movies/") && !search.includes("watchlist") && path !== "/movies/add";
  if (dest.key === "watchlist")
    return path === "/movies" && search.includes("watchlist");
  if (dest.key === "suggestions") return path.startsWith("/suggestions");
  if (dest.key === "friends") return path.startsWith("/friends");
  if (dest.key === "settings") return path.startsWith("/settings");
  return false;
}

export default function NavRail({
  orientation,
}: {
  orientation: "horizontal" | "vertical";
}) {
  const { currentUser, stats, friendsOf } = useStore();
  const { path, search } = useRouter();
  if (!currentUser) return null;

  const watched = stats(currentUser.id, "watched").count;
  const watchlist = stats(currentUser.id, "watchlist").count;
  const friends = friendsOf(currentUser.id).length;

  const dests: Dest[] = [
    { key: "watched", label: "Watched", to: "/movies", count: watched },
    { key: "watchlist", label: "Watchlist", to: "/movies?status=watchlist", count: watchlist },
    { key: "suggestions", label: "Suggestions", to: "/suggestions" },
    { key: "friends", label: "Friends", to: "/friends", count: friends },
  ];

  /* ── Mobile: thin bottom strip ── */
  if (orientation === "horizontal") {
    return (
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch border-t border-white/[0.06] bg-[#05070d]/80 backdrop-blur-md lg:hidden">
        {dests.map((d) => {
          const active = isActive(d, path, search);
          return (
            <Link
              key={d.key}
              to={d.to}
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[13px] font-medium"
            >
              {active && (
                <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-accent" />
              )}
              <span className={active ? "text-white" : "text-text-muted"}>
                {d.label}
              </span>
              {d.count !== undefined && (
                <span
                  className={`nums text-[11px] ${active ? "text-white/70" : "text-text-muted"}`}
                >
                  {d.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  /* ── Desktop: fixed top bar ── */
  return (
    <nav className="fixed inset-x-0 top-0 z-30 hidden h-14 items-center border-b border-white/[0.06] bg-[#05070d]/80 px-6 backdrop-blur-md lg:flex">
      {/* Wordmark */}
      <Link to="/movies" className="mr-8 flex items-baseline gap-1 text-[15px] font-bold tracking-tight text-white">
        <span>Movie</span>
        <span className="text-accent">Night</span>
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-1">
        {dests.map((d) => {
          const active = isActive(d, path, search);
          return (
            <Link
              key={d.key}
              to={d.to}
              className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[14px] font-medium transition-colors ${
                active
                  ? "text-white"
                  : "text-text-muted hover:bg-white/[0.04] hover:text-text-primary"
              }`}
            >
              <span>{d.label}</span>
              {d.count !== undefined && (
                <span className={`nums text-[12px] ${active ? "text-white/60" : "text-text-muted"}`}>
                  {d.count}
                </span>
              )}
              {active && (
                <span className="absolute inset-x-2 -bottom-[13px] h-[2px] rounded-full bg-accent" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Settings — far right */}
      <Link
        to="/settings"
        className={`ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
          path.startsWith("/settings")
            ? "text-white"
            : "text-text-muted hover:text-text-primary"
        }`}
      >
        <GearIcon />
      </Link>
    </nav>
  );
}
