import type { ReactNode } from "react";
import useCompactLayout from "../hooks/useCompactLayout";
import NavRail from "./NavRail";
import AmbientBackground from "./AmbientBackground";

/**
 * App chrome: a fixed top nav bar on desktop (h-14), a fixed bottom strip on
 * mobile. Content reflows inside <main> with simple horizontal padding.
 */
export default function AppShell({
  children,
  fullBleed = false,
}: {
  children: ReactNode;
  fullBleed?: boolean;
}) {
  const compact = useCompactLayout();
  return (
    <div className="relative min-h-full bg-bg">
      {/* Ambient Interactive Background */}
      <AmbientBackground />

      <div className="relative z-20">
        <NavRail key={compact ? "compact" : "desktop"} orientation={compact ? "horizontal" : "vertical"} />
      </div>

      <main
        className={
          fullBleed
            ? "relative z-10 w-full pb-20 pt-0 lg:pb-16 lg:pt-14"
            : "relative z-10 mx-auto max-w-[1400px] px-5 pb-20 pt-4 lg:pb-10 lg:pt-20 lg:px-8"
        }
      >
        {children}
      </main>
    </div>
  );
}
