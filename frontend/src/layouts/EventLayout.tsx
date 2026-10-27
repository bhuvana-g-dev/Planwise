import { useState } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import {
  CalendarClock,
  ChefHat,
  LayoutDashboard,
  ListChecks,
  MapPinned,
  Menu,
  PartyPopper,
  Receipt,
  RefreshCw,
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
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

function groups(eventId: string): NavGroup[] {
  const base = `/events/${eventId}`;
  return [
    {
      title: "Overview",
      items: [
        {
          to: base,
          label: "Dashboard",
          icon: <LayoutDashboard className="h-4 w-4" />,
          end: true,
        },
      ],
    },
    {
      title: "Planning",
      items: [
        {
          to: `${base}/budget`,
          label: "Budget & Expenses",
          icon: <Receipt className="h-4 w-4" />,
        },
        {
          to: `${base}/catering`,
          label: "Catering & Menu",
          icon: <ChefHat className="h-4 w-4" />,
        },
        {
          to: `${base}/timeline`,
          label: "Timeline & Tasks",
          icon: <ListChecks className="h-4 w-4" />,
        },
        {
          to: `${base}/adapt`,
          label: "Adapt Plan",
          icon: <RefreshCw className="h-4 w-4" />,
        },
      ],
    },
    {
      title: "People & Suppliers",
      items: [
        {
          to: `${base}/guests`,
          label: "Guests & RSVP",
          icon: <Users className="h-4 w-4" />,
        },
        {
          to: `${base}/venues-discovery`,
          label: "Venues & Maps",
          icon: <MapPinned className="h-4 w-4" />,
        },
        {
          to: `${base}/vendors`,
          label: "Vendors & Quotes",
          icon: <Store className="h-4 w-4" />,
        },
      ],
    },
    {
      title: "The big day",
      items: [
        {
          to: `${base}/event-day`,
          label: "Event Day",
          icon: <PartyPopper className="h-4 w-4" />,
        },
      ],
    },
  ];
}

export default function EventLayout() {
  const { eventId } = useParams();
  const [open, setOpen] = useState(false);
  if (!eventId) return <Outlet />;

  const navGroups = groups(eventId);

  return (
    <div className="flex gap-6">
      {/* Mobile toggle */}
      <button
        className="btn-secondary fixed bottom-4 right-4 z-30 shadow-lg lg:hidden"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle event menu"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        Menu
      </button>

      {/* Sidebar */}
      <aside
        className={classNames(
          "w-60 shrink-0",
          "lg:block",
          open
            ? "fixed inset-y-0 left-0 z-20 block w-64 overflow-y-auto border-r border-slate-200 bg-white p-4 pt-20"
            : "hidden"
        )}
      >
        <nav className="sticky top-24 space-y-6" aria-label="Event sections">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CalendarClock className="h-4 w-4 text-brand-600" />
            Event workspace
          </div>
          {navGroups.map((g) => (
            <div key={g.title}>
              <p className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {g.title}
              </p>
              <ul className="space-y-0.5">
                {g.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        classNames(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                          isActive
                            ? "bg-brand-50 text-brand-700"
                            : "text-slate-600 hover:bg-slate-50"
                        )
                      }
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
        <Outlet />
      </div>
    </div>
  );
}
