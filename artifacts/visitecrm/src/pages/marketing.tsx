import { useState } from "react";
import {
  useListCoupons,
  useCreateCoupon,
  useUpdateCoupon,
  useDeleteCoupon,
} from "@workspace/api-client-react";
import { useListClients } from "@workspace/api-client-react";
import type { CreateCouponBodyType } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Tag,
  Trash2,
  Pencil,
  Cake,
  Ticket,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { Coupon } from "@workspace/api-client-react";

const MONTHS_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function birthdayMonth(dateStr: string): number {
  const parts = dateStr.split("-");
  return parts.length >= 2 ? parseInt(parts[1], 10) : 0;
}

function birthdayDay(dateStr: string): number {
  const parts = dateStr.split("-");
  return parts.length >= 3 ? parseInt(parts[2], 10) : 0;
}

export default function Marketing() {
  const [tab, setTab] = useState("coupons");
  const [isOpen, setIsOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [couponType, setCouponType] = useState<CreateCouponBodyType>("percentage");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  const { data: coupons, isLoading: loadingCoupons, refetch } = useListCoupons();
  const { data: clients } = useListClients({ limit: 500 });

  const createCoupon = useCreateCoupon();
  const updateCoupon = useUpdateCoupon();
  const deleteCoupon = useDeleteCoupon();

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = (fd.get("code") as string).toUpperCase();
    const value = fd.get("value") as string;
    const minOrderValue = (fd.get("minOrderValue") as string) || undefined;
    const maxUsesRaw = fd.get("maxUses") as string;
    const maxUses = maxUsesRaw ? parseInt(maxUsesRaw, 10) : undefined;
    const validFrom = (fd.get("validFrom") as string) || undefined;
    const validUntil = (fd.get("validUntil") as string) || undefined;
    if (editingCoupon) {
      await updateCoupon.mutateAsync({
        id: editingCoupon.id,
        data: {
          code,
          value,
          type: couponType,
          isActive: editingCoupon.isActive,
          minOrderValue,
          maxUses,
          validFrom,
          validUntil,
        },
      });
    } else {
      await createCoupon.mutateAsync({
        data: {
          code,
          type: couponType,
          value,
          minOrderValue,
          maxUses,
          isActive: true,
          validFrom,
          validUntil,
        },
      });
    }
    setIsOpen(false);
    setEditingCoupon(null);
    setCouponType("percentage");
    refetch();
  };

  const handleToggle = async (c: Coupon) => {
    await updateCoupon.mutateAsync({
      id: c.id,
      data: {
        code: c.code,
        value: c.value,
        type: c.type as CreateCouponBodyType,
        isActive: !c.isActive,
      },
    });
    refetch();
  };

  const handleDelete = async (id: string) => {
    await deleteCoupon.mutateAsync({ id });
    refetch();
  };

  const openEdit = (c: Coupon) => {
    setEditingCoupon(c);
    setCouponType(c.type as CreateCouponBodyType);
    setIsOpen(true);
  };

  const birthdayClients = (clients?.data ?? [])
    .filter((c) => c.birthDate && birthdayMonth(c.birthDate) === selectedMonth)
    .sort((a, b) => birthdayDay(a.birthDate!) - birthdayDay(b.birthDate!));

  const today = new Date();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketing</h1>
          <p className="text-muted-foreground mt-1">
            Cupons de desconto e calendário de aniversariantes.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="coupons">
            <Ticket className="w-4 h-4 mr-1.5" /> Cupons
          </TabsTrigger>
          <TabsTrigger value="birthdays">
            <Cake className="w-4 h-4 mr-1.5" /> Aniversariantes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="coupons" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Dialog
              open={isOpen}
              onOpenChange={(o) => {
                setIsOpen(o);
                if (!o) setEditingCoupon(null);
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" /> Novo Cupom
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    {editingCoupon ? "Editar Cupom" : "Criar Cupom"}
                  </DialogTitle>
                </DialogHeader>
                <form
                  key={editingCoupon?.id ?? "new"}
                  onSubmit={handleSave}
                  className="space-y-4 mt-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Código</label>
                      <Input
                        name="code"
                        required
                        placeholder="VERAO2025"
                        defaultValue={editingCoupon?.code ?? ""}
                        className="uppercase"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tipo</label>
                      <Select
                        value={couponType}
                        onValueChange={(v) =>
                          setCouponType(v as CreateCouponBodyType)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Percentual (%)</SelectItem>
                          <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {couponType === "percentage" ? "Desconto (%)" : "Desconto (R$)"}
                      </label>
                      <Input
                        name="value"
                        required
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={couponType === "percentage" ? "10" : "50"}
                        defaultValue={editingCoupon?.value ?? ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Pedido mínimo (R$)</label>
                      <Input
                        name="minOrderValue"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        defaultValue={editingCoupon?.minOrderValue ?? ""}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Usos máximos</label>
                      <Input
                        name="maxUses"
                        type="number"
                        min="1"
                        placeholder="Ilimitado"
                        defaultValue={editingCoupon?.maxUses ?? ""}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Válido de</label>
                      <Input
                        name="validFrom"
                        type="date"
                        defaultValue={editingCoupon?.validFrom?.split("T")[0] ?? ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Válido até</label>
                      <Input
                        name="validUntil"
                        type="date"
                        defaultValue={editingCoupon?.validUntil?.split("T")[0] ?? ""}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsOpen(false);
                        setEditingCoupon(null);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={createCoupon.isPending || updateCoupon.isPending}
                    >
                      {createCoupon.isPending || updateCoupon.isPending
                        ? "Salvando..."
                        : editingCoupon
                        ? "Salvar"
                        : "Criar Cupom"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 mb-2">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                    <Tag className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total de Cupons</p>
                    <p className="text-xl font-bold">{(coupons ?? []).length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 text-green-700">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ativos</p>
                    <p className="text-xl font-bold">
                      {(coupons ?? []).filter((c) => c.isActive).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-100 text-orange-700">
                    <Ticket className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Utilizações</p>
                    <p className="text-xl font-bold">
                      {(coupons ?? []).reduce((s, c) => s + c.usedCount, 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Desconto</TableHead>
                  <TableHead>Usos</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingCoupons ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (coupons ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-12 text-muted-foreground"
                    >
                      <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">Nenhum cupom cadastrado.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  (coupons ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <code className="font-mono font-semibold tracking-wider bg-muted px-2 py-0.5 rounded text-sm">
                          {c.code}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {c.type === "percentage" ? "Percentual" : "Valor Fixo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {c.type === "percentage"
                          ? `${c.value}%`
                          : `R$ ${parseFloat(c.value).toFixed(2)}`}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {c.usedCount}
                          {c.maxUses ? (
                            <span className="text-muted-foreground">/{c.maxUses}</span>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.validUntil
                          ? new Date(c.validUntil).toLocaleDateString("pt-BR")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={c.isActive}
                          onCheckedChange={() => handleToggle(c)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(c)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(c.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="birthdays" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cake className="w-4 h-4 text-pink-500" />
                Aniversariantes do Mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                {MONTHS_PT.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedMonth(i + 1)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selectedMonth === i + 1
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {birthdayClients.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Cake className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    Nenhum aniversariante em {MONTHS_PT[selectedMonth - 1]}.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {birthdayClients.map((c) => {
                    const day = birthdayDay(c.birthDate!);
                    const isToday =
                      selectedMonth === todayMonth && day === todayDay;
                    return (
                      <div
                        key={c.id}
                        className={`flex items-center gap-4 p-3 rounded-lg border ${
                          isToday ? "border-pink-300 bg-pink-50" : "bg-card"
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                            isToday
                              ? "bg-pink-500 text-white"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {day}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.email} • {c.whatsapp}
                          </p>
                        </div>
                        {isToday && (
                          <Badge className="bg-pink-100 text-pink-800 shrink-0">
                            Hoje!
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
