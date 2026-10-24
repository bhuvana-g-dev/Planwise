import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { api, ApiError } from "../services/api";
import type { EventRecord } from "../types";
import { EmptyState, ErrorBanner, Spinner } from "../components/ui";
import { formatDate, formatINR } from "../utils/format";

export default function EventsList() {
  const [events, setEvents] = useState<EventRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listEvents()
      .then(setEvents)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Failed to load events")
      );
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">My events</h1>
        <Link to="/create" className="btn-primary">
          New event
        </Link>
      </div>

      {error && <ErrorBanner message={error} />}

      {!events && !error && <Spinner label="Loading events…" />}

      {events && events.length === 0 && (
        <EmptyState
          title="No events yet"
          description="Create your first event and PlanWise will generate a complete, budget-valid plan."
          action={
            <Link to="/create" className="btn-primary">
              Create an event
            </Link>
          }
        />
      )}

      {events && events.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <Link key={e.id} to={`/events/${e.id}`} className="card p-5 hover:shadow-lg transition">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">{e.name}</h3>
                <span className="badge bg-brand-100 capitalize text-brand-700">
                  {e.event_type}
                </span>
              </div>
              <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  {formatDate(e.event_date)}
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  {e.location}
                </p>
                <p className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  {e.guest_count} guests
                </p>
              </div>
              <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
                <span className="text-slate-500">Budget </span>
                <span className="font-semibold text-slate-900">
                  {formatINR(e.budget_paise)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
