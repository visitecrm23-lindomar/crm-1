import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { publicStoreApi, PublicStore, StoreProduct, CouponValidation } from "@/lib/storeApi";
import { calculateTripDuration } from "@/lib/tripDuration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  User,
  ClipboardList,
  Armchair,
  CreditCard,
  Ticket,
  MapPin,
  Calendar,
  Clock,
  Users,
  Tag,
  X,
  Copy,
  Check,
  Printer,
  Search,
  Bus,
  AlertTriangle,
  QrCode,
  Banknote,
  Building2,
  CheckCircle2,
  MessageSquare,
  Phone,
  Mail,
  Info,
  ArrowUp,
  ArrowDown,
  DollarSign,
} from "lucide-react";

type Step = "dados" | "revisao" | "assento" | "pagamento" | "confirmado";

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "dados", label: "Dados", icon: <User className="w-4 h-4" /> },
  { key: "revisao", label: "Revisão", icon: <ClipboardList className="w-4 h-4" /> },
  { key: "assento", label: "Assento", icon: <Armchair className="w-4 h-4" /> },
  { key: "pagamento", label: "Pagamento", icon: <CreditCard className="w-4 h-4" /> },
  { key: "confirmado", label: "Confirmação", icon: <Ticket className="w-4 h-4" /> },
];

