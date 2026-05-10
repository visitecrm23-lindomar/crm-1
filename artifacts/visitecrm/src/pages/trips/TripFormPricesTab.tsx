import { useState, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Check, Loader2, UserCog, MapPin } from "lucide-react";
import { formatCurrency } from "./utils";
import { FIXED_COST_CATEGORIES, VARIABLE_COST_CATEGORIES } from "./constants";
import type { TripFormData, FreePassenger } from "./types";
import { useGetTripSeatMap, getGetTripSeatMapQueryKey } from "@workspace/api-client-react";

function maskCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function maskWhatsApp(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

interface NewFixed { category: string; description: string; customDesc: string; value: string }
interface NewVariable { category: string; description: string; customDesc: string; valuePax: string }

interface TripFormPricesTabProps {
  form: TripFormData;
  setForm: Dispatch<SetStateAction<TripFormData>>;
  newFixed: NewFixed;
  setNewFixed: Dispatch<SetStateAction<NewFixed>>;
  newVariable: NewVariable;
  setNewVariable: Dispatch<SetStateAction<NewVariable>>;
  tripId?: string;
  isSavingCosts: boolean;
  isPending: boolean;
  handleSaveCosts: () => void;
}

const EMPTY_NEW_FIXED: NewFixed = { category: "", description: "", customDesc: "", value: "" };
const EMPTY_NEW_VARIABLE: NewVariable = { category: "", description: "", customDesc: "", valuePax: "" };

const EMPTY_FREE_PASSENGER = { name: "", cpf: "", whatsapp: "", seatNumber: "" };

function SeatSelect({
  value,
  onChange,
  availableSeats,
  excludedSeats,
  currentSeat,
}: {
  value: string;
  onChange: (v: string) => void;
  availableSeats: string[];
  excludedSeats: string[];
  currentSeat?: string | null;
}) {
  const options = availableSeats.filter(s => s === currentSeat || !excludedSeats.includes(s));
  return (
    <Select value={value || "__none__"} onValueChange={v => onChange(v === "__none__" ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder="Sem assento" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Sem assento</SelectItem>
        {options.map(s => (
          <SelectItem key={s} value={s}>Assento {s}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FreePassengersSection({
  form,
  setForm,
  availableSeats,
}: {
  form: TripFormData;
  setForm: Dispatch<SetStateAction<TripFormData>>;
  availableSeats: string[];
}) {
  const [addingRole, setAddingRole] = useState<"organizer" | "guide" | null>(null);
  const [newPax, setNewPax] = useState(EMPTY_FREE_PASSENGER);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPax, setEditPax] = useState(EMPTY_FREE_PASSENGER);

  const organizers = form.freePassengers.filter(p => p.role === "organizer");
  const guides = form.freePassengers.filter(p => p.role === "guide");

  const handleAdd = () => {
    if (!addingRole || !newPax.name) return;
    const fp: FreePassenger = {
      id: crypto.randomUUID(),
      name: newPax.name.trim(),
      cpf: newPax.cpf.trim(),
      whatsapp: newPax.whatsapp.trim(),
      role: addingRole,
      seatNumber: newPax.seatNumber.trim() || null,
    };
    setForm(prev => ({ ...prev, freePassengers: [...prev.freePassengers, fp] }));
    setNewPax(EMPTY_FREE_PASSENGER);
    setAddingRole(null);
  };

  const handleRemove = (id: string) => {
    setForm(prev => ({ ...prev, freePassengers: prev.freePassengers.filter(p => p.id !== id) }));
    if (editingId === id) setEditingId(null);
  };

  const startEdit = (p: FreePassenger) => {
    setEditingId(p.id);
    setEditPax({ name: p.name, cpf: p.cpf, whatsapp: p.whatsapp, seatNumber: p.seatNumber ?? "" });
  };

  const handleSaveEdit = (id: string) => {
    setForm(prev => ({
      ...prev,
      freePassengers: prev.freePassengers.map(p =>
        p.id === id
          ? { ...p, name: editPax.name.trim(), cpf: editPax.cpf.trim(), whatsapp: editPax.whatsapp.trim(), seatNumber: editPax.seatNumber.trim() || null }
          : p
      ),
    }));
    setEditingId(null);
  };

  const assignedSeats = form.freePassengers
    .filter(p => p.seatNumber)
    .map(p => p.seatNumber as string);

  const renderPassenger = (p: FreePassenger) => {
    if (editingId === p.id) {
      const otherAssigned = assignedSeats.filter(s => s !== p.seatNumber);
      return (
        <div key={p.id} className="border rounded-lg p-3 space-y-2 bg-muted/10">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome *</Label>
              <Input value={editPax.name} onChange={e => setEditPax(prev => ({ ...prev, name: e.target.value }))} placeholder="Nome completo" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assento</Label>
              {availableSeats.length > 0 ? (
                <SeatSelect
                  value={editPax.seatNumber}
                  onChange={v => setEditPax(prev => ({ ...prev, seatNumber: v }))}
                  availableSeats={availableSeats}
                  excludedSeats={otherAssigned}
                  currentSeat={p.seatNumber}
                />
              ) : (
                <Input value={editPax.seatNumber} onChange={e => setEditPax(prev => ({ ...prev, seatNumber: e.target.value }))} placeholder="Ex: 1, 2A..." />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CPF</Label>
              <Input value={editPax.cpf} onChange={e => setEditPax(prev => ({ ...prev, cpf: maskCpf(e.target.value) }))} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">WhatsApp</Label>
              <Input value={editPax.whatsapp} onChange={e => setEditPax(prev => ({ ...prev, whatsapp: maskWhatsApp(e.target.value) }))} placeholder="(11) 99999-9999" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleSaveEdit(p.id)} disabled={!editPax.name}><Check className="w-3 h-3 mr-1" />Salvar</Button>
            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
          </div>
        </div>
      );
    }
    return (
      <div key={p.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-sm group">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="font-medium truncate">{p.name}</span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {p.cpf && <span>CPF: {p.cpf}</span>}
              {p.whatsapp && <span>• {p.whatsapp}</span>}
              {p.seatNumber && (
                <Badge variant="secondary" className="text-xs py-0 px-1.5 gap-0.5">
                  <MapPin className="w-2.5 h-2.5" />Assento {p.seatNumber}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-3">
          <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => startEdit(p)}>
            <UserCog className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100" onClick={() => handleRemove(p.id)}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  const renderGroup = (role: "organizer" | "guide", label: string, list: FreePassenger[]) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{label}</h4>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setAddingRole(role); setNewPax(EMPTY_FREE_PASSENGER); }}>
          <Plus className="w-3 h-3" />Adicionar
        </Button>
      </div>
      {list.length === 0 && addingRole !== role && (
        <p className="text-xs text-muted-foreground py-1">Nenhum cadastrado.</p>
      )}
      {list.map(renderPassenger)}
      {addingRole === role && (
        <div className="border-2 border-dashed border-primary/30 rounded-lg p-3 space-y-2 bg-primary/5">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome *</Label>
              <Input value={newPax.name} onChange={e => setNewPax(prev => ({ ...prev, name: e.target.value }))} placeholder="Nome completo" autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assento (opcional)</Label>
              {availableSeats.length > 0 ? (
                <SeatSelect
                  value={newPax.seatNumber}
                  onChange={v => setNewPax(prev => ({ ...prev, seatNumber: v }))}
                  availableSeats={availableSeats}
                  excludedSeats={assignedSeats}
                />
              ) : (
                <Input value={newPax.seatNumber} onChange={e => setNewPax(prev => ({ ...prev, seatNumber: e.target.value }))} placeholder="Ex: 1, 2A..." />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CPF (opcional)</Label>
              <Input value={newPax.cpf} onChange={e => setNewPax(prev => ({ ...prev, cpf: maskCpf(e.target.value) }))} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">WhatsApp (opcional)</Label>
              <Input value={newPax.whatsapp} onChange={e => setNewPax(prev => ({ ...prev, whatsapp: maskWhatsApp(e.target.value) }))} placeholder="(11) 99999-9999" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!newPax.name}><Check className="w-3 h-3 mr-1" />Confirmar</Button>
            <Button size="sm" variant="outline" onClick={() => setAddingRole(null)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {renderGroup("organizer", "Responsável da Viagem", organizers)}
      <div className="border-t" />
      {renderGroup("guide", "Guia de Turismo", guides)}
    </div>
  );
}

export function TripFormPricesTab({ form, setForm, newFixed, setNewFixed, newVariable, setNewVariable, tripId, isSavingCosts, isPending, handleSaveCosts }: TripFormPricesTabProps) {
  const cap = parseInt(form.totalCapacity || "0");

  const { data: seatMapData } = useGetTripSeatMap(tripId ?? "", {
    query: { enabled: !!tripId, queryKey: getGetTripSeatMapQueryKey(tripId ?? "") },
  });

  const availableSeats = useMemo(() => {
    if (seatMapData?.seats && seatMapData.seats.length > 0) {
      const freeSeatNumbers = new Set(
        form.freePassengers.filter(p => p.seatNumber).map(p => p.seatNumber as string)
      );
      const seats = seatMapData.seats
        .filter(s => s.status === "available" || s.status === "free" || freeSeatNumbers.has(s.number))
        .map(s => s.number)
        .sort((a, b) => {
          const na = parseInt(a), nb = parseInt(b);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return a.localeCompare(b);
        });
      return seats;
    }
    return cap > 0 ? Array.from({ length: cap }, (_, i) => String(i + 1)) : [];
  }, [seatMapData, form.freePassengers, cap]);
  const freeCount = form.freePassengers.length;
  const paidCap = Math.max(0, cap - freeCount);
  const grossRevenue = parseFloat(form.priceAdult || "0") * paidCap;
  const totalFixed = form.fixedCostItems.reduce((s, c) => s + c.value, 0);
  const totalVariablePax = form.variableCostItems.reduce((s, c) => s + c.valuePax, 0);
  const totalVariable = totalVariablePax * cap;
  const totalOperational = totalFixed + totalVariable;
  const costPerPax = paidCap > 0 ? totalOperational / paidCap : 0;
  const profit = grossRevenue - totalOperational;
  const marginPct = grossRevenue > 0 ? Math.round(profit / grossRevenue * 100) : 0;

  return (
    <>
      <div className="bg-card border rounded-lg p-6 space-y-4">
        <h3 className="font-semibold">Preços por Categoria</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Preço Adulto (R$) *</Label>
            <Input type="number" step="0.01" placeholder="0.00" value={form.priceAdult} onChange={e => setForm(p => ({ ...p, priceAdult: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Preço Criança (R$)</Label>
            <Input type="number" step="0.01" placeholder="0.00" value={form.priceChild} onChange={e => setForm(p => ({ ...p, priceChild: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Preço Idoso (R$)</Label>
            <Input type="number" step="0.01" placeholder="0.00" value={form.priceSenior} onChange={e => setForm(p => ({ ...p, priceSenior: e.target.value }))} />
          </div>
        </div>
        <div className="border-t pt-4 space-y-3">
          <h4 className="font-medium text-sm">Faixas de Preço Dinâmico</h4>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Preço de Lançamento (–20%)", value: form.priceAdult ? formatCurrency(parseFloat(form.priceAdult) * 0.8) : "—" },
              { label: "Preço Antecipado (–10%)", value: form.priceAdult ? formatCurrency(parseFloat(form.priceAdult) * 0.9) : "—" },
              { label: "Preço Padrão", value: form.priceAdult ? formatCurrency(parseFloat(form.priceAdult)) : "—" },
              { label: "Preço de Última Hora (+10%)", value: form.priceAdult ? formatCurrency(parseFloat(form.priceAdult) * 1.1) : "—" },
            ].map(tier => (
              <div key={tier.label} className="flex justify-between items-center p-3 bg-muted/30 rounded-lg text-sm">
                <span className="text-muted-foreground">{tier.label}</span>
                <span className="font-medium">{tier.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold">Controle de Gratuidades</h3>
            <p className="text-sm text-muted-foreground">Passageiros gratuitos não contabilizados na receita bruta</p>
          </div>
          {freeCount > 0 && (
            <Badge variant="secondary" className="shrink-0">
              {freeCount} gratuidade{freeCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <FreePassengersSection form={form} setForm={setForm} availableSeats={availableSeats} />
        {freeCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm dark:bg-amber-950/20 dark:border-amber-800">
            <span className="text-amber-700 dark:text-amber-400 font-medium">
              {freeCount} assento{freeCount > 1 ? "s" : ""} gratuito{freeCount > 1 ? "s" : ""} — receita calculada sobre {paidCap} pagante{paidCap !== 1 ? "s" : ""} de {cap} total
            </span>
          </div>
        )}
      </div>

      <div className="bg-card border rounded-lg p-6 space-y-4">
        <div>
          <h3 className="font-semibold">Custos Fixos</h3>
          <p className="text-sm text-muted-foreground">Valores que não dependem do número de passageiros</p>
        </div>
        {form.fixedCostItems.length > 0 && (
          <div className="space-y-2">
            {form.fixedCostItems.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">{item.category}</span>
                  <span className="truncate">{item.description}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <span className="font-semibold text-sm">{formatCurrency(item.value)}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => setForm(prev => ({ ...prev, fixedCostItems: prev.fixedCostItems.filter(c => c.id !== item.id) }))}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center pt-1 text-sm font-semibold border-t">
              <span>Total Fixo</span>
              <span>{formatCurrency(totalFixed)}</span>
            </div>
          </div>
        )}
        <div className="border rounded-lg p-4 space-y-3 bg-muted/10">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Adicionar Custo Fixo</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Categoria</Label>
              <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={newFixed.category}
                onChange={e => setNewFixed(prev => ({ ...prev, category: e.target.value, description: "", customDesc: "" }))}>
                <option value="">Selecione...</option>
                {Object.keys(FIXED_COST_CATEGORIES).map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              {newFixed.category && newFixed.description !== "Outro" ? (
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={newFixed.description}
                  onChange={e => setNewFixed(prev => ({ ...prev, description: e.target.value, customDesc: "" }))}>
                  <option value="">Selecione...</option>
                  {(FIXED_COST_CATEGORIES[newFixed.category] ?? []).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              ) : newFixed.description === "Outro" ? (
                <Input placeholder="Descreva o custo..." value={newFixed.customDesc}
                  onChange={e => setNewFixed(prev => ({ ...prev, customDesc: e.target.value }))} />
              ) : (
                <Input disabled placeholder="Selecione uma categoria primeiro" className="bg-muted/30" />
              )}
            </div>
          </div>
          <div className="flex gap-3 items-end">
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Valor (R$)</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newFixed.value}
                onChange={e => setNewFixed(prev => ({ ...prev, value: e.target.value }))} />
            </div>
            <Button size="sm" variant="outline"
              disabled={!newFixed.category || !newFixed.description || (newFixed.description === "Outro" && !newFixed.customDesc) || !newFixed.value}
              onClick={() => {
                const desc = newFixed.description === "Outro" ? newFixed.customDesc : newFixed.description;
                setForm(prev => ({ ...prev, fixedCostItems: [...prev.fixedCostItems, { id: crypto.randomUUID(), category: newFixed.category, description: desc, value: parseFloat(newFixed.value) || 0 }] }));
                setNewFixed(EMPTY_NEW_FIXED);
              }}>
              <Plus className="w-4 h-4 mr-1" />Adicionar
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-6 space-y-4">
        <div>
          <h3 className="font-semibold">Custos Variáveis</h3>
          <p className="text-sm text-muted-foreground">Valores multiplicados pelo número de passageiros</p>
        </div>
        {form.variableCostItems.length > 0 && (
          <div className="space-y-2">
            {form.variableCostItems.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">{item.category}</span>
                  <span className="truncate">{item.description}</span>
                  <span className="text-muted-foreground text-xs shrink-0">{formatCurrency(item.valuePax)}/pax</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <span className="font-semibold text-sm">{cap > 0 ? formatCurrency(item.valuePax * cap) : "—"}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => setForm(prev => ({ ...prev, variableCostItems: prev.variableCostItems.filter(c => c.id !== item.id) }))}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center pt-1 text-sm font-semibold border-t">
              <span>Total Variável ({cap} pax)</span>
              <span>{formatCurrency(totalVariable)}</span>
            </div>
          </div>
        )}
        <div className="border rounded-lg p-4 space-y-3 bg-muted/10">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Adicionar Custo Variável</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Categoria</Label>
              <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={newVariable.category}
                onChange={e => setNewVariable(prev => ({ ...prev, category: e.target.value, description: "", customDesc: "" }))}>
                <option value="">Selecione...</option>
                {Object.keys(VARIABLE_COST_CATEGORIES).map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              {newVariable.category && newVariable.description !== "Outro" ? (
                <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={newVariable.description}
                  onChange={e => setNewVariable(prev => ({ ...prev, description: e.target.value, customDesc: "" }))}>
                  <option value="">Selecione...</option>
                  {(VARIABLE_COST_CATEGORIES[newVariable.category] ?? []).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              ) : newVariable.description === "Outro" ? (
                <Input placeholder="Descreva o custo..." value={newVariable.customDesc}
                  onChange={e => setNewVariable(prev => ({ ...prev, customDesc: e.target.value }))} />
              ) : (
                <Input disabled placeholder="Selecione uma categoria primeiro" className="bg-muted/30" />
              )}
            </div>
          </div>
          <div className="flex gap-3 items-end">
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Valor por Passageiro (R$)</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newVariable.valuePax}
                onChange={e => setNewVariable(prev => ({ ...prev, valuePax: e.target.value }))} />
            </div>
            <Button size="sm" variant="outline"
              disabled={!newVariable.category || !newVariable.description || (newVariable.description === "Outro" && !newVariable.customDesc) || !newVariable.valuePax}
              onClick={() => {
                const desc = newVariable.description === "Outro" ? newVariable.customDesc : newVariable.description;
                setForm(prev => ({ ...prev, variableCostItems: [...prev.variableCostItems, { id: crypto.randomUUID(), category: newVariable.category, description: desc, valuePax: parseFloat(newVariable.valuePax) || 0 }] }));
                setNewVariable(EMPTY_NEW_VARIABLE);
              }}>
              <Plus className="w-4 h-4 mr-1" />Adicionar
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-6 space-y-4">
        <h3 className="font-semibold">Resumo Financeiro</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: "Vagas Disponíveis (capacidade total)", value: `${cap} vagas`, muted: false },
            ...(freeCount > 0 ? [{ label: `Gratuidades (${freeCount})`, value: `${paidCap} vagas pagantes`, muted: false }] : []),
            { label: "Total Custos Fixos", value: formatCurrency(totalFixed), muted: false },
            { label: `Total Custos Variáveis (${cap} pax)`, value: formatCurrency(totalVariable), muted: false },
            { label: "Custo Operacional Total", value: formatCurrency(totalOperational), muted: false },
            { label: freeCount > 0 ? "Custo por Pagante" : "Custo por Passageiro", value: formatCurrency(costPerPax), muted: false },
            { label: `Receita Bruta (${paidCap} pagantes, 100%)`, value: formatCurrency(grossRevenue), muted: false },
            { label: `Receita Bruta (${paidCap} pagantes, 80%)`, value: formatCurrency(grossRevenue * 0.8), muted: true },
          ].map(row => (
            <div key={row.label} className={`flex justify-between p-3 rounded-lg ${row.muted ? "bg-muted/20" : "bg-muted/40"}`}>
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium">{row.value}</span>
            </div>
          ))}
        </div>
        <div className={`flex justify-between items-center p-4 rounded-lg border-2 text-sm font-semibold ${profit >= 0 ? "border-green-500/40 bg-green-50 dark:bg-green-950/20" : "border-red-500/40 bg-red-50 dark:bg-red-950/20"}`}>
          <span className={profit >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
            {profit >= 0 ? "Lucro Estimado" : "Prejuízo Estimado"}
          </span>
          <div className="text-right">
            <span className={`text-lg ${profit >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{formatCurrency(Math.abs(profit))}</span>
            <span className="ml-2 text-xs text-muted-foreground">({marginPct}% margem)</span>
          </div>
        </div>
      </div>

      {tripId && (
        <div className="flex justify-end">
          <Button onClick={handleSaveCosts} disabled={isSavingCosts || isPending} className="gap-2">
            {isSavingCosts
              ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando Custos...</>
              : <><Check className="w-4 h-4" />Salvar Custos</>}
          </Button>
        </div>
      )}
    </>
  );
}
