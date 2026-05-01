import type { Trip } from "@workspace/api-client-react";
import { SeatMapPicker } from "@/components/SeatMapPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { TRIP_TYPE_LABELS } from "./constants";

interface WizardStep1Props {
  allTrips: Trip[];
  allClients: { id: string; name: string; whatsapp?: string | null }[];
  boardingRaw: { id: string; name: string }[] | undefined;
  selectedTripFull: Trip | undefined;
  selectedTripId: string;
  selectedClientId: string;
  boardingLocationId: string;
  selectedSeats: string[];
  manualSeats: string;
  tripComboOpen: boolean;
  clientComboOpen: boolean;
  canGoNext: boolean;
  setTripComboOpen: (v: boolean) => void;
  setClientComboOpen: (v: boolean) => void;
  onSelectTrip: (id: string) => void;
  onSelectClient: (id: string) => void;
  onSelectBoarding: (id: string) => void;
  onSelectSeats: (seats: string[]) => void;
  onManualSeatsChange: (v: string) => void;
  onClose: () => void;
  onNext: () => void;
}

export function WizardStep1({
  allTrips, allClients, boardingRaw, selectedTripFull,
  selectedTripId, selectedClientId, boardingLocationId,
  selectedSeats, manualSeats, tripComboOpen, clientComboOpen, canGoNext,
  setTripComboOpen, setClientComboOpen, onSelectTrip, onSelectClient,
  onSelectBoarding, onSelectSeats, onManualSeatsChange, onClose, onNext,
}: WizardStep1Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Viagem *</label>
          <Popover open={tripComboOpen} onOpenChange={setTripComboOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={tripComboOpen} className="w-full justify-between font-normal">
                <span className="truncate">
                  {selectedTripId ? (allTrips.find(t => t.id === selectedTripId)?.name ?? "Viagem não encontrada") : "Selecionar viagem..."}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar viagem..." />
                <CommandList>
                  <CommandEmpty>Nenhuma viagem encontrada.</CommandEmpty>
                  <CommandGroup>
                    {allTrips.map(t => (
                      <CommandItem key={t.id} value={`${t.name} ${t.availableSeats ?? ""}`} onSelect={() => onSelectTrip(t.id)}>
                        <Check className={`mr-2 h-4 w-4 ${selectedTripId === t.id ? "opacity-100" : "opacity-0"}`} />
                        <span className="flex-1">{t.name}</span>
                        {t.availableSeats != null && <span className="text-xs text-muted-foreground ml-2">{t.availableSeats} vagas</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Cliente *</label>
          <Popover open={clientComboOpen} onOpenChange={setClientComboOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={clientComboOpen} className="w-full justify-between font-normal">
                <span className="truncate">
                  {selectedClientId ? (() => {
                    const cl = allClients.find(c => c.id === selectedClientId);
                    return cl ? `${cl.name} — ${cl.whatsapp}` : "Cliente não encontrado";
                  })() : "Selecionar cliente..."}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar por nome ou whatsapp..." />
                <CommandList>
                  <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                  <CommandGroup>
                    {allClients.map(c => (
                      <CommandItem key={c.id} value={`${c.name} ${c.whatsapp}`} onSelect={() => onSelectClient(c.id)}>
                        <Check className={`mr-2 h-4 w-4 ${selectedClientId === c.id ? "opacity-100" : "opacity-0"}`} />
                        <span className="flex-1">{c.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{c.whatsapp}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {selectedTripFull && (
        <div className="rounded-lg border bg-muted/40 p-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
          <div className="col-span-2 sm:col-span-3 pb-1 border-b">
            <p className="text-xs text-muted-foreground">Viagem</p>
            <p className="font-semibold leading-tight">{selectedTripFull.name}</p>
          </div>
          {selectedTripFull.type && <div><p className="text-xs text-muted-foreground">Tipo</p><p className="font-medium">{TRIP_TYPE_LABELS[selectedTripFull.type] ?? selectedTripFull.type}</p></div>}
          {selectedTripFull.destination && <div><p className="text-xs text-muted-foreground">Destino</p><p className="font-medium">{selectedTripFull.destination}</p></div>}
          <div><p className="text-xs text-muted-foreground">Data de Saída</p><p className="font-medium">{new Date(selectedTripFull.departureDate).toLocaleDateString("pt-BR")}</p></div>
          {selectedTripFull.returnDate && <div><p className="text-xs text-muted-foreground">Data de Retorno</p><p className="font-medium">{new Date(selectedTripFull.returnDate).toLocaleDateString("pt-BR")}</p></div>}
          <div><p className="text-xs text-muted-foreground">Vagas Disponíveis</p><p className="font-medium">{selectedTripFull.availableSeats ?? "—"}</p></div>
          {selectedTripFull.vehicleType && <div><p className="text-xs text-muted-foreground">Veículo</p><p className="font-medium">{selectedTripFull.vehicleType}</p></div>}
          <div><p className="text-xs text-muted-foreground">Preço Base</p><p className="font-medium">R$ {(selectedTripFull.priceAdult ?? 0).toFixed(2)}/pessoa</p></div>
        </div>
      )}

      {(boardingRaw ?? []).length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Ponto de Embarque</label>
          <Select onValueChange={onSelectBoarding} value={boardingLocationId}>
            <SelectTrigger><SelectValue placeholder="Selecionar ponto de embarque..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Nenhum</SelectItem>
              {(boardingRaw ?? []).map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <Separator />

      <div className="space-y-2">
        <label className="text-sm font-medium">Seleção de Assentos * <span className="font-normal text-muted-foreground">(obrigatório)</span></label>
        {selectedTripId ? (
          <SeatMapPicker tripId={selectedTripId} selectedSeats={selectedSeats} onSeatsChange={seats => { onSelectSeats(seats); onManualSeatsChange(""); }} />
        ) : (
          <div className="text-sm text-muted-foreground py-4 text-center border rounded-lg bg-muted/20">
            Selecione uma viagem para ver o mapa de assentos.
          </div>
        )}
        <div className="mt-2">
          <label className="text-xs text-muted-foreground">Ou informe manualmente (separados por vírgula)</label>
          <Input
            placeholder="Ex: 12, 13, 14"
            value={manualSeats}
            onChange={e => { onManualSeatsChange(e.target.value); onSelectSeats([]); }}
            className="mt-1"
            disabled={selectedSeats.length > 0}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={onNext} disabled={!canGoNext}>Próximo →</Button>
      </div>
    </div>
  );
}
