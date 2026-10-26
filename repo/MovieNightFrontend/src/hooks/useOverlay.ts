import { useEffect } from "react";

/**
 * Calls `onEscape` when the Escape key is pressed while `active` is true.
 * Designed for modals, sheets, and dropdowns.
 */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onEscape();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [active, onEscape]);
}

/**
 * Locks body scroll when `active` is true. Restores on unmount or deactivation.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

/** Focus entry/return for overlays; modal overlays also contain keyboard focus. */
export function useOverlayFocus(
  active: boolean,
  container: import("react").RefObject<HTMLElement | null>,
  modal = false,
) {
  useEffect(() => {
    const panel = container.current;
    if (!active || !panel) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), iframe, [tabindex="0"]',
    )).filter(element => element.getClientRects().length && !element.closest('[inert]') && !element.hasAttribute('data-focus-guard'));
    (controls()[0] ?? panel).focus();
    const onTab = (event: KeyboardEvent) => {
      if (!modal || event.key !== "Tab") return;
      const items = controls();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) { event.preventDefault(); panel.focus(); return; }
      if (!panel.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    // Native Tab can leave an iframe without a parent-document keydown event.
    const onFocus = (event: FocusEvent) => {
      if (modal && !panel.contains(event.target as Node)) (controls()[0] ?? panel).focus();
    };
    document.addEventListener("keydown", onTab);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onTab);
      document.removeEventListener("focusin", onFocus);
      if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus();
    };
  }, [active, container, modal]);
}
