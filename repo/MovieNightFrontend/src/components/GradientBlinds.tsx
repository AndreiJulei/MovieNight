import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";

export interface GradientBlindsProps {
  className?: string;
  dpr?: number;
  paused?: boolean;
  gradientColors?: string[];
  angle?: number;
  noise?: number;
  blindCount?: number;
  blindMinWidth?: number;
  mouseDampening?: number;
  mirrorGradient?: boolean;
  spotlightRadius?: number;
  spotlightSoftness?: number;
  spotlightOpacity?: number;
  distortAmount?: number;
  shineDirection?: "left" | "right";
  mixBlendMode?: React.CSSProperties["mixBlendMode"];
  lightMode?: boolean;
}

const MAX_COLORS = 8;

const hexToRGB = (hex: string): [number, number, number] => {
  const c = hex.replace("#", "").padEnd(6, "0");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return [r, g, b];
};

const prepStops = (stops?: string[]) => {
  const base = (stops && stops.length ? stops : ["#FF9FFC", "#5227FF"]).slice(
    0,
    MAX_COLORS,
  );
  if (base.length === 1) base.push(base[0]);
  while (base.length < MAX_COLORS) base.push(base[base.length - 1]);
  const arr: [number, number, number][] = [];
  for (let i = 0; i < MAX_COLORS; i++) arr.push(hexToRGB(base[i]));
  const count = Math.max(2, Math.min(MAX_COLORS, stops?.length ?? 2));
  return { arr, count };
};

// Module-level global mouse tracker to preserve exact cursor coordinates during page navigation
let globalPointer = {
  x: typeof window !== "undefined" ? window.innerWidth / 2 : 400,
  y: typeof window !== "undefined" ? window.innerHeight / 2 : 300,
};

if (typeof window !== "undefined") {
  window.addEventListener(
    "mousemove",
    (e: MouseEvent) => {
      globalPointer = { x: e.clientX, y: e.clientY };
    },
    { passive: true },
  );
}

