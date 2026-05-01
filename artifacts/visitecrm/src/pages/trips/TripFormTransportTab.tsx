import type { Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Clock } from "lucide-react";
import { VEHICLE_TYPES } from "./constants";
import type { TripFormData } from "./types";

interface TripFormTransportTabProps {
  form: TripFormData;
  setForm: Dispatch<SetStateAction<TripFormData>>;
}

export function TripFormTransportTab({ form, setForm }: TripFormTransportTabProps) {
  const set = (k: keyof TripFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));
  const setVal = (k: keyof TripFormData) => (v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <>
      {(form.originCity || form.originState || form.departureTime || form.returnTime) && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">Origem e Horários</h3>
          <div className="flex flex-wrap gap-4 text-sm text-blue-700 dark:text-blue-300">
            {(form.originCity || form.originState) && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                <span>Saída de <strong>{[form.originCity, form.originState].filter(Boolean).join(", ")}</strong></span>
              </div>
            )}
            {form.departureTime && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>Saída: <strong>{form.departureTime}</strong></span>
              </div>
            )}
            {form.returnTime && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>Retorno: <strong>{form.returnTime}</strong></span>
              </div>
            )}
          </div>
          <p className="text-xs text-blue-500 dark:text-blue-400 mt-2">Esses campos podem ser editados na aba "Básico".</p>
        </div>
      )}
      <div className="bg-card border rounded-lg p-6 space-y-4">
        <h3 className="font-semibold">Veículo</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Tipo de Veículo</Label>
            <Select value={form.vehicleType || "none"} onValueChange={v => setVal("vehicleType")(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não definido</SelectItem>
                {VEHICLE_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Placa do Veículo</Label>
            <Input placeholder="ABC-1234" value={form.vehiclePlate} onChange={set("vehiclePlate")} />
          </div>
        </div>
      </div>
      <div className="bg-card border rounded-lg p-6 space-y-5">
        <h3 className="font-semibold">Tripulação Completa</h3>
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Motorista 1</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome do Motorista</Label>
              <Input placeholder="João da Silva" value={form.driverName} onChange={set("driverName")} />
            </div>
            <div className="space-y-2">
              <Label>CPF do Motorista</Label>
              <Input placeholder="000.000.000-00" value={form.driver1Cpf} onChange={set("driver1Cpf")} />
            </div>
            <div className="space-y-2">
              <Label>Nº CNH</Label>
              <Input placeholder="00000000000" value={form.driver1Cnh} onChange={set("driver1Cnh")} />
            </div>
            <div className="space-y-2">
              <Label>Categoria CNH</Label>
              <Select value={form.driver1CnhCategory || "none"} onValueChange={v => setVal("driver1CnhCategory")(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não informado</SelectItem>
                  {["D", "E"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Validade CNH</Label>
              <Input type="date" value={form.driver1CnhExpiry} onChange={set("driver1CnhExpiry")} />
            </div>
          </div>
        </div>
        <div className="border-t pt-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Motorista 2 (opcional)</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input placeholder="Nome do 2º motorista" value={form.driver2Name} onChange={set("driver2Name")} />
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input placeholder="000.000.000-00" value={form.driver2Cpf} onChange={set("driver2Cpf")} />
            </div>
            <div className="space-y-2">
              <Label>Nº CNH</Label>
              <Input placeholder="00000000000" value={form.driver2Cnh} onChange={set("driver2Cnh")} />
            </div>
            <div className="space-y-2">
              <Label>Categoria CNH</Label>
              <Select value={form.driver2CnhCategory || "none"} onValueChange={v => setVal("driver2CnhCategory")(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não informado</SelectItem>
                  {["D", "E"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Validade CNH</Label>
              <Input type="date" value={form.driver2CnhExpiry} onChange={set("driver2CnhExpiry")} />
            </div>
          </div>
        </div>
        <div className="border-t pt-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Guia de Turismo</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome do Guia</Label>
              <Input placeholder="Maria Costa" value={form.tourGuide} onChange={set("tourGuide")} />
            </div>
            <div className="space-y-2">
              <Label>CPF do Guia</Label>
              <Input placeholder="000.000.000-00" value={form.tourGuideCpf} onChange={set("tourGuideCpf")} />
            </div>
            <div className="space-y-2">
              <Label>Nº Registro CADASTUR</Label>
              <Input placeholder="00000/00" value={form.tourGuideRegistration} onChange={set("tourGuideRegistration")} />
            </div>
          </div>
        </div>
        <div className="border-t pt-4">
          <div className="space-y-2">
            <Label>Responsável da Viagem</Label>
            <Input placeholder="Nome do responsável" value={form.tripOrganizer} onChange={set("tripOrganizer")} />
          </div>
        </div>
      </div>
      <div className="bg-card border rounded-lg p-6 space-y-4">
        <h3 className="font-semibold">Hospedagem</h3>
        <p className="text-sm text-muted-foreground">Integração com cadastro de hospedagens disponível em módulo futuro.</p>
      </div>
    </>
  );
}
