import { Drumstick, Leaf } from "lucide-react";
import type { FoodType } from "../../types";
import { FOOD_LABEL } from "../../utils/caterers";

/** Veg / non-veg indicator styled after the familiar Indian food marks. */
export default function FoodTypeBadge({
  type,
  compact = false,
}: {
  type: FoodType;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-sand-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
      {(type === "veg" || type === "both") && (
        <span className="grid h-4 w-4 place-items-center rounded-[3px] border-2 border-emerald-600">
          <Leaf className="h-2.5 w-2.5 text-emerald-600" aria-hidden />
        </span>
      )}
      {(type === "nonveg" || type === "both") && (
        <span className="grid h-4 w-4 place-items-center rounded-[3px] border-2 border-rose-700">
          <Drumstick className="h-2.5 w-2.5 text-rose-700" aria-hidden />
        </span>
      )}
      {!compact && FOOD_LABEL[type]}
      {compact && <span className="sr-only">{FOOD_LABEL[type]}</span>}
    </span>
  );
}
