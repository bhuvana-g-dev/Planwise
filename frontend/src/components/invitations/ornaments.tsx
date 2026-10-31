// Decorative SVG layers for invitation cards (1080 x 1350 canvas).
// Ornaments stay in the top (y < 200) and bottom (y > 1150) margins and the
// corners, so they never sit under the text area computed in layout.ts.

import type { ReactNode } from "react";
import { CARD_H as H, CARD_W as W, type Divider, type Frame, type InvitationTemplate, type Ornament } from "../../invitations/templates";

/** Small deterministic PRNG so scattered ornaments look the same every render. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const star = (cx: number, cy: number, r: number, points = 5, inner = 0.45) => {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 ? r * inner : r;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
};

const heartPath = (cx: number, cy: number, s: number) =>
  `M ${cx} ${cy + s * 0.9} C ${cx - s * 1.4} ${cy - s * 0.1} ${cx - s * 0.6} ${cy - s * 1.1} ${cx} ${cy - s * 0.35} ` +
  `C ${cx + s * 0.6} ${cy - s * 1.1} ${cx + s * 1.4} ${cy - s * 0.1} ${cx} ${cy + s * 0.9} Z`;

const sparklePath = (cx: number, cy: number, r: number) =>
  `M ${cx} ${cy - r} Q ${cx + r * 0.18} ${cy - r * 0.18} ${cx + r} ${cy} Q ${cx + r * 0.18} ${cy + r * 0.18} ${cx} ${cy + r} ` +
  `Q ${cx - r * 0.18} ${cy + r * 0.18} ${cx - r} ${cy} Q ${cx - r * 0.18} ${cy - r * 0.18} ${cx} ${cy - r} Z`;

/** Random points inside the top and bottom margin bands. */
function scatter(seed: number, n: number) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const top = i % 2 === 0;
    return {
      x: 50 + r() * (W - 100),
      y: top ? 30 + r() * 150 : H - 30 - r() * 150,
      s: r(),
      rot: r() * 360,
      c: r(),
    };
  });
}

