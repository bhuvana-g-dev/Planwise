import { BadgeCheck, CircleHelp, Package, Sparkle } from "lucide-react";
import type { VenuePrice } from "../../types";
import {
  formatPriceRange,
  KIND_STYLE,
  STATUS_LABEL,
  STATUS_STYLE,
  statusDetail,
} from "../../utils/venuePricing";
import { classNames } from "../../utils/format";

/** Shows the applicable venue price, where it came from, what it covers and
 *  how it compares with the budget. Estimates are always visibly labelled. */
export default function VenuePriceTag({
  price,
  compact = false,
}: {
  price: VenuePrice | undefined;
  compact?: boolean;
}) {
  if (!price) return null;
  const range = formatPriceRange(price);
  const detail = statusDetail(price);
  const Icon =
    price.kind === "quoted" ? BadgeCheck : price.kind === "estimated" ? Sparkle : CircleHelp;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={classNames(
            "text-base font-bold tabular-nums",
            price.kind === "unavailable" ? "text-slate-400" : "text-slate-900"
          )}
        >
          {range ?? "Price unavailable"}
        </span>
        <span
          className={classNames(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            KIND_STYLE[price.kind]
          )}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {price.label}
        </span>
      </div>

      {price.kind !== "unavailable" && price.scope_label && (
        <p className="flex items-center gap-1 text-xs text-slate-500">
          <Package className="h-3 w-3" aria-hidden />
          {price.scope_label}
          {price.package_includes.length > 0 &&
            ` · includes ${price.package_includes.join(", ")}`}
        </p>
      )}

      {price.budget_status !== "unknown" && (
        <span
          className={classNames(
            "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
            STATUS_STYLE[price.budget_status]
          )}
        >
          {STATUS_LABEL[price.budget_status]}
          {detail && <span className="ml-1 font-normal opacity-80">· {detail}</span>}
        </span>
      )}

      {!compact && price.note && (
        <p className="text-[11px] leading-snug text-slate-400">{price.note}</p>
      )}
    </div>
  );
}
