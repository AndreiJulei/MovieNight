interface RetroTvLogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

export default function RetroTvLogo({
  size = "md",
  className = "",
}: RetroTvLogoProps) {
  // Size mapping: compact and proportionate
  const fontSizes = {
    xs: "7px", // for mobile bars
    sm: "8px", // for nav rail header
    md: "10px", // for login form header
    lg: "13px", // for main transition screen (refined, not oversized)
    xl: "16px",
  };

  return (
    <div
      className={`inline-flex items-center justify-center select-none ${className}`}
      style={{ fontSize: fontSizes[size] }}
    >
      <div className="relative flex flex-col items-center">
        {/* Dual V-Antenna & Base Dial */}
        <div className="relative z-0 mb-[-3.5em] flex flex-col items-center">
          {/* Dual Metallic Aerials */}
          <div className="relative h-[4.5em] w-[11em]">
            {/* Left Aerial Antenna */}
            <div
              className="absolute bottom-0 left-[2.2em] h-[5em] w-[3px] origin-bottom -rotate-[32deg] rounded-full shadow-md"
              style={{
                background: "linear-gradient(to top, #111, #555, #999, #222)",
              }}
            >
              <div className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full border border-black bg-[#aaa] shadow-inner" />
            </div>

            {/* Right Aerial Antenna */}
            <div
              className="absolute bottom-0 right-[2.2em] h-[5.2em] w-[3px] origin-bottom rotate-[30deg] rounded-full shadow-md"
              style={{
                background: "linear-gradient(to top, #111, #555, #999, #222)",
              }}
            >
              <div className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full border border-black bg-[#aaa] shadow-inner" />
            </div>
          </div>

          {/* Antenna Dial Hub - Sleek Dark Obsidian */}
          <div className="relative -mt-3.5 h-[3.2em] w-[3.2em] rounded-full border-2 border-black/80 bg-[#121624] shadow-[inset_-2px_-2px_4px_#090c15,inset_2px_2px_4px_#1e2538]">
            <div className="absolute inset-1 rounded-full border border-white/5 bg-gradient-to-tr from-[#0b0e18] to-[#1c2236]" />
          </div>
        </div>

        {/* TV Main Body Chassis - Sleek Black / Cyber Obsidian */}
        <div
          className="relative z-10 flex h-[10.2em] w-[18.5em] items-center justify-between rounded-[16px] border-2 border-black/80 bg-[#0e121e] p-[0.75em] shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_#05070c,0_12px_30px_rgba(0,0,0,0.85)]"
        >
          {/* Glass Reflection Arc */}
          <div className="pointer-events-none absolute top-1.5 left-1.5 h-6 w-6 opacity-40">
            <svg
              viewBox="0 0 190 190"
              fill="#ffffff"
              className="h-full w-full"
            >
              <path d="M70.343,70.343c-30.554,30.553-44.806,72.7-39.102,115.635l-29.738,3.951C-5.442,137.659,11.917,86.34,49.129,49.13C86.34,11.918,137.664-5.445,189.928,1.502l-3.95,29.738C143.041,25.54,100.895,39.789,70.343,70.343z" />
            </svg>
          </div>

          {/* CRT Screen Frame */}
          <div className="relative flex h-full w-[12.8em] items-center justify-center rounded-[12px] border-2 border-black/90 bg-[#05070d] shadow-[inset_0_0_15px_rgba(0,0,0,0.95),1.5px_1.5px_0_rgba(255,255,255,0.05)]">
            {/* Screen Inner Glass Tube */}
            <div className="relative flex h-[92%] w-[94%] flex-col items-center justify-center overflow-hidden rounded-[8px] border border-black/60 bg-gradient-to-b from-[#060914] via-[#090e22] to-[#04060e]">
              {/* Glowing Crescent Moon & Stars in Background */}
              <div className="pointer-events-none absolute inset-0">
                {/* Crescent Moon */}
                <div className="absolute top-1.5 right-3 h-4 w-4 rounded-full bg-transparent shadow-[2.5px_-1.5px_0_1px_#ffe494,0_0_8px_#ffe494]" />

                {/* Sparkling Stars */}
                <div className="absolute top-2 left-3 h-0.5 w-0.5 rounded-full bg-white/80 shadow-[0_0_3px_#fff]" />
                <div className="absolute top-5 left-5 h-0.5 w-0.5 rounded-full bg-white/50" />
                <div className="absolute bottom-2.5 right-5 h-0.5 w-0.5 rounded-full bg-white/60" />
                <div className="absolute bottom-3 left-4 h-0.5 w-0.5 rounded-full bg-white/40" />
              </div>

              {/* CRT Scanline Horizontal Overlay */}
              <div
                className="pointer-events-none absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.08) 50%, transparent 50%)",
                  backgroundSize: "100% 4px",
                }}
              />

              {/* Movie Night Typography inside CRT Screen */}
              <div className="relative z-10 flex flex-col items-center text-center font-sans tracking-wider">
                <span className="text-[1.1em] font-black uppercase leading-none text-white drop-shadow-[0_0_8px_rgba(100,108,255,0.85)]">
                  Movie
                </span>
                <span className="mt-[0.12em] text-[1.18em] font-black uppercase leading-none text-[#ffe494] drop-shadow-[0_0_10px_rgba(255,228,148,0.9)]">
                  Night
                </span>
              </div>
            </div>
          </div>

          {/* Right TV Controls & Speaker Area - Sleek Dark Obsidian */}
          <div className="flex h-full w-[3.8em] flex-col items-center justify-between rounded-[8px] border-2 border-black/80 bg-[#121624] p-[0.35em] shadow-[inset_1.5px_1.5px_0_rgba(255,255,255,0.06),1.5px_1.5px_0_#05070c]">
            {/* Top Rotary Dial 1 */}
            <div className="relative h-[1.7em] w-[1.7em] rounded-full border-2 border-black/90 bg-[#1c2236] shadow-[inset_1.5px_1.5px_1px_rgba(255,255,255,0.1),-1.5px_0_0_1px_black]">
              <div className="absolute top-1/2 left-1/2 h-[0.7em] w-[2px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-sm bg-[#646cff]" />
            </div>

            {/* Bottom Rotary Dial 2 */}
            <div className="relative h-[1.7em] w-[1.7em] rounded-full border-2 border-black/90 bg-[#1c2236] shadow-[inset_1.5px_1.5px_1px_rgba(255,255,255,0.1),-1.5px_0_0_1px_black]">
              <div className="absolute top-1/2 left-1/2 h-[0.7em] w-[2px] -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-sm bg-[#ffe494]" />
            </div>

            {/* Speaker Grill Ventilation Lines */}
            <div className="flex w-full flex-col gap-[3px] px-1 pb-1">
              <div className="h-[2px] w-full rounded-full bg-black/80" />
              <div className="h-[2px] w-full rounded-full bg-black/80" />
              <div className="h-[2px] w-full rounded-full bg-black/80" />
              <div className="h-[2px] w-full rounded-full bg-black/80" />
            </div>
          </div>
        </div>

        {/* TV Rubber Feet Stand */}
        <div className="relative z-0 flex w-full justify-between px-[2.8em]">
          <div className="h-[0.7em] w-[1.8em] rounded-b-md border-2 border-t-0 border-black/90 bg-[#1c202e] shadow-md" />
          <div className="h-[0.7em] w-[1.8em] rounded-b-md border-2 border-t-0 border-black/90 bg-[#1c202e] shadow-md" />
        </div>
      </div>
    </div>
  );
}