function Mandala({ cx, cy, r, c1, c2 }: { cx: number; cy: number; r: number; c1: string; c2: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={c1} strokeWidth={2} opacity={0.6} />
      {Array.from({ length: 16 }, (_, i) => (
        <ellipse key={`o${i}`} cx={cx} cy={cy - r * 0.68} rx={r * 0.12} ry={r * 0.3}
          fill="none" stroke={c1} strokeWidth={2} transform={`rotate(${i * 22.5} ${cx} ${cy})`} />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse key={`i${i}`} cx={cx} cy={cy - r * 0.32} rx={r * 0.1} ry={r * 0.22}
          fill={c2} opacity={0.75} transform={`rotate(${i * 45 + 22.5} ${cx} ${cy})`} />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.12} fill={c1} />
    </g>
  );
}

function Flower({ cx, cy, r, c1, c2, leaf }: { cx: number; cy: number; r: number; c1: string; c2: string; leaf: string }) {
  return (
    <g>
      <ellipse cx={cx - r * 1.1} cy={cy + r * 0.5} rx={r * 0.9} ry={r * 0.32} fill={leaf} opacity={0.7}
        transform={`rotate(-30 ${cx - r * 1.1} ${cy + r * 0.5})`} />
      <ellipse cx={cx + r * 1.1} cy={cy + r * 0.6} rx={r * 0.9} ry={r * 0.32} fill={leaf} opacity={0.7}
        transform={`rotate(25 ${cx + r * 1.1} ${cy + r * 0.6})`} />
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return <circle key={i} cx={cx + Math.cos(a) * r * 0.55} cy={cy + Math.sin(a) * r * 0.55}
          r={r * 0.5} fill={c1} opacity={0.85} />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.32} fill={c2} />
    </g>
  );
}

function Balloon({ x, y, r, color, tieTo }: { x: number; y: number; r: number; color: string; tieTo: [number, number] }) {
  return (
    <g>
      <path d={`M ${x} ${y + r * 1.2} Q ${(x + tieTo[0]) / 2 + 12} ${(y + tieTo[1]) / 2} ${tieTo[0]} ${tieTo[1]}`}
        stroke={color} strokeWidth={2} fill="none" opacity={0.6} />
      <ellipse cx={x} cy={y} rx={r} ry={r * 1.2} fill={color} />
      <ellipse cx={x - r * 0.35} cy={y - r * 0.45} rx={r * 0.18} ry={r * 0.3} fill="#ffffff" opacity={0.45} />
      <path d={`M ${x - 7} ${y + r * 1.28} L ${x + 7} ${y + r * 1.28} L ${x} ${y + r * 1.15} Z`} fill={color} />
    </g>
  );
}

function Diya({ x, y, s, c1, c2 }: { x: number; y: number; s: number; c1: string; c2: string }) {
  return (
    <g>
      <path d={`M ${x - s} ${y} Q ${x} ${y + s * 0.9} ${x + s} ${y} Z`} fill={c1} />
      <path d={`M ${x - s * 1.05} ${y} L ${x + s * 1.05} ${y}`} stroke={c1} strokeWidth={4} strokeLinecap="round" />
      <path d={`M ${x} ${y - s * 1.1} Q ${x + s * 0.32} ${y - s * 0.45} ${x} ${y - s * 0.12} Q ${x - s * 0.32} ${y - s * 0.45} ${x} ${y - s * 1.1} Z`}
        fill={c2} />
      <circle cx={x} cy={y - s * 0.5} r={s * 0.75} fill={c2} opacity={0.12} />
    </g>
  );
}

export function OrnamentLayer({ t }: { t: InvitationTemplate }): ReactNode {
  const { accent: a, muted: m, ink: k, bg2 } = t.palette;
  const o: Ornament = t.ornament;
  switch (o) {
    case "mandala":
      return (
        <g>
          <Mandala cx={W / 2} cy={118} r={78} c1={a} c2={m} />
          <Mandala cx={W / 2} cy={H - 112} r={64} c1={a} c2={m} />
        </g>
      );
    case "floral":
      return (
        <g>
          <Flower cx={120} cy={120} r={48} c1={a} c2={m} leaf={m} />
          <Flower cx={210} cy={70} r={26} c1={m} c2={a} leaf={m} />
          <Flower cx={W - 120} cy={H - 120} r={48} c1={a} c2={m} leaf={m} />
          <Flower cx={W - 210} cy={H - 70} r={26} c1={m} c2={a} leaf={m} />
        </g>
      );
    case "kolam": {
      const row = (y: number) =>
        Array.from({ length: 16 }, (_, i) => {
          const x = 90 + i * 60;
          return (
            <g key={`${y}-${i}`}>
              <rect x={x - 11} y={y - 11} width={22} height={22} fill="none" stroke={a} strokeWidth={2.5}
                transform={`rotate(45 ${x} ${y})`} />
              <circle cx={x} cy={y} r={3.5} fill={a} />
              <circle cx={x + 30} cy={y - 22} r={3} fill={m} />
              <circle cx={x + 30} cy={y + 22} r={3} fill={m} />
            </g>
          );
        });
      return (
        <g>
          {row(150)}
          {row(H - 150)}
          <path d={`M 60 150 ${Array.from({ length: 16 }, (_, i) => `Q ${120 + i * 60} ${i % 2 ? 120 : 180} ${150 + i * 60} 150`).join(" ")}`}
            fill="none" stroke={a} strokeWidth={1.5} opacity={0.5} />
        </g>
      );
    }
    case "leaves": {
      const vine = (y: number, flip: number) => (
        <g>
          <path d={`M 170 ${y} Q ${W / 2} ${y + 46 * flip} ${W - 170} ${y}`} fill="none" stroke={a} strokeWidth={2.5} />
          {Array.from({ length: 12 }, (_, i) => {
            const tt = (i + 0.5) / 12;
            const x = 170 + (W - 340) * tt;
            // Point on the quadratic vine (control point is 46px off the line).
            const yy = y + 2 * tt * (1 - tt) * 46 * flip;
            const up = i % 2 === 0 ? -1 : 1;
            return (
              <ellipse key={i} cx={x} cy={yy + up * 14} rx={22} ry={8} fill={i % 3 ? a : m} opacity={0.85}
                transform={`rotate(${up * 35} ${x} ${yy + up * 14})`} />
            );
          })}
        </g>
      );
      return <g>{vine(120, 1)}{vine(H - 120, -1)}</g>;
    }
    case "balloons": {
      const colors = [a, m, k];
      const cluster = (xs: number[], ys: number[], tie: [number, number]) =>
        xs.map((x, i) => <Balloon key={`${x}-${i}`} x={x} y={ys[i]} r={34 + (i % 2) * 8} color={colors[i % 3]} tieTo={tie} />);
      return (
        <g>
          {cluster([95, 165, 235], [95, 70, 110], [170, 205])}
          {cluster([W - 95, W - 165, W - 235], [95, 70, 110], [W - 170, 205])}
          {scatter(7, 18).filter((p) => p.y > H / 2).map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4 + p.s * 6} fill={colors[i % 3]} opacity={0.7} />
          ))}
        </g>
      );
    }
    case "confetti":
      return (
        <g>
          {scatter(11, 70).map((p, i) =>
            i % 3 === 0 ? (
              <circle key={i} cx={p.x} cy={p.y} r={3 + p.s * 5} fill={p.c > 0.5 ? a : m} opacity={0.85} />
            ) : (
              <rect key={i} x={p.x} y={p.y} width={8 + p.s * 10} height={4 + p.s * 3}
                fill={p.c > 0.66 ? a : p.c > 0.33 ? m : k} opacity={0.8}
                transform={`rotate(${p.rot} ${p.x} ${p.y})`} />
            )
          )}
        </g>
      );
    case "stars":
      return (
        <g>
          {scatter(23, 22).map((p, i) => (
            <polygon key={i} points={star(p.x, p.y, 10 + p.s * 16)} fill={i % 3 === 0 ? m : a} opacity={0.85}
              transform={`rotate(${p.rot / 6} ${p.x} ${p.y})`} />
          ))}
        </g>
      );
    case "hearts":
      return (
        <g>
          {scatter(31, 20).map((p, i) => (
            <path key={i} d={heartPath(p.x, p.y, 10 + p.s * 14)} fill={i % 2 ? a : m} opacity={0.75}
              transform={`rotate(${(p.rot % 40) - 20} ${p.x} ${p.y})`} />
          ))}
        </g>
      );
    case "sparkle":
      return (
        <g>
          {scatter(41, 26).map((p, i) => (
            <path key={i} d={sparklePath(p.x, p.y, 8 + p.s * 20)} fill={i % 3 === 0 ? m : a}
              opacity={0.5 + p.s * 0.5} />
          ))}
        </g>
      );
    case "bunting": {
      const rope = (y0: number, sag: number) => {
        const pt = (tt: number) => ({
          x: tt * W,
          y: (1 - tt) * (1 - tt) * y0 + 2 * (1 - tt) * tt * (y0 + sag) + tt * tt * y0,
        });
        const colors = [a, m, k, bg2];
        return (
          <g>
            <path d={`M 0 ${y0} Q ${W / 2} ${y0 + sag} ${W} ${y0}`} fill="none" stroke={k} strokeWidth={2} opacity={0.6} />
            {Array.from({ length: 13 }, (_, i) => {
              const p = pt((i + 0.5) / 13);
              return (
                <path key={i} d={`M ${p.x - 26} ${p.y} L ${p.x + 26} ${p.y} L ${p.x} ${p.y + 56} Z`}
                  fill={colors[i % 4]} stroke={k} strokeOpacity={0.15} />
              );
            })}
          </g>
        );
      };
      return <g>{rope(30, 90)}{rope(H - 120, 50)}</g>;
    }
    case "diya":
      return (
        <g>
          {[0, 1, 2, 3, 4].map((i) => (
            <Diya key={i} x={W / 2 + (i - 2) * 170} y={H - 95} s={i === 2 ? 46 : 34} c1={a} c2={m} />
          ))}
          <path d={`M 80 70 Q ${W / 2} 170 ${W - 80} 70`} fill="none" stroke={a} strokeWidth={1.5} opacity={0.5} />
          {Array.from({ length: 15 }, (_, i) => {
            const tt = (i + 0.5) / 15;
            const x = 80 + tt * (W - 160);
            const y = (1 - tt) * (1 - tt) * 70 + 2 * (1 - tt) * tt * 170 + tt * tt * 70;
            return <circle key={i} cx={x} cy={y} r={6} fill={i % 2 ? m : a} />;
          })}
        </g>
      );
    case "cake": {
      const cx = W / 2;
      const base = H - 30;
      return (
        <g>
          {/* Scaled down so the candle flames stay below the text area (y > 1160). */}
          <g transform={`translate(${cx} ${base}) scale(0.72) translate(${-cx} ${-base})`}>
          <rect x={cx - 130} y={base - 70} width={260} height={70} rx={12} fill={a} />
          <rect x={cx - 95} y={base - 130} width={190} height={60} rx={10} fill={m} />
          <path d={`M ${cx - 130} ${base - 52} q 22 18 43 0 t 43 0 t 43 0 t 43 0 t 43 0 t 43 0`}
            fill="none" stroke="#ffffff" strokeWidth={5} opacity={0.8} />
          {[-50, 0, 50].map((dx) => (
            <g key={dx}>
              <rect x={cx + dx - 5} y={base - 172} width={10} height={42} rx={3} fill={k} opacity={0.75} />
              <path d={sparklePath(cx + dx, base - 186, 11)} fill="#f59e0b" />
            </g>
          ))}
          </g>
          {scatter(53, 24).filter((p) => p.y < H / 2).map((p, i) => (
            <polygon key={i} points={star(p.x, p.y, 7 + p.s * 10)} fill={i % 2 ? a : m} opacity={0.7} />
          ))}
        </g>
      );
    }
    case "geometric": {
      const fan = (x: number, y: number, sx: number, sy: number) => (
        <g>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const ang = (i / 5) * (Math.PI / 2);
            return (
              <line key={i} x1={x} y1={y} x2={x + sx * Math.cos(ang) * 130} y2={y + sy * Math.sin(ang) * 130}
                stroke={a} strokeWidth={1.5} opacity={0.55} />
            );
          })}
          <path d={`M ${x + sx * 70} ${y} A 70 70 0 0 ${sx * sy > 0 ? 1 : 0} ${x} ${y + sy * 70}`}
            fill="none" stroke={a} strokeWidth={2} />
        </g>
      );
      return (
        <g>
          {fan(40, 40, 1, 1)}
          {fan(W - 40, 40, -1, 1)}
          {fan(40, H - 40, 1, -1)}
          {fan(W - 40, H - 40, -1, -1)}
          <line x1={W / 2 - 120} y1={150} x2={W / 2 + 120} y2={150} stroke={a} strokeWidth={2} />
          <line x1={W / 2 - 120} y1={H - 150} x2={W / 2 + 120} y2={H - 150} stroke={a} strokeWidth={2} />
        </g>
      );
    }
  }
}

