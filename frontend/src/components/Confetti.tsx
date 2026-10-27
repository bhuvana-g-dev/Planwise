import { useEffect, useState } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";

// Pure-CSS confetti burst. Render it with a `fire` key that changes when you
// want a burst (e.g. after the backend confirms a milestone). Non-interactive,
// decorative, cleans up after ~1.8s, and does nothing under reduced-motion.
const COLORS = ["#f59e0b", "#db2777", "#fbbf24", "#34d399", "#60a5fa", "#fcd34d"];

export function Confetti({ fire }: { fire: number }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (fire <= 0 || reduced) return;
    setActive(true);
    const t = setTimeout(() => setActive(false), 1800);
    return () => clearTimeout(t);
  }, [fire, reduced]);

  if (!active) return null;

  const pieces = Array.from({ length: 70 });
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
      aria-hidden
    >
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const dur = 1.1 + Math.random() * 0.7;
        const size = 6 + Math.random() * 6;
        const color = COLORS[i % COLORS.length];
        const rotate = Math.random() * 360;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: "-5%",
              left: `${left}%`,
              width: size,
              height: size * 0.6,
              background: color,
              borderRadius: 2,
              transform: `rotate(${rotate}deg)`,
              animation: `confetti-fall ${dur}s cubic-bezier(0.3,0.7,0.5,1) ${delay}s forwards`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes confetti-fall {
          to { transform: translateY(110vh) rotate(720deg); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
