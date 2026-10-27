import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { classNames } from "../utils/format";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span className="text-sm">{label ?? "Loading…"}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="card animate-scale-in p-10 text-center">
      <div className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        {icon ?? <Info className="h-7 w-7" aria-hidden />}
      </div>
      <h3 className="mt-3 text-base font-semibold text-slate-800">{title}</h3>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
      role="status"
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "rose" | "brand" | "plum";
}) {
  const tones: Record<string, string> = {
    slate: "bg-sand-200 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-brand-100 text-brand-800",
    rose: "bg-rose-100 text-rose-700",
    brand: "bg-brand-100 text-brand-700",
    plum: "bg-plum-100 text-plum-600",
  };
  return <span className={classNames("badge", tones[tone])}>{children}</span>;
}

export function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const over = pct > 100;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-sand-200">
      <div
        className={classNames(
          "h-full rounded-full transition-all duration-700 ease-out",
          over
            ? "bg-rose-500"
            : "bg-gradient-to-r from-brand-400 to-brand-600"
        )}
        style={{ width: `${clamped}%` }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

/** Animated circular progress ring. Width grows via CSS transition. */
export function ProgressRing({
  pct,
  size = 88,
  stroke = 9,
  label,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (clamped / 100) * circ;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          className="text-sand-200"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          className="text-brand-500 transition-[stroke-dashoffset] duration-1000 ease-out"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {label ?? (
          <span className="text-lg font-bold text-slate-900">
            {Math.round(clamped)}%
          </span>
        )}
      </div>
    </div>
  );
}

/** Shimmer skeleton block. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={classNames("skeleton", className)} aria-hidden />;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "primary",
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <div className="card-plain w-full max-w-md animate-scale-in p-6 shadow-lift">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className={tone === "danger" ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
