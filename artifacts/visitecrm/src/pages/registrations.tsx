import { useState } from "react";
import { useListSuppliers, useCreateSupplier, useDeleteSupplier, useListVehicles, useCreateVehicle, useDeleteVehicle, useListAccommodations, useCreateAccommodation, useDeleteAccommodation, useListDestinations, useCreateDestination, useDeleteDestination } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
};

export default function Registrations() {
  const [tab, setTab] = useState("suppliers");

  // Suppliers
  const { data: suppliers, isLoading: loadingSuppliers, refetch: refetchSuppliers } = useListSuppliers();
  const createSupplier = useCreateSupplier();
  const deleteSupplier = useDeleteSupplier();

  // Vehicles
  const { data: vehicles, isLoading: loadingVehicles, refetch: refetchVehicles } = useListVehicles();
  const createVehicle = useCreateVehicle();
  const deleteVehicle = useDeleteVehicle();

  // Accommodations
  const { data: accommodations, isLoading: loadingAccommodations, refetch: refetchAccommodations } = useListAccommodations();
  const createAccommodation = useCreateAccommodation();
  const deleteAccommodation = useDeleteAccommodation();

  // Destinations
  const { data: destinations, isLoading: loadingDestinations, refetch: refetchDestinations } = useListDestinations();
  const createDestination = useCreateDestination();
  const deleteDestination = useDeleteDestination();

  const [isSupplierOpen, setIsSupplierOpen] = useState(false);
  const [isVehicleOpen, setIsVehicleOpen] = useState(false);
  const [isAccommodationOpen, setIsAccommodationOpen] = useState(false);
  const [isDestinationOpen, setIsDestinationOpen] = useState(false);

  const handleCreateSupplier = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createSupplier.mutateAsync({ data: {
      name: fd.get("name") as string,
      type: fd.get("type") as string,
      cnpj: fd.get("cnpj") as string || undefined,
      contactName: fd.get("contactName") as string || undefined,
      email: fd.get("email") as string || undefined,
      whatsapp: fd.get("whatsapp") as string || undefined,
      addressCity: fd.get("addressCity") as string || undefined,
      addressState: fd.get("addressState") as string || undefined,
    }});
    setIsSupplierOpen(false);
    refetchSuppliers();
  };

  const handleCreateVehicle = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createVehicle.mutateAsync({ data: {
      name: fd.get("name") as string,
      type: fd.get("type") as string,
      plate: fd.get("plate") as string,
      capacity: parseInt(fd.get("capacity") as string || "0"),
      model: fd.get("model") as string || undefined,
      year: parseInt(fd.get("year") as string || "0") || undefined,
      dailyRate: parseFloat(fd.get("dailyRate") as string || "0") || undefined,
    }});
    setIsVehicleOpen(false);
    refetchVehicles();
  };

  const handleCreateAccommodation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createAccommodation.mutateAsync({ data: {
      name: fd.get("name") as string,
      type: fd.get("type") as string,
      city: fd.get("city") as string || undefined,
      state: fd.get("state") as string || undefined,
      pricePerNight: parseFloat(fd.get("pricePerNight") as string || "0") || undefined,
      totalRooms: parseInt(fd.get("totalRooms") as string || "0") || undefined,
      contactName: fd.get("contactName") as string || undefined,
      phone: fd.get("phone") as string || undefined,
    }});
    setIsAccommodationOpen(false);
    refetchAccommodations();
  };

  const handleCreateDestination = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createDestination.mutateAsync({ data: {
      name: fd.get("name") as string,
      city: fd.get("city") as string,
      state: fd.get("state") as string,
      country: fd.get("country") as string || "Brasil",
      description: fd.get("description") as string || undefined,
      bestSeason: fd.get("bestSeason") as string || undefined,
    }});
    setIsDestinationOpen(false);
    refetchDestinations();
  };

  const LoadingRows = () => (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>)}
        </TableRow>
      ))}
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cadastros</h1>
        <p className="text-muted-foreground mt-1">Gerencie fornecedores, veículos, acomodações e destinos.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
          <TabsTrigger value="vehicles">Veículos</TabsTrigger>
          <TabsTrigger value="accommodations">Hospedagens</TabsTrigger>
          <TabsTrigger value="destinations">Destinos</TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{suppliers?.length ?? 0} fornecedores cadastrados</p>
            <Dialog open={isSupplierOpen} onOpenChange={setIsSupplierOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" /> Novo Fornecedor</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Cadastrar Fornecedor</DialogTitle></DialogHeader>
                <form onSubmit={handleCreateSupplier} className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2"><label className="text-sm font-medium">Nome</label><Input name="name" required /></div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tipo</label>
                      <Select name="type" defaultValue="transport">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="transport">Transporte</SelectItem>
                          <SelectItem value="accommodation">Hospedagem</SelectItem>
                          <SelectItem value="food">Alimentação</SelectItem>
                          <SelectItem value="guide">Guia</SelectItem>
                          <SelectItem value="other">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><label className="text-sm font-medium">CNPJ</label><Input name="cnpj" /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Contato</label><Input name="contactName" /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">E-mail</label><Input name="email" type="email" /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">WhatsApp</label><Input name="whatsapp" /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Cidade</label><Input name="addressCity" /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Estado (UF)</label><Input name="addressState" /></div>
                  </div>
                  <div className="flex justify-end"><Button type="submit" disabled={createSupplier.isPending}>{createSupplier.isPending ? "Salvando..." : "Salvar"}</Button></div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Contato</TableHead><TableHead>Cidade</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {loadingSuppliers ? <LoadingRows /> : !suppliers || suppliers.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum fornecedor cadastrado.</TableCell></TableRow>
                ) : suppliers.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.type}</TableCell>
                    <TableCell><p>{s.contactName || "—"}</p><p className="text-xs text-muted-foreground">{s.whatsapp}</p></TableCell>
                    <TableCell>{s.addressCity ? `${s.addressCity}/${s.addressState}` : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => deleteSupplier.mutateAsync({ id: s.id }).then(() => refetchSuppliers())}><Trash2 className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="vehicles" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{vehicles?.length ?? 0} veículos cadastrados</p>
            <Dialog open={isVehicleOpen} onOpenChange={setIsVehicleOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" /> Novo Veículo</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Cadastrar Veículo</DialogTitle></DialogHeader>
                <form onSubmit={handleCreateVehicle} className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2"><label className="text-sm font-medium">Nome</label><Input name="name" required placeholder="Ex: Ônibus Turismo" /></div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tipo</label>
                      <Select name="type" defaultValue="bus">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bus">Ônibus</SelectItem>
                          <SelectItem value="van">Van</SelectItem>
                          <SelectItem value="minibus">Micro-ônibus</SelectItem>
                          <SelectItem value="car">Carro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><label className="text-sm font-medium">Placa</label><Input name="plate" required /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Capacidade</label><Input name="capacity" type="number" required /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Modelo</label><Input name="model" /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Ano</label><Input name="year" type="number" /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Diária (R$)</label><Input name="dailyRate" type="number" step="0.01" /></div>
                  </div>
                  <div className="flex justify-end"><Button type="submit" disabled={createVehicle.isPending}>{createVehicle.isPending ? "Salvando..." : "Salvar"}</Button></div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Veículo</TableHead><TableHead>Placa</TableHead><TableHead>Capacidade</TableHead><TableHead>Diária</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {loadingVehicles ? <LoadingRows /> : !vehicles || vehicles.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum veículo cadastrado.</TableCell></TableRow>
                ) : vehicles.map(v => (
                  <TableRow key={v.id}>
                    <TableCell><p className="font-medium">{v.name}</p><p className="text-xs text-muted-foreground">{v.type} {v.model ? `- ${v.model}` : ""}</p></TableCell>
                    <TableCell><span className="font-mono">{v.plate}</span></TableCell>
                    <TableCell>{v.capacity} lugares</TableCell>
                    <TableCell>{v.dailyRate ? `R$ ${v.dailyRate.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => deleteVehicle.mutateAsync({ id: v.id }).then(() => refetchVehicles())}><Trash2 className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="accommodations" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{accommodations?.length ?? 0} hospedagens cadastradas</p>
            <Dialog open={isAccommodationOpen} onOpenChange={setIsAccommodationOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" /> Nova Hospedagem</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Cadastrar Hospedagem</DialogTitle></DialogHeader>
                <form onSubmit={handleCreateAccommodation} className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2"><label className="text-sm font-medium">Nome</label><Input name="name" required /></div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tipo</label>
                      <Select name="type" defaultValue="hotel">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hotel">Hotel</SelectItem>
                          <SelectItem value="pousada">Pousada</SelectItem>
                          <SelectItem value="hostel">Hostel</SelectItem>
                          <SelectItem value="resort">Resort</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><label className="text-sm font-medium">Cidade</label><Input name="city" /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Estado</label><Input name="state" /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Quartos</label><Input name="totalRooms" type="number" /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Diária (R$)</label><Input name="pricePerNight" type="number" step="0.01" /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Contato</label><Input name="contactName" /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Telefone</label><Input name="phone" /></div>
                  </div>
                  <div className="flex justify-end"><Button type="submit" disabled={createAccommodation.isPending}>{createAccommodation.isPending ? "Salvando..." : "Salvar"}</Button></div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Localização</TableHead><TableHead>Diária</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {loadingAccommodations ? <LoadingRows /> : !accommodations || accommodations.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma hospedagem cadastrada.</TableCell></TableRow>
                ) : accommodations.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>{a.type}</TableCell>
                    <TableCell>{a.city ? `${a.city}/${a.state}` : "—"}</TableCell>
                    <TableCell>{a.pricePerNight ? `R$ ${a.pricePerNight.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => deleteAccommodation.mutateAsync({ id: a.id }).then(() => refetchAccommodations())}><Trash2 className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="destinations" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{destinations?.length ?? 0} destinos cadastrados</p>
            <Dialog open={isDestinationOpen} onOpenChange={setIsDestinationOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" /> Novo Destino</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Cadastrar Destino</DialogTitle></DialogHeader>
                <form onSubmit={handleCreateDestination} className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2"><label className="text-sm font-medium">Nome do Destino</label><Input name="name" required /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Cidade</label><Input name="city" required /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Estado</label><Input name="state" required /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">País</label><Input name="country" defaultValue="Brasil" /></div>
                    <div className="space-y-2"><label className="text-sm font-medium">Melhor Época</label><Input name="bestSeason" placeholder="Ex: Outubro a Março" /></div>
                    <div className="space-y-2 col-span-2"><label className="text-sm font-medium">Descrição</label><Input name="description" /></div>
                  </div>
                  <div className="flex justify-end"><Button type="submit" disabled={createDestination.isPending}>{createDestination.isPending ? "Salvando..." : "Salvar"}</Button></div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Cidade</TableHead><TableHead>Estado</TableHead><TableHead>Melhor Época</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {loadingDestinations ? <LoadingRows /> : !destinations || destinations.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum destino cadastrado.</TableCell></TableRow>
                ) : destinations.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>{d.city}</TableCell>
                    <TableCell>{d.state}</TableCell>
                    <TableCell>{d.bestSeason || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => deleteDestination.mutateAsync({ id: d.id }).then(() => refetchDestinations())}><Trash2 className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
