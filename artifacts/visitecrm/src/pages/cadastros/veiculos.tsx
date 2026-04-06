import { useState } from "react";
import {
  useListVehicles,
  useCreateVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
  useListTrips,
} from "@workspace/api-client-react";
import type { Vehicle, CreateVehicleBody, UpdateVehicleBody } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Bus, Eye } from "lucide-react";

const VEHICLE_TYPES = ["Ônibus", "Micro-ônibus", "Van", "Carro", "Barco", "Avião", "Outro"];
const AMENITY_OPTIONS = [
  "Ar-condicionado",
  "Wi-Fi",
  "TV",
  "Frigobar",
  "Banheiro",
  "Tomada USB",
  "Reclinável",
];
const STATUS_OPTIONS = ["active", "inactive", "maintenance"];
const statusLabel: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  maintenance: "Manutenção",
};

function fmtCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function VehicleDetailModal({
  vehicle,
  open,
  onClose,
}: {
  vehicle: Vehicle | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: tripsData } = useListTrips({ limit: 200 });
  const allTrips = tripsData?.data ?? [];
  const linkedTrips = allTrips.filter((t) => t.vehiclePlate === vehicle?.plate);

  if (!vehicle) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vehicle.name}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="info">
          <TabsList className="mb-4">
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="trips">
              Viagens vinculadas {linkedTrips.length > 0 && `(${linkedTrips.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Placa</p>
                <p className="font-medium font-mono">{vehicle.plate}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Tipo</p>
                <p className="font-medium">{vehicle.type}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Modelo/Ano</p>
                <p className="font-medium">
                  {vehicle.model ? `${vehicle.model}${vehicle.year ? ` (${vehicle.year})` : ""}` : "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Capacidade</p>
                <p className="font-medium">{vehicle.capacity} lugares</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Diária</p>
                <p className="font-medium">{fmtCurrency(vehicle.dailyRate)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Status</p>
                <Badge
                  variant={
                    vehicle.status === "active"
                      ? "default"
                      : vehicle.status === "maintenance"
                      ? "secondary"
                      : "outline"
                  }
                >
                  {statusLabel[vehicle.status] ?? vehicle.status}
                </Badge>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs mb-1">Comodidades</p>
                <div className="flex flex-wrap gap-1">
                  {(vehicle.amenities ?? []).map((a) => (
                    <Badge key={a} variant="outline" className="text-xs">
                      {a}
                    </Badge>
                  ))}
                  {(vehicle.amenities ?? []).length === 0 && (
                    <span className="text-muted-foreground text-xs">Nenhuma</span>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="trips">
            {linkedTrips.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Nenhuma viagem vinculada a este veículo (placa: {vehicle.plate})
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Viagem</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Partida</TableHead>
                      <TableHead>Assentos</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedTrips.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium text-sm">{t.name}</TableCell>
                        <TableCell className="text-sm">
                          {t.destinationCity}/{t.destinationState}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(t.departureDate).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {t.reservedSeats}/{t.totalCapacity}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              t.status === "confirmed"
                                ? "default"
                                : t.status === "cancelled"
                                ? "destructive"
                                : "secondary"
                            }
                            className="text-xs"
                          >
                            {t.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Veiculos() {
  const { toast } = useToast();
  const { data: vehicles = [], refetch } = useListVehicles();
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const deleteVehicle = useDeleteVehicle();

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<Partial<CreateVehicleBody & UpdateVehicleBody>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [amenitiesInput, setAmenitiesInput] = useState<string[]>([]);
  const [viewVehicle, setViewVehicle] = useState<Vehicle | null>(null);

  const filtered = vehicles.filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.plate.toLowerCase().includes(search.toLowerCase()) ||
      v.type.toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() {
    setEditing(null);
    setForm({ amenities: [] });
    setAmenitiesInput([]);
    setModalOpen(true);
  }

  function openEdit(v: Vehicle) {
    setEditing(v);
    setForm({
      name: v.name,
      capacity: v.capacity,
      dailyRate: v.dailyRate ?? undefined,
      status: v.status,
    });
    setAmenitiesInput(v.amenities ?? []);
    setModalOpen(true);
  }

  function toggleAmenity(a: string) {
    setAmenitiesInput((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
  }

  async function handleSave() {
    try {
      if (editing) {
        const body: UpdateVehicleBody = {
          name: form.name ?? undefined,
          capacity: form.capacity ?? undefined,
          dailyRate: form.dailyRate ?? undefined,
          status: (form as UpdateVehicleBody).status ?? undefined,
        };
        await updateVehicle.mutateAsync({ id: editing.id, data: body });
        toast({ title: "Veículo atualizado" });
      } else {
        const body: CreateVehicleBody = {
          name: form.name!,
          type: (form as CreateVehicleBody).type!,
          plate: (form as CreateVehicleBody).plate!,
          capacity: form.capacity!,
          model: (form as CreateVehicleBody).model ?? undefined,
          year: (form as CreateVehicleBody).year ?? undefined,
          dailyRate: form.dailyRate ?? undefined,
          amenities: amenitiesInput,
        };
        if (!body.name || !body.type || !body.plate || !body.capacity) {
          toast({ title: "Preencha nome, tipo, placa e capacidade", variant: "destructive" });
          return;
        }
        await createVehicle.mutateAsync({ data: body });
        toast({ title: "Veículo criado" });
      }
      setModalOpen(false);
      refetch();
    } catch {
      toast({ title: "Erro ao salvar veículo", variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteVehicle.mutateAsync({ id });
      toast({ title: "Veículo excluído" });
      setDeleteId(null);
      refetch();
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Veículos</h1>
          <p className="text-sm text-muted-foreground">{vehicles.length} veículo(s) cadastrado(s)</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Veículo
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, placa, tipo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Capacidade</TableHead>
              <TableHead>Modelo/Ano</TableHead>
              <TableHead>Diária</TableHead>
              <TableHead>Comodidades</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  <Bus className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Nenhum veículo encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell>{v.type}</TableCell>
                  <TableCell className="font-mono">{v.plate}</TableCell>
                  <TableCell>{v.capacity} lugares</TableCell>
                  <TableCell>
                    {v.model ? `${v.model}${v.year ? ` (${v.year})` : ""}` : "—"}
                  </TableCell>
                  <TableCell>{fmtCurrency(v.dailyRate)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(v.amenities ?? []).slice(0, 3).map((a) => (
                        <Badge key={a} variant="outline" className="text-xs">
                          {a}
                        </Badge>
                      ))}
                      {(v.amenities ?? []).length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{v.amenities.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        v.status === "active"
                          ? "default"
                          : v.status === "maintenance"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {statusLabel[v.status] ?? v.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setViewVehicle(v)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(v)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(v.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail modal */}
      <VehicleDetailModal
        vehicle={viewVehicle}
        open={!!viewVehicle}
        onClose={() => setViewVehicle(null)}
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Veículo" : "Novo Veículo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Nome *</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              {!editing && (
                <>
                  <div className="space-y-1">
                    <Label>Tipo *</Label>
                    <Select
                      value={(form as CreateVehicleBody).type ?? ""}
                      onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {VEHICLE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Placa *</Label>
                    <Input
                      value={(form as CreateVehicleBody).plate ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))
                      }
                      className="uppercase"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Modelo</Label>
                    <Input
                      value={(form as CreateVehicleBody).model ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Ano</Label>
                    <Input
                      type="number"
                      value={(form as CreateVehicleBody).year ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, year: Number(e.target.value) || undefined }))
                      }
                      min={1990}
                      max={new Date().getFullYear() + 1}
                    />
                  </div>
                </>
              )}
              <div className="space-y-1">
                <Label>Capacidade *</Label>
                <Input
                  type="number"
                  value={form.capacity ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, capacity: Number(e.target.value) }))
                  }
                  min={1}
                />
              </div>
              <div className="space-y-1">
                <Label>Diária (R$)</Label>
                <Input
                  type="number"
                  value={form.dailyRate ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dailyRate: Number(e.target.value) || undefined }))
                  }
                  min={0}
                  step={0.01}
                />
              </div>
              {editing && (
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select
                    value={(form as UpdateVehicleBody).status ?? "active"}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!editing && (
                <div className="col-span-2 space-y-2">
                  <Label>Comodidades</Label>
                  <div className="flex flex-wrap gap-2">
                    {AMENITY_OPTIONS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => toggleAmenity(a)}
                        className={`px-2 py-1 rounded text-xs border transition-colors ${
                          amenitiesInput.includes(a)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:border-primary"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={createVehicle.isPending || updateVehicle.isPending}>
              {editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Veículo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir este veículo?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={deleteVehicle.isPending}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
