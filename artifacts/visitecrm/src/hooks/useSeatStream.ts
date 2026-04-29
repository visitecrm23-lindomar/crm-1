import { useEffect, useRef, useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface SeatStreamEntry {
  number: string;
  status: string;
}

interface UseSeatStreamOptions {
  tripId: string | null | undefined;
  slug?: string;
  isPublic?: boolean;
  enabled?: boolean;
}

export function useSeatStream({ tripId, slug, isPublic = true, enabled = true }: UseSeatStreamOptions) {
  const [occupiedSeats, setOccupiedSeats] = useState<Record<string, string>>({});
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!tripId || !enabled) return;

    const url = isPublic && slug
      ? `${BASE}/api/public/store/${encodeURIComponent(slug)}/trips/${encodeURIComponent(tripId)}/seats/stream`
      : `${BASE}/api/trips/${encodeURIComponent(tripId)}/seats/stream`;

    const es = new EventSource(url, { withCredentials: !isPublic });
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data) as { tripId: string; seats: SeatStreamEntry[] };
        if (payload.tripId !== tripId) return;
        const map: Record<string, string> = {};
        for (const seat of payload.seats) map[seat.number] = seat.status;
        setOccupiedSeats(map);
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [tripId, slug, isPublic, enabled]);

  return { occupiedSeats, connected };
}
