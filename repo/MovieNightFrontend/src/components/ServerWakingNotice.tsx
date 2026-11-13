import { useSyncExternalStore } from "react";
import { isServerWaking, subscribeServerWaking } from "../api/serverWake";

/**
 * Non-blocking notice while a read waits on a sleeping free-tier backend (#18). The live region
 * stays mounted so screen readers announce the message when it appears.
 */
export default function ServerWakingNotice() {
  const waking = useSyncExternalStore(subscribeServerWaking, isServerWaking, () => false);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-3 z-[110] flex justify-center px-4"
    >
      {waking && (
        <p className="flex items-center gap-2.5 rounded-lg border border-white/15 bg-[#0e1320]/95 px-4 py-2 text-sm text-text-primary shadow-2xl backdrop-blur-xl">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
          Waking up the server… this can take up to a minute.
        </p>
      )}
    </div>
  );
}
