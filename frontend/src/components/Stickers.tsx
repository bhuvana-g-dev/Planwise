// Lightweight, reusable celebration illustrations (inline SVG, no deps).
// All are decorative: aria-hidden + focusable=false so they never interfere
// with screen readers, text selection, or keyboard navigation.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 24, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    fill: "none",
    "aria-hidden": true,
    focusable: false,
    ...rest,
  } as SVGProps<SVGSVGElement>;
}

export function BalloonSticker(p: IconProps) {
  return (
    <svg {...base(p)}>
      <ellipse cx="18" cy="16" rx="9" ry="11" fill="#fbbf24" />
      <ellipse cx="30" cy="18" rx="8" ry="10" fill="#db2777" opacity="0.85" />
      <path d="M18 27c0 3 0 5 3 8M30 28c0 3 0 4-3 7" stroke="#b45309" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function GiftSticker(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="9" y="20" width="30" height="20" rx="3" fill="#f59e0b" />
      <rect x="9" y="15" width="30" height="7" rx="2" fill="#d97706" />
      <rect x="21" y="15" width="6" height="25" fill="#fde68a" />
      <path d="M24 15c-4-6-10-3-7 1 2 2 7 0 7 0zm0 0c4-6 10-3 7 1-2 2-7 0-7 0z" fill="#db2777" />
    </svg>
  );
}

export function StarSticker(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M24 6l4.5 10.5L39 18l-8 7 2.5 11L24 30l-9.5 6L17 25l-8-7 10.5-1.5z" fill="#fbbf24" />
    </svg>
  );
}

export function SparkleSticker(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M24 8c1 8 4 11 12 12-8 1-11 4-12 12-1-8-4-11-12-12 8-1 11-4 12-12z" fill="#fcd34d" />
    </svg>
  );
}

export function CalendarSticker(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="9" y="11" width="30" height="28" rx="4" fill="#fff" stroke="#d97706" strokeWidth="2" />
      <rect x="9" y="11" width="30" height="8" rx="4" fill="#f59e0b" />
      <path d="M16 8v6M32 8v6" stroke="#b45309" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 27l5 5 9-9" stroke="#059669" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CakeSticker(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="10" y="24" width="28" height="15" rx="3" fill="#f9a8d4" />
      <rect x="10" y="24" width="28" height="6" fill="#f59e0b" />
      <path d="M24 10v8" stroke="#b45309" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="9" r="2.4" fill="#fbbf24" />
    </svg>
  );
}

export function RingsSticker(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="19" cy="28" r="9" stroke="#f59e0b" strokeWidth="3" />
      <circle cx="29" cy="28" r="9" stroke="#db2777" strokeWidth="3" />
      <path d="M16 14l3 4 3-4z" fill="#fcd34d" />
    </svg>
  );
}

/** Maps an event type to a representative sticker. */
export function EventTypeSticker({
  type,
  size = 28,
}: {
  type?: string;
  size?: number;
}) {
  switch (type) {
    case "wedding":
      return <RingsSticker size={size} />;
    case "community":
      return <StarSticker size={size} />;
    case "birthday":
    default:
      return <CakeSticker size={size} />;
  }
}