export default function GradientBlinds({
  className = "",
  dpr,
  paused = false,
  gradientColors = ["#FF9FFC", "#5227FF"],
  angle = 20,
  noise = 0.08,
  blindCount = 16,
  blindMinWidth = 60,
  mouseDampening = 0.12,
  mirrorGradient = false,
  spotlightRadius = 0.35,
  spotlightSoftness = 1,
  spotlightOpacity = 1,
  distortAmount = 0,
  shineDirection = "left",
  mixBlendMode,
  lightMode = false,
}: GradientBlindsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const programRef = useRef<Program | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const geometryRef = useRef<Triangle | null>(null);
  const rendererRef = useRef<Renderer | null>(null);

  const mouseTargetRef = useRef<[number, number]>([400, 300]);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const currentDpr =
      dpr ??
      (typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1);

    const renderer = new Renderer({
      dpr: currentDpr,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    rendererRef.current = renderer;
    const gl = renderer.gl;
    const canvas = gl.canvas;

    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    container.appendChild(canvas);

    // Calculate exact starting mouse coordinates without centering flash
    const rect = container.getBoundingClientRect();
    const initX = (globalPointer.x - rect.left) * currentDpr;
    const initY = (rect.height - (globalPointer.y - rect.top)) * currentDpr;
    mouseTargetRef.current = [initX, initY];

    const vertex = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

    const fragment = `
#ifdef GL_ES
precision highp float;
#endif

uniform vec3  iResolution;
uniform vec2  iMouse;
uniform float iTime;

uniform float uAngle;
uniform float uNoise;
uniform float uBlindCount;
uniform float uSpotlightRadius;
uniform float uSpotlightSoftness;
uniform float uSpotlightOpacity;
uniform float uMirror;
uniform float uDistort;
uniform float uShineFlip;
uniform vec3  uColor0;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform vec3  uColor4;
uniform vec3  uColor5;
uniform vec3  uColor6;
uniform vec3  uColor7;
uniform int   uColorCount;
uniform float uLightMode;

varying vec2 vUv;

// Stable pseudo-random grain without per-frame temporal jitter
float rand(vec2 co){
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 rotate2D(vec2 p, float a){
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
}

vec3 getGradientColor(float t){
  float tt = clamp(t, 0.0, 1.0);
  int count = uColorCount;
  if (count < 2) count = 2;
  float scaled = tt * float(count - 1);
  float seg = floor(scaled);
  float f = fract(scaled);

  if (seg < 1.0) return mix(uColor0, uColor1, f);
  if (seg < 2.0 && count > 2) return mix(uColor1, uColor2, f);
  if (seg < 3.0 && count > 3) return mix(uColor2, uColor3, f);
  if (seg < 4.0 && count > 4) return mix(uColor3, uColor4, f);
  if (seg < 5.0 && count > 5) return mix(uColor4, uColor5, f);
  if (seg < 6.0 && count > 6) return mix(uColor5, uColor6, f);
  if (seg < 7.0 && count > 7) return mix(uColor6, uColor7, f);
  if (count > 7) return uColor7;
  if (count > 6) return uColor6;
  if (count > 5) return uColor5;
  if (count > 4) return uColor4;
  if (count > 3) return uColor3;
  if (count > 2) return uColor2;
  return uColor1;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv0 = fragCoord.xy / iResolution.xy;

    float aspect = iResolution.x / iResolution.y;
    vec2 p = uv0 * 2.0 - 1.0;
    p.x *= aspect;
    vec2 pr = rotate2D(p, uAngle);
    pr.x /= aspect;
    vec2 uv = pr * 0.5 + 0.5;

    vec2 uvMod = uv;
    if (uDistort > 0.0) {
      float a = uvMod.y * 6.0;
      float b = uvMod.x * 6.0;
      float w = 0.01 * uDistort;
      uvMod.x += sin(a) * w;
      uvMod.y += cos(b) * w;
    }
    float t = uvMod.x;
    if (uMirror > 0.5) {
      t = 1.0 - abs(1.0 - 2.0 * fract(t));
    }
    vec3 base = getGradientColor(t);

    vec2 offset = vec2(iMouse.x / iResolution.x, iMouse.y / iResolution.y);
    float d = length(uv0 - offset);
    float r = max(uSpotlightRadius, 1e-4);
    float dn = d / r;
    float spot = clamp((1.0 - pow(dn, uSpotlightSoftness * 1.5)) * uSpotlightOpacity, 0.0, 1.0);
    vec3 cir = vec3(spot);

    float blindCount = max(uBlindCount, 1.0);
    float stripePhase = uvMod.x * blindCount;
    float stripe = fract(stripePhase);
    float stripeAA = clamp(blindCount * 1.25 / min(iResolution.x, iResolution.y), 0.001, 0.12);
    float edgeDistance = min(stripe, 1.0 - stripe);
    float edgeBlend = 1.0 - smoothstep(0.0, stripeAA, edgeDistance);
    stripe = mix(stripe, 0.5, edgeBlend);
    if (uShineFlip > 0.5) stripe = 1.0 - stripe;
    vec3 ran = vec3(stripe);
    vec3 revealSignal = clamp(cir * (base + 0.15) - (ran * 0.3), 0.0, 1.5);

    vec3 col;
    if (uLightMode > 0.5) {
        float peak = max(base.r, max(base.g, base.b));
        vec3 pigment = base / max(peak, 0.0001);
        float neutral = min(pigment.r, min(pigment.g, pigment.b));
        pigment = max(pigment - vec3(neutral * 0.72), vec3(0.0));
        pigment /= max(max(pigment.r, max(pigment.g, pigment.b)), 0.0001);
        pigment = mix(pigment, pigment * pigment, 0.12) * 0.72;
        vec3 revealed = clamp(revealSignal, 0.0, 1.0);
        float coverage = max(revealed.r, max(revealed.g, revealed.b));
        col = mix(vec3(1.0), pigment, coverage);
        float grain = max(rand(gl_FragCoord.xy) - 0.5, 0.0);
        float grainAmount = grain * uNoise * mix(0.12, 0.18, coverage);
        col = clamp(col - vec3(grainAmount), 0.0, 1.0);
    } else {
        col = revealSignal;
        col += (rand(gl_FragCoord.xy) - 0.5) * uNoise * 0.5;
    }

    float alpha = clamp(spot * 1.2, 0.0, 1.0);
    fragColor = vec4(col, alpha);
}

void main() {
    vec4 color;
    mainImage(color, vUv * iResolution.xy);
    gl_FragColor = color;
}
`;

    const { arr: colorArr, count: colorCount } = prepStops(gradientColors);
    const uniforms: Record<string, { value: unknown }> = {
      iResolution: {
        value: [gl.drawingBufferWidth, gl.drawingBufferHeight, 1],
      },
      iMouse: { value: [initX, initY] },
      iTime: { value: 0 },
      uAngle: { value: (angle * Math.PI) / 180 },
      uNoise: { value: noise },
      uBlindCount: { value: Math.max(1, blindCount) },
      uSpotlightRadius: { value: spotlightRadius },
      uSpotlightSoftness: { value: spotlightSoftness },
      uSpotlightOpacity: { value: spotlightOpacity },
      uMirror: { value: mirrorGradient ? 1 : 0 },
      uDistort: { value: distortAmount },
      uShineFlip: { value: shineDirection === "right" ? 1 : 0 },
      uColor0: { value: colorArr[0] },
      uColor1: { value: colorArr[1] },
      uColor2: { value: colorArr[2] },
      uColor3: { value: colorArr[3] },
      uColor4: { value: colorArr[4] },
      uColor5: { value: colorArr[5] },
      uColor6: { value: colorArr[6] },
      uColor7: { value: colorArr[7] },
      uColorCount: { value: colorCount },
      uLightMode: { value: lightMode ? 1 : 0 },
    };

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms,
    });
    programRef.current = program;

    const geometry = new Triangle(gl);
    geometryRef.current = geometry;
    const mesh = new Mesh(gl, { geometry, program });
    meshRef.current = mesh;

    const resize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      uniforms.iResolution.value = [
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
        1,
      ];

      if (blindMinWidth && blindMinWidth > 0) {
        const maxByMinWidth = Math.max(1, Math.floor(w / blindMinWidth));
        const effective = blindCount
          ? Math.min(blindCount, maxByMinWidth)
          : maxByMinWidth;
        uniforms.uBlindCount.value = Math.max(1, effective);
      } else {
        uniforms.uBlindCount.value = Math.max(1, blindCount);
      }
    };

    resize();
    window.addEventListener("resize", resize);

    // Global window-level cursor tracking
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!container) return;
      const r = container.getBoundingClientRect();
      const scale = currentDpr;
      const x = (e.clientX - r.left) * scale;
      const y = (r.height - (e.clientY - r.top)) * scale;
      mouseTargetRef.current = [x, y];
    };

    window.addEventListener("mousemove", handleGlobalMouseMove, {
      passive: true,
    });

    const loop = (t: number) => {
      rafRef.current = requestAnimationFrame(loop);
      uniforms.iTime.value = t * 0.001;

      if (mouseDampening > 0) {
        if (!lastTimeRef.current) lastTimeRef.current = t;
        const dt = Math.min((t - lastTimeRef.current) / 1000, 0.1);
        lastTimeRef.current = t;
        const tau = Math.max(1e-4, mouseDampening);
        const factor = Math.min(1 - Math.exp(-dt / tau), 1);
        const target = mouseTargetRef.current;
        const cur = uniforms.iMouse.value as [number, number];
        cur[0] += (target[0] - cur[0]) * factor;
        cur[1] += (target[1] - cur[1]) * factor;
      } else {
        lastTimeRef.current = t;
      }

      if (!paused && programRef.current && meshRef.current) {
        try {
          renderer.render({ scene: meshRef.current });
        } catch (err) {
          // ignore context changes
        }
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      programRef.current = null;
      geometryRef.current = null;
      meshRef.current = null;
      rendererRef.current = null;
    };
  }, [
    dpr,
    paused,
    gradientColors,
    angle,
    noise,
    blindCount,
    blindMinWidth,
    mouseDampening,
    mirrorGradient,
    spotlightRadius,
    spotlightSoftness,
    spotlightOpacity,
    distortAmount,
    shineDirection,
    lightMode,
  ]);

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none relative h-full w-full overflow-hidden ${className}`}
      style={{
        ...(!lightMode && mixBlendMode && {
          mixBlendMode,
        }),
      }}
    />
  );
}
