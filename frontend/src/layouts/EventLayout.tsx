import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useParams } from "react-router-dom";
import {
  ChefHat,
  LayoutDashboard,
  ListChecks,
  Mail,
  MapPinned,
  Menu,
  PartyPopper,
  Receipt,
  Sparkles,
  Store,
  Users,
  X,
} from "lucide-react";
import { classNames } from "../utils/format";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
  /** Extra sub-paths that should also highlight this item. */
  also?: string[];
}

interface NavGroup {
  /** Omitted for the standalone top/bottom items. */
  title?: string;
  items: NavItem[];
}

const icon = (C: typeof Receipt) => <C className="h-4 w-4 shrink-0" aria-hidden />;

// One entry per job, short labels, three groups that follow how people plan:
// sort the plan, book the suppliers, look after the guests.
export function navGroups(eventId: string): NavGroup[] {
  const base = `/events/${eventId}`;
  return [
    { items: [{ to: base, label: "Dashboard", icon: icon(LayoutDashboard), end: true }] },
    {
      title: "Plan",
      items: [
        { to: `${base}/budget`, label: "Budget", icon: icon(Receipt) },
        { to: `${base}/timeline`, label: "Timeline", icon: icon(ListChecks) },
        { to: `${base}/adapt`, label: "Adapt with AI", icon: icon(Sparkles) },
      ],
    },
    {
      title: "Book",
      items: [
        { to: `${base}/venues-discovery`, label: "Venues", icon: icon(MapPinned) },
        { to: `${base}/catering`, label: "Food & catering", icon: icon(ChefHat), also: [`${base}/caterers`] },
        { to: `${base}/vendors`, label: "Vendors", icon: icon(Store) },
      ],
    },
    {
      title: "Guests",
      items: [
        { to: `${base}/guests`, label: "Guest list", icon: icon(Users) },
        { to: `${base}/invitations`, label: "Invitations", icon: icon(Mail) },
      ],
    },
    { items: [{ to: `${base}/event-day`, label: "Event day", icon: icon(PartyPopper) }] },
  ];
}

/** Menu vs. caterers live on two pages; this switch makes them feel like one. */
function FoodTabs({ base, path }: { base: string; path: string }) {
  const tabs = [
    { to: `${base}/catering`, label: "Menu & quantities" },
    { to: `${base}/caterers`, label: "Caterers & booking" },
  ];
  return (
    <nav aria-label="Food & catering" className="mb-4 inline-flex rounded-xl border border-sand-200 bg-white p-1 shadow-sm">
      {tabs.map((t) => {
        const active = path === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={active ? "page" : undefined}
            className={classNames(
              "rounded-lg px-3.5 py-1.5 text-sm font-medium transition",
              active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-sand-50"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function EventLayout() {
  const { eventId } = useParams();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  if (!eventId) return <Outlet />;

  const base = `/events/${eventId}`;
  const path = pathname.replace(/\/+$/, "");
  const groups = navGroups(eventId);
  const showFoodTabs = path === `${base}/catering` || path === `${base}/caterers`;

  return (
    <div className="flex gap-8">
      {/* Mobile toggle */}
      <button
        type="button"
        className="btn-secondary fixed bottom-4 right-4 z-30 shadow-lg lg:hidden"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close event menu" : "Open event menu"}
        aria-expanded={open}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        Menu
      </button>

      {/* Sidebar */}
      <aside
        className={classNames(
          "w-52 shrink-0 lg:block",
          open
            ? "fixed inset-y-0 left-0 z-20 block w-64 overflow-y-auto border-r border-sand-200 bg-white p-4 pt-20"
            : "hidden"
        )}
      >
        <nav className="sticky top-24 space-y-5" aria-label="Event sections">
          {groups.map((g, gi) => (
            <div key={g.title ?? `g${gi}`}>
              {g.title && (
                <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {g.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {g.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) => {
                        const active = isActive || !!item.also?.includes(path);
                        return classNames(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                          active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-sand-50 hover:text-slate-900"
                        );
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Backdrop for mobile */}
      {open && (
        <div
          className="fixed inset-0 z-10 bg-slate-900/20 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <div className="min-w-0 flex-1">
        {showFoodTabs && <FoodTabs base={base} path={path} />}
        <Outlet />
      </div>
    </div>
  );
}
