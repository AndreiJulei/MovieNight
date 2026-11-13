import { useSyncExternalStore } from "react";

function useMediaQuery(query: string) {
  const subscribe = (onChange: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  };
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Keep mounted interactive UI aligned with the existing navigation breakpoint. */
export default function useCompactLayout() {
  return useMediaQuery("(max-width: 1023px)");
}

/** Phone widths only (below Tailwind `md`); tablets keep the wide layouts (#28). */
export function usePhoneLayout() {
  return useMediaQuery("(max-width: 767px)");
}
