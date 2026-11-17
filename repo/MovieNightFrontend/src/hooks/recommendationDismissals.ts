import { useSyncExternalStore } from "react";
import type { Movie } from "../store/data";

/**
 * Personal recommendations the user dismissed ("Not interested", #40) in this tab, keyed by user.
 * Shared by every mounted list, so the Home row and View all agree while the request is in flight;
 * the server excludes dismissed titles from later responses.
 */
const dismissedByUser = new Map<string, ReadonlySet<number>>();
const listeners = new Set<() => void>();
const NONE: ReadonlySet<number> = new Set();

/**
 * A second tap on the same slot of the same list this soon after a dismissal is a double tap: the next
 * card has slid in under the pointer, and the tap is not a decision about it (RM04).
 */
const DOUBLE_TAP_MS = 600;
const lastDismissalByList = new WeakMap<object, { index: number; at: number }>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function dismissedRecommendations(userId: string | undefined): ReadonlySet<number> {
  return (userId && dismissedByUser.get(userId)) || NONE;
}

export function setRecommendationDismissed(userId: string, tmdbId: number, dismissed: boolean) {
  const current = dismissedRecommendations(userId);
  if (current.has(tmdbId) === dismissed) return;
  const next = new Set(current);
  if (dismissed) next.add(tmdbId); else next.delete(tmdbId);
  dismissedByUser.set(userId, next);
  listeners.forEach((listener) => listener());
}

/** True when this activation at `index` of `list` should dismiss, false for the second tap of a double tap. */
export function acceptDismissalTap(list: object, index: number, now = Date.now()): boolean {
  const last = lastDismissalByList.get(list);
  if (last && last.index === index && now - last.at < DOUBLE_TAP_MS) return false;
  lastDismissalByList.set(list, { index, at: now });
  return true;
}

export function useDismissedRecommendations(userId: string | undefined): ReadonlySet<number> {
  return useSyncExternalStore(subscribe, () => dismissedRecommendations(userId), () => NONE);
}

/**
 * How a card asks to be dismissed. `keyboard` moves focus to the toast's Undo; `restoreFocus` puts it
 * back in the list (the next card, or the restored one after Undo) when the toast closes.
 */
export type DismissRecommendation = (
  movie: Movie,
  focus: { keyboard: boolean; restoreFocus: () => void },
) => void;
