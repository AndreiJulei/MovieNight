import { useSyncExternalStore } from "react";

const query = "(max-width: 1023px)";
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

/** Keep mounted interactive UI aligned with the existing navigation breakpoint. */
export default function useCompactLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
