"use client";

import { useEffect, useRef } from "react";
import type { OrbState } from "@/lib/types";

type Props = {
  state: OrbState;
  visionActive: boolean;
  onPress: () => void;
  size?: "hero" | "mini";
};

export default function AIOrb({
  state,
  visionActive,
  onPress,
  size = "hero",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const particles = Array.from({ length: size === "hero" ? 42 : 16 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 0.28 + Math.random() * 0.22,
      s: 0.002 + Math.random() * 0.006,
      size: 0.8 + Math.random() * 1.8,
      o: 0.15 + Math.random() * 0.45,
    }));

    const draw = (t: number) => {
      const { width, height } = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.42;
      const speed =
        state === "listening" ? 2.4 : state === "processing" ? 3.2 : state === "speaking" ? 2.8 : 1;

      for (const p of particles) {
        p.a += p.s * speed;
        const wobble = Math.sin(t / 900 + p.a) * (state === "idle" ? 4 : 8);
        const x = cx + Math.cos(p.a) * (radius * p.r * 2.15) + wobble;
        const y = cy + Math.sin(p.a) * (radius * p.r * 2.15);
        ctx.beginPath();
        ctx.fillStyle = visionActive
          ? `rgba(180,255,230,${p.o})`
          : `rgba(210,255,230,${p.o})`;
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, state, visionActive]);

  return (
    <div
      ref={wrapRef}
      className={`orb-wrap ${size} state-${state} ${visionActive ? "vision" : ""}`}
    >
      <canvas ref={canvasRef} className="orb-particles" aria-hidden />
      <button
        type="button"
        className="orb"
        onClick={onPress}
        aria-label="Talk to StudyMate"
      >
        <span className="orb-core" />
        <span className="orb-sheen" />
        <span className="orb-ring r1" />
        <span className="orb-ring r2" />
        <span className="orb-ring r3" />
      </button>
    </div>
  );
}
