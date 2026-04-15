import { useMemo, useEffect } from "react";
import { useGetTripSeatMap } from "@workspace/api-client-react";
import type { Seat } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

// Seat types that are clickable / reservable
const CLICKABLE_TYPES = ["seat", "vip", "accessible"];

interface SeatMapPickerProps {
  tripId: string;
  selectedSeats: string[];
  onSeatsChange: (seats: string[]) => void;
  maxSeats?: number;
  onHasMap?: (hasMap: boolean) => void;
}

type SeatWithType = Seat & { type?: string };

export function getSeatColor(status: string, selected: boolean, type?: string) {
  if (selected) return "bg-primary border-2 border-primary text-primary-foreground cursor-pointer";

  // Non-seat cells
  if (type === "wc") return "bg-cyan-100 border-2 border-cyan-300 text-cyan-700 cursor-not-allowed";
  if (type === "stairs") return "bg-purple-100 border-2 border-purple-300 text-purple-700 cursor-not-allowed";
  if (type === "fridge") return "bg-sky-100 border-2 border-sky-300 text-sky-700 cursor-not-allowed";
  if (type === "blocked") return "bg-gray-100 border-2 border-gray-300 text-gray-400 cursor-not-allowed";

  // Seat types
  switch (status) {
    case "available":
      if (type === "vip") return "bg-yellow-50 border-2 border-yellow-500 hover:border-yellow-600 hover:bg-yellow-100 text-yellow-800 cursor-pointer shadow-[0_0_0_1px_theme(colors.yellow.400)]";
      if (type === "accessible") return "bg-blue-50 border-2 border-blue-400 hover:border-blue-600 hover:bg-blue-100 text-blue-800 cursor-pointer";
      return "bg-white border-2 border-gray-200 hover:border-primary hover:bg-primary/10 cursor-pointer";
    case "reserved":
    case "occupied":
      return "bg-orange-400 border-2 border-orange-500 text-white cursor-not-allowed";
    case "confirmed":
      return "bg-green-500 border-2 border-green-600 text-white cursor-not-allowed";
    case "blocked":
    case "wc":
    case "stairs":
    case "fridge":
      return "bg-gray-100 border-2 border-gray-200 text-gray-400 cursor-not-allowed";
    default:
      return "bg-gray-100 border-2 border-gray-200 cursor-not-allowed";
  }
}

export function getCellIcon(type?: string, seatNumber?: string): string {
  switch (type) {
    case "wc": return "🚽";
    case "stairs": return "🪜";
    case "fridge": return "🧊";
    case "blocked": return "✕";
    case "vip": return "★";
    case "accessible": return "♿";
    default: return seatNumber ?? "";
  }
}

const NON_SEAT_TYPES = ["wc", "stairs", "fridge", "blocked", "empty"];

function getCellTitle(seat: SeatWithType, selected: boolean): string {
  const typeLabel: Record<string, string> = {
    wc: "Banheiro",
    stairs: "Escada",
    fridge: "Frigobar",
    blocked: "Bloqueado",
    vip: `Assento VIP ${seat.number}`,
    accessible: `Assento Acessível ${seat.number}`,
  };
  if (seat.type && typeLabel[seat.type]) return typeLabel[seat.type];
  if (selected) return `Assento ${seat.number} — Selecionado`;
  return `Assento ${seat.number} — ${seat.status}`;
}

