import { useEffect, useRef } from "react";
import "./gateway-flow.css";

// GatewayFlow — an ambient "flow through the gateway" background.
// Layered ribbons of light stream left to right on sine paths,
// breathing through a soft gate glow at the centre, with fine
// particles riding the current. Canvas, DPR-aware, pauses offscreen
// and honours prefers-reduced-motion with a single still frame.
const RIBBONS = [
  { y: 0.30, amp: 26, len: 0.006, speed: 0.55, width: 46, hue: "0, 108, 237", alpha: 0.16 },
  { y: 0.44, amp: 34, len: 0.004, speed: 0.38, width: 64, hue: "75, 147, 255", alpha: 0.12 },
  { y: 0.55, amp: 22, len: 0.008, speed: 0.72, width: 34, hue: "10, 132, 255", alpha: 0.18 },
  { y: 0.66, amp: 40, len: 0.005, speed: 0.30, width: 72, hue: "0, 108, 237", alpha: 0.09 },
  { y: 0.76, amp: 18, len: 0.009, speed: 0.85, width: 26, hue: "140, 190, 255", alpha: 0.13 },
];

export default function GatewayFlow({ className = "", style }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let w = 0;
    let h = 0;
    let running = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const particles = Array.from({ length: 42 }, (_, i) => ({
      x: Math.random(),
      y: 0.18 + Math.random() * 0.66,
      s: 0.0006 + Math.random() * 0.0016,
      r: 0.8 + Math.random() * 1.7,
      drift: Math.random() * Math.PI * 2,
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);

      // The gate: a soft vertical glow the streams pass through.
      const gateX = w * 0.5;
      const gate = ctx.createRadialGradient(gateX, h * 0.52, 0, gateX, h * 0.52, Math.max(w, h) * 0.55);
      gate.addColorStop(0, "rgba(0, 108, 237, 0.14)");
      gate.addColorStop(0.5, "rgba(0, 108, 237, 0.05)");
      gate.addColorStop(1, "rgba(0, 108, 237, 0)");
      ctx.fillStyle = gate;
      ctx.fillRect(0, 0, w, h);

      for (const rb of RIBBONS) {
        ctx.beginPath();
        const baseY = h * rb.y;
        for (let x = -20; x <= w + 20; x += 14) {
          const y =
            baseY +
            Math.sin(x * rb.len + t * 0.001 * rb.speed) * rb.amp +
            Math.sin(x * rb.len * 0.37 - t * 0.0006 * rb.speed) * rb.amp * 0.5;
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, `rgba(${rb.hue}, 0)`);
        grad.addColorStop(0.25, `rgba(${rb.hue}, ${rb.alpha})`);
        grad.addColorStop(0.5, `rgba(${rb.hue}, ${rb.alpha * 1.5})`);
        grad.addColorStop(0.75, `rgba(${rb.hue}, ${rb.alpha})`);
        grad.addColorStop(1, `rgba(${rb.hue}, 0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = rb.width;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(190, 220, 255, 0.75)";
      for (const p of particles) {
        p.x += p.s;
        if (p.x > 1.02) {
          p.x = -0.02;
          p.y = 0.18 + Math.random() * 0.66;
        }
        const py = h * p.y + Math.sin(t * 0.001 + p.drift) * 9;
        ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t * 0.0008 + p.drift));
        ctx.beginPath();
        ctx.arc(p.x * w, py, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const loop = (t) => {
      if (running) draw(t);
      raf = requestAnimationFrame(loop);
    };

    resize();
    if (reduced) {
      draw(1200);
    } else {
      raf = requestAnimationFrame(loop);
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(1200);
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([entry]) => {
      running = entry.isIntersecting;
    });
    io.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={`gateway-flow ${className}`} style={style} aria-hidden="true" />;
}
