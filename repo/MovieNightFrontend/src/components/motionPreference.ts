import { useEffect, useState } from "react";

/**
 * #29 (PD-13): the per-device Animations setting. Without an explicit choice it follows
 * `prefers-reduced-motion`: on normally, off when the system asks for reduced motion.
 */
const ANIMATIONS_STORAGE_KEY = "movienight_animations";
export const ANIMATIONS_CHANGED_EVENT = "animations_changed";

type MotionQuery = (query: string) => Pick<MediaQueryList, "matches">;

const browserStorage = () => (typeof window === "undefined" ? undefined : window.localStorage);
const browserMatchMedia = (): MotionQuery | undefined =>
  typeof window === "undefined" || !window.matchMedia ? undefined : (q) => window.matchMedia(q);

export function prefersReducedMotion(matchMedia: MotionQuery | undefined = browserMatchMedia()): boolean {
  try {
    return Boolean(matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
}

/** The stored choice, or null when this device never chose. */
export function readAnimationsChoice(
  storage: Pick<Storage, "getItem"> | undefined = browserStorage(),
): boolean | null {
  try {
    const saved = storage?.getItem(ANIMATIONS_STORAGE_KEY);
    return saved === "on" ? true : saved === "off" ? false : null;
  } catch {
    return null;
  }
}

export function animationsEnabled(
  storage: Pick<Storage, "getItem"> | undefined = browserStorage(),
  matchMedia: MotionQuery | undefined = browserMatchMedia(),
): boolean {
  return readAnimationsChoice(storage) ?? !prefersReducedMotion(matchMedia);
}

export function saveAnimationsChoice(enabled: boolean) {
  try {
    window.localStorage.setItem(ANIMATIONS_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Still applies for this page view when storage is unavailable.
  }
  window.dispatchEvent(new Event(ANIMATIONS_CHANGED_EVENT));
}

/** Live value of the setting, updated when it or the system motion preference changes. */
export function useAnimationsEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => animationsEnabled());
  useEffect(() => {
    const update = () => setEnabled(animationsEnabled());
    window.addEventListener(ANIMATIONS_CHANGED_EVENT, update);
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    query?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener(ANIMATIONS_CHANGED_EVENT, update);
      query?.removeEventListener?.("change", update);
    };
  }, []);
  return enabled;
}
