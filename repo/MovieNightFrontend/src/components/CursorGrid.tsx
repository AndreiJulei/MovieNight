import { useEffect, useRef } from "react";

export interface CursorGridProps {
  cellSize?: number;
  color?: string;
  radius?: number;
  falloff?: "smooth" | "linear";
  holdTime?: number;
  fadeDuration?: number;
  lineWidth?: number;
  maxOpacity?: number;
  fillOpacity?: number;
  gridOpacity?: number;
  cellRadius?: number;
  clickPulse?: boolean;
  pulseSpeed?: number;
  className?: string;
  style?: React.CSSProperties;
}

interface TrailPoint {
  x: number;
  y: number;
  time: number;
}

interface Pulse {
  x: number;
  y: number;
  startTime: number;
  duration: number;
  maxRadius: number;
}

export default function CursorGrid({
  cellSize = 70,
  color = "#D946EF",
  radius = 140,
  falloff = "smooth",
  holdTime = 400,
  fadeDuration = 800,
  lineWidth = 1.2,
  maxOpacity = 1,
  fillOpacity = 0,
  gridOpacity = 0.06,
  cellRadius = 0,
  clickPulse = true,
  pulseSpeed = 600,
  className = "",
  style,
}: CursorGridProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const mousePos = useRef<{ x: number; y: number }>({ x: -2000, y: -2000 });
  const trail = useRef<TrailPoint[]>([]);
  const pulses = useRef<Pulse[]>([]);
  const rafId = useRef<number>(0);

  // Convert hex / named color to RGB components
  const hexToRgb = (c: string): [number, number, number] => {
    if (c.startsWith("#")) {
      let hex = c.slice(1);
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      const num = parseInt(hex, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }
    // Default to vibrant magenta/fuchsia #D946EF
    return [217, 70, 239];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const [r, g, b] = hexToRgb(color);
    const totalLifetime = holdTime + fadeDuration;

    let width = (canvas.width = container.clientWidth);
    let height = (canvas.height = container.clientHeight);

    const handleResize = () => {
      if (!container || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    // Mouse Move Tracker
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mousePos.current = { x, y };

      const now = performance.now();
      trail.current.push({ x, y, time: now });

      // Keep recent trail clean
      if (trail.current.length > 50) {
        trail.current.shift();
      }
    };

    // Click Pulse Wave Generator
    const handleMouseDown = (e: MouseEvent) => {
      if (!clickPulse) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const maxRadius = Math.max(width, height) * 0.9;
      pulses.current.push({
        x,
        y,
        startTime: performance.now(),
        duration: pulseSpeed,
        maxRadius,
      });
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    if (clickPulse) {
      window.addEventListener("mousedown", handleMouseDown, { passive: true });
    }

    // Main Canvas Render Loop
    const render = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, width, height);

      // 1. Static base grid lines (subtle)
      if (gridOpacity > 0) {
        ctx.save();
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${gridOpacity})`;
        ctx.lineWidth = lineWidth * 0.8;
        ctx.beginPath();

        // Vertical lines
        for (let x = 0; x <= width; x += cellSize) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
        // Horizontal lines
        for (let y = 0; y <= height; y += cellSize) {
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Filter expired trail points
      trail.current = trail.current.filter(
        (pt) => now - pt.time < totalLifetime,
      );

      // Filter expired pulses
      pulses.current = pulses.current.filter(
        (p) => now - p.startTime < p.duration,
      );

      const numCols = Math.ceil(width / cellSize);
      const numRows = Math.ceil(height / cellSize);

      // 2. Render Cell Fill Highlights (if fillOpacity > 0)
      if (fillOpacity > 0) {
        for (let col = 0; col < numCols; col++) {
          for (let row = 0; row < numRows; row++) {
            const cellCenterX = col * cellSize + cellSize / 2;
            const cellCenterY = row * cellSize + cellSize / 2;

            let intensity = 0;

            // Compute distance from cursor and trail
            const curDist = Math.hypot(
              cellCenterX - mousePos.current.x,
              cellCenterY - mousePos.current.y,
            );
            if (curDist < radius) {
              const ratio = 1 - curDist / radius;
              intensity =
                falloff === "smooth"
                  ? (1 - Math.cos(ratio * Math.PI)) / 2
                  : ratio;
            }

            // Check trailing decay
            for (const pt of trail.current) {
              const d = Math.hypot(cellCenterX - pt.x, cellCenterY - pt.y);
              if (d < radius) {
                const age = now - pt.time;
                let fade = 1;
                if (age > holdTime) {
                  fade = 1 - (age - holdTime) / fadeDuration;
                }
                const ratio = (1 - d / radius) * Math.max(0, fade);
                const ptInt =
                  falloff === "smooth"
                    ? (1 - Math.cos(ratio * Math.PI)) / 2
                    : ratio;
                if (ptInt > intensity) intensity = ptInt;
              }
            }

            if (intensity > 0.01) {
              ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${
                intensity * fillOpacity
              })`;
              ctx.fillRect(
                col * cellSize,
                row * cellSize,
                cellSize,
                cellSize,
              );
            }
          }
        }
      }

      // 3. Highlighted Intersecting Grid Lines with smooth falloff & trailing glow
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";

      // Draw vertical segment lines with localized lighting
      for (let col = 0; col <= numCols; col++) {
        const x = col * cellSize;
        for (let row = 0; row < numRows; row++) {
          const y1 = row * cellSize;
          const y2 = y1 + cellSize;
          const midY = (y1 + y2) / 2;

          let intensity = 0;

          // Proximity to current mouse cursor
          const d = Math.hypot(x - mousePos.current.x, midY - mousePos.current.y);
          if (d < radius) {
            const ratio = 1 - d / radius;
            intensity =
              falloff === "smooth"
                ? (1 - Math.cos(ratio * Math.PI)) / 2
                : ratio;
          }

          // Trail points decay
          for (const pt of trail.current) {
            const ptDist = Math.hypot(x - pt.x, midY - pt.y);
            if (ptDist < radius) {
              const age = now - pt.time;
              let fade = 1;
              if (age > holdTime) {
                fade = 1 - (age - holdTime) / fadeDuration;
              }
              const ratio = (1 - ptDist / radius) * Math.max(0, fade);
              const ptInt =
                falloff === "smooth"
                  ? (1 - Math.cos(ratio * Math.PI)) / 2
                  : ratio;
              if (ptInt > intensity) intensity = ptInt;
            }
          }

          // Click Pulse shockwave calculation
          for (const pulse of pulses.current) {
            const elapsed = now - pulse.startTime;
            const progress = elapsed / pulse.duration;
            const currentPulseRadius = progress * pulse.maxRadius;
            const pulseDist = Math.hypot(x - pulse.x, midY - pulse.y);
            const ringThickness = 65;
            const diff = Math.abs(pulseDist - currentPulseRadius);

            if (diff < ringThickness) {
              const ringFade = 1 - diff / ringThickness;
              const overallFade = 1 - progress;
              const pulseInt = ringFade * overallFade * 0.9;
              if (pulseInt > intensity) intensity = pulseInt;
            }
          }

          if (intensity > 0.02) {
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(
              maxOpacity,
              intensity * maxOpacity,
            )})`;
            ctx.beginPath();
            ctx.moveTo(x, y1);
            ctx.lineTo(x, y2);
            ctx.stroke();
          }
        }
      }

      // Draw horizontal segment lines with localized lighting
      for (let row = 0; row <= numRows; row++) {
        const y = row * cellSize;
        for (let col = 0; col < numCols; col++) {
          const x1 = col * cellSize;
          const x2 = x1 + cellSize;
          const midX = (x1 + x2) / 2;

          let intensity = 0;

          // Proximity to current mouse cursor
          const d = Math.hypot(midX - mousePos.current.x, y - mousePos.current.y);
          if (d < radius) {
            const ratio = 1 - d / radius;
            intensity =
              falloff === "smooth"
                ? (1 - Math.cos(ratio * Math.PI)) / 2
                : ratio;
          }

          // Trail points decay
          for (const pt of trail.current) {
            const ptDist = Math.hypot(midX - pt.x, y - pt.y);
            if (ptDist < radius) {
              const age = now - pt.time;
              let fade = 1;
              if (age > holdTime) {
                fade = 1 - (age - holdTime) / fadeDuration;
              }
              const ratio = (1 - ptDist / radius) * Math.max(0, fade);
              const ptInt =
                falloff === "smooth"
                  ? (1 - Math.cos(ratio * Math.PI)) / 2
                  : ratio;
              if (ptInt > intensity) intensity = ptInt;
            }
          }

          // Click Pulse shockwave calculation
          for (const pulse of pulses.current) {
            const elapsed = now - pulse.startTime;
            const progress = elapsed / pulse.duration;
            const currentPulseRadius = progress * pulse.maxRadius;
            const pulseDist = Math.hypot(midX - pulse.x, y - pulse.y);
            const ringThickness = 65;
            const diff = Math.abs(pulseDist - currentPulseRadius);

            if (diff < ringThickness) {
              const ringFade = 1 - diff / ringThickness;
              const overallFade = 1 - progress;
              const pulseInt = ringFade * overallFade * 0.9;
              if (pulseInt > intensity) intensity = pulseInt;
            }
          }

          if (intensity > 0.02) {
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(
              maxOpacity,
              intensity * maxOpacity,
            )})`;
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();
          }
        }
      }

      rafId.current = requestAnimationFrame(render);
    };

    rafId.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId.current);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      if (clickPulse) {
        window.removeEventListener("mousedown", handleMouseDown);
      }
    };
  }, [
    cellSize,
    color,
    radius,
    falloff,
    holdTime,
    fadeDuration,
    lineWidth,
    maxOpacity,
    fillOpacity,
    gridOpacity,
    cellRadius,
    clickPulse,
    pulseSpeed,
  ]);

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={style}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full pointer-events-none"
      />
    </div>
  );
}