export function FrameLayer({ t }: { t: InvitationTemplate }): ReactNode {
  const { accent: a, panel } = t.palette;
  const f: Frame = t.frame;
  switch (f) {
    case "none":
      return null;
    case "double":
      return (
        <g fill="none" stroke={a}>
          <rect x={42} y={42} width={W - 84} height={H - 84} strokeWidth={3} />
          <rect x={58} y={58} width={W - 116} height={H - 116} strokeWidth={1.2} />
        </g>
      );
    case "corners": {
      const c = (x: number, y: number, sx: number, sy: number) => (
        <g>
          <path d={`M ${x} ${y + sy * 120} L ${x} ${y} L ${x + sx * 120} ${y}`} fill="none" stroke={a} strokeWidth={3} />
          <rect x={x + sx * 14 - 7} y={y + sy * 14 - 7} width={14} height={14} fill={a}
            transform={`rotate(45 ${x + sx * 14} ${y + sy * 14})`} />
        </g>
      );
      return <g>{c(40, 40, 1, 1)}{c(W - 40, 40, -1, 1)}{c(40, H - 40, 1, -1)}{c(W - 40, H - 40, -1, -1)}</g>;
    }
    case "band":
      return (
        <g>
          <rect x={0} y={0} width={W} height={200} fill={a} opacity={0.1} />
          <rect x={0} y={198} width={W} height={4} fill={a} opacity={0.6} />
          <rect x={0} y={H - 170} width={W} height={170} fill={a} opacity={0.1} />
          <rect x={0} y={H - 172} width={W} height={4} fill={a} opacity={0.6} />
        </g>
      );
    case "arch":
      return (
        <path d={`M 150 ${H - 110} V 430 A 390 390 0 0 1 ${W - 150} 430 V ${H - 110} Z`}
          fill={panel} fillOpacity={0.75} stroke={a} strokeWidth={3} />
      );
    case "panel":
      return (
        <rect x={120} y={165} width={W - 240} height={H - 330} rx={36}
          fill={panel} fillOpacity={0.88} stroke={a} strokeOpacity={0.35} strokeWidth={3} />
      );
  }
}

