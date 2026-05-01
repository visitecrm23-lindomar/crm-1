import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useGetTrip, useCreateTrip, useUpdateTrip, useListLayouts } from "@workspace/api-client-react";
import { PlanLimitWall, usePlanLimitError } from "@/components/plan-limit-wall";
import { CoverImageUpload } from "@/components/cover-image-upload";
import { GalleryUpload } from "@/components/gallery-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, X, Check, Clock, MapPin, Loader2 } from "lucide-react";
import { TiptapEditor } from "./TiptapEditor";
import { LayoutMiniPreview, TripCostsTab } from "./TripCostsSection";
import { formatCurrency } from "./utils";
import { TRIP_TYPES, TRIP_TYPE_LABELS, VEHICLE_TYPES, FIXED_COST_CATEGORIES, VARIABLE_COST_CATEGORIES } from "./constants";
import { type TripFormData, EMPTY_FORM, toTripFormData, newBP, newDay } from "./types";
import { TripFormPricesTab } from "./TripFormPricesTab";
import { TripFormTransportTab } from "./TripFormTransportTab";

export function TripForm({ tripId }: { tripId?: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState("basico");
  const [form, setForm] = useState<TripFormData>(EMPTY_FORM);
  const [tripLimitError, setTripLimitError] = useState<{ resource: string; current?: number; limit?: number } | null>(null);

  const { data: existingTrip } = useGetTrip(tripId ?? "", { query: { enabled: !!tripId, queryKey: ["/api/trips", tripId] } });
  const { data: layouts = [] } = useListLayouts({ query: { queryKey: ["layouts"] } });
  const createTrip = useCreateTrip();
  const updateTrip = useUpdateTrip();
  const isPending = createTrip.isPending || updateTrip.isPending;
  const [isSavingCosts, setIsSavingCosts] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const isUploading = uploadingCount > 0;
  const handleUploadingChange = (uploading: boolean) =>
    setUploadingCount((prev) => (uploading ? prev + 1 : Math.max(0, prev - 1)));

  const EMPTY_NEW_FIXED = { category: "", description: "", customDesc: "", value: "" };
  const EMPTY_NEW_VARIABLE = { category: "", description: "", customDesc: "", valuePax: "" };
  const [newFixed, setNewFixed] = useState(EMPTY_NEW_FIXED);
  const [newVariable, setNewVariable] = useState(EMPTY_NEW_VARIABLE);

  const selectedLayout = layouts.find(l => l.id === form.layoutId) ?? null;

  useEffect(() => {
    if (!existingTrip || !tripId) return;
    setForm(toTripFormData(existingTrip));
  }, [existingTrip?.id, tripId]);

  useEffect(() => {
    if (!selectedLayout) return;
    setForm(prev => ({ ...prev, totalCapacity: String(selectedLayout.seatCount) }));
  }, [form.layoutId, selectedLayout?.seatCount]);

  const set = (k: keyof TripFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));
  const setVal = (k: keyof TripFormData) => (v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const cap = parseInt(form.totalCapacity || "0");
  const freeSeats = Math.min(parseInt(form.freeOrganizers || "0") + parseInt(form.freeGuides || "0"), cap);
  const paidCap = Math.max(0, cap - freeSeats);
  const grossRevenue = parseFloat(form.priceAdult || "0") * paidCap;
  const totalFixed = form.fixedCostItems.reduce((s, c) => s + c.value, 0);
  const totalVariablePax = form.variableCostItems.reduce((s, c) => s + c.valuePax, 0);
  const totalVariable = totalVariablePax * cap;
  const totalOperational = totalFixed + totalVariable;
  const costPerPax = paidCap > 0 ? totalOperational / paidCap : 0;
  const profit = grossRevenue - totalOperational;
  const marginPct = grossRevenue > 0 ? Math.round(profit / grossRevenue * 100) : 0;

  const handleSave = async (publish = false) => {
    if (!form.name || !form.destination || !form.destinationCity || !form.destinationState || !form.departureDate || !form.priceAdult) {
      toast({ title: "Preencha os campos obrigatórios: nome, destino, cidade, estado, data de saída e preço adulto", variant: "destructive" });
      return;
    }
    const inclArr = form.inclusions.split("\n").map(s => s.trim()).filter(Boolean);
    const exclArr = form.exclusions.split("\n").map(s => s.trim()).filter(Boolean);
    const statusToSave = publish ? "active" : form.status;
    const itineraryToSave = form.itinerary.filter(d => d.title || d.description);
    const boardingPointsToSave = form.boardingPoints.filter(bp => bp.name);
    try {
      if (tripId) {
        await updateTrip.mutateAsync({
          id: tripId,
          data: {
            name: form.name, description: form.description || undefined,
            destination: form.destination, destinationCity: form.destinationCity, destinationState: form.destinationState,
            originCity: form.originCity || undefined, originState: form.originState || undefined,
            type: form.type, category: form.category,
            departureDate: form.departureDate, returnDate: form.returnDate || undefined,
            departureTime: form.departureTime || undefined, returnTime: form.returnTime || undefined,
            totalCapacity: parseInt(form.totalCapacity),
            priceAdult: parseFloat(form.priceAdult),
            priceChild: form.priceChild ? parseFloat(form.priceChild) : undefined,
            priceSenior: form.priceSenior ? parseFloat(form.priceSenior) : undefined,
            inclusions: inclArr, exclusions: exclArr,
            coverImage: form.coverImage || undefined,
            seatLayout: form.layoutId ? undefined : form.seatLayout,
            layoutId: form.layoutId || null,
            vehicleType: form.vehicleType || undefined, vehiclePlate: form.vehiclePlate || undefined, driverName: form.driverName || undefined, tourGuide: form.tourGuide || undefined, tripOrganizer: form.tripOrganizer || undefined,
            driver1Cpf: form.driver1Cpf || null, driver1Cnh: form.driver1Cnh || null, driver1CnhCategory: form.driver1CnhCategory || null, driver1CnhExpiry: form.driver1CnhExpiry || null,
            driver2Name: form.driver2Name || null, driver2Cpf: form.driver2Cpf || null, driver2Cnh: form.driver2Cnh || null, driver2CnhCategory: form.driver2CnhCategory || null, driver2CnhExpiry: form.driver2CnhExpiry || null,
            tourGuideCpf: form.tourGuideCpf || null, tourGuideRegistration: form.tourGuideRegistration || null,
            freeOrganizers: parseInt(form.freeOrganizers || "0"),
            freeGuides: parseInt(form.freeGuides || "0"),
            status: statusToSave,
            itinerary: itineraryToSave.length ? itineraryToSave : undefined,
            boardingPoints: boardingPointsToSave.length ? boardingPointsToSave : undefined,
            fixedCosts: form.fixedCostItems,
            variableCosts: form.variableCostItems,
            gallery: form.gallery.length ? form.gallery : undefined,
          },
        });
      } else {
        await createTrip.mutateAsync({
          data: {
            name: form.name, description: form.description || undefined,
            destination: form.destination, destinationCity: form.destinationCity, destinationState: form.destinationState,
            originCity: form.originCity || undefined, originState: form.originState || undefined,
            type: form.type, category: form.category,
            departureDate: form.departureDate, returnDate: form.returnDate || undefined,
            departureTime: form.departureTime || undefined, returnTime: form.returnTime || undefined,
            totalCapacity: parseInt(form.totalCapacity),
            priceAdult: parseFloat(form.priceAdult),
            priceChild: form.priceChild ? parseFloat(form.priceChild) : undefined,
            priceSenior: form.priceSenior ? parseFloat(form.priceSenior) : undefined,
            inclusions: inclArr, exclusions: exclArr,
            coverImage: form.coverImage || undefined,
            seatLayout: form.layoutId ? undefined : form.seatLayout,
            layoutId: form.layoutId || null,
            vehicleType: form.vehicleType || undefined, vehiclePlate: form.vehiclePlate || undefined, driverName: form.driverName || undefined, tourGuide: form.tourGuide || undefined, tripOrganizer: form.tripOrganizer || undefined,
            driver1Cpf: form.driver1Cpf || null, driver1Cnh: form.driver1Cnh || null, driver1CnhCategory: form.driver1CnhCategory || null, driver1CnhExpiry: form.driver1CnhExpiry || null,
            driver2Name: form.driver2Name || null, driver2Cpf: form.driver2Cpf || null, driver2Cnh: form.driver2Cnh || null, driver2CnhCategory: form.driver2CnhCategory || null, driver2CnhExpiry: form.driver2CnhExpiry || null,
            tourGuideCpf: form.tourGuideCpf || null, tourGuideRegistration: form.tourGuideRegistration || null,
            freeOrganizers: parseInt(form.freeOrganizers || "0"),
            freeGuides: parseInt(form.freeGuides || "0"),
            status: statusToSave,
            itinerary: itineraryToSave.length ? itineraryToSave : undefined,
            boardingPoints: boardingPointsToSave.length ? boardingPointsToSave : undefined,
            fixedCosts: form.fixedCostItems,
            variableCosts: form.variableCostItems,
            gallery: form.gallery.length ? form.gallery : undefined,
          },
        });
      }
      navigate("/trips");
    } catch (err: unknown) {
      const responseData = (err as { data?: Record<string, unknown> })?.data
        ?? (err as { response?: { data?: Record<string, unknown> } })?.response?.data
        ?? {};
      const limitInfo = usePlanLimitError(responseData);
      if (limitInfo.isLimitError) {
        setTripLimitError({ resource: limitInfo.resource ?? "trips", current: limitInfo.current, limit: limitInfo.limit });
        return;
      }
      const msg = (responseData["error"] as string)
        || (err as { message?: string })?.message
        || "Erro ao salvar viagem";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const handleSaveCosts = async () => {
    if (!tripId) return;
    setIsSavingCosts(true);
    try {
      await updateTrip.mutateAsync({
        id: tripId,
        data: {
          fixedCosts: form.fixedCostItems,
          variableCosts: form.variableCostItems,
        },
      });
      toast({ title: "Custos salvos com sucesso" });
    } catch {
      toast({ title: "Erro ao salvar custos", variant: "destructive" });
    } finally {
      setIsSavingCosts(false);
    }
  };

  const TABS = [
    { id: "basico", label: "Informações Básicas" },
    { id: "precos", label: "Preços" },
    { id: "pontos", label: "Pontos de Embarque" },
    { id: "roteiro", label: "Roteiro" },
    { id: "inclusoes", label: "Inclusões / Exclusões" },
    { id: "transporte", label: "Transporte e Hospedagem" },
    { id: "midia", label: "Mídia" },
    ...(tripId ? [{ id: "custos", label: "Custos" }] : []),
  ];

  const canSave = !!form.name && !!form.destination && !!form.destinationCity && !!form.destinationState && !!form.departureDate && !!form.priceAdult;

  if (tripLimitError) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/trips")}><ArrowLeft className="w-4 h-4" /></Button>
          <h1 className="text-2xl font-bold tracking-tight">Nova Viagem</h1>
        </div>
        <PlanLimitWall
          resource={tripLimitError.resource as "clients" | "users" | "trips"}
          current={tripLimitError.current}
          limit={tripLimitError.limit}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/trips")}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tripId ? "Editar Viagem" : "Nova Viagem"}</h1>
          <p className="text-muted-foreground text-sm">{tripId ? "Atualize as informações da viagem" : "Preencha as informações para criar uma nova viagem"}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {TABS.map(t => <TabsTrigger key={t.id} value={t.id} className="text-xs">{t.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="basico" className="space-y-4 mt-6">
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              <Label>Nome da Viagem *</Label>
              <Input placeholder="Ex: Maravilhas do Nordeste" value={form.name} onChange={set("name")} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <TiptapEditor value={form.description} onChange={v => setForm(prev => ({ ...prev, description: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cidade de Origem</Label>
                <Input placeholder="São Paulo" value={form.originCity} onChange={set("originCity")} />
              </div>
              <div className="space-y-2">
                <Label>Estado (UF) de Origem</Label>
                <Input placeholder="SP" maxLength={2} value={form.originState} onChange={set("originState")} />
              </div>
              <div className="space-y-2">
                <Label>Destino / Título *</Label>
                <Input placeholder="Nordeste Brasileiro" value={form.destination} onChange={set("destination")} />
              </div>
              <div className="space-y-2">
                <Label>Cidade de Destino *</Label>
                <Input placeholder="Natal" value={form.destinationCity} onChange={set("destinationCity")} />
              </div>
              <div className="space-y-2">
                <Label>Estado (UF) de Destino *</Label>
                <Input placeholder="RN" maxLength={2} value={form.destinationState} onChange={set("destinationState")} />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={setVal("type")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {form.type && !TRIP_TYPES.includes(form.type) && <SelectItem value={form.type}>{TRIP_TYPE_LABELS[form.type] ?? form.type}</SelectItem>}
                    {TRIP_TYPES.map(t => <SelectItem key={t} value={t}>{TRIP_TYPE_LABELS[t] ?? t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data de Saída *</Label>
                <Input type="date" value={form.departureDate} onChange={set("departureDate")} />
              </div>
              <div className="space-y-2">
                <Label>Horário de Saída</Label>
                <Input type="time" value={form.departureTime} onChange={set("departureTime")} />
              </div>
              <div className="space-y-2">
                <Label>Data de Retorno</Label>
                <Input type="date" value={form.returnDate} onChange={set("returnDate")} />
              </div>
              <div className="space-y-2">
                <Label>Horário de Retorno</Label>
                <Input type="time" value={form.returnTime} onChange={set("returnTime")} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Layout de Assentos</Label>
                <Select
                  value={form.layoutId || `__std_${form.seatLayout}`}
                  onValueChange={v => {
                    if (v.startsWith("__std_")) {
                      setForm(prev => ({ ...prev, layoutId: "", seatLayout: v.replace("__std_", "") }));
                    } else {
                      setForm(prev => ({ ...prev, layoutId: v }));
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione um layout..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__std_2x2">Padrão 2x2 (automático)</SelectItem>
                    <SelectItem value="__std_2x1">Premium 2x1 (automático)</SelectItem>
                    {layouts.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-t mt-1 pt-2">
                          Layouts personalizados
                        </div>
                        {layouts.map(l => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name} — {l.seatCount} assentos
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
                {selectedLayout && (
                  <div className="mt-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0">
                        <LayoutMiniPreview cells={selectedLayout.cells} rows={selectedLayout.rows} cols={selectedLayout.cols} />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-medium text-indigo-800 truncate">✓ {selectedLayout.name}</p>
                        <p className="text-indigo-600 text-xs">
                          {selectedLayout.rows} fil. × {selectedLayout.cols} col. · {selectedLayout.seatCount} assentos
                        </p>
                        <p className="text-indigo-500 text-xs">
                          {selectedLayout.floors > 1 ? `${selectedLayout.floors} andares · ` : ""}
                          Numeração: {selectedLayout.numberingType === "by_row" ? "por fileira" : "sequencial"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Capacidade Total (assentos) *</Label>
                <Input
                  type="number" min="1" max="500"
                  value={form.totalCapacity}
                  onChange={set("totalCapacity")}
                  disabled={!!selectedLayout}
                  title={selectedLayout ? "Calculado automaticamente a partir do layout" : undefined}
                />
                {selectedLayout && (
                  <p className="text-xs text-muted-foreground">Calculado automaticamente ({selectedLayout.seatCount} assentos)</p>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="precos" className="space-y-4 mt-6">
          <TripFormPricesTab
            form={form} setForm={setForm}
            newFixed={newFixed} setNewFixed={setNewFixed}
            newVariable={newVariable} setNewVariable={setNewVariable}
            tripId={tripId} isSavingCosts={isSavingCosts} isPending={isPending}
            handleSaveCosts={handleSaveCosts}
          />
        </TabsContent>

        <TabsContent value="pontos" className="space-y-4 mt-6">
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Pontos de Embarque</h3>
                <p className="text-sm text-muted-foreground">Cadastre os pontos e horários de coleta da viagem.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setForm(prev => ({ ...prev, boardingPoints: [...prev.boardingPoints, newBP()] }))}>
                <Plus className="w-4 h-4 mr-1" />Adicionar Ponto
              </Button>
            </div>
            <div className="space-y-3">
              {form.boardingPoints.map((bp, idx) => (
                <div key={bp.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Ponto {idx + 1}</span>
                    {form.boardingPoints.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setForm(prev => ({ ...prev, boardingPoints: prev.boardingPoints.filter(b => b.id !== bp.id) }))}>
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome do Ponto</Label>
                      <Input placeholder="Terminal Rodoviário" value={bp.name} onChange={e => setForm(prev => ({ ...prev, boardingPoints: prev.boardingPoints.map(b => b.id === bp.id ? { ...b, name: e.target.value } : b) }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Horário</Label>
                      <Input type="time" value={bp.time} onChange={e => setForm(prev => ({ ...prev, boardingPoints: prev.boardingPoints.map(b => b.id === bp.id ? { ...b, time: e.target.value } : b) }))} />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Endereço / Referência</Label>
                      <Input placeholder="Av. Principal, 100 — Em frente ao posto Shell" value={bp.address} onChange={e => setForm(prev => ({ ...prev, boardingPoints: prev.boardingPoints.map(b => b.id === bp.id ? { ...b, address: e.target.value } : b) }))} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="roteiro" className="space-y-4 mt-6">
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Roteiro por Dia</h3>
              <Button size="sm" variant="outline" onClick={() => setForm(prev => ({ ...prev, itinerary: [...prev.itinerary, newDay(prev.itinerary.length + 1)] }))}>
                <Plus className="w-4 h-4 mr-1" />Adicionar Dia
              </Button>
            </div>
            <div className="space-y-3">
              {form.itinerary.map((day, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Dia {day.day}</span>
                    {form.itinerary.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setForm(prev => ({ ...prev, itinerary: prev.itinerary.filter((_, i) => i !== idx).map((d, i) => ({ ...d, day: i + 1 })) }))}>
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Input placeholder="Título do dia (ex: Chegada em Natal)" value={day.title} onChange={e => setForm(prev => ({ ...prev, itinerary: prev.itinerary.map((d, i) => i === idx ? { ...d, title: e.target.value } : d) }))} />
                    <Textarea placeholder="Descreva as atividades do dia..." rows={3} value={day.description} onChange={e => setForm(prev => ({ ...prev, itinerary: prev.itinerary.map((d, i) => i === idx ? { ...d, description: e.target.value } : d) }))} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="inclusoes" className="space-y-4 mt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border rounded-lg p-6 space-y-3">
              <div className="flex items-center gap-2"><Check className="w-4 h-4 text-green-600" /><h3 className="font-semibold">O que está incluso</h3></div>
              <Textarea placeholder={"Transporte ida e volta\nCafé da manhã\nGuia turístico\nSeguro de viagem"} value={form.inclusions} onChange={set("inclusions")} rows={8} className="font-mono text-sm" />
              <p className="text-xs text-muted-foreground">Um item por linha</p>
            </div>
            <div className="bg-card border rounded-lg p-6 space-y-3">
              <div className="flex items-center gap-2"><X className="w-4 h-4 text-red-600" /><h3 className="font-semibold">O que não está incluso</h3></div>
              <Textarea placeholder={"Despesas pessoais\nAlmoço e jantar\nIngresso para atrações opcionais"} value={form.exclusions} onChange={set("exclusions")} rows={8} className="font-mono text-sm" />
              <p className="text-xs text-muted-foreground">Um item por linha</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="transporte" className="space-y-4 mt-6">
          <TripFormTransportTab form={form} setForm={setForm} />
        </TabsContent>

        <TabsContent value="midia" className="space-y-4 mt-6">
          <div className="bg-card border rounded-lg p-6 space-y-6">
            <div className="space-y-3">
              <h3 className="font-semibold">Imagem de Capa</h3>
              <p className="text-xs text-muted-foreground">Envie 1 imagem para a capa da viagem (PNG, JPG, WEBP · máx. 4 MB)</p>
              <CoverImageUpload
                value={form.coverImage}
                onChange={(url) => setForm(prev => ({ ...prev, coverImage: url }))}
                onUploadingChange={handleUploadingChange}
                disabled={isPending}
                objectFit="cover"
              />
            </div>
            <div className="border-t pt-5 space-y-3">
              <h3 className="font-semibold">Galeria de Imagens</h3>
              <p className="text-xs text-muted-foreground">Envie até 3 imagens para a galeria da viagem (PNG, JPG, WEBP · máx. 4 MB cada)</p>
              <GalleryUpload
                value={form.gallery}
                onChange={(urls) => setForm(prev => ({ ...prev, gallery: urls }))}
                onUploadingChange={handleUploadingChange}
                disabled={isPending}
              />
            </div>
          </div>
        </TabsContent>

        {tripId && (
          <TabsContent value="custos" className="space-y-4 mt-6">
            <TripCostsTab tripId={tripId} />
          </TabsContent>
        )}
      </Tabs>

      <div className="flex items-center justify-between bg-card border rounded-lg p-4">
        <Button variant="ghost" onClick={() => navigate("/trips")}>Cancelar</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={isPending || isUploading || !canSave}>
            {isPending ? "Salvando..." : "Salvar como Rascunho"}
          </Button>
          <Button onClick={() => handleSave(true)} disabled={isPending || isUploading || !canSave}>
            {isPending ? "Publicando..." : isUploading ? "Aguardando upload..." : "Publicar Viagem"}
          </Button>
        </div>
      </div>
    </div>
  );
}
