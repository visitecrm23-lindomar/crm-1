import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  useGetTripBoardingPanel, useListReservations, useCheckInPassenger, useUndoCheckInPassenger,
  useSyncTripPassengers, useUpdatePassengerBoarding,
} from "@workspace/api-client-react";
import type { BoardingPassenger } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search, MapPin, Users, ClipboardList, LogIn, RotateCcw, CheckCircle,
  UserRound, RefreshCw, MessageSquare, Pencil, Loader2,
} from "lucide-react";
import { Client360Modal } from "@/components/client360-modal";
import { PassengerObsModal } from "./PassengerObsModal";
import type { BoardingPoint } from "./types";

export function BoardingPanelModal({ tripId, tripName, open, onClose }: { tripId: string; tripName: string; open: boolean; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [client360Id, setClient360Id] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: panel, isLoading, refetch } = useGetTripBoardingPanel(tripId, {
    query: { queryKey: ["boarding-panel", tripId], enabled: open && !!tripId },
  });

  const { data: reservationsData } = useListReservations({ tripId, limit: 200 }, {
    query: { queryKey: ["reservations-boarding", tripId], enabled: open && !!tripId },
  });

  const reservationClientMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reservationsData?.data ?? []) {
      if (r.clientId) map.set(r.id, r.clientId);
    }
    return map;
  }, [reservationsData]);

  const checkIn = useCheckInPassenger();
  const undoCheckIn = useUndoCheckInPassenger();
  const syncPassengers = useSyncTripPassengers();
  const updateBoarding = useUpdatePassengerBoarding();
  const [syncing, setSyncing] = useState(false);
  const [updatingLocationId, setUpdatingLocationId] = useState<string | null>(null);
  const [editingPassenger, setEditingPassenger] = useState<BoardingPassenger | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncPassengers.mutateAsync({ id: tripId });
      await refetch();
      if (result.created > 0) {
        toast({ title: `${result.created} passageiro(s) sincronizado(s)`, description: "O painel foi atualizado." });
      } else {
        toast({ title: "Tudo sincronizado", description: "Nenhum passageiro novo a adicionar." });
      }
    } catch {
      toast({ title: "Erro ao sincronizar passageiros", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handleCheckIn = async (p: BoardingPassenger) => {
    try {
      await checkIn.mutateAsync({ reservationId: p.reservationId, id: p.id });
      await refetch();
      toast({ title: `${p.name} embarcou`, description: "Check-in individual registrado." });
    } catch {
      toast({ title: "Erro ao fazer check-in", variant: "destructive" });
    }
  };

  const handleUndoCheckIn = async (p: BoardingPassenger) => {
    try {
      await undoCheckIn.mutateAsync({ reservationId: p.reservationId, id: p.id });
      await refetch();
      toast({ title: "Check-in desfeito" });
    } catch {
      toast({ title: "Erro ao desfazer check-in", variant: "destructive" });
    }
  };

  const handleBoardingLocationChange = async (p: BoardingPassenger, locationId: string | null) => {
    setUpdatingLocationId(p.id);
    try {
      await updateBoarding.mutateAsync({ tripId, passengerId: p.id, data: { boardingLocationId: locationId } });
      await refetch();
    } catch {
      toast({ title: "Erro ao atualizar local de embarque", variant: "destructive" });
    } finally {
      setUpdatingLocationId(null);
    }
  };

  const boardingPoints: BoardingPoint[] = panel?.boardingPoints ?? [];
  const passengers = panel?.passengers ?? [];
  const filtered = search
    ? passengers.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.seatNumber?.toLowerCase().includes(search.toLowerCase()) ||
        (p.reservationNumber ?? p.voucherCode).toLowerCase().includes(search.toLowerCase()) ||
        p.clientName.toLowerCase().includes(search.toLowerCase())
      )
    : passengers;

  const pct = panel && panel.totalPassengers > 0
    ? Math.round((panel.checkedIn / panel.totalPassengers) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                Painel de Embarque — {tripName}
              </DialogTitle>
              {panel?.manifestNumber && (
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">Manifesto: {panel.manifestNumber}</p>
              )}
            </div>
            <Button
              size="sm" variant="outline" className="h-8 text-xs gap-1.5 mr-2"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </Button>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <div className="bg-muted/50 border rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <div className="flex gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-700">{panel?.checkedIn ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Embarcados</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{(panel?.totalPassengers ?? 0) - (panel?.checkedIn ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">Pendentes</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{panel?.totalPassengers ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{pct}%</p>
                  <p className="text-xs text-muted-foreground">embarque</p>
                </div>
              </div>
              <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : "bg-amber-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, assento ou nº de reserva..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="overflow-y-auto flex-1 space-y-1.5 pr-1">
              {filtered.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{passengers.length === 0 ? "Nenhum passageiro cadastrado nesta viagem" : "Nenhum resultado encontrado"}</p>
                </div>
              ) : filtered.map(p => {
                const isCheckedIn = !!p.checkedInAt;
                const currentLocationId = p.boardingLocationId ?? "";
                const isUpdatingThis = updatingLocationId === p.id;
                const hasObs = !!(p.observations || p.specialNeeds);
                return (
                  <div key={p.id} className={`p-3 rounded-lg border ${isCheckedIn ? "bg-green-50 border-green-200" : "bg-muted/30"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.seatNumber && (
                            <span className="font-mono text-xs bg-gray-100 border border-gray-300 px-2 py-0.5 rounded font-bold">{p.seatNumber}</span>
                          )}
                          <span className="font-medium text-sm">{p.name}</span>
                          {hasObs && (
                            <span title={[p.specialNeeds, p.observations].filter(Boolean).join(" | ")}
                              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 cursor-help">
                              <MessageSquare className="w-3 h-3" />
                            </span>
                          )}
                          {isCheckedIn && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold border border-green-200">
                              <CheckCircle className="w-3 h-3" />
                              {new Date(p.checkedInAt!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
                          <span>{p.clientName}</span>
                          {p.cpf && <span>CPF: {p.cpf}</span>}
                          <span className="font-mono opacity-70">{p.reservationNumber ?? p.voucherCode}</span>
                        </div>
                      </div>
                      <div className="shrink-0 ml-2 flex items-center gap-1">
                        <Button
                          size="sm" variant="outline" className={`h-8 w-8 p-0 ${hasObs ? "text-amber-600 border-amber-300" : ""}`}
                          onClick={() => setEditingPassenger(p)}
                          title="Editar informações do passageiro"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        {reservationClientMap.get(p.reservationId) && (
                          <Button
                            size="sm" variant="outline" className="h-8 text-xs gap-1"
                            onClick={() => setClient360Id(reservationClientMap.get(p.reservationId)!)}
                          >
                            <UserRound className="w-3.5 h-3.5" /> Perfil 360°
                          </Button>
                        )}
                        {isCheckedIn ? (
                          <Button
                            size="sm" variant="outline" className="h-8 text-xs text-muted-foreground gap-1"
                            onClick={() => handleUndoCheckIn(p)}
                            disabled={undoCheckIn.isPending}
                          >
                            <RotateCcw className="w-3 h-3" /> Desfazer
                          </Button>
                        ) : (
                          <Button
                            size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white gap-1"
                            onClick={() => handleCheckIn(p)}
                            disabled={checkIn.isPending}
                          >
                            <LogIn className="w-3 h-3" /> Embarcar
                          </Button>
                        )}
                      </div>
                    </div>
                    {boardingPoints.length > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <Select
                          value={currentLocationId || "__none__"}
                          onValueChange={v => handleBoardingLocationChange(p, v === "__none__" ? null : v)}
                          disabled={isUpdatingThis}
                        >
                          <SelectTrigger className="h-7 text-xs flex-1 max-w-xs">
                            <SelectValue placeholder="Ponto de embarque..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Não definido —</SelectItem>
                            {boardingPoints.map(bp => (
                              <SelectItem key={bp.id} value={bp.id}>
                                {bp.name}{bp.time ? ` (${bp.time})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isUpdatingThis && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
      <Client360Modal open={!!client360Id} onClose={() => setClient360Id(null)} clientId={client360Id} />
      <PassengerObsModal
        passenger={editingPassenger}
        tripId={tripId}
        open={!!editingPassenger}
        onClose={() => setEditingPassenger(null)}
        onSaved={() => refetch()}
      />
    </Dialog>
  );
}