export function DividerMark({ t, y }: { t: InvitationTemplate; y: number }): ReactNode {
  const { accent: a, muted: m } = t.palette;
  const cx = W / 2;
  const d: Divider = t.divider;
  const lines = (
    <g stroke={a} strokeWidth={2}>
      <line x1={cx - 160} y1={y} x2={cx - 34} y2={y} />
      <line x1={cx + 34} y1={y} x2={cx + 160} y2={y} />
    </g>
  );
  switch (d) {
    case "line":
      return <line x1={cx - 120} y1={y} x2={cx + 120} y2={y} stroke={a} strokeWidth={2} />;
    case "diamond":
      return <g>{lines}<rect x={cx - 10} y={y - 10} width={20} height={20} fill={a} transform={`rotate(45 ${cx} ${y})`} /></g>;
    case "dots":
      return <g>{lines}{[-16, 0, 16].map((dx) => <circle key={dx} cx={cx + dx} cy={y} r={dx ? 4 : 6} fill={dx ? m : a} />)}</g>;
    case "heart":
      return <g>{lines}<path d={heartPath(cx, y, 13)} fill={a} /></g>;
    case "star":
      return <g>{lines}<polygon points={star(cx, y, 16)} fill={a} /></g>;
    case "flower":
      return (
        <g>
          {lines}
          {[0, 90, 180, 270].map((r) => (
            <ellipse key={r} cx={cx} cy={y - 9} rx={6} ry={10} fill={a} transform={`rotate(${r} ${cx} ${y})`} />
          ))}
          <circle cx={cx} cy={y} r={4} fill={m} />
        </g>
      );
  }
}
