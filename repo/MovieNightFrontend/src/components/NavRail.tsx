import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import { GearIcon, MenuIcon } from "./NavRail.icons";
import { useEscapeKey, useBodyScrollLock } from "../hooks/useOverlay";
import NavSearch from "./NavSearch";

const EXPLORE_OPTIONS = [
  { label: "Movies", to: "/explore/movies" },
  { label: "TV Series", to: "/explore/tv" },
  { label: "Anime", to: "/explore/anime" },
];

function isRouteActive(path: string, search: string, key: string): boolean {
  if (key === "home") return path === "/" || path === "/home";
  if (key === "watched")
    return path.startsWith("/movies") && !path.startsWith("/movies/") && !search.includes("watchlist") && path !== "/movies/add";
  if (key === "watchlist")
    return path === "/movies" && search.includes("watchlist");
  if (key === "explore") return path.startsWith("/explore");
  if (key === "friends") return path.startsWith("/friends");
  if (key === "lists") return path.startsWith("/lists");
  if (key === "personal-rec") return path === "/suggestions" || path === "/suggestions/for-you";
  if (key === "friends-rec") return path.startsWith("/suggestions/friends");
  if (key === "settings") return path.startsWith("/settings");
  return false;
}

export default function NavRail({
  orientation,
}: {
  orientation: "horizontal" | "vertical";
}) {
  const { currentUser } = useStore();
  const { path, search, navigate } = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [exploreHovered, setExploreHovered] = useState(false);
  const [mobileExploreOpen, setMobileExploreOpen] = useState(false);

  const menuContainerRef = useRef<HTMLDivElement>(null);
  const menuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const exploreTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Hover handlers for the main 3-line menu
  const handleMenuEnter = () => {
    if (menuTimeoutRef.current) {
      clearTimeout(menuTimeoutRef.current);
      menuTimeoutRef.current = null;
    }
    setMenuOpen(true);
  };

  const handleMenuLeave = () => {
    if (menuTimeoutRef.current) clearTimeout(menuTimeoutRef.current);
    menuTimeoutRef.current = setTimeout(() => {
      setMenuOpen(false);
      setExploreHovered(false);
    }, 240);
  };

  // Hover handlers for the Explore submenu flyout
  const handleExploreEnter = () => {
    if (exploreTimeoutRef.current) {
      clearTimeout(exploreTimeoutRef.current);
      exploreTimeoutRef.current = null;
    }
    setExploreHovered(true);
  };

  const handleExploreLeave = () => {
    if (exploreTimeoutRef.current) clearTimeout(exploreTimeoutRef.current);
    exploreTimeoutRef.current = setTimeout(() => {
      setExploreHovered(false);
    }, 200);
  };

  useEscapeKey(menuOpen, () => {
    setMenuOpen(false);
    setExploreHovered(false);
  });
  useBodyScrollLock(menuOpen && orientation === "horizontal");

  useEffect(() => {
    return () => {
      if (menuTimeoutRef.current) clearTimeout(menuTimeoutRef.current);
      if (exploreTimeoutRef.current) clearTimeout(exploreTimeoutRef.current);
    };
  }, []);

  // Close desktop menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setExploreHovered(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  if (!currentUser) return null;

  const mainMenuItems = [
    { key: "watched", label: "Watched", to: "/movies" },
    { key: "watchlist", label: "Watchlist", to: "/movies?status=watchlist" },
    { key: "explore", label: "Explore", to: "/explore/movies", isExplore: true },
    { key: "friends", label: "Friends", to: "/friends" },
    { key: "lists", label: "Lists", to: "/lists" },
    { key: "personal-rec", label: "Personal Recommendations", to: "/suggestions" },
    { key: "friends-rec", label: "Friends' Recommendations", to: "/suggestions/friends" },
  ];

  /* ── Mobile: Bottom Nav Bar + Full Sheet Menu ── */
  if (orientation === "horizontal") {
    return (
      <>
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation Menu">
            <div
              className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute inset-x-0 bottom-14 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-white/15 bg-[#0b101b] p-5 shadow-2xl">
              <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-white/20" />

              {/* Mobile Search Bar inside menu */}
              <div className="mb-5">
                <NavSearch onNavigate={() => setMenuOpen(false)} className="w-full" />
              </div>

              {/* Clean Distilled Menu Buttons */}
              <div className="space-y-1.5" role="menu">
                {mainMenuItems.map((item) => {
                  const active = isRouteActive(path, search, item.key);

                  if (item.isExplore) {
                    return (
                      <div key={item.key} className="space-y-1.5">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => setMobileExploreOpen((o) => !o)}
                          className={`flex h-11 w-full items-center justify-between rounded-xl border px-4 text-left text-sm font-medium transition-all ${
                            path.startsWith("/explore")
                              ? "border-accent/40 bg-accent/15 text-white"
                              : "border-white/[0.08] bg-white/[0.02] text-text-primary hover:border-white/20 hover:bg-white/[0.06]"
                          }`}
                        >
                          <span>{item.label}</span>
                          <span className={`text-xs text-text-muted transition-transform ${mobileExploreOpen ? "rotate-90" : ""}`}>
                            ›
                          </span>
                        </button>

                        {mobileExploreOpen && (
                          <div className="ml-3 space-y-1.5 border-l border-white/10 pl-3">
                            {EXPLORE_OPTIONS.map((sub) => (
                              <button
                                key={sub.to}
                                type="button"
                                onClick={() => {
                                  setMenuOpen(false);
                                  navigate(sub.to);
                                }}
                                className={`flex h-10 w-full items-center rounded-lg border px-3 text-left text-[13px] font-medium transition-all ${
                                  path === sub.to
                                    ? "border-accent/40 bg-accent/20 text-white"
                                    : "border-white/[0.06] bg-white/[0.02] text-text-muted hover:text-white"
                                }`}
                              >
                                {sub.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate(item.to);
                      }}
                      className={`flex h-11 w-full items-center justify-between rounded-xl border px-4 text-left text-sm font-medium transition-all ${
                        active
                          ? "border-accent/40 bg-accent/15 text-white font-semibold"
                          : "border-white/[0.08] bg-white/[0.02] text-text-primary hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Mobile Fixed Bottom Nav */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-center justify-around border-t border-white/[0.08] bg-[#05070d]/90 px-2 backdrop-blur-lg lg:hidden">
          <Link
            to="/"
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
              path === "/" || path === "/home" ? "text-accent" : "text-text-muted hover:text-white"
            }`}
            title="Home"
          >
            <span className="text-base">🎬</span>
          </Link>

          {/* 3-Line Menu Trigger without text, animated color */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className={`group flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
              menuOpen ? "text-[#4a9dec]" : "text-white/80 hover:text-[#4a9dec]"
            }`}
            title="Menu"
            aria-label="Menu"
          >
            <MenuIcon className="h-5 w-5 transition-colors duration-200 text-current" />
          </button>

          {/* Quick Search */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-text-muted hover:text-white transition-colors"
            title="Search"
            aria-label="Search"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          {/* Settings */}
          <Link
            to="/settings"
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
              path.startsWith("/settings") ? "text-accent" : "text-text-muted hover:text-white"
            }`}
            title="Settings"
            aria-label="Settings"
          >
            <GearIcon className="h-4 w-4" />
          </Link>
        </nav>
      </>
    );
  }

  /* ── Desktop: Fixed Top Bar ── */
  return (
    <nav className="fixed inset-x-0 top-0 z-30 hidden h-14 items-center border-b border-white/[0.08] bg-[#05070d]/85 px-6 backdrop-blur-md lg:flex">
      {/* Left Cluster: [Logo] -> [≡ 3 lines icon] -> [Search Bar] */}
      <div className="flex items-center gap-3">
        {/* Wordmark Logo (Routes to Home '/') */}
        <Link
          to="/"
          className="flex items-baseline gap-1 text-[16px] font-bold tracking-tight text-white transition-opacity hover:opacity-90 select-none mr-1"
          title="Movie Night Home"
        >
          <span>Movie</span>
          <span className="text-accent">Night</span>
        </Link>

        {/* 3-Line Menu Trigger (No text "Menu", color animates on hover/click, opens on hover) */}
        <div
          ref={menuContainerRef}
          className="relative"
          onMouseEnter={handleMenuEnter}
          onMouseLeave={handleMenuLeave}
        >
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="desktop-main-menu"
            onClick={() => setMenuOpen((o) => !o)}
            className={`group flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200 cursor-pointer select-none ${
              menuOpen
                ? "border-accent/40 bg-white/[0.12] text-[#4a9dec] shadow-sm"
                : "border-transparent text-white/80 hover:border-white/10 hover:bg-white/[0.06] hover:text-[#4a9dec]"
            }`}
            title="Menu"
            aria-label="Navigation Menu"
          >
            <MenuIcon className="h-4.5 w-4.5 transition-colors duration-200 text-current" />
          </button>

          {/* Clean Distilled Menu Panel */}
          {menuOpen && (
            <div
              id="desktop-main-menu"
              role="menu"
              aria-label="Navigation Menu"
              className="absolute left-0 top-full pt-2 z-50 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="relative w-[230px] rounded-2xl border border-white/15 bg-[#0b101b]/98 p-2.5 shadow-2xl backdrop-blur-2xl">
                <div className="flex flex-col gap-1.5">
                  {mainMenuItems.map((item) => {
                    const active = isRouteActive(path, search, item.key);

                    if (item.isExplore) {
                      return (
                        <div
                          key={item.key}
                          onMouseEnter={handleExploreEnter}
                          onMouseLeave={handleExploreLeave}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setExploreHovered((o) => !o);
                            }}
                            className={`flex h-10 w-full items-center justify-between rounded-xl border px-3.5 text-[13.5px] font-medium transition-all cursor-pointer ${
                              exploreHovered || path.startsWith("/explore")
                                ? "border-accent/40 bg-accent/15 text-white"
                                : "border-white/[0.08] bg-white/[0.02] text-text-primary hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                            }`}
                          >
                            <span>{item.label}</span>
                            <span className="text-xs text-text-muted transition-transform group-hover:translate-x-0.5">
                              ›
                            </span>
                          </button>
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={item.key}
                        to={item.to}
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          setExploreHovered(false);
                        }}
                        className={`flex h-10 items-center rounded-xl border px-3.5 text-[13.5px] font-medium transition-all ${
                          active
                            ? "border-accent/40 bg-accent/15 text-white font-semibold"
                            : "border-white/[0.08] bg-white/[0.02] text-text-primary hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                        }`}
                      >
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>

                {/* Explore Flyout Submenu:
                    Vertically aligned with pixel precision:
                    - Submenu starts at top-[46px]
                    - Button 1 (Movies) lines up with Watchlist (y = 56px)
                    - Button 2 (TV Series) lines up with Explore (y = 102px)
                    - Button 3 (Anime) lines up with Friends (y = 148px)
                    - Invisible hover bridge on the left prevents mouse cursor drops
                */}
                {exploreHovered && (
                  <div
                    className="absolute left-full top-[46px] ml-2 w-[165px] rounded-2xl border border-white/15 bg-[#0b101b]/98 p-2.5 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 z-50 before:absolute before:-left-3 before:top-0 before:bottom-0 before:w-4"
                    onMouseEnter={handleExploreEnter}
                    onMouseLeave={handleExploreLeave}
                  >
                    <div className="flex flex-col gap-1.5">
                      {EXPLORE_OPTIONS.map((cat) => {
                        const subActive = path === cat.to;
                        return (
                          <Link
                            key={cat.to}
                            to={cat.to}
                            role="menuitem"
                            onClick={() => {
                              setMenuOpen(false);
                              setExploreHovered(false);
                            }}
                            className={`flex h-10 items-center rounded-xl border px-3.5 text-[13.5px] font-medium transition-all ${
                              subActive
                                ? "border-accent/40 bg-accent/20 text-white font-semibold"
                                : "border-white/[0.08] bg-white/[0.02] text-text-primary hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                            }`}
                          >
                            <span>{cat.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Glowing Pill Search Input */}
        <NavSearch />
      </div>

      {/* Right Cluster: [Settings] (Kept on far right for visual balance) */}
      <div className="ml-auto flex items-center gap-2">
        <Link
          to="/settings"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition-all cursor-pointer ${
            path.startsWith("/settings")
              ? "border-accent/40 bg-white/[0.1] text-white"
              : "border-transparent text-text-muted hover:border-white/10 hover:bg-white/[0.04] hover:text-text-primary"
          }`}
          title="Account Settings"
          aria-label="Settings"
        >
          <GearIcon />
        </Link>
      </div>
    </nav>
  );
}