const PAYMENT_METHODS_CONFIG = [
  {
    id: "pix",
    label: "PIX",
    description: "Pagamento instantâneo",
    Icon: QrCode,
    color: "text-teal-600",
    bg: "bg-teal-50",
    border: "border-teal-200",
  },
  {
    id: "boleto",
    label: "Boleto Bancário",
    description: "Vencimento em 3 dias úteis",
    Icon: Tag,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  {
    id: "credit_card",
    label: "Cartão de Crédito",
    description: "Parcelamento em até 12x",
    Icon: CreditCard,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  {
    id: "debit_card",
    label: "Cartão de Débito",
    description: "Pagamento à vista",
    Icon: CreditCard,
    color: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
  },
  {
    id: "transfer",
    label: "Transferência Bancária",
    description: "TED ou DOC",
    Icon: Building2,
    color: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-200",
  },
  {
    id: "cash",
    label: "Dinheiro",
    description: "Pagamento na agência",
    Icon: Banknote,
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
  },
];

const PAYMENT_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS_CONFIG.map((m) => [m.id, m.label])
);

function fmtDate(d?: string | null) {
  if (!d) return null;
  const clean = d.slice(0, 10) + "T12:00:00";
  return new Date(clean).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateLong(d?: string | null) {
  if (!d) return null;
  const clean = d.slice(0, 10) + "T12:00:00";
  return new Date(clean).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center justify-center mb-8 print:hidden">
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  done
                    ? "bg-green-500 text-white"
                    : active
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <Check className="w-4 h-4" /> : step.icon}
              </div>
              <span
                className={`text-xs mt-1 hidden sm:block ${
                  active ? "font-semibold text-primary" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-8 sm:w-12 mx-1 ${done ? "bg-green-500" : "bg-muted"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const TRIP_TYPE_LABELS: Record<string, string> = {
  excursao: "Excursão",
  bate_volta: "Bate-Volta",
  trilha: "Trilha",
  rota: "Rota",
  transfer: "Transfer",
  pacote_fechado: "Pacote Fechado",
  personalizada: "Viagem Personalizada",
  excursion: "Excursão",
  package: "Pacote Fechado",
  custom: "Viagem Personalizada",
};

function ProductCard({ product, store }: { product: StoreProduct; store: PublicStore }) {
  const images = product.images ?? [];
  const startDate = product.departureDate ?? product.startDate;
  return (
    <div className="flex gap-4 p-4 border rounded-xl bg-muted/30">
      <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-muted flex items-center justify-center">
        {images[0] ? (
          <img src={images[0]} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <Bus className="w-8 h-8 text-muted-foreground/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm leading-tight mb-1 line-clamp-2">{product.name}</p>
        {product.tripType && (
          <span className="inline-block mb-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
            {TRIP_TYPE_LABELS[product.tripType] ?? product.tripType}
          </span>
        )}
        {product.destination && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <MapPin className="w-3 h-3 shrink-0" />
            {product.destination}
          </p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {startDate && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {fmtDate(startDate)}
            </p>
          )}
          {(() => {
            const dur = calculateTripDuration(
              product.departureDate ?? product.startDate,
              product.endDate,
              product.departureTime,
              product.returnTime,
            ) ?? (product.durationDays ? { formattedShort: `${product.durationDays}d` } : null);
            return dur ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {dur.formattedShort}
              </p>
            ) : null;
          })()}
        </div>
        <p className="text-base font-bold mt-1" style={{ color: store.primaryColor }}>
          R$ {parseFloat(product.salePrice ?? product.price).toFixed(2)}
          <span className="text-xs font-normal text-muted-foreground ml-1">/ pessoa</span>
        </p>
      </div>
    </div>
  );
}

type PublicSeatEntry = {
  number: string;
  row: number;
  col: number;
  floor: number;
  type: string;
  status: string;
};

const CLICKABLE_SEAT_TYPES = ["seat", "vip", "accessible"];
const NON_SEAT_TYPES_PUB = ["wc", "stairs", "fridge", "blocked", "empty"];

function getCellIconPub(type: string, label?: string): string {
  switch (type) {
    case "wc": return "🚽";
    case "stairs": return "🪜";
    case "fridge": return "🧊";
    case "blocked": return "✕";
    case "vip": return "⭐";
    default: return label ?? "";
  }
}

function PublicLayoutSeatPicker({
  seats,
  totalSeats,
  layout,
  floors,
  qty,
  selected,
  onToggle,
  accentColor,
  pricePerPerson,
}: {
  seats: PublicSeatEntry[];
  totalSeats: number;
  layout: string;
  floors: number;
  qty: number;
  selected: string[];
  onToggle: (n: string) => void;
  accentColor?: string;
  pricePerPerson?: number;
}) {
  const isMultiFloor = floors > 1;
  const [activeFloor, setActiveFloor] = useState<number>(isMultiFloor ? 2 : 1);

  const clickableSeats = useMemo(
    () => seats.filter(s => CLICKABLE_SEAT_TYPES.includes(s.type)),
    [seats]
  );
  const occupiedCount = clickableSeats.filter(s => s.status !== "available").length;
  const availableCount = clickableSeats.length - occupiedCount;
  const occupancyPct = clickableSeats.length > 0
    ? Math.round((occupiedCount / clickableSeats.length) * 100)
    : 0;

  const floorCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (let f = 1; f <= floors; f++) {
      counts[f] = seats.filter(
        s => s.floor === f && CLICKABLE_SEAT_TYPES.includes(s.type) && s.status === "available"
      ).length;
    }
    return counts;
  }, [seats, floors]);

  const activeSeats = useMemo(
    () => [...seats.filter(s => s.floor === activeFloor)].sort((a, b) =>
      a.row !== b.row ? a.row - b.row : a.col - b.col
    ),
    [seats, activeFloor]
  );

  const maxRow = Math.max(...activeSeats.map(s => s.row), 0);
  const maxCol = Math.max(...activeSeats.map(s => s.col), 4);
  const aisleAfterCol = Math.ceil(maxCol / 2);

  const selectedSeatObjects = useMemo(
    () => seats.filter(s => selected.includes(s.number)),
    [seats, selected]
  );

  function formatPrice(price: number) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);
  }

  function SeatCell({ seat }: { seat: PublicSeatEntry }) {
    const isNonSeat = NON_SEAT_TYPES_PUB.includes(seat.type);
    const isOccupied = !isNonSeat && seat.status !== "available";
    const isSelected = selected.includes(seat.number);
    const canSelect = !isNonSeat && !isOccupied && (isSelected || selected.length < qty);
    const isClickable = CLICKABLE_SEAT_TYPES.includes(seat.type) && !isOccupied;
    const isVip = seat.type === "vip";

    if (isNonSeat) {
      let nonSeatCls = "w-11 h-11 rounded-xl border-2 flex flex-col items-center justify-center text-xs font-medium select-none ";
      if (seat.type === "wc") nonSeatCls += "border-cyan-200 bg-cyan-50 text-cyan-600";
      else if (seat.type === "stairs") nonSeatCls += "border-purple-200 bg-purple-50 text-purple-600";
      else nonSeatCls += "border-gray-200 bg-gray-100 text-gray-400";
      return (
        <div className={nonSeatCls} title={seat.type}>
          <span className="text-sm">{getCellIconPub(seat.type, seat.number)}</span>
        </div>
      );
    }

    let btnCls = "w-11 h-11 rounded-xl border-2 flex flex-col items-center justify-center transition-all duration-200 select-none ";
    if (isSelected) {
      btnCls += "bg-gradient-to-br from-green-400 to-green-600 text-white border-green-700 shadow-lg scale-105 ring-2 ring-green-300 ring-offset-1 cursor-pointer";
    } else if (isOccupied) {
      btnCls += "bg-gradient-to-br from-red-300 to-red-400 text-white border-red-500 cursor-not-allowed opacity-75";
    } else if (canSelect) {
      if (isVip) {
        btnCls += "bg-gradient-to-br from-yellow-300 to-yellow-400 text-yellow-900 border-yellow-500 hover:from-yellow-400 hover:to-yellow-500 hover:scale-105 hover:shadow-md cursor-pointer";
      } else {
        btnCls += "bg-gradient-to-br from-blue-400 to-blue-500 text-white border-blue-600 hover:from-blue-500 hover:to-blue-600 hover:scale-105 hover:shadow-md cursor-pointer";
      }
    } else {
      btnCls += "bg-gradient-to-br from-gray-200 to-gray-300 text-gray-500 border-gray-400 cursor-not-allowed opacity-60";
    }

    const seatPrice = pricePerPerson != null ? pricePerPerson * (isVip ? 1.1 : 1) : null;

    return (
      <div className="relative group">
        <button
          type="button"
          className={btnCls}
          onClick={() => isClickable && canSelect && onToggle(seat.number)}
          disabled={!isClickable || (!canSelect && !isSelected)}
          title={isOccupied ? `Assento ${seat.number} — Ocupado` : `Assento ${seat.number}`}
        >
          <Armchair className="w-4 h-4 mb-0.5 shrink-0" />
          <span className="text-[10px] font-bold leading-none">
            {isSelected ? "✓" : isOccupied ? "✗" : seat.number}
          </span>
          {!isOccupied && !isSelected && (
            <span className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          )}
        </button>

        {isVip && !isOccupied && (
          <span className="absolute -top-1.5 -right-1.5 z-10 bg-yellow-500 text-yellow-900 text-[9px] font-bold px-1 py-0.5 rounded-full shadow-sm border border-yellow-600 leading-none">
            VIP
          </span>
        )}

        {seatPrice != null && !isOccupied && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <div className="bg-gray-900 text-white text-[10px] font-semibold px-2 py-1 rounded-lg shadow-xl whitespace-nowrap">
              {formatPrice(seatPrice)}
              {isVip && <span className="ml-1 text-yellow-300">(+10%)</span>}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 -mt-px" />
          </div>
        )}
      </div>
    );
  }

  function FloorGrid({ floorNum }: { floorNum: number }) {
    const isUpper = floorNum === 2;
    const floorSeats = seats
      .filter(s => s.floor === floorNum)
      .sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col);
    const fMaxRow = Math.max(...floorSeats.map(s => s.row), 0);
    const fMaxCol = Math.max(...floorSeats.map(s => s.col), 4);
    const fAisle = Math.ceil(fMaxCol / 2);

    return (
      <div className="space-y-3">
        <div className={`flex items-center justify-between p-4 rounded-2xl text-white shadow-sm ${isUpper ? "bg-gradient-to-r from-blue-600 to-blue-700" : "bg-gradient-to-r from-purple-600 to-purple-700"}`}>
          <div className="flex items-center gap-3">
            {isUpper ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
            <div>
              <p className="font-bold text-sm">{isUpper ? "Piso Superior" : "Piso Inferior"}</p>
              <p className="text-xs text-white/80">{floorCounts[floorNum] ?? 0} assentos disponíveis</p>
            </div>
          </div>
          <span className="text-xs font-semibold bg-white/20 px-3 py-1 rounded-full border border-white/30">
            {floorSeats.filter(s => CLICKABLE_SEAT_TYPES.includes(s.type)).length} lugares
          </span>
        </div>

        <div className="border-2 border-gray-200 rounded-2xl overflow-hidden shadow-inner">
          <div className="bg-gray-800 text-white text-xs font-bold py-2.5 text-center tracking-[0.15em]">
            {isUpper ? "🏢 PISO SUPERIOR — FRENTE" : "🚌 PISO INFERIOR — FRENTE"}
          </div>
          <div className="bg-gradient-to-b from-gray-50 to-white p-3 space-y-1.5">
            {Array.from({ length: fMaxRow }, (_, rowIdx) => {
              const rowNum = rowIdx + 1;
              const rowSeats = floorSeats.filter(s => s.row === rowNum);
              const leftSeats = rowSeats.filter(s => s.col <= fAisle);
              const rightSeats = rowSeats.filter(s => s.col > fAisle);
              return (
                <div key={rowNum} className="flex items-center justify-center gap-1">
                  <div className="flex gap-1">
                    {leftSeats.map(s => <SeatCell key={s.number} seat={s} />)}
                  </div>
                  <div className="w-6 flex items-center justify-center text-gray-300 text-sm font-light select-none">|</div>
                  <div className="flex gap-1">
                    {rightSeats.map(s => <SeatCell key={s.number} seat={s} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-3 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm">
          <p className="text-[11px] text-blue-100 mb-0.5">Total</p>
          <p className="text-2xl font-bold">{clickableSeats.length}</p>
        </div>
        <div className="rounded-xl p-3 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-sm">
          <p className="text-[11px] text-green-100 mb-0.5">Disponíveis</p>
          <p className="text-2xl font-bold">{availableCount}</p>
        </div>
        <div className="rounded-xl p-3 bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-sm">
          <p className="text-[11px] text-orange-100 mb-0.5">Ocupação</p>
          <p className="text-2xl font-bold">{occupancyPct}%</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-blue-400 to-blue-500 inline-block shadow-sm" />
          Disponível
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-green-400 to-green-600 inline-block shadow-sm" />
          Selecionado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-red-300 to-red-400 inline-block shadow-sm" />
          Ocupado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-yellow-300 to-yellow-400 inline-block shadow-sm" />
          VIP (+10%)
        </span>
      </div>

      {isMultiFloor ? (
        <Tabs value={String(activeFloor)} onValueChange={(v) => setActiveFloor(Number(v))}>
          <TabsList className="grid w-full grid-cols-2 h-12 bg-gray-100 p-1 rounded-2xl shadow-sm">
            <TabsTrigger
              value="2"
              className="flex items-center gap-2 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-blue-600 rounded-xl transition-all"
            >
              <ArrowUp className="w-4 h-4" />
              Piso Superior
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">
                {floorCounts[2] ?? 0}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="1"
              className="flex items-center gap-2 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-purple-600 rounded-xl transition-all"
            >
              <ArrowDown className="w-4 h-4" />
              Piso Inferior
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold">
                {floorCounts[1] ?? 0}
              </span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="2" className="mt-4">
            <FloorGrid floorNum={2} />
          </TabsContent>
          <TabsContent value="1" className="mt-4">
            <FloorGrid floorNum={1} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="border-2 border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-gray-800 text-white text-xs font-bold py-2.5 text-center tracking-[0.15em]">
            FRENTE DO ÔNIBUS
          </div>
          <div className="bg-gray-50 p-3 space-y-1.5">
            {Array.from({ length: maxRow }, (_, rowIdx) => {
              const rowNum = rowIdx + 1;
              const rowSeats = activeSeats.filter(s => s.row === rowNum);
              const leftSeats = rowSeats.filter(s => s.col <= aisleAfterCol);
              const rightSeats = rowSeats.filter(s => s.col > aisleAfterCol);
              return (
                <div key={rowNum} className="flex items-center justify-center gap-1">
                  <div className="flex gap-1">
                    {leftSeats.map(s => <SeatCell key={s.number} seat={s} />)}
                  </div>
                  <div className="w-6 flex items-center justify-center text-gray-300 text-sm font-light select-none">|</div>
                  <div className="flex gap-1">
                    {rightSeats.map(s => <SeatCell key={s.number} seat={s} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl border-2 border-green-300 bg-gradient-to-br from-green-50 to-emerald-50 p-4 shadow-sm"
          >
            <p className="font-bold text-green-800 flex items-center gap-2 mb-3 text-sm">
              <Check className="w-4 h-4 text-green-600" />
              Assentos Selecionados
            </p>
            <div className="space-y-2">
              {selectedSeatObjects.map((seat, idx) => {
                const isVip = seat.type === "vip";
                const price = pricePerPerson != null ? pricePerPerson * (isVip ? 1.1 : 1) : null;
                return (
                  <motion.div
                    key={seat.number}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-center justify-between p-3 bg-white rounded-xl border border-green-200 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                        {seat.number}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-gray-900">Assento {seat.number}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          {floors > 1
                            ? seat.floor === 2
                              ? <><ArrowUp className="w-3 h-3" /> Piso Superior</>
                              : <><ArrowDown className="w-3 h-3" /> Piso Inferior</>
                            : null}
                          {isVip && <span className="ml-1 text-yellow-600 font-semibold">• VIP</span>}
                        </p>
                      </div>
                    </div>
                    {price != null && (
                      <p className="font-bold text-green-600 text-sm">{formatPrice(price)}</p>
                    )}
                  </motion.div>
                );
              })}
            </div>
            {pricePerPerson != null && selectedSeatObjects.length > 0 && (
              <div className="mt-3 pt-3 border-t-2 border-green-200 flex items-center justify-between">
                <span className="font-bold text-gray-900 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  Total
                </span>
                <span className="text-xl font-bold text-green-600">
                  {formatPrice(
                    selectedSeatObjects.reduce(
                      (sum, s) => sum + pricePerPerson * (s.type === "vip" ? 1.1 : 1),
                      0
                    )
                  )}
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-900">
            <p className="font-bold mb-1.5">💡 Dicas para escolher seu assento:</p>
            <ul className="space-y-1 text-xs text-blue-800">
              <li>• Assentos VIP oferecem mais espaço e conforto (+10%)</li>
              <li>• Piso inferior geralmente tem menos movimento</li>
              <li>• Assentos próximos à entrada facilitam o embarque</li>
              <li>• Selecione exatamente {qty} assento{qty !== 1 ? "s" : ""} para continuar</li>
            </ul>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {selected.length}/{qty} assento{qty !== 1 ? "s" : ""} selecionado{qty !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function SeatGrid({
  totalCapacity,
  occupiedSeats,
  qty,
  selected,
  onToggle,
  accentColor,
}: {
  totalCapacity: number;
  occupiedSeats: number[];
  qty: number;
  selected: number[];
  onToggle: (n: number) => void;
  accentColor?: string;
}) {
  const accent = accentColor || "#f97316";
  const availableCount = totalCapacity - occupiedSeats.length;
  const rowCount = Math.ceil(totalCapacity / 4);

  function SeatBtn({ seatNum }: { seatNum: number }) {
    const isOccupied = occupiedSeats.includes(seatNum);
    const isSelected = selected.includes(seatNum);
    const canSelect = !isOccupied && (isSelected || selected.length < qty);
    let style: React.CSSProperties = {};
    let cls =
      "relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-all select-none ";
    if (isOccupied) {
      cls += "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed";
    } else if (isSelected) {
      cls += "border-transparent text-white cursor-pointer";
      style = { backgroundColor: accent, borderColor: accent };
    } else if (canSelect) {
      cls += "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 cursor-pointer";
    } else {
      cls += "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed";
    }
    return (
      <button
        onClick={() => canSelect && onToggle(seatNum)}
        disabled={isOccupied}
        title={isOccupied ? `Assento ${seatNum} — Ocupado` : `Assento ${seatNum}`}
        className={cls}
        style={style}
      >
        {seatNum}
        {isSelected && (
          <span className="absolute top-0.5 right-0.5">
            <Check className="w-3 h-3 text-white" />
          </span>
        )}
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/70">Layout: 2×2 Padrão</span>
        <span>
          <strong className="text-foreground">{availableCount}</strong> disponíveis &middot; {totalCapacity} total
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded border-2 border-gray-300 bg-white inline-block" />
          Disponível
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded border-2 border-gray-200 bg-gray-100 inline-block" />
          Ocupado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded inline-block" style={{ backgroundColor: accent }} />
          Selecionado
        </span>
      </div>

      <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-gray-800 text-white text-xs font-bold py-2.5 text-center tracking-[0.15em]">
          FRENTE DO ÔNIBUS
        </div>
        <div className="bg-gray-50 p-3 space-y-2">
          {Array.from({ length: rowCount }, (_, rowIdx) => {
            const s1 = rowIdx * 4 + 1;
            const s2 = rowIdx * 4 + 2;
            const s3 = rowIdx * 4 + 3;
            const s4 = rowIdx * 4 + 4;
            return (
              <div key={rowIdx} className="flex items-center justify-center gap-1">
                <div className="flex gap-1.5">
                  {s1 <= totalCapacity && <SeatBtn seatNum={s1} />}
                  {s2 <= totalCapacity && <SeatBtn seatNum={s2} />}
                </div>
                <div className="w-6 flex items-center justify-center text-gray-300 text-sm font-light select-none">
                  |
                </div>
                <div className="flex gap-1.5">
                  {s3 <= totalCapacity && <SeatBtn seatNum={s3} />}
                  {s4 <= totalCapacity && <SeatBtn seatNum={s4} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-3">
        Selecione exatamente {qty} assento{qty !== 1 ? "s" : ""} para continuar
        {" "}({selected.length}/{qty} selecionado{qty !== 1 ? "s" : ""})
      </p>
    </div>
  );
}

function Voucher({
  order,
  product,
  store,
  customerName,
  seats,
  paymentMethod,
}: {
  order: { orderNumber: string; totalAmount: string; createdAt: string };
  product: StoreProduct;
  store: PublicStore;
  customerName: string;
  seats: (number | string)[];
  paymentMethod: string;
}) {
  const startDate = product.departureDate ?? product.startDate;
  const images = product.images ?? [];

  return (
    <div
      id="voucher"
      className="border-2 border-dashed border-primary/40 rounded-2xl p-6 bg-white max-w-lg mx-auto print:block print:border-solid print:border-gray-300"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          {store.logoUrl ? (
            <img src={store.logoUrl} alt={store.name} className="h-10 object-contain" />
          ) : (
            <p className="font-bold text-lg" style={{ color: store.primaryColor }}>
              {store.name}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">Voucher de Reserva</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Pedido</p>
          <p className="font-mono font-bold text-primary text-lg">{order.orderNumber}</p>
        </div>
      </div>

      <div
        className="h-1 rounded-full mb-4"
        style={{ background: `linear-gradient(90deg, ${store.primaryColor}, ${store.secondaryColor})` }}
      />

      <div className="flex gap-4 mb-4">
        {images[0] && (
          <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0">
            <img src={images[0]} alt={product.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-base leading-tight mb-1">{product.name}</p>
          {product.destination && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 shrink-0" /> {product.destination}
            </p>
          )}
          {startDate && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 shrink-0" /> {fmtDate(startDate)}
            </p>
          )}
          {(() => {
            const dur = calculateTripDuration(
              product.departureDate ?? product.startDate,
              product.endDate,
              product.departureTime,
              product.returnTime,
            ) ?? (product.durationDays ? { formatted: `${product.durationDays} dia${product.durationDays > 1 ? "s" : ""}` } : null);
            return dur ? (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 shrink-0" /> {dur.formatted}
              </p>
            ) : null;
          })()}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm mb-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-0.5">Passageiro</p>
          <p className="font-semibold">{customerName}</p>
        </div>
        {seats.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
              <Armchair className="w-3 h-3" /> Assento(s)
            </p>
            <p className="font-semibold">{seats.join(", ")}</p>
          </div>
        )}
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-0.5">Pagamento</p>
          <p className="font-semibold">{PAYMENT_LABELS[paymentMethod] ?? paymentMethod}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-0.5">Total</p>
          <p className="font-bold text-green-700 text-base">
            R$ {parseFloat(order.totalAmount).toFixed(2)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 border-t pt-4">
        <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center shrink-0 text-center">
          <div className="text-xs text-muted-foreground leading-tight">
            <p className="font-mono font-bold text-primary text-xs break-all">{order.orderNumber}</p>
            <p className="text-[10px] mt-1">QR Code</p>
          </div>
        </div>
        <div className="flex-1 text-xs text-muted-foreground leading-relaxed">
          <p>Apresente este voucher no embarque. Em caso de dúvidas, entre em contato com nossa equipe.</p>
          {store.contactWhatsapp && (
            <p className="mt-1 font-medium text-foreground">WhatsApp: {store.contactWhatsapp}</p>
          )}
          {store.contactEmail && (
            <p className="font-medium text-foreground">{store.contactEmail}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfettiPiece({ delay, left, size, color, shape }: {
  delay: number; left: number; size: number; color: string; shape: "circle" | "square";
}) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${left}%`,
        top: "-12px",
        width: size,
        height: size,
        backgroundColor: color,
        borderRadius: shape === "circle" ? "50%" : "2px",
        animation: `confettiFall ${2 + delay}s ease-in ${delay * 0.1}s forwards`,
      }}
    />
  );
}

