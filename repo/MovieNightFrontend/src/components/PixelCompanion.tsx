import { useEffect, useRef, useState } from "react";
import { useRouter } from "../router";
import EvilEye from "./EvilEye";

// John Wick Sprites
import wickLeftIdle from "../assets/wick-left-idle.png";
import wickLeftShoot from "../assets/wick-left-shoot.png";
import wickCenterIdle from "../assets/wick-center-idle.png";
import wickRightIdle from "../assets/wick-right-idle.png";
import wickRightShoot from "../assets/wick-right-shoot.png";

// Pulp Fiction Sprites (Vincent & Jules)
import pulpIdle from "../assets/pulp-idle.png";
import pulpShoot from "../assets/pulp-shoot.png";

// Courage the Cowardly Dog (3-state slow idle loop + 1 hover state + 4-frame scream)
import courageIdle0 from "../assets/courage-idle-0.png";
import courageIdle1 from "../assets/courage-idle-1.png";
import courageIdle2 from "../assets/courage-idle-2.png";
import courageHoverAlert from "../assets/courage-idle-3.png";

import courageScream0 from "../assets/courage-scream-0.png";
import courageScream1 from "../assets/courage-scream-1.png";
import courageScream2 from "../assets/courage-scream-2.png";
import courageScream3 from "../assets/courage-scream-3.png";

export type CompanionCharacter = "wick" | "pulp" | "courage" | "sauron" | "none";
type Pose = "left" | "center" | "right";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Courage Idle: 3 states
const COURAGE_IDLE_FRAMES = [courageIdle0, courageIdle1, courageIdle2];
const COURAGE_SCREAM_FRAMES = [
  courageScream0,
  courageScream1,
  courageScream2,
  courageScream3,
];

