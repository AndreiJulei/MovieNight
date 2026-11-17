import type { MouseEvent } from "react";
import type { Movie } from "../store/data";
import { acceptDismissalTap, type DismissRecommendation } from "../hooks/recommendationDismissals";

/** Marks the control so a list can move focus to the neighbouring card's control after a dismissal. */
export const NOT_INTERESTED_ATTRIBUTE = "data-not-interested";

/**
 * "Not interested" ✕ on a personal recommendation card (#40). The target is 44 px; the visible
 * disc is smaller. Always shown on touch screens; on pointer devices it appears on hover or focus.
 */
export default function NotInterestedButton({
  title,
  onActivate,
  className = "",
}: {
  title: string;
  /** `keyboard` is true when Enter/Space activated the button (a click with no pointer position). */
  onActivate: (keyboard: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      {...{ [NOT_INTERESTED_ATTRIBUTE]: "" }}
      aria-label={`Not interested in ${title}`}
      title="Not interested"
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        onActivate(e.detail === 0);
      }}
      className={`group/dismiss absolute z-20 flex h-11 w-11 items-center justify-center rounded-full outline-none transition-opacity duration-150 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100 [@media(hover:hover)]:group-focus-within/card:opacity-100 ${className}`}
    >
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/75 text-white shadow-md backdrop-blur-sm transition-colors group-hover/dismiss:border-white/50 group-hover/dismiss:bg-black group-focus-visible/dismiss:outline-2 group-focus-visible/dismiss:outline-offset-1 group-focus-visible/dismiss:outline-accent"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </span>
    </button>
  );
}

/** Focuses the "Not interested" control now at `index` in `container` (or the last one), after React re-renders. */
export function focusNotInterestedAt(container: HTMLElement | null, index: number) {
  requestAnimationFrame(() => {
    if (!container) return;
    const controls = container.querySelectorAll<HTMLElement>(`[${NOT_INTERESTED_ATTRIBUTE}]`);
    const target = controls[Math.min(index, controls.length - 1)];
    // Nothing left in the list: the list itself takes focus rather than the document body.
    (target ?? container).focus({ preventScroll: false });
  });
}

/**
 * Dismisses the card at `index` of a list (#40). A second tap on the same slot within the double-tap
 * window is ignored (RM04); focus returns to that slot when the toast closes.
 */
export function dismissFromList(
  onDismiss: DismissRecommendation,
  movie: Movie,
  list: { readonly current: HTMLElement | null },
  index: number,
  keyboard: boolean,
) {
  if (!acceptDismissalTap(list, index)) return;
  onDismiss(movie, { keyboard, restoreFocus: () => focusNotInterestedAt(list.current, index) });
}
