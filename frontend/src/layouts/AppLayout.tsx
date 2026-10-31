import { Link, NavLink, Outlet } from "react-router-dom";
import {
  CalendarHeart,
  LayoutDashboard,
  LogIn,
  LogOut,
  PlusCircle,
} from "lucide-react";
import { classNames } from "../utils/format";
import { useAuth } from "../hooks/useAuth";

export default function AppLayout() {
  const { enabled, user, loading, signIn, logout } = useAuth();
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="PlanWise AI home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
              <CalendarHeart className="h-5 w-5" aria-hidden />
            </span>
            <span className="whitespace-nowrap text-lg font-semibold tracking-tight text-slate-900">
              PlanWise <span className="text-brand-600">AI</span>
            </span>
          </Link>
          {/* Phones get icon-only buttons (labels from sm up) so the bar never overflows. */}
          <nav className="flex min-w-0 items-center gap-1 sm:gap-2" aria-label="Primary">
            <NavItem to="/events" icon={<LayoutDashboard className="h-4 w-4" aria-hidden />}>
              My Events
            </NavItem>
            <NavLink
              to="/create"
              className="btn-primary whitespace-nowrap px-3 sm:px-4"
              aria-label="New Event"
              title="New Event"
            >
              <PlusCircle className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">New Event</span>
            </NavLink>
            {enabled && !loading && (
              <div className="flex items-center gap-2">
                {user ? (
                  <>
                    <span className="hidden text-sm text-slate-500 sm:inline">
                      {user.displayName ?? user.email}
                    </span>
                    <button
                      className="btn-secondary whitespace-nowrap px-3 sm:px-4"
                      onClick={() => void logout()}
                      aria-label="Sign out"
                      title="Sign out"
                    >
                      <LogOut className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">Sign out</span>
                    </button>
                  </>
                ) : (
                  <button
                    className="btn-secondary whitespace-nowrap px-3 sm:px-4"
                    onClick={() => void signIn()}
                    aria-label="Sign in"
                    title="Sign in"
                  >
                    <LogIn className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Sign in</span>
                  </button>
                )}
              </div>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-slate-400">
        PlanWise AI — estimates are illustrative, not verified vendor quotations.
      </footer>
    </div>
  );
}

function NavItem({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      aria-label={typeof children === "string" ? children : undefined}
      title={typeof children === "string" ? children : undefined}
      className={({ isActive }) =>
        classNames(
          "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition",
          isActive
            ? "bg-brand-50 text-brand-700"
            : "text-slate-600 hover:bg-slate-50"
        )
      }
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </NavLink>
  );
}
