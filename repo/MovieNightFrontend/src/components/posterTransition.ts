import { flushSync } from "react-dom";
import { moviesApi } from "../api/movies";
import { setPopTransitionHandler } from "../router";
import { parseTitleId } from "../store/titleIdentity";
import { animationsEnabled } from "./motionPreference";

/**
 * #29 (PD-13): the clicked poster grows into the title page's poster, and shrinks back on Back.
 *
 * Uses the View Transitions API with one shared `view-transition-name`. The source poster gets the
 * name just for the "old" snapshot; the title page's poster (`.poster-hero-target`) carries it in
 * CSS. Without the API, MovieDetailPage plays a FLIP entrance from the PosterTransitionContext
 * start rectangle instead. With Animations off (or reduced motion by default), navigation is instant.
 */
export const POSTER_TRANSITION_NAME = "poster-hero";
/** Marks the poster element a title card exposes, so Back can find the original slot. */
export const POSTER_ID_ATTRIBUTE = "data-poster-id";

type ViewTransition = { finished: Promise<void> };
type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => ViewTransition;
};

interface OpenedTitle {
  movieId: string;
  detailPath: string;
  startRect: DOMRect;
}

let lastOpened: OpenedTitle | null = null;

const viewTransitionDocument = () =>
  typeof document === "undefined" ? undefined : (document as ViewTransitionDocument);

export function supportsViewTransitions(): boolean {
  return typeof viewTransitionDocument()?.startViewTransition === "function";
}

/**
 * Short wait usable inside a View Transition update. Frames are paused until
 * that update resolves, so a requestAnimationFrame wait never fires there and
 * froze Back until the browser's DOM-update timeout aborted the transition.
 */
const shortWait = () => new Promise<void>((resolve) => setTimeout(resolve, 16));

/** Let the destination poster decode so the morph never lands on an empty box (bounded wait). */
async function settleHeroImage(maxMs: number) {
  const img = document.querySelector<HTMLImageElement>(".poster-hero-target img");
  if (!img || (img.complete && img.naturalWidth > 0)) return;
  await Promise.race([img.decode().catch(() => undefined), new Promise((r) => setTimeout(r, maxMs))]);
}

/**
 * Navigate to a title page from a poster. `source` is the visible poster element.
 * Returns true when the View Transitions path handled the animation.
 */
export function openTitleWithTransition({
  source,
  movieId,
  url,
  navigate,
}: {
  source: HTMLElement | null;
  movieId: string;
  url: string;
  navigate: (url: string) => void;
}): boolean {
  const doc = viewTransitionDocument();
  if (!source || !doc || !animationsEnabled()) {
    lastOpened = null;
    navigate(url);
    return false;
  }
  lastOpened = {
    movieId,
    detailPath: new URL(url, window.location.origin).pathname,
    startRect: source.getBoundingClientRect(),
  };
  if (!doc.startViewTransition) {
    navigate(url);
    return false;
  }

  const root = doc.documentElement;
  // A poster on the current title page (You May Also Like) must not share the name with its hero.
  root.dataset.posterTransition = "leaving";
  source.style.setProperty("view-transition-name", POSTER_TRANSITION_NAME);
  let transition: ViewTransition;
  try {
    transition = doc.startViewTransition(async () => {
      source.style.removeProperty("view-transition-name");
      delete root.dataset.posterTransition;
      flushSync(() => navigate(url));
      await settleHeroImage(150);
    });
  } catch {
    source.style.removeProperty("view-transition-name");
    delete root.dataset.posterTransition;
    navigate(url);
    return false;
  }
  void transition.finished.catch(() => undefined).finally(() => {
    source.style.removeProperty("view-transition-name");
    delete root.dataset.posterTransition;
  });
  return true;
}

/** The on-screen card for a title nearest to where it was clicked (a title can sit in several rows). */
function findOriginalCard(opened: OpenedTitle): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(`[${POSTER_ID_ATTRIBUTE}="${CSS.escape(opened.movieId)}"]`),
  );
  let best: HTMLElement | null = null;
  let bestDistance = Infinity;
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const distance = Math.hypot(rect.left - opened.startRect.left, rect.top - opened.startRect.top);
    if (distance < bestDistance) {
      best = el;
      bestDistance = distance;
    }
  }
  return best;
}

/** Reverse morph on Back from the title page the poster opened. */
setPopTransitionHandler((update, info) => {
  const doc = viewTransitionDocument();
  const opened = lastOpened;
  // Any history step ends this opening, so a later Back never animates against a stale rectangle.
  lastOpened = null;
  const fromPath = new URL(info.fromUrl, window.location.origin).pathname;
  if (
    !opened || !doc?.startViewTransition || fromPath !== opened.detailPath ||
    info.hasUAVisualTransition || !animationsEnabled() ||
    !document.querySelector(".poster-hero-target")
  ) {
    update();
    return;
  }
  let target: HTMLElement | null = null;
  try {
    const transition = doc.startViewTransition(async () => {
      flushSync(update);
      // Restore the list position before the "new" snapshot; cached rows may need a few frames.
      const deadline = performance.now() + 300;
      while (true) {
        window.scrollTo(0, info.scrollY);
        target = findOriginalCard(opened);
        if (target || performance.now() > deadline) break;
        await shortWait();
      }
      target?.style.setProperty("view-transition-name", POSTER_TRANSITION_NAME);
    });
    void transition.finished.catch(() => undefined).finally(() => {
      target?.style.removeProperty("view-transition-name");
    });
  } catch {
    update();
  }
});

/**
 * FLIP entrance for browsers without View Transitions: animate the title page poster from the
 * clicked poster's rectangle to its own.
 */
export function playFlipEntrance(target: HTMLElement, startRect: { top: number; left: number; width: number; height: number }) {
  if (supportsViewTransitions() || !animationsEnabled() || typeof target.animate !== "function") return;
  const end = target.getBoundingClientRect();
  if (!end.width || !end.height) return;
  const dx = startRect.left - end.left;
  const dy = startRect.top - end.top;
  const sx = startRect.width / end.width;
  const sy = startRect.height / end.height;
  target.animate(
    [
      { transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transformOrigin: "top left", transform: "none" },
    ],
    { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}

// ── Prefetch (#29 TX02) ──

const HOVER_INTENT_MS = 150;

/** Start the title details request so the page renders as soon as the transition ends. */
export function prefetchTitle(movieId: string, userScope: string | undefined) {
  try {
    const identity = parseTitleId(movieId);
    if (identity.providerId == null || !identity.category) return;
    moviesApi.prefetchByTmdbId(identity.providerId, identity.category, userScope);
  } catch {
    /* an unparseable id simply is not prefetched */
  }
}

// One pointer hovers one poster at a time, so a single timer survives card re-renders.
let hoverTimer: ReturnType<typeof setTimeout> | undefined;

/** Pointer/touch press prefetches at once; desktop hover after 150 ms of intent. */
export function titlePrefetchHandlers(movieId: string, userScope: string | undefined) {
  const now = () => prefetchTitle(movieId, userScope);
  return {
    onPointerDown: now,
    onTouchStart: now,
    onMouseEnter: () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(now, HOVER_INTENT_MS);
    },
    onMouseLeave: () => clearTimeout(hoverTimer),
  };
}
