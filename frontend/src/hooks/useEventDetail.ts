import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../services/api";
import type { EventDetail } from "../types";

export function useEventDetail(eventId: string | undefined) {
  const [data, setData] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await api.getEvent(eventId);
      setData(detail);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load event");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}
