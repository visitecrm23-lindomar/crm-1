import { useMemo } from "react";
import { useGetTripSeatMap } from "@workspace/api-client-react";
import type { Seat } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

interface SeatMapPickerProps {
  tripId: string;
  selectedSeats: string[];
  onSeatsChange: (seats: string[]) => void;
  maxSeats?: number;
}

export function getSeatColor(status: string, selected: boolean) {
  if (selected) return "bg-primary border-2 border-primary text-primary-foreground cursor-pointer";
  switch (status) {
    case "available": return "bg-white border-2 border-gray-200 hover:border-primary hover:bg-primary/10 cursor-pointer";
    case "reserved":
    case "occupied": return "bg-orange-400 border-2 border-orange-500 text-white cursor-not-allowed";
    case "confirmed": return "bg-green-500 border-2 border-green-600 text-white cursor-not-allowed";
    case "blocked": return "bg-gray-300 border-2 border-gray-400 text-gray-600 cursor-not-allowed";
    default: return "bg-gray-100 border-2 border-gray-200 cursor-not-allowed";
  }
}

export function SeatMapPicker({ tripId, selectedSeats, onSeatsChange, maxSeats }: SeatMapPickerProps) {
  const { data: seatMap, isLoading } = useGetTripSeatMap(tripId, {
    query: { queryKey: ["seat-map-picker", tripId], refetchInterval: 8000 },
  });

  const seats = useMemo(() => {
    if (!seatMap?.seats) return [];
    return [...seatMap.seats].sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });
  }, [seatMap]);

  const maxRow = useMemo(() => Math.max(...seats.map(s => s.row), 0), [seats]);

  const seatCounts = useMemo(() => ({
    available: seats.filter(s => s.status === "available").length,
    reserved: seats.filter(s => s.status === "reserved" || s.status === "occupied").length,
    confirmed: seats.filter(s => s.status === "confirmed").length,
  }), [seats]);

  const handleSeatClick = (seat: Seat) => {
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
          const leftSeats = rowSeats.filter(s => s.col <= 2);
          const rightSeats = rowSeats.filter(s => s.col > 2);
          return (
            <div key={rowNum} className="flex items-center gap-2 justify-center">
              <div className="flex gap-1">
                {leftSeats.map(seat => (
                  <button
                    key={seat.number}
                    type="button"
                    className={`w-9 h-9 rounded-md text-xs font-bold flex items-center justify-center transition-all ${getSeatColor(seat.status, selectedSeats.includes(seat.number))}`}
                    onClick={() => handleSeatClick(seat)}
                    title={`Assento ${seat.number} — ${selectedSeats.includes(seat.number) ? "Selecionado" : seat.status}`}
                    disabled={seat.status !== "available" && !selectedSeats.includes(seat.number)}
                  >
                    {seat.number}
                  </button>
                ))}
              </div>
              <div className="w-4 text-center text-xs text-muted-foreground shrink-0">|</div>
              <div className="flex gap-1">
                {rightSeats.map(seat => (
                  <button
                    key={seat.number}
                    type="button"
                    className={`w-9 h-9 rounded-md text-xs font-bold flex items-center justify-center transition-all ${getSeatColor(seat.status, selectedSeats.includes(seat.number))}`}
                    onClick={() => handleSeatClick(seat)}
                    title={`Assento ${seat.number} — ${selectedSeats.includes(seat.number) ? "Selecionado" : seat.status}`}
                    disabled={seat.status !== "available" && !selectedSeats.includes(seat.number)}
                  >
                    {seat.number}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 justify-center text-xs flex-wrap pt-1">
        {[
          { color: "bg-primary", label: "Selecionado" },
          { color: "bg-white border-2 border-gray-200", label: "Disponível" },
          { color: "bg-orange-400", label: "Reservado" },
          { color: "bg-green-500", label: "Confirmado" },
          { color: "bg-gray-300", label: "Bloqueado" },
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
