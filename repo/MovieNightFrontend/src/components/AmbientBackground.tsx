import { useEffect, useState } from "react";
import CursorGrid from "./CursorGrid";
import GradientBlinds from "./GradientBlinds";

export type BackgroundType = "grid" | "blinds" | "blank";

export default function AmbientBackground() {
  const [bgType, setBgType] = useState<BackgroundType>(() => {
    if (typeof window !== "undefined") {
      return (
        (localStorage.getItem("app_background_type") as BackgroundType) || "grid"
      );
    }
    return "grid";
  });

  useEffect(() => {
    const handleBgChange = () => {
      const saved =
        (localStorage.getItem("app_background_type") as BackgroundType) ||
        "grid";
      setBgType(saved);
    };

    window.addEventListener("storage", handleBgChange);
    window.addEventListener("background_changed", handleBgChange);

    return () => {
      window.removeEventListener("storage", handleBgChange);
      window.removeEventListener("background_changed", handleBgChange);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#05070D]">
      {/* 1. Neon Cursor Grid */}
      {bgType === "grid" && (
        <CursorGrid
          cellSize={36}
          color="#D946EF"
          radius={75}
          falloff="smooth"
          holdTime={200}
          fadeDuration={400}
          lineWidth={1.1}
          maxOpacity={0.95}
          fillOpacity={0}
          gridOpacity={0.05}
          cellRadius={0}
          clickPulse={false}
          className="absolute inset-0"
        />
      )}

      {/* 2. Gradient Blinds Shader */}
      {bgType === "blinds" && (
        <div className="absolute inset-0">
          <GradientBlinds
            gradientColors={["#FF9FFC", "#5227FF"]}
            angle={20}
            noise={0.06}
            blindCount={16}
            blindMinWidth={60}
            spotlightRadius={0.32}
            spotlightSoftness={1}
            spotlightOpacity={0.85}
            mouseDampening={0.12}
            distortAmount={0}
            shineDirection="left"
            className="h-full w-full"
          />
        </div>
      )}

      {/* 3. Blank: clean pure obsidian */}
      {bgType === "blank" && <div className="absolute inset-0 bg-[#05070D]" />}

      {/* Subtle Corner Vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(5,7,13,0.55)_80%,rgba(5,7,13,0.9)_100%)]" />
    </div>
  );
}
