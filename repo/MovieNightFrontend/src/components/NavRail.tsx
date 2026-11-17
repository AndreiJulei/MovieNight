import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "../router";
import { useStore } from "../store/MovieStore";
import { MenuIcon } from "./NavRail.icons";
import UserAvatar from "./UserAvatar";
import useMyAvatar from "../hooks/useMyAvatar";
import { useEscapeKey, useBodyScrollLock, useOverlayFocus } from "../hooks/useOverlay";
import NavSearch from "./NavSearch";
import { PHONE_BAR_HEIGHT, phoneMenuBottomOffset } from "./phoneMenuLogic";

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
  if (key === "profile") return path === "/profile" || path.startsWith("/settings");
  return false;
}

/** Gap kept between the phone menu's top edge and the visible viewport top. */
const PHONE_MENU_TOP_GAP = 16;
/** Smallest scrollable phone menu height, even with a tall keyboard open. */
const PHONE_MENU_MIN_HEIGHT = 160;
/** Height used before the first measurement. */
const PHONE_MENU_INITIAL_MAX_HEIGHT = 480;

/**
 * Keeps the phone menu resting on the bar, or on the keyboard's top edge while
 * the search keyboard is open (visualViewport).
 */
function usePhoneMenuPosition(active: boolean) {
  const measure = () => {
    const viewport = window.visualViewport;
    // clientHeight tracks the layout viewport; iOS can shrink innerHeight with the keyboard.
    const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
    const viewportHeight = viewport?.height ?? layoutHeight;
    const viewportOffsetTop = viewport?.offsetTop ?? 0;
    const bottom = phoneMenuBottomOffset({ layoutHeight, viewportHeight, viewportOffsetTop });
    return { bottom, maxHeight: Math.max(PHONE_MENU_MIN_HEIGHT, layoutHeight - bottom - viewportOffsetTop - PHONE_MENU_TOP_GAP) };
  };
  const [position, setPosition] = useState(() => ({ bottom: PHONE_BAR_HEIGHT, maxHeight: PHONE_MENU_INITIAL_MAX_HEIGHT }));
  useEffect(() => {
    if (!active) return;
    const update = () => setPosition(measure());
    update();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [active]);
  return position;
}

export default function NavRail({
  orientation,
}: {
  orientation: "horizontal" | "vertical";
}) {
  const { currentUser } = useStore();
  const { path, search } = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [desktopExploreOpen, setDesktopExploreOpen] = useState(false);
  const [mobileExploreOpen, setMobileExploreOpen] = useState(false);

  const menuContainerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const phone = orientation === "horizontal";
  const [searchActive, setSearchActive] = useState(false);
  const menuPosition = usePhoneMenuPosition(menuOpen && phone);
  // PB02: the phone menu focuses its panel, never the search field, so no keyboard opens.
  // Non-modal: the bottom bar stays usable while the menu is open, so focus is not trapped.
  useOverlayFocus(menuOpen, panelRef, false, phone ? "container" : "first");
  useEscapeKey(menuOpen, () => {
    setMenuOpen(false);
    setDesktopExploreOpen(false);
  });
  useBodyScrollLock(menuOpen && phone);

  // Navigating closes the menu.
  useEffect(() => {
    setMenuOpen(false);
    setDesktopExploreOpen(false);
  }, [path, search]);

  useEffect(() => {
    if (!menuOpen) setSearchActive(false);
  }, [menuOpen]);

  // Close desktop menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setDesktopExploreOpen(false);
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

  /* ── Mobile: Bottom Bar + Menu anchored on top of it (#27) ── */
  if (orientation === "horizontal") {
    const closeMenu = () => setMenuOpen(false);
    return (
      <>
        {menuOpen && (
          <>
            {/* Catches outside taps; dims only while searching (PB04). Leaves the bar tappable. */}
            <div
              data-testid="phone-menu-backdrop"
              aria-hidden="true"
              onClick={closeMenu}
              className={`fixed inset-x-0 top-0 z-40 transition-colors duration-100 lg:hidden ${
                searchActive ? "bg-black/70" : "bg-transparent"
              }`}
              style={{ bottom: PHONE_BAR_HEIGHT }}
            />
            <div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-label="Navigation Menu"
              className="phone-menu-fade fixed inset-x-0 z-50 overflow-y-auto border-t border-white/15 bg-[#0b101b] px-4 pb-3 pt-4 shadow-[0_-12px_32px_rgba(0,0,0,0.45)] outline-none lg:hidden"
              style={{ bottom: menuPosition.bottom, maxHeight: menuPosition.maxHeight }}
            >
              <div className="mb-4">
                <NavSearch onNavigate={closeMenu} onActiveChange={setSearchActive} className="w-full" />
              </div>

              <div className="space-y-1.5" role="menu">
                {mainMenuItems.map((item) => {
                  const active = isRouteActive(path, search, item.key);

                  if (item.isExplore) {
                    return (
                      <div key={item.key} className="space-y-1.5">
                        <button
                          type="button"
                          role="menuitem"
                          aria-expanded={mobileExploreOpen}
                          onClick={() => setMobileExploreOpen((o) => !o)}
                          className={`flex h-11 w-full items-center justify-between rounded-xl border px-4 text-left text-sm font-medium transition-colors ${
                            path.startsWith("/explore")
                              ? "border-accent/40 bg-accent/15 text-white"
                              : "border-white/[0.08] bg-white/[0.02] text-text-primary hover:border-white/20 hover:bg-white/[0.06]"
                          }`}
                        >
                          <span>{item.label}</span>
                          <span className={`text-xs text-text-muted ${mobileExploreOpen ? "rotate-90" : ""}`}>›</span>
                        </button>

                        {mobileExploreOpen && (
                          <div className="ml-3 space-y-1.5 border-l border-white/10 pl-3">
                            {EXPLORE_OPTIONS.map((sub) => (
                              <Link
                                key={sub.to}
                                to={sub.to}
                                role="menuitem"
                                aria-current={path === sub.to ? "page" : undefined}
                                onClick={closeMenu}
                                className={`flex h-11 w-full items-center rounded-lg border px-3 text-left text-[13px] font-medium transition-colors ${
                                  path === sub.to
                                    ? "border-accent/40 bg-accent/20 text-white"
                                    : "border-white/[0.06] bg-white/[0.02] text-text-muted hover:text-white"
                                }`}
                              >
                                {sub.label}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.key}
                      to={item.to}
                      role="menuitem"
                      aria-current={active ? "page" : undefined}
                      onClick={closeMenu}
                      className={`flex h-11 w-full items-center justify-between rounded-xl border px-4 text-left text-sm font-medium transition-colors ${
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
            </div>
          </>
        )}

        {/* Bottom bar: [MN] [☰] [avatar → profile] (PB01, #33). */}
        <nav
          aria-label="Primary"
          className={`fixed inset-x-0 bottom-0 z-40 flex h-14 items-center justify-around border-t px-2 lg:hidden ${
            menuOpen ? "border-white/[0.06] bg-[#0b101b]" : "border-white/[0.08] bg-[#05070d]/90 backdrop-blur-lg"
          }`}
        >
          <Link
            to="/"
            aria-label="Movie Night home"
            aria-current={path === "/" || path === "/home" ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[17px] font-black tracking-tight transition-colors hover:bg-white/[0.06]"
            title="Movie Night home"
          >
            <span className="text-white">M</span>
            <span className="text-accent">N</span>
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
              menuOpen ? "text-[#4a9dec]" : "text-white/80 hover:text-[#4a9dec]"
            }`}
            title="Menu"
            aria-label="Menu"
          >
            <MenuIcon className="h-5 w-5 text-current" />
          </button>

          <ProfileLink compact onClick={() => setMenuOpen(false)} />
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
          aria-current={path === "/" || path === "/home" ? "page" : undefined}
          className="flex items-baseline gap-1 text-[16px] font-bold tracking-tight text-white transition-opacity hover:opacity-90 select-none mr-1"
          title="Movie Night Home"
        >
          <span>Movie</span>
          <span className="text-accent">Night</span>
        </Link>

        {/* Explicit menu toggle works with mouse, touch and keyboard. */}
        <div
          ref={menuContainerRef}
          className="relative"
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
              ref={panelRef}
              id="desktop-main-menu"
              role="menu"
              aria-label="Navigation Menu"
              className="absolute left-0 top-full pt-2 z-50 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="relative max-h-[calc(100dvh-5rem)] overflow-y-auto w-[230px] rounded-2xl border border-white/15 bg-[#0b101b]/98 p-2.5 shadow-2xl backdrop-blur-2xl">
                <div className="flex flex-col gap-1.5">
                  {mainMenuItems.map((item) => {
                    const active = isRouteActive(path, search, item.key);

                    if (item.isExplore) {
                      return (
                        <div
                          key={item.key}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            aria-expanded={desktopExploreOpen}
                            onClick={() => {
                              setDesktopExploreOpen((o) => !o);
                            }}
                            className={`flex h-10 w-full items-center justify-between rounded-xl border px-3.5 text-[13.5px] font-medium transition-all cursor-pointer ${
                              desktopExploreOpen || path.startsWith("/explore")
                                ? "border-accent/40 bg-accent/15 text-white"
                                : "border-white/[0.08] bg-white/[0.02] text-text-primary hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                            }`}
                          >
                            <span>{item.label}</span>
                            <span className="text-xs text-text-muted transition-transform group-hover:translate-x-0.5">
                              ›
                            </span>
                          </button>
                          {desktopExploreOpen && (
                            <div className="ml-3 mt-2 space-y-1 border-l border-white/10 pl-2">
                              {EXPLORE_OPTIONS.map((category) => (
                                <Link key={category.to} to={category.to} role="menuitem"
                                  aria-current={path === category.to ? "page" : undefined}
                                  onClick={() => { setMenuOpen(false); setDesktopExploreOpen(false); }}
                                  className={`flex items-center rounded-lg px-3 py-2 text-sm hover:bg-white/[0.06] ${path === category.to ? "bg-accent/15 font-semibold text-white" : "text-text-primary"}`}>
                                  {category.label}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={item.key}
                        to={item.to}
                        role="menuitem"
                        aria-current={active ? "page" : undefined}
                        onClick={() => {
                          setMenuOpen(false);
                          setDesktopExploreOpen(false);
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


              </div>
            </div>
          )}
        </div>

        {/* Glowing Pill Search Input */}
        <NavSearch />
      </div>

      {/* Right Cluster: [Settings] (Kept on far right for visual balance) */}
      <div className="ml-auto flex items-center gap-2">
        <ProfileLink />
      </div>
    </nav>
  );
}

/** The user's avatar replaces the old gear and opens their profile (#33). */
function ProfileLink({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  const { path, search } = useRouter();
  const { currentUser } = useStore();
  const avatar = useMyAvatar(currentUser?.id);
  const active = isRouteActive(path, search, "profile");
  return (
    <Link
      to="/profile"
      aria-current={path === "/profile" ? "page" : undefined}
      onClick={onClick}
      title="Your profile"
      aria-label="Your profile"
      className={`flex items-center justify-center rounded-full transition-all h-11 w-11 ${
        active ? "ring-2 ring-accent ring-offset-2 ring-offset-[#05070d]" : "opacity-90 hover:opacity-100"
      }`}
    >
      <UserAvatar avatar={avatar} displayName={currentUser?.displayName} username={currentUser?.username} size="sm" className={compact ? "!h-9 !w-9 !text-sm" : "!h-10 !w-10 !text-base"} />
    </Link>
  );
}
