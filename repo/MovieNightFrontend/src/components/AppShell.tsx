import type { ReactNode } from "react";
import NavRail from "./NavRail";
import AmbientBackground from "./AmbientBackground";

/**
 * App chrome: a fixed top nav bar on desktop (h-14), a fixed bottom strip on
 * mobile. Content reflows inside <main> with simple horizontal padding.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-full bg-bg">
      {/* Ambient Interactive Background */}
      <AmbientBackground />

      {/* Desktop: top bar */}
      <div className="relative z-20 hidden lg:block">
        <NavRail orientation="vertical" />
      </div>
      {/* Mobile: bottom strip */}
      <div className="relative z-20 lg:hidden">
        <NavRail orientation="horizontal" />
      </div>

      <main className="relative z-10 mx-auto max-w-[1400px] px-5 pb-20 pt-4 lg:pb-10 lg:pt-20 lg:px-8">
        {children}
      </main>
    </div>
  );
}