export default function PixelCompanion() {
  const { path } = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [character, setCharacter] = useState<CompanionCharacter>(() => {
    if (typeof window !== "undefined") {
      return (
        (localStorage.getItem("pixel_companion_char") as CompanionCharacter) ||
        "wick"
      );
    }
    return "wick";
  });

  const [pose, setPose] = useState<Pose>("left");
  const [tilt, setTilt] = useState(0);
  const [isActing, setIsActing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Courage sequential animation indexes
  const [courageIdleIdx, setCourageIdleIdx] = useState(0);
  const [courageScreamIdx, setCourageScreamIdx] = useState(0);

  const actionTimers = useRef<number[]>([]);

  // Clear timers safely
  const clearAllActionTimers = () => {
    actionTimers.current.forEach((t) => window.clearTimeout(t));
    actionTimers.current = [];
  };

  // Listen for storage / custom events to update character dynamically
  useEffect(() => {
    const handleStorage = () => {
      const saved =
        (localStorage.getItem("pixel_companion_char") as CompanionCharacter) ||
        "wick";
      setCharacter(saved);
      clearAllActionTimers();
      setIsActing(false);
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("companion_changed", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("companion_changed", handleStorage);
      clearAllActionTimers();
    };
  }, []);

  // Courage slow idle cycle: changes only once every 2.5 seconds among 3 states
  useEffect(() => {
    if (character !== "courage" || isActing || isHovered || prefersReduced())
      return;
    const interval = window.setInterval(() => {
      setCourageIdleIdx((prev) => (prev + 1) % COURAGE_IDLE_FRAMES.length);
    }, 2500);
    return () => window.clearInterval(interval);
  }, [character, isActing, isHovered]);

  const cycleCharacter = (e: React.MouseEvent) => {
    e.stopPropagation();
    const order: CompanionCharacter[] = ["wick", "pulp", "courage", "sauron"];
    const currIdx = order.indexOf(character);
    const next = order[(currIdx + 1) % order.length];
    setCharacter(next);
    localStorage.setItem("pixel_companion_char", next);
    window.dispatchEvent(new Event("companion_changed"));
  };

  useEffect(() => {
    if (prefersReduced() || character === "none") return;

    const handleMouseMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 3;

      const deltaX = e.clientX - centerX;
      const deltaY = e.clientY - centerY;

      // 1. Horizontal direction
      let nextPose: Pose = "center";
      if (deltaX < -35) {
        nextPose = "left";
      } else if (deltaX > 35) {
        nextPose = "right";
      }
      setPose(nextPose);

      // 2. Vertical aiming orientation for John Wick
      const normalizedY = deltaY / window.innerHeight;
      const magnitude = Math.max(-12, Math.min(12, normalizedY * 16));

      if (nextPose === "left") {
        setTilt(-magnitude);
      } else if (nextPose === "right") {
        setTilt(magnitude);
      } else {
        setTilt(0);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.closest(".companion-control-btn")) return;

      clearAllActionTimers();
      setIsActing(true);

      if (character === "courage") {
        // Step through Courage screaming sequence frame-by-frame
        setCourageScreamIdx(0);
        actionTimers.current.push(
          window.setTimeout(() => setCourageScreamIdx(1), 70),
        );
        actionTimers.current.push(
          window.setTimeout(() => setCourageScreamIdx(2), 140),
        );
        actionTimers.current.push(
          window.setTimeout(() => setCourageScreamIdx(3), 210),
        );
        actionTimers.current.push(
          window.setTimeout(() => {
            setIsActing(false);
            setCourageScreamIdx(0);
          }, 450),
        );
      } else if (character === "pulp") {
        // Pulp Fiction shooting action
        actionTimers.current.push(
          window.setTimeout(() => {
            setIsActing(false);
          }, 350),
        );
      } else if (character === "sauron") {
        // Sauron blazing flare eruption
        actionTimers.current.push(
          window.setTimeout(() => {
            setIsActing(false);
          }, 450),
        );
      } else {
        // John Wick muzzle flash & recoil
        actionTimers.current.push(
          window.setTimeout(() => {
            setIsActing(false);
          }, 240),
        );
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mousedown", handleMouseDown);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      clearAllActionTimers();
    };
  }, [character]);

  // Completely hide on the login page
  if (path === "/login" || character === "none") return null;

  // Character-specific rendering
  const renderCharacterContent = () => {
    // 1. JOHN WICK
    if (character === "wick") {
      let src = wickLeftIdle;
      if (isActing) {
        src = pose === "right" ? wickRightShoot : wickLeftShoot;
      } else {
        if (pose === "right") src = wickRightIdle;
        else if (pose === "center") src = wickCenterIdle;
        else src = wickLeftIdle;
      }

      const recoil = isActing
        ? pose === "right"
          ? "translateX(-6px)"
          : "translateX(6px)"
        : "translateX(0px)";

      return (
        <div
          className="pointer-events-none relative transition-transform duration-100 ease-out"
          style={{
            transform: `rotate(${pose === "center" ? 0 : tilt}deg) ${recoil}`,
            transformOrigin: "bottom center",
          }}
        >
          <img
            src={src}
            alt="John Wick"
            draggable={false}
            className="pixelated h-36 w-auto object-contain filter drop-shadow-[0_12px_22px_rgba(0,0,0,0.85)] lg:h-44"
            style={{
              imageRendering: "pixelated",
              animation: !isActing ? "wickBreathe 3s ease-in-out infinite" : undefined,
            }}
          />
          {isActing && (
            <div
              className={`absolute top-[10%] ${
                pose === "right" ? "right-[-10px]" : "left-[-10px]"
              }`}
              style={{ animation: "muzzleFlash 0.15s ease-out forwards" }}
            >
              <div className="h-6 w-8 rounded-full bg-[#FFF4CF] blur-[1px] opacity-90" />
              <div className="absolute inset-0 h-4 w-6 rounded-full bg-[#FFD36B] blur-[2px] opacity-80" />
            </div>
          )}
        </div>
      );
    }

    // 2. PULP FICTION (Vincent Vega & Jules Winnfield)
    if (character === "pulp") {
      const isRight = pose === "right";
      const recoil = isActing
        ? isRight
          ? "translateX(-8px)"
          : "translateX(8px)"
        : "translateX(0px)";

      return (
        <div
          className="pointer-events-none relative transition-transform duration-120 ease-out"
          style={{
            transform: `scaleX(${isRight ? -1 : 1}) ${recoil}`,
            transformOrigin: "bottom center",
          }}
        >
          <img
            src={isActing ? pulpShoot : pulpIdle}
            alt="Pulp Fiction"
            draggable={false}
            className="pixelated h-36 w-auto object-contain filter drop-shadow-[0_12px_22px_rgba(0,0,0,0.85)] lg:h-44"
            style={{
              imageRendering: "pixelated",
              animation: !isActing ? "wickBreathe 3s ease-in-out infinite" : undefined,
            }}
          />

          {/* Dual Muzzle Fire Flashes & Ejected Cartridge Shell Casings */}
          {isActing && (
            <>
              {/* Vincent Gun Muzzle Flame (Left gun) */}
              <div
                className="absolute top-[41%] left-[-16px] pointer-events-none"
                style={{ animation: "pulpMuzzleFire 0.18s ease-out forwards" }}
              >
                <div className="h-6 w-9 rounded-full bg-[#ff7a00] blur-[1.5px] opacity-95 shadow-[0_0_12px_#ff7a00]" />
                <div className="absolute inset-0.5 h-4 w-7 rounded-full bg-[#ffe48a] blur-[1px]" />
                <div className="absolute inset-1.5 h-2 w-4 rounded-full bg-white" />
              </div>

              {/* Jules Gun Muzzle Flame (Right gun) */}
              <div
                className="absolute top-[36%] left-[24%] pointer-events-none"
                style={{ animation: "pulpMuzzleFire 0.18s 0.03s ease-out forwards" }}
              >
                <div className="h-5 w-8 rounded-full bg-[#ff7a00] blur-[1.5px] opacity-95 shadow-[0_0_12px_#ff7a00]" />
                <div className="absolute inset-0.5 h-3.5 w-6 rounded-full bg-[#ffe48a] blur-[1px]" />
                <div className="absolute inset-1.5 h-1.5 w-3 rounded-full bg-white" />
              </div>

              {/* Vincent Ejected Brass Shell Casing */}
              <div
                className="absolute top-[40%] left-[8%] h-2 w-3.5 rounded-sm bg-[#ffd700] border border-[#b8860b] shadow-[0_0_4px_#ffd700]"
                style={{ animation: "cartridgeEject 0.32s cubic-bezier(0.25, 1, 0.5, 1) forwards" }}
              />

              {/* Jules Ejected Brass Shell Casing */}
              <div
                className="absolute top-[35%] left-[38%] h-2 w-3.5 rounded-sm bg-[#ffd700] border border-[#b8860b] shadow-[0_0_4px_#ffd700]"
                style={{ animation: "cartridgeEject 0.32s 0.04s cubic-bezier(0.25, 1, 0.5, 1) forwards" }}
              />
            </>
          )}
        </div>
      );
    }

    // 3. COURAGE THE COWARDLY DOG
    if (character === "courage") {
      const isRight = pose === "right";

      let activeSrc = COURAGE_IDLE_FRAMES[courageIdleIdx];
      if (isActing) {
        activeSrc = COURAGE_SCREAM_FRAMES[courageScreamIdx];
      } else if (isHovered) {
        activeSrc = courageHoverAlert; // 4th state on hover!
      }

      return (
        <div
          className="pointer-events-none relative transition-transform duration-100 ease-out"
          style={{
            transform: `scaleX(${isRight ? -1 : 1})`,
            transformOrigin: "bottom center",
          }}
        >
          <img
            src={activeSrc}
            alt="Courage the Cowardly Dog"
            draggable={false}
            className="pixelated h-34 w-auto object-contain filter drop-shadow-[0_12px_20px_rgba(0,0,0,0.85)] lg:h-42"
            style={{
              imageRendering: "pixelated",
              animation: isActing
                ? "shiverScream 0.08s infinite alternate"
                : undefined,
            }}
          />
        </div>
      );
    }

    // 4. SAURON (The Eye of Sauron - 100% Transparent Background)
    if (character === "sauron") {
      return (
        <div className="pointer-events-none relative flex flex-col items-center bg-transparent">
          <div className="relative h-44 w-44 lg:h-52 lg:w-52 bg-transparent">
            {/* The Great Eye Shader - Pure Transparent Canvas */}
            <div className="absolute inset-0 bg-transparent">
              <EvilEye
                eyeColor="#FF6F37"
                intensity={isActing ? 2.8 : isHovered ? 2.0 : 1.5}
                pupilSize={0.6}
                irisWidth={0.25}
                glowIntensity={isActing ? 0.8 : isHovered ? 0.5 : 0.35}
                scale={isActing ? 0.92 : isHovered ? 0.88 : 0.8}
                noiseScale={1.0}
                pupilFollow={1.0}
                flameSpeed={isActing ? 2.5 : 1.0}
                backgroundColor="#000000"
              />
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const getLabel = () => {
    switch (character) {
      case "wick":
        return "JOHN WICK";
      case "pulp":
        return "PULP FICTION";
      case "courage":
        return "COURAGE";
      case "sauron":
        return "SAURON";
      default:
        return "COMPANION";
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="fixed bottom-3 right-4 z-40 flex flex-col items-center select-none lg:bottom-5 lg:right-7 cursor-pointer"
    >
      {/* Switch Character Quick Toggle Pill */}
      <button
        onClick={cycleCharacter}
        title="Click to cycle companion (or configure in Settings)"
        className="companion-control-btn mb-1.5 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/65 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-zinc-300 backdrop-blur-md transition-all hover:border-accent hover:bg-black/90 hover:text-white active:scale-95 shadow-md"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        {getLabel()}
      </button>

      {renderCharacterContent()}
    </div>
  );
}
