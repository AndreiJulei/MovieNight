import type { ReactNode } from "react";
import useCompactLayout from "../hooks/useCompactLayout";
import NavRail from "./NavRail";
import OfflineBanner from "./OfflineBanner";
import { WIDE_CONTENT_CLASS } from "./layout";

const MAIN_CLASS = {
  default:
    "relative z-10 mx-auto max-w-[1400px] px-5 pb-20 pt-4 lg:pb-10 lg:pt-20 lg:px-8",
  // #21/#22: rows and poster grids use the wide, capped content area.
  wide: `relative z-10 ${WIDE_CONTENT_CLASS} pb-20 pt-4 lg:pb-10 lg:pt-20`,
  fullBleed: "relative z-10 w-full pb-20 pt-0 lg:pb-16 lg:pt-14",
} as const;

/**
 * App chrome: a fixed top nav bar on desktop (h-14), a fixed bottom strip on
 * mobile. Content reflows inside <main> with simple horizontal padding.
 */
export default function AppShell({
  children,
  fullBleed = false,
  width = "default",
}: {
  children: ReactNode;
  fullBleed?: boolean;
  width?: "default" | "wide";
}) {
  const compact = useCompactLayout();
  return (
    <div className="relative min-h-full bg-bg">
      <div className="relative z-20">
        <NavRail key={compact ? "compact" : "desktop"} orientation={compact ? "horizontal" : "vertical"} />
      </div>

      <main className={MAIN_CLASS[fullBleed ? "fullBleed" : width]}>
        <OfflineBanner />
        {children}
      </main>
    </div>
  );
}