function ConfettiAnimation() {
  const pieces = useMemo(() => {
    const colors = ["#f97316", "#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#eab308", "#06b6d4"];
    return Array.from({ length: 80 }, (_, i) => ({
      id: i,
      delay: i * 0.05,
      left: Math.floor(Math.random() * 100),
      size: 6 + Math.floor(Math.random() * 8),
      color: colors[i % colors.length],
      shape: i % 2 === 0 ? "circle" as const : "square" as const,
    }));
  }, []);

  return (
    <>
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        {pieces.map((p) => (
          <ConfettiPiece key={p.id} {...p} />
        ))}
      </div>
    </>
  );
}


export default function ReservationWizard({
  slug,
  productSlug,
  store,
}: {
  slug: string;
  productSlug: string;
  store: PublicStore;
}) {
  const [, navigate] = useLocation();
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [step, setStep] = useState<Step>("dados");
  const [submitting, setSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<{ orderNumber: string; totalAmount: string; createdAt: string } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const [form, setFormState] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerCpf: "",
    customerBirthdate: "",
    notes: "",
    paymentMethod: (store.paymentMethods ?? [])[0] ?? "pix",
    couponCode: "",
    cardNumber: "",
    cardName: "",
    cardExpiry: "",
    cardCvv: "",
    installments: "1",
  });
  const [qty, setQty] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<{ variantName: string; label: string; price: number } | null>(null);
  const [couponResult, setCouponResult] = useState<CouponValidation | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [layoutSeats, setLayoutSeats] = useState<string[]>([]);
  const [layoutSeatMap, setLayoutSeatMap] = useState<{
    tripId: string;
    layout: string;
    floors: number;
    totalSeats: number;
    cols: number;
    seats: PublicSeatEntry[];
  } | null>(null);
  const [loadingLayoutMap, setLoadingLayoutMap] = useState(false);

  const [referralCode, setReferralCode] = useState(() => localStorage.getItem("referral_code") ?? "");
  const [referralApplied, setReferralApplied] = useState(false);
  const [referralDiscountPct, setReferralDiscountPct] = useState(5);

  useEffect(() => {
    setLoadingProduct(true);
    publicStoreApi
      .getProduct(slug, productSlug)
      .then((p) => setProduct(p))
      .catch(() => setNotFound(true))
      .finally(() => setLoadingProduct(false));
  }, [slug, productSlug]);

  useEffect(() => {
    if (!product?.tripId) { setLayoutSeatMap(null); return; }
    setLoadingLayoutMap(true);
    publicStoreApi
      .getTripSeatMap(slug, product.tripId)
      .then((data) => setLayoutSeatMap(data))
      .catch(() => setLayoutSeatMap(null))
      .finally(() => setLoadingLayoutMap(false));
  }, [slug, product?.tripId]);

  // Auto-apply referral code from localStorage
  useEffect(() => {
    const savedCode = localStorage.getItem("referral_code");
    if (savedCode) {
      publicStoreApi.validateReferral(slug, savedCode).then((res) => {
        if (res.valid) {
          setReferralCode(savedCode);
          setReferralApplied(true);
          setReferralDiscountPct(res.discountPercent ?? 5);
        }
      }).catch(() => {/* Silently ignore */});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(field: string, value: string) {
    setFormState((p) => ({ ...p, [field]: value }));
  }

  const basePrice = product ? parseFloat(product.salePrice ?? product.price) : 0;
  const unitPrice = selectedVariant ? selectedVariant.price : basePrice;
  const subtotal = unitPrice * qty;
  const couponDiscount = couponResult?.valid ? Number(couponResult.discountAmount ?? 0) : 0;
  const referralDiscount = referralApplied ? subtotal * (referralDiscountPct / 100) : 0;
  const finalTotal = Math.max(0, subtotal - couponDiscount - referralDiscount);

  const showSeatGrid =
    product?.totalCapacity != null && product.totalCapacity > 0 && product.totalCapacity <= 60;

  const effectiveSeats: string[] = layoutSeatMap ? layoutSeats : selectedSeats.map(String);

  const maxSeats = (() => {
    if (product?.availableSeats != null) return product.availableSeats;
    if (showSeatGrid && product?.totalCapacity) return product.totalCapacity;
    return 99;
  })();

  const isSoldOut = maxSeats === 0;

  const occupiedSeats: number[] = (() => {
    if (!product?.totalCapacity) return [];
    const taken = product.totalCapacity - (product.availableSeats ?? product.totalCapacity);
    return Array.from({ length: Math.max(0, taken) }, (_, i) => i + 1);
  })();

  const passengerOptions = Array.from(
    { length: Math.max(1, Math.min(maxSeats, 10)) },
    (_, i) => i + 1
  );

  async function validateCoupon() {
    if (!form.couponCode || !product) return;
    setValidatingCoupon(true);
    try {
      const res = await publicStoreApi.validateCoupon(slug, form.couponCode, subtotal);
      setCouponResult(res);
    } catch {
      setCouponResult({ valid: false, error: "Cupom inválido" });
    } finally {
      setValidatingCoupon(false);
    }
  }

  function removeCoupon() {
    setCouponResult(null);
    set("couponCode", "");
  }

  async function applyReferral() {
    if (!referralCode.trim()) return;
    try {
      const res = await publicStoreApi.validateReferral(slug, referralCode.trim().toUpperCase());
      if (res.valid) {
        setReferralApplied(true);
        setReferralDiscountPct(res.discountPercent ?? 5);
        localStorage.setItem("referral_code", referralCode.trim().toUpperCase());
      } else {
        alert(res.error ?? "Código inválido");
      }
    } catch {
      alert("Erro ao validar código de indicação");
    }
  }

  function removeReferral() {
    setReferralApplied(false);
    setReferralCode("");
  }

  function toggleSeat(n: number) {
    setSelectedSeats((prev) => {
      if (prev.includes(n)) return prev.filter((s) => s !== n);
      if (prev.length < qty) return [...prev, n].sort((a, b) => a - b);
      return prev;
    });
  }

  function canProceedFromDados() {
    return (
      !!form.customerName.trim() &&
      !!form.customerEmail.trim() &&
      !!form.customerPhone.trim() &&
      !!form.customerBirthdate
    );
  }

  function canProceedFromRevisao() {
    if (isSoldOut) return false;
    if (product?.hasVariants && !selectedVariant) return false;
    if (showSeatGrid && product?.totalCapacity && qty > product.totalCapacity) return false;
    return qty >= 1;
  }

  function canProceedFromAssento() {
    if (layoutSeatMap) return layoutSeats.length === qty;
    if (showSeatGrid) return selectedSeats.length === qty;
    return true;
  }

  function canProceedFromPagamento() {
    return !!form.paymentMethod;
  }

  async function submit() {
    if (!product) return;
    setSubmitting(true);
    try {
      const seatNotes =
        effectiveSeats.length > 0
          ? `Assentos selecionados: ${effectiveSeats.join(", ")}.`
          : showSeatGrid
          ? ""
          : `${qty} vaga(s) reservada(s).`;
      const birthdateNote = form.customerBirthdate
        ? `Data de nascimento: ${form.customerBirthdate}.`
        : "";
      const referralNote = referralApplied
        ? `Código de indicação: ${referralCode}. Desconto de indicação: R$ ${referralDiscount.toFixed(2)}.`
        : "";
      const extraNotes = [seatNotes, birthdateNote, referralNote, form.notes]
        .filter(Boolean)
        .join(" ");

      const order = await publicStoreApi.createOrder(slug, {
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone || undefined,
        customerCpf: form.customerCpf || undefined,
        customerBirthdate: form.customerBirthdate || undefined,
        items: [
          {
            productId: product.id,
            productName: product.name,
            quantity: qty,
            unitPrice,
            variantLabel: selectedVariant?.label,
          },
        ],
        couponCode: couponResult?.valid ? form.couponCode : undefined,
        referralCode: referralApplied ? referralCode.trim().toUpperCase() : undefined,
        referralCookieId: referralApplied ? (localStorage.getItem("referral_server_cookie_id") ?? undefined) : undefined,
        paymentMethod: form.paymentMethod,
        notes: extraNotes || undefined,
        seats: effectiveSeats.length > 0 ? effectiveSeats : undefined,
      });
      setCompletedOrder({
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
      });
      localStorage.removeItem("referral_code");
      localStorage.removeItem("referral_code_expiry");
      localStorage.removeItem("referral_referrer_name");
      localStorage.removeItem("referral_server_cookie_id");
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
      setStep("confirmado");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao finalizar reserva. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  function goNext() {
    const order: Step[] = ["dados", "revisao", "assento", "pagamento", "confirmado"];
    const idx = order.indexOf(step);
    if (idx < order.length - 1) setStep(order[idx + 1]);
  }

  function goBack() {
    const order: Step[] = ["dados", "revisao", "assento", "pagamento", "confirmado"];
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
    else navigate(`/loja/${slug}/produtos/${productSlug}`);
  }

  function handlePrint() {
    window.print();
  }

  if (loadingProduct) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-bold mb-2">Produto não encontrado</h2>
        <Button variant="outline" onClick={() => navigate(`/loja/${slug}/produtos`)}>
          Ver Catálogo
        </Button>
      </div>
    );
  }

  if (step === "confirmado" && completedOrder) {
    const totalAmt = parseFloat(completedOrder.totalAmount);
    const startDate = product.departureDate ?? product.startDate;
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 pb-20">
        {showConfetti && <ConfettiAnimation />}

        <StepIndicator current="confirmado" />

        <div className="space-y-6">
          <div
            className="rounded-2xl p-8 text-center border"
            style={{
              background: `linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)`,
              borderColor: "#bbf7d0",
            }}
          >
            <div className="flex justify-center mb-4">
              <div className="bg-green-500 rounded-full p-4">
                <CheckCircle2 className="w-14 h-14 text-white" />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-green-900 mb-2">Reserva Confirmada! 🎉</h2>
            <p className="text-lg text-green-800 mb-6">Sua reserva foi realizada com sucesso!</p>
            <div className="inline-flex items-center gap-2 bg-white px-6 py-3 rounded-xl shadow-sm border border-green-200">
              <Ticket className="w-5 h-5 text-green-600" />
              <div className="text-left">
                <p className="text-xs text-muted-foreground">Número do Pedido</p>
                <p className="text-2xl font-bold text-green-600 font-mono">{completedOrder.orderNumber}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border rounded-2xl p-6 space-y-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                Detalhes da Viagem
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Viagem</p>
                  <p className="font-semibold">{product.name}</p>
                  {product.destination && <p className="text-muted-foreground">📍 {product.destination}</p>}
                </div>
                {startDate && (
                  <div>
                    <p className="text-muted-foreground text-xs">Data de Saída</p>
                    <p className="font-semibold">{fmtDateLong(startDate)}</p>
                  </div>
                )}
                {(() => {
                  const dur = calculateTripDuration(
                    product.departureDate ?? product.startDate,
                    product.endDate,
                    product.departureTime,
                    product.returnTime,
                  ) ?? (product.durationDays ? { formatted: `${product.durationDays} ${product.durationDays === 1 ? "dia" : "dias"}` } : null);
                  return dur ? (
                    <div>
                      <p className="text-muted-foreground text-xs">Duração</p>
                      <p className="font-semibold">{dur.formatted}</p>
                    </div>
                  ) : null;
                })()}
                <div>
                  <p className="text-muted-foreground text-xs">Passageiros</p>
                  <p className="font-semibold">{qty} passageiro{qty !== 1 ? "s" : ""}</p>
                </div>
                {effectiveSeats.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Assentos</p>
                    <div className="flex flex-wrap gap-1.5">
                      {effectiveSeats.map((s) => (
                        <span
                          key={s}
                          className="px-2.5 py-1 rounded-full text-white text-xs font-semibold"
                          style={{ backgroundColor: store.accentColor || store.primaryColor }}
                        >
                          Assento {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border rounded-2xl p-6 space-y-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-600" />
                Suas Informações
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Nome</p>
                  <p className="font-semibold">{form.customerName}</p>
                </div>
                {form.customerCpf && (
                  <div>
                    <p className="text-muted-foreground text-xs">CPF</p>
                    <p className="font-semibold">{form.customerCpf}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs">Email</p>
                  <p className="font-semibold">{form.customerEmail}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Telefone</p>
                  <p className="font-semibold">{form.customerPhone}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Número do Pedido</p>
                  <div className="mt-1">
                    <span
                      className="px-3 py-1.5 rounded-lg text-white text-sm font-mono font-bold"
                      style={{ backgroundColor: store.primaryColor }}
                    >
                      {completedOrder.orderNumber}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border rounded-2xl p-6">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
              <CreditCard className="w-5 h-5 text-green-600" />
              Resumo Financeiro
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-muted-foreground mb-1">Valor Total</p>
                <p className="text-2xl font-bold text-gray-900">R$ {totalAmt.toFixed(2)}</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-xl">
                <p className="text-xs text-muted-foreground mb-1">Valor Pago</p>
                <p className="text-2xl font-bold text-green-600">R$ 0,00</p>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-xl">
                <p className="text-xs text-muted-foreground mb-1">Saldo Pendente</p>
                <p className="text-2xl font-bold text-orange-600">R$ {totalAmt.toFixed(2)}</p>
              </div>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-900">
              <p><strong>Forma de Pagamento:</strong> {PAYMENT_LABELS[form.paymentMethod] ?? form.paymentMethod}</p>
              <p className="mt-1.5 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" />
                Aguardando confirmação do pagamento. Você receberá um email assim que o pagamento for confirmado.
              </p>
            </div>
          </div>

          <div className="border rounded-2xl p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
            <h3 className="text-lg font-bold mb-4">📋 Próximos Passos</h3>
            <div className="space-y-3">
              {[
                "Você receberá um email de confirmação com todos os detalhes da sua reserva e o voucher em anexo.",
                "Também enviaremos uma mensagem no WhatsApp com as informações de embarque.",
                "Apresente o voucher e documento com foto no dia do embarque.",
                "Chegue ao ponto de embarque com 30 minutos de antecedência.",
              ].map((step, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div
                    className="text-white rounded-full w-6 h-6 flex items-center justify-center shrink-0 font-bold text-sm"
                    style={{ backgroundColor: store.primaryColor }}
                  >
                    {idx + 1}
                  </div>
                  <p className="text-gray-700 text-sm">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <Voucher
            order={completedOrder}
            product={product}
            store={store}
            customerName={form.customerName}
            seats={effectiveSeats}
            paymentMethod={form.paymentMethod}
          />

          <div className="flex flex-col sm:flex-row gap-3 justify-center print:hidden">
            <Button onClick={handlePrint} variant="outline" className="flex items-center gap-2">
              <Printer className="w-4 h-4" />
              Imprimir / Salvar Voucher
            </Button>
            {store.contactWhatsapp && (
              <Button
                onClick={() => {
                  const phone = store.contactWhatsapp!.replace(/\D/g, "");
                  const msg = `Olá! Acabei de fazer uma reserva (${completedOrder.orderNumber}) para a viagem ${product.name}. Gostaria de mais informações.`;
                  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
                }}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
              >
                <MessageSquare className="w-4 h-4" />
                Falar no WhatsApp
              </Button>
            )}
            <Button
              onClick={() => navigate(`/loja/${slug}/consultar-pedido`)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Consultar Pedido
            </Button>
            <Button
              onClick={() => navigate(`/loja/${slug}/produtos`)}
              style={{ backgroundColor: store.primaryColor }}
              className="text-white flex items-center gap-2"
            >
              Ver mais pacotes
            </Button>
          </div>

          {(store.contactWhatsapp || store.contactEmail || store.contactPhone) && (
            <div className="border rounded-2xl p-6 bg-gray-50 print:hidden">
              <h3 className="text-lg font-bold mb-3">📞 Precisa de Ajuda?</h3>
              <p className="text-muted-foreground text-sm mb-4">Nossa equipe está pronta para atendê-lo!</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {store.contactWhatsapp && (
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-green-600 shrink-0" />
                    <div>
                      <p className="text-muted-foreground text-xs">WhatsApp</p>
                      <p className="font-semibold">{store.contactWhatsapp}</p>
                    </div>
                  </div>
                )}
                {store.contactEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <p className="text-muted-foreground text-xs">Email</p>
                      <p className="font-semibold">{store.contactEmail}</p>
                    </div>
                  </div>
                )}
                {store.contactPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-600 shrink-0" />
                    <div>
                      <p className="text-muted-foreground text-xs">Telefone</p>
                      <p className="font-semibold">{store.contactPhone}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const hasSidebar = step === "revisao" || step === "pagamento";

  return (
    <div className={`mx-auto px-4 py-10 pb-24 ${hasSidebar ? "max-w-5xl" : "max-w-2xl"}`}>
      <div className="flex items-center gap-2 mb-6 print:hidden">
        <button
          onClick={goBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {step === "dados" ? "Voltar ao Produto" : "Voltar"}
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-2 print:hidden">Reservar Viagem</h1>
      <div className="flex flex-wrap items-center gap-2 mb-6 print:hidden">
        <p className="text-muted-foreground text-sm">{product.name}</p>
        {product.tripType && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
            {TRIP_TYPE_LABELS[product.tripType] ?? product.tripType}
          </span>
        )}
      </div>

      <StepIndicator current={step} />

      {step === "dados" && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Seus Dados
          </h2>
          <div className="border rounded-2xl p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="name">
                  Nome Completo <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={form.customerName}
                  onChange={(e) => set("customerName", e.target.value)}
                  placeholder="Seu nome completo"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">
                  E-mail <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) => set("customerEmail", e.target.value)}
                  placeholder="seu@email.com"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">
                  WhatsApp / Telefone <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="phone"
                  value={form.customerPhone}
                  onChange={(e) => set("customerPhone", e.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="birthdate">
                  Data de Nascimento <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="birthdate"
                    type="date"
                    value={form.customerBirthdate}
                    onChange={(e) => set("customerBirthdate", e.target.value)}
                    className="pl-10"
                    max={new Date().toISOString().split("T")[0]}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cpf">CPF <span className="text-red-500">*</span></Label>
                <Input
                  id="cpf"
                  value={form.customerCpf}
                  onChange={(e) =>
                    set(
                      "customerCpf",
                      e.target.value
                        .replace(/\D/g, "")
                        .replace(/(\d{3})(\d)/, "$1.$2")
                        .replace(/(\d{3})(\d)/, "$1.$2")
                        .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
                        .slice(0, 14)
                    )
                  }
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <Label className="flex items-center gap-1.5 mb-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                Quantidade de Passageiros <span className="text-red-500">*</span>
              </Label>
              <select
                value={qty}
                onChange={(e) => {
                  setQty(Number(e.target.value));
                  setSelectedSeats([]);
                  setLayoutSeats([]);
                }}
                disabled={isSoldOut}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white"
              >
                {passengerOptions.map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "passageiro" : "passageiros"}
                  </option>
                ))}
              </select>
              {product.availableSeats != null && (
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" />
                  {maxSeats} vaga{maxSeats !== 1 ? "s" : ""} disponível{maxSeats !== 1 ? "is" : ""}
                </p>
              )}
              {isSoldOut && (
                <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Produto esgotado
                </p>
              )}
            </div>

            <div className="border-t pt-4 space-y-1">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Restrições alimentares, necessidades especiais, etc."
                rows={3}
              />
            </div>
          </div>
        </div>
      )}

      {step === "revisao" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              Revisão do Pedido
            </h2>

            <ProductCard product={product} store={store} />

            {product.hasVariants && (product.variants ?? []).length > 0 && (
              <div className="border rounded-xl p-4 space-y-3">
                {(product.variants ?? []).map((v) => (
                  <div key={v.name}>
                    <Label className="text-sm font-medium mb-2 block">
                      {v.name} <span className="text-red-500">*</span>
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {v.options.map((opt) => (
                        <button
                          key={opt.label}
                          onClick={() => setSelectedVariant({ variantName: v.name, label: opt.label, price: opt.price })}
                          className={`px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                            selectedVariant?.label === opt.label
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          {opt.label}
                          {opt.price !== basePrice && (
                            <span className="ml-1 text-xs opacity-70">(R$ {opt.price.toFixed(2)})</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {!selectedVariant && (
                  <p className="text-xs text-amber-600">Selecione uma opção para continuar</p>
                )}
              </div>
            )}

            {isSoldOut && (
              <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Este produto está esgotado e não pode ser reservado no momento.
              </div>
            )}

            <div className={`flex items-center justify-between p-4 border rounded-xl ${isSoldOut ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Quantidade de passageiros</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setQty((q) => Math.max(1, q - 1)); setSelectedSeats([]); setLayoutSeats([]); }}
                  className="w-8 h-8 rounded-full border flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors"
                  disabled={qty <= 1}
                >
                  −
                </button>
                <span className="w-8 text-center font-bold text-lg">{qty}</span>
                <button
                  onClick={() => { setQty((q) => Math.min(maxSeats, q + 1)); setSelectedSeats([]); setLayoutSeats([]); }}
                  className="w-8 h-8 rounded-full border flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors"
                  disabled={qty >= maxSeats}
                >
                  +
                </button>
              </div>
            </div>

            <div className="border rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold">Resumo do Passageiro</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Nome</p>
                  <p className="font-medium">{form.customerName}</p>
                </div>
                {form.customerCpf && (
                  <div>
                    <p className="text-muted-foreground text-xs">CPF</p>
                    <p className="font-medium">{form.customerCpf}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs">E-mail</p>
                  <p className="font-medium">{form.customerEmail}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Telefone</p>
                  <p className="font-medium">{form.customerPhone}</p>
                </div>
                {form.customerBirthdate && (
                  <div>
                    <p className="text-muted-foreground text-xs">Data de Nascimento</p>
                    <p className="font-medium">{fmtDate(form.customerBirthdate)}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="border rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Códigos de Desconto
              </h3>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Código de Indicação</Label>
                {referralApplied ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="flex-1 text-green-700">
                      Código <strong>{referralCode}</strong> aplicado! Desconto: <strong>R$ {referralDiscount.toFixed(2)}</strong>
                    </span>
                    <button onClick={removeReferral} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      placeholder="Ex: MARIA2024"
                      className="font-mono"
                    />
                    <Button variant="outline" onClick={applyReferral} disabled={!referralCode.trim()}>
                      Aplicar
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Cupom de Desconto</Label>
                {couponResult?.valid ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="flex-1 text-green-700">
                      Cupom <strong>{couponResult.code}</strong> aplicado! Desconto:{" "}
                      <strong>R$ {couponDiscount.toFixed(2)}</strong>
                    </span>
                    <button onClick={removeCoupon} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={form.couponCode}
                      onChange={(e) => set("couponCode", e.target.value.toUpperCase())}
                      placeholder="CODIGO"
                      className="font-mono"
                    />
                    <Button
                      variant="outline"
                      onClick={validateCoupon}
                      disabled={!form.couponCode || validatingCoupon}
                    >
                      {validatingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aplicar"}
                    </Button>
                  </div>
                )}
                {couponResult && !couponResult.valid && (
                  <p className="text-xs text-red-600">{couponResult.error ?? "Cupom inválido"}</p>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="border rounded-2xl p-5 space-y-3 lg:sticky lg:top-4">
              <h3 className="font-bold text-base">Resumo Financeiro</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Preço por pessoa</span>
                  <span className="font-medium">R$ {unitPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quantidade</span>
                  <span className="font-medium">× {qty}</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">R$ {subtotal.toFixed(2)}</span>
                </div>
                {referralDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Desconto Indicação ({referralDiscountPct}%)</span>
                    <span>− R$ {referralDiscount.toFixed(2)}</span>
                  </div>
                )}
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Desconto Cupom</span>
                    <span>− R$ {couponDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span style={{ color: store.primaryColor }}>R$ {finalTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === "assento" && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Armchair className="w-5 h-5 text-primary" />
              Seleção de Assentos{" "}
              <span className="text-sm font-normal text-muted-foreground">* (obrigatório)</span>
            </h2>
          </div>

          {showSeatGrid && product.totalCapacity ? (
            <>
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Selecione <strong>{qty}</strong> assento{qty !== 1 ? "s" : ""} para sua viagem.{" "}
                  Os assentos em VERMELHO já estão ocupados.
                </span>
              </div>

              {loadingLayoutMap ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando mapa de assentos…
                </div>
              ) : layoutSeatMap ? (
                <PublicLayoutSeatPicker
                  seats={layoutSeatMap.seats}
                  totalSeats={layoutSeatMap.totalSeats}
                  layout={layoutSeatMap.layout}
                  floors={layoutSeatMap.floors}
                  qty={qty}
                  selected={layoutSeats}
                  onToggle={(n) => setLayoutSeats((prev) =>
                    prev.includes(n) ? prev.filter(s => s !== n) : prev.length < qty ? [...prev, n] : prev
                  )}
                  accentColor={store?.accentColor || store?.primaryColor}
                  pricePerPerson={unitPrice}
                />
              ) : (
                <SeatGrid
                  totalCapacity={product.totalCapacity}
                  occupiedSeats={occupiedSeats}
                  qty={qty}
                  selected={selectedSeats}
                  onToggle={toggleSeat}
                  accentColor={store?.accentColor || store?.primaryColor}
                />
              )}

              <div className="border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Assentos Selecionados</p>
                    <div className="flex flex-wrap gap-1.5">
                      {effectiveSeats.length > 0 ? (
                        effectiveSeats.map((s) => (
                          <span
                            key={s}
                            className="px-2.5 py-1 rounded-full text-white text-xs font-semibold"
                            style={{ backgroundColor: store.accentColor || store.primaryColor }}
                          >
                            Assento {s}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">Nenhum assento selecionado</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-xs text-muted-foreground">Progresso</p>
                    <p
                      className="text-2xl font-bold"
                      style={{ color: store.accentColor || store.primaryColor }}
                    >
                      {effectiveSeats.length} / {qty}
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-6 border-2 border-dashed border-primary/30 rounded-xl text-center bg-primary/5">
                <Armchair className="w-12 h-12 text-primary/50 mx-auto mb-3" />
                <p className="text-lg font-semibold mb-1">
                  {qty} vaga{qty !== 1 ? "s" : ""} reservada{qty !== 1 ? "s" : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  Os assentos serão designados pelo motorista no embarque.
                </p>
                {product.availableSeats != null && (
                  <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-white border rounded-full px-3 py-1">
                    <Users className="w-3 h-3" />
                    {product.availableSeats} vagas disponíveis
                  </div>
                )}
              </div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <p className="font-semibold mb-1">Ponto de embarque</p>
                {product.destination ? (
                  <p>Destino: {product.destination}</p>
                ) : (
                  <p>O ponto de embarque será informado por e-mail após a confirmação.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {step === "pagamento" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Forma de Pagamento
            </h2>

            <div className="space-y-3">
              {((store.paymentMethods ?? []).length > 0 ? (store.paymentMethods ?? []) : ["pix"]).map((methodId) => {
                const config = PAYMENT_METHODS_CONFIG.find((m) => m.id === methodId);
                if (!config) return null;
                const { Icon } = config;
                const isSelected = form.paymentMethod === methodId;
                return (
                  <label
                    key={methodId}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? "border-orange-500 bg-orange-50"
                        : "border-border hover:border-gray-300 bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment_method"
                      value={methodId}
                      checked={isSelected}
                      onChange={() => set("paymentMethod", methodId)}
                      className="accent-orange-500"
                    />
                    <div className={`p-2.5 rounded-lg ${config.bg}`}>
                      <Icon className={`w-5 h-5 ${config.color}`} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{config.label}</p>
                      <p className="text-xs text-muted-foreground">{config.description}</p>
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0" />}
                  </label>
                );
              })}
            </div>

            {form.paymentMethod === "pix" && (
              <div className="mt-2 p-4 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-900">
                <p className="flex items-start gap-1.5">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  Após confirmar a reserva, você receberá o QR Code do PIX por email e WhatsApp para efetuar o pagamento.
                </p>
              </div>
            )}

            {form.paymentMethod === "credit_card" && (
              <div className="mt-2 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-sm text-blue-900 mb-3 font-medium">Parcelamento disponível:</p>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 6, 12].map((n) => (
                    <button
                      key={n}
                      onClick={() => set("installments", String(n))}
                      className={`p-2 rounded-lg border text-xs font-medium transition-colors ${
                        form.installments === String(n)
                          ? "border-blue-500 bg-blue-100 text-blue-700"
                          : "border-blue-200 bg-white hover:bg-blue-50"
                      }`}
                    >
                      <span className="block font-bold">{n}x</span>
                      <span className="text-blue-600">R$ {(finalTotal / n).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.paymentMethod === "debit_card" && (
              <div className="mt-2 p-4 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-900">
                <p className="flex items-start gap-1.5">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  Pagamento à vista no débito. Será processado após a confirmação da reserva.
                </p>
              </div>
            )}

            {form.paymentMethod === "transfer" && (
              <div className="mt-2 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                <p className="text-sm text-orange-900 font-medium mb-2">Dados para transferência (TED/DOC/PIX):</p>
                <div className="space-y-1.5 text-sm text-orange-800">
                  <div className="bg-white/60 rounded-lg p-3 border border-orange-200 space-y-1">
                    <p><span className="font-medium">Banco:</span> Banco do Brasil</p>
                    <p><span className="font-medium">Agência:</span> Entre em contato para obter</p>
                    <p><span className="font-medium">Conta:</span> Dados enviados por e-mail após confirmação</p>
                    <p><span className="font-medium">Favorecido:</span> {store.name}</p>
                  </div>
                  {store.contactWhatsapp && (
                    <p className="mt-1">
                      Dados completos também enviados via WhatsApp: <strong>{store.contactWhatsapp}</strong>
                    </p>
                  )}
                </div>
              </div>
            )}

            {form.paymentMethod === "boleto" && (
              <div className="mt-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 space-y-1">
                <p className="font-medium">Instruções:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>O boleto tem vencimento em 3 dias úteis</li>
                  <li>Pode ser pago em qualquer banco, lotérica ou internet banking</li>
                  <li>Sua reserva será confirmada após a identificação do pagamento</li>
                </ul>
              </div>
            )}

            {form.paymentMethod === "cash" && (
              <div className="mt-2 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-900">
                <p className="flex items-start gap-1.5">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  Pagamento em dinheiro deve ser realizado na agência até 48h antes da viagem.
                </p>
                {store.contactAddress && (
                  <p className="mt-2 font-medium">📍 {store.contactAddress}</p>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="border rounded-2xl p-5 space-y-3 lg:sticky lg:top-4">
              <h3 className="font-bold text-base">Resumo Final</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Viagem</p>
                  <p className="font-medium leading-tight">{product.name}</p>
                  {product.tripType && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      {TRIP_TYPE_LABELS[product.tripType] ?? product.tripType}
                    </span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Passageiros</span>
                  <span className="font-medium">{qty}</span>
                </div>
                {effectiveSeats.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Assentos</p>
                    <div className="flex flex-wrap gap-1">
                      {effectiveSeats.map((s) => (
                        <span
                          key={s}
                          className="px-1.5 py-0.5 rounded text-white text-xs font-semibold"
                          style={{ backgroundColor: store.accentColor || store.primaryColor }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>R$ {subtotal.toFixed(2)}</span>
                </div>
                {referralDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Desc. Indicação</span>
                    <span>− R$ {referralDiscount.toFixed(2)}</span>
                  </div>
                )}
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Desc. Cupom</span>
                    <span>− R$ {couponDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span style={{ color: store.primaryColor }}>R$ {finalTotal.toFixed(2)}</span>
                </div>
                {form.paymentMethod && (
                  <div className="pt-1">
                    <span
                      className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
                      style={{ backgroundColor: store.accentColor || store.primaryColor }}
                    >
                      {PAYMENT_LABELS[form.paymentMethod] ?? form.paymentMethod}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === "dados" ? "Cancelar" : "Voltar"}
          </button>

          {step !== "pagamento" ? (
            <Button
              onClick={goNext}
              disabled={
                (step === "dados" && !canProceedFromDados()) ||
                (step === "revisao" && !canProceedFromRevisao()) ||
                (step === "assento" && !canProceedFromAssento())
              }
              style={{ backgroundColor: store.primaryColor }}
              className="text-white font-semibold px-8 flex items-center gap-2"
            >
              Continuar
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={submitting || !canProceedFromPagamento()}
              style={{ backgroundColor: store.accentColor || store.primaryColor }}
              className="text-white font-bold px-8 flex items-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Ticket className="w-4 h-4" />
              )}
              Confirmar Reserva
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
