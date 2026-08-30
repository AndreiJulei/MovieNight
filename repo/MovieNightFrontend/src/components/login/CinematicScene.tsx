import { useRef, useEffect, useState } from "react";
import loopVideo from "../../assets/login-loop.mp4";
import climaxVideo from "../../assets/login-climax.mp4";
import PosterCarousel3D from "./PosterCarousel3D";

const TEXT_HOLD_MS = 3400; // Extra second of animation hold
const FADE_MS = 800;

export default function CinematicScene({
  fading,
  onFinished,
}: {
  fading?: boolean;
  onFinished?: () => void;
}) {
  const loopRef = useRef<HTMLVideoElement>(null);
  const climaxRef = useRef<HTMLVideoElement>(null);

  // Stage 0 — idle login screen
  // Stage 1 — climax video rush (~1.5 s)
  // Stage 2 — empty ring spinning, cards sweep in one-by-one from foreground
  // Stage 3 — all cards placed → ring shrinks, "Welcome to" and "Movie Night" power on
  // Stage 4 — dissolve to black → onFinished()
  const [stage, setStage] = useState<number>(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (loopRef.current) loopRef.current.play().catch(() => {});
  }, []);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (!fading) {
      setStage(0);
      return;
    }

    // Kick off climax video
    setStage(1);
    if (climaxRef.current) {
      climaxRef.current.currentTime = 0;
      climaxRef.current.play().catch(() => {});
    }

    // After climax: show the empty ring and start the card fill-in
    timers.current.push(window.setTimeout(() => setStage(2), 1500));

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [fading]);

  // PosterCarousel3D fires this the instant every card has landed
  const handleAllPlaced = () => {
    setStage(3);
    timers.current.push(window.setTimeout(() => setStage(4), TEXT_HOLD_MS));
  };

  // Stage 4 → wait for the blackout CSS transition, then signal done
  useEffect(() => {
    if (stage !== 4) return;
    const t = window.setTimeout(() => onFinished?.(), FADE_MS);
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [stage, onFinished]);

  return (
    <div className="absolute inset-0 h-full w-full overflow-hidden bg-[#070b16]">
      <style>{`
        /* Neon power-on: bright flash, brief dip, second flare, settle */
        @keyframes neonOn {
          0%   { opacity: 0;    text-shadow: none; transform: translateY(6px); }
          20%  { opacity: 1;    text-shadow: 0 0 4px rgba(255,255,255,0.9), 0 0 35px rgba(99,102,241,0.85); transform: translateY(0); }
          35%  { opacity: 0.65; text-shadow: 0 0 2px rgba(255,255,255,0.4), 0 0 10px rgba(99,102,241,0.3); }
          55%  { opacity: 1;    text-shadow: 0 0 3px rgba(255,255,255,0.85), 0 0 24px rgba(99,102,241,0.7); }
          100% { opacity: 1;    text-shadow: 0 0 1px rgba(255,255,255,0.5),  0 0 12px rgba(99,102,241,0.3); }
        }
        .neon-text { opacity: 0; }
        .neon-text.on {
          animation: neonOn 1400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .neon-text.on {
            animation: none;
            opacity: 1;
            text-shadow: 0 0 8px rgba(99,102,241,0.3);
          }
        }
      `}</style>

      {/* ── Unified Fullscreen Bluish Background Canvas ── */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          background:
            "radial-gradient(ellipse 90% 90% at 50% 50%, #0c1228 0%, #070b16 65%, #04060d 100%)",
        }}
      />

      {/* ── 1. Idle loop ── */}
      <video
        ref={loopRef}
        src={loopVideo}
        autoPlay
        loop
        muted
        playsInline
        className={`absolute inset-0 h-full w-full object-cover object-center brightness-95 contrast-105 transition-opacity duration-500 ${
          stage >= 1 ? "opacity-0" : "opacity-100"
        }`}
      />

      {/* ── 2. Climax flythrough ── */}
      <video
        ref={climaxRef}
        src={climaxVideo}
        muted
        playsInline
        className={`absolute inset-0 h-full w-full object-cover object-center brightness-95 contrast-105 transition-opacity duration-700 ${
          stage === 1 ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* ── 3. Carousel + text composition ── */}
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-1000 ${
          stage >= 2 && stage < 4
            ? "opacity-100"
            : "opacity-0 pointer-events-none"
        }`}
      >
        {/* "Welcome to" — top, above the ring */}
        <span
          className={`neon-text text-[12px] font-bold uppercase tracking-[0.4em] text-zinc-300 mb-2 md:mb-4 ${
            stage >= 3 ? "on" : ""
          }`}
        >
          Welcome to
        </span>

        {/* 3D ring — ample height, overflow visible so bottom of cards never clips */}
        <div
          className={`relative w-full overflow-visible transition-transform duration-1000 ${
            stage >= 3 ? "scale-[0.82]" : "scale-100"
          }`}
          style={{
            height: "clamp(340px, 54vh, 500px)",
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <PosterCarousel3D play={stage >= 2} onAllPlaced={handleAllPlaced} />
        </div>

        {/* "Movie Night" — bottom wordmark */}
        <div
          className={`neon-text mt-3 flex items-baseline justify-center gap-2 md:mt-5 ${
            stage >= 3 ? "on" : ""
          }`}
          style={{ animationDelay: "200ms" }}
        >
          <span
            className="text-3xl font-black tracking-tight text-white md:text-4xl"
            style={{ fontFamily: "'Georgia', 'Playfair Display', serif" }}
          >
            Movie
          </span>
          <span
            className="text-3xl font-black tracking-tight text-accent md:text-4xl"
            style={{ fontFamily: "'Georgia', 'Playfair Display', serif" }}
          >
            Night
          </span>
        </div>
      </div>

      {/* Cinematic side vignette (only visible on idle login screen) */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
          stage === 0 ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(90deg, rgba(4,6,11,0.15) 0%, rgba(4,6,11,0.4) 45%, rgba(4,6,11,0.85) 75%, rgba(4,6,11,0.94) 100%)",
        }}
      />

      {/* Soft top/bottom fade (only visible on idle) */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
          stage === 0 ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(to bottom, rgba(4,6,11,0.7) 0%, transparent 20%, transparent 80%, rgba(4,6,11,0.7) 100%)",
        }}
      />

      {/* Final blackout veil */}
      <div
        className={`pointer-events-none absolute inset-0 bg-[#05070D] transition-opacity ${
          stage >= 4 ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDuration: `${FADE_MS}ms` }}
      />
    </div>
  );
}