export function SeatMapPicker({ tripId, selectedSeats, onSeatsChange, maxSeats, onHasMap }: SeatMapPickerProps) {
  const { data: seatMap, isLoading } = useGetTripSeatMap(tripId, {
    query: { queryKey: ["seat-map-picker", tripId], refetchInterval: 8000 },
  });

  const seats = useMemo<SeatWithType[]>(() => {
    if (!seatMap?.seats) return [];
    return [...(seatMap.seats as SeatWithType[])].sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });
  }, [seatMap]);

  useEffect(() => {
    if (!isLoading) {
      onHasMap?.(seats.length > 0);
    }
  }, [isLoading, seats.length]);

  const maxRow = useMemo(() => Math.max(...seats.map(s => s.row), 0), [seats]);
  const maxCol = useMemo(() => Math.max(...seats.map(s => s.col), 4), [seats]);
  const aisleAfterCol = Math.ceil(maxCol / 2);

  const clickableSeats = useMemo(() =>
    seats.filter(s => CLICKABLE_TYPES.includes(s.type ?? "seat")),
    [seats]
  );

  const seatCounts = useMemo(() => ({
    available: clickableSeats.filter(s => s.status === "available").length,
    reserved: clickableSeats.filter(s => s.status === "reserved" || s.status === "occupied").length,
    confirmed: clickableSeats.filter(s => s.status === "confirmed").length,
  }), [clickableSeats]);

  const handleSeatClick = (seat: SeatWithType) => {
    if (!CLICKABLE_TYPES.includes(seat.type ?? "seat")) return;
    if (seat.status !== "available") return;
    const isSelected = selectedSeats.includes(seat.number);
    if (isSelected) {
      onSeatsChange(selectedSeats.filter(s => s !== seat.number));
    } else {
      if (maxSeats && selectedSeats.length >= maxSeats) return;
      onSeatsChange([...selectedSeats, seat.number]);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!seatMap || seats.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-6 border rounded-lg bg-muted/20">
        Mapa de assentos não disponível para esta viagem.<br />
        Informe os assentos manualmente no passo seguinte.
      </div>
    );
  }

  const hasCustomTypes = seats.some(s => s.type && s.type !== "seat");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Layout: <strong>{seatMap.layout === "2x1" ? "2x1 Premium" : "2x2 Padrão"}</strong></span>
        <span>{seatCounts.available} disponíveis · {seatMap.totalSeats} total</span>
      </div>

      <div className="bg-gray-800 text-white text-center py-2 rounded-lg text-xs font-medium">FRENTE DO ÔNIBUS</div>

      <div className="space-y-1.5 max-w-xs mx-auto">
        {Array.from({ length: maxRow }).map((_, rowIdx) => {
          const rowNum = rowIdx + 1;
          const rowSeats = seats.filter(s => s.row === rowNum);
          const leftSeats = rowSeats.filter(s => s.col <= aisleAfterCol);
          const rightSeats = rowSeats.filter(s => s.col > aisleAfterCol);

          return (
            <div key={rowNum} className="flex items-center gap-2 justify-center">
              <div className="flex gap-1">
                {leftSeats.map(seat => {
                  const s = seat as SeatWithType;
                  const isNonSeat = NON_SEAT_TYPES.includes(s.type ?? "");
                  const isClickable = CLICKABLE_TYPES.includes(s.type ?? "seat");
                  const isSelected = selectedSeats.includes(s.number);
                  const cellClass = `w-9 h-9 rounded-md text-xs font-bold flex items-center justify-center transition-all ${getSeatColor(s.status, isSelected, s.type)}`;
                  if (isNonSeat) {
                    return (
                      <div key={s.number} className={cellClass} title={getCellTitle(s, false)} aria-label={getCellTitle(s, false)}>
                        {getCellIcon(s.type)}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={s.number}
                      type="button"
                      className={cellClass}
                      onClick={() => handleSeatClick(s)}
                      title={getCellTitle(s, isSelected)}
                      disabled={!isClickable || (s.status !== "available" && !isSelected)}
                    >
                      {getCellIcon(s.type, isSelected ? "✓" : s.number)}
                    </button>
                  );
                })}
              </div>
              <div className="w-4 text-center text-xs text-muted-foreground shrink-0">|</div>
              <div className="flex gap-1">
                {rightSeats.map(seat => {
                  const s = seat as SeatWithType;
                  const isNonSeat = NON_SEAT_TYPES.includes(s.type ?? "");
                  const isClickable = CLICKABLE_TYPES.includes(s.type ?? "seat");
                  const isSelected = selectedSeats.includes(s.number);
                  const cellClass = `w-9 h-9 rounded-md text-xs font-bold flex items-center justify-center transition-all ${getSeatColor(s.status, isSelected, s.type)}`;
                  if (isNonSeat) {
                    return (
                      <div key={s.number} className={cellClass} title={getCellTitle(s, false)} aria-label={getCellTitle(s, false)}>
                        {getCellIcon(s.type)}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={s.number}
                      type="button"
                      className={cellClass}
                      onClick={() => handleSeatClick(s)}
                      title={getCellTitle(s, isSelected)}
                      disabled={!isClickable || (s.status !== "available" && !isSelected)}
                    >
                      {getCellIcon(s.type, isSelected ? "✓" : s.number)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 justify-center text-xs flex-wrap pt-1">
        {[
          { color: "bg-primary", label: "Selecionado" },
          { color: "bg-white border-2 border-gray-200", label: "Disponível" },
          { color: "bg-yellow-50 border-2 border-yellow-500", label: "VIP ★" },
          { color: "bg-blue-50 border-2 border-blue-400", label: "Acessível ♿" },
          { color: "bg-orange-400", label: "Reservado" },
          { color: "bg-green-500", label: "Confirmado" },
          { color: "bg-gray-300", label: "Bloqueado" },
          ...(hasCustomTypes ? [
            { color: "bg-cyan-100 border-2 border-cyan-300", label: "Banheiro 🚽" },
            { color: "bg-purple-100 border-2 border-purple-300", label: "Escada 🪜" },
          ] : []),
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className={`w-3.5 h-3.5 rounded ${l.color}`} />
            <span className="text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>

      {selectedSeats.length > 0 && (
        <div className="text-center text-sm font-medium text-primary">
          {selectedSeats.length} assento{selectedSeats.length !== 1 ? "s" : ""} selecionado{selectedSeats.length !== 1 ? "s" : ""}: {selectedSeats.join(", ")}
        </div>
      )}
    </div>
  );
}
