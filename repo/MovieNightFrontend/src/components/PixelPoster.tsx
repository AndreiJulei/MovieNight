import { useMemo } from "react";
import { mulberry32, PALETTES, SILHOUETTES } from "./pixel";

/**
 * A deterministic abstract pixel-art poster generated from `seed`.
 * Renders at a 2:3 aspect ratio. Purely decorative — no real poster art.
 */
export default function PixelPoster({
  seed,
  className,
}: {
  seed: number;
  className?: string;
}) {
  const { bg, ink, hi, silo, cols, rows, cell, starfield } = useMemo(() => {
    const rand = mulberry32(seed * 2654435761);
    const [bg, ink, hi] = PALETTES[Math.floor(rand() * PALETTES.length)];
    const silo = SILHOUETTES[Math.floor(rand() * SILHOUETTES.length)];
    const cols = 9;
    const rows = 13; // 2:3-ish grid
    const cell = 10;
    // sparse decorative pixels in the two top/bottom rows
    const starfield: { x: number; y: number; c: string }[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if ((y < 1 || y > rows - 2) && rand() > 0.72) {
          starfield.push({ x, y, c: rand() > 0.5 ? hi : ink });
        }
      }
    }
    return { bg, ink, hi, silo, cols, rows, cell, starfield };
  }, [seed]);

  const w = cols * cell;
  const h = rows * cell;
  const offsetY = 1; // nudge silhouette down one row

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`pixelated block h-full w-full ${className ?? ""}`}
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
      aria-hidden="true"
    >
      <rect width={w} height={h} fill={bg} />
      {starfield.map((s, i) => (
        <rect
          key={`s${i}`}
          x={s.x * cell}
          y={s.y * cell}
          width={cell}
          height={cell}
          fill={s.c}
          opacity={0.6}
        />
      ))}
      {silo.map((row, y) =>
        row.map((v, x) =>
          v ? (
            <rect
              key={`${x}-${y}`}
              x={x * cell}
              y={(y + offsetY) * cell}
              width={cell}
              height={cell}
              fill={(x + y) % 5 === 0 ? hi : ink}
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
