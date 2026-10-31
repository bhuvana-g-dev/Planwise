import { forwardRef, useId, useMemo } from "react";
import type { InvitationDesign } from "../../types";
import { layoutInvitation } from "../../invitations/layout";
import { CARD_H, CARD_W, type InvitationTemplate } from "../../invitations/templates";
import { DividerMark, FrameLayer, OrnamentLayer } from "./ornaments";

/**
 * The invitation as a self-contained SVG (1080 x 1350, portrait 4:5).
 * Scales to whatever width the parent gives it; the same markup is what the
 * PNG export rasterises, so preview and download match.
 */
const InvitationCard = forwardRef<SVGSVGElement, {
  template: InvitationTemplate;
  design: InvitationDesign;
  className?: string;
  /** Thumbnails are decorative; the full preview gets a text alternative. */
  decorative?: boolean;
}>(function InvitationCard({ template: t, design, className, decorative }, ref) {
  const layout = useMemo(() => layoutInvitation(t, design), [t, design]);
  // SVG ids must be unique per card on the page and valid in url(#...).
  // Include the template id too, so cards rendered in separate React roots
  // (where useId can repeat) still never share a gradient.
  const gid = `inv-bg-${t.id}-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      width={CARD_W}
      height={CARD_H}
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `Invitation preview: ${design.headline || t.name}`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={t.palette.bg} />
          <stop offset="1" stopColor={t.palette.bg2} />
        </linearGradient>
      </defs>
      <rect width={CARD_W} height={CARD_H} fill={`url(#${gid})`} />
      <FrameLayer t={t} />
      <OrnamentLayer t={t} />
      {layout.dividerY !== null && <DividerMark t={t} y={layout.dividerY} />}
      {layout.lines.map((l, i) => (
        <text
          key={i}
          x={CARD_W / 2}
          y={l.y}
          textAnchor="middle"
          fontFamily={l.family}
          fontSize={l.size}
          fontWeight={l.weight}
          fontStyle={l.italic ? "italic" : "normal"}
          letterSpacing={l.letterSpacing || undefined}
          fill={l.color}
        >
          {l.text}
        </text>
      ))}
    </svg>
  );
});

export default InvitationCard;
