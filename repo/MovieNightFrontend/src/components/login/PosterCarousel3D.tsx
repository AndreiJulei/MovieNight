import { useEffect, useRef, useState } from "react";
import { mockPosters } from "../../assets/posters";
import goodBadUglyClip from "../../imports/good-bad-ugly-clip.mp4";
import darkKnightClip from "../../imports/dark-knight-clip.mp4";
import taxiDriverClip from "../../imports/taxi-driver-clip.mp4";
import starWarsClip from "../../imports/star-wars-clip.mp4";
import laHaineClip from "../../imports/la-haine-clip.mp4";
import godfatherClip from "../../imports/godfather-clip.mp4";

interface PosterEntry {
  title: string;
  posterUrl: string;
  clipUrl?: string;
}

interface PosterCarousel3DProps {
  play: boolean;
  onAllPlaced?: () => void;
}

// 10 posters for the ring - Video cards at Card #0, #1, #2, #4, #5, #7
const posterList: PosterEntry[] = [
  {
    title: "The Good, the Bad and the Ugly",
    posterUrl: mockPosters[0].posterUrl,
    clipUrl: goodBadUglyClip, // 6s duel scene (4:07 to 4:13)
  },
  {
    title: "The Dark Knight",
    posterUrl: mockPosters[1].posterUrl,
    clipUrl: darkKnightClip, // 10s interrogation scene (2:40 to 2:50)
  },
  {
    title: "Taxi Driver",
    posterUrl: mockPosters[2].posterUrl,
    clipUrl: taxiDriverClip, // 11s training scene (sec 44 to 55)
  },
  mockPosters[3], // Goodfellas
  {
    title: "Star Wars: Episode V",
    posterUrl: mockPosters[4].posterUrl,
    clipUrl: starWarsClip, // 9s I am your Father scene (1:36 to 1:45)
  },
  {
    title: "La Haine",
    posterUrl: mockPosters[5].posterUrl,
    clipUrl: laHaineClip, // 7s mirror scene (sec 25 to 32)
  },
  mockPosters[6], // Memories of Murder
  {
    title: "The Godfather",
    posterUrl: mockPosters[7].posterUrl,
    clipUrl: godfatherClip, // 8s opening scene (2:56 to 3:04)
  },
  mockPosters[8], // Schindler's List
  mockPosters[9], // Apocalypse Now
];

const TOTAL = posterList.length;
const INITIAL_DELAY = 600;  // ms before card #1
const START_GAP = 800;      // ms between 1st and 2nd arrivals
const DECAY = 0.78;         // decay rate
const MIN_GAP = 180;        // floor gap
const SETTLE_BUFFER = 700;  // ms after last card lands

function buildSchedule(): number[] {
  const delays: number[] = [];
  let t = INITIAL_DELAY;
  let gap = START_GAP;
  for (let i = 0; i < TOTAL; i++) {
    delays.push(t);
    gap = Math.max(MIN_GAP, gap * DECAY);
    t += gap;
  }
  return delays;
}

export default function PosterCarousel3D({ play, onAllPlaced }: PosterCarousel3DProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const timers = useRef<number[]>([]);
  const firedComplete = useRef(false);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (!play) {
      setRevealedCount(0);
      firedComplete.current = false;
      return;
    }

    const schedule = buildSchedule();
    schedule.forEach((delay, i) => {
      timers.current.push(window.setTimeout(() => setRevealedCount(i + 1), delay));
    });

    const totalDuration = schedule[schedule.length - 1] + SETTLE_BUFFER;
    timers.current.push(
      window.setTimeout(() => {
        if (!firedComplete.current) {
          firedComplete.current = true;
          onAllPlaced?.();
        }
      }, totalDuration),
    );

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-visible">
      <style>{`
        /* ---- Ring container ---- */
        .carousel-ring {
          --card-w: 110px;
          --card-h: 165px;
          --radius: 250px;
          --tilt: -12deg;
          --persp: 1100px;
          position: relative;
          width: var(--card-w);
          height: var(--card-h);
          transform-style: preserve-3d;
          transform: perspective(var(--persp)) rotateX(var(--tilt)) rotateY(0deg);
        }

        .carousel-ring.spinning {
          animation: ringRotate 24s linear infinite;
        }

        @media (min-width: 768px) {
          .carousel-ring {
            --card-w: 140px;
            --card-h: 210px;
            --radius: 330px;
          }
        }

        @keyframes ringRotate {
          from { transform: perspective(var(--persp)) rotateX(var(--tilt)) rotateY(0deg); }
          to   { transform: perspective(var(--persp)) rotateX(var(--tilt)) rotateY(360deg); }
        }

        /* ---- Fixed angular slot ---- */
        .ring-slot {
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
        }

        /* ---- The poster card ---- */
        .ring-card {
          position: absolute;
          inset: 0;
          border-radius: 10px;
          overflow: hidden;
          border: 1.5px solid rgba(255, 255, 255, 0.15);
          box-shadow:
            0 14px 40px rgba(0, 0, 0, 0.85),
            0 0 15px rgba(79, 70, 229, 0.15);
          backface-visibility: visible;
          transform-style: preserve-3d;

          /* ---- Pre-reveal pose ---- */
          opacity: 0;
          transform:
            translateX(-450px)
            translateZ(260px)
            rotateY(-45deg)
            scale(1.5);
          filter: blur(10px) brightness(1.4);

          /* ---- Arrival transition ---- */
          transition:
            opacity    800ms cubic-bezier(0.16, 1, 0.3, 1),
            transform  800ms cubic-bezier(0.16, 1, 0.3, 1),
            filter     800ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Revealed: snaps into ring slot */
        .ring-card.revealed {
          opacity: 1;
          transform:
            translateX(0)
            translateZ(0)
            rotateY(0deg)
            scale(1);
          filter: blur(0px) brightness(1);
        }

        .ring-card img,
        .ring-card video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        /* ---- Reduced motion ---- */
        @media (prefers-reduced-motion: reduce) {
          .carousel-ring { animation-duration: 60s; }
          .ring-card {
            transform: scale(0.9);
            filter: none;
            transition-duration: 300ms;
          }
          .ring-card.revealed {
            transform: scale(1);
          }
        }
      `}</style>

      {/* 3D ring - starts rotating only when play flips true */}
      <div className={`carousel-ring ${play ? "spinning" : ""}`}>
        {posterList.map((poster, index) => {
          const angle = (360 / TOTAL) * index;
          const isRevealed = index < revealedCount;
          return (
            <div
              key={index}
              className="ring-slot"
              style={{ transform: `rotateY(${angle}deg) translateZ(var(--radius))` }}
            >
              <div className={`ring-card bg-[#0e1320] ${isRevealed ? "revealed" : ""}`}>
                {poster.clipUrl ? (
                  <video
                    src={poster.clipUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={poster.posterUrl}
                    alt={poster.title}
                    draggable={false}
                  />
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/30 via-transparent to-white/10" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
