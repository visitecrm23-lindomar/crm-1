import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { storeApi, StoreOrder } from "@/lib/storeApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, Loader2, Search, Eye, Package } from "lucide-react";

const ORDER_STATUSES = [
  { value: "pending", label: "Pendente", color: "bg-yellow-100 text-yellow-800" },
  { value: "confirmed", label: "Confirmado", color: "bg-blue-100 text-blue-800" },
  { value: "processing", label: "Em Processamento", color: "bg-purple-100 text-purple-800" },
  { value: "completed", label: "Concluído", color: "bg-green-100 text-green-800" },
  { value: "cancelled", label: "Cancelado", color: "bg-red-100 text-red-800" },
];

const PAYMENT_STATUSES = [
  { value: "pending", label: "Aguardando" },
  { value: "paid", label: "Pago" },
  { value: "refunded", label: "Reembolsado" },
  { value: "failed", label: "Falhou" },
];

function statusLabel(s: string) {
  return ORDER_STATUSES.find((x) => x.value === s)?.label ?? s;
}

function paymentLabel(s: string) {
  return PAYMENT_STATUSES.find((x) => x.value === s)?.label ?? s;
}

function statusColor(s: string) {
  return ORDER_STATUSES.find((x) => x.value === s)?.color ?? "bg-gray-100 text-gray-800";
}

function OrderDetail({ order, onClose, onUpdated }: { order: StoreOrder; onClose: () => void; onUpdated: (o: StoreOrder) => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(order.status);
  const [paymentStatus, setPaymentStatus] = useState(order.paymentStatus);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await storeApi.updateOrderStatus(order.id, status, paymentStatus);
      toast({ title: "Pedido atualizado!" });
      onUpdated(updated);
    } catch (err: unknown) {
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{order.customerName}</p>
            <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
            {order.customerPhone && (
              <p className="text-sm text-muted-foreground">{order.customerPhone}</p>
            )}
            {order.customerCpf && (
              <p className="text-sm text-muted-foreground">CPF: {order.customerCpf}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>R$ {parseFloat(order.subtotal).toFixed(2)}</span>
            </div>
            {parseFloat(order.discountAmount) > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Desconto {order.couponCode && `(${order.couponCode})`}</span>
                <span>- R$ {parseFloat(order.discountAmount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t pt-1 mt-1">
              <span>Total</span>
              <span>R$ {parseFloat(order.totalAmount).toFixed(2)}</span>
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              Pagamento: {order.paymentMethod ?? "Não informado"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Itens do Pedido</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                <div>
                  <span className="font-medium text-sm">{item.productName}</span>
                  {item.variantLabel && (
                    <span className="text-xs text-muted-foreground ml-2">({item.variantLabel})</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-2">x{item.quantity}</span>
                </div>
                <span className="text-sm font-medium">
                  R$ {(item.unitPrice * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Atualizar Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Status do Pedido</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Status do Pagamento</label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LojaPedidos() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<StoreOrder | null>(null);

  async function load() {
    setLoading(true);
    try {
      setOrders(await storeApi.getOrders());
    } catch (err: unknown) {
      toast({
        title: "Erro ao carregar pedidos",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = orders.filter((o) => {
    const matchSearch =
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.customerName.toLowerCase().includes(search.toLowerCase()) ||
      o.customerEmail.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    const orderDate = new Date(o.createdAt);
    const matchFrom = !dateFrom || orderDate >= new Date(dateFrom);
    const matchTo = !dateTo || orderDate <= new Date(dateTo + "T23:59:59");
    return matchSearch && matchStatus && matchFrom && matchTo;
  });

  const stats = {
    total: orders.length,
    revenue: orders
      .filter((o) => o.status !== "cancelled")
      .reduce((acc, o) => acc + parseFloat(o.totalAmount), 0),
    pending: orders.filter((o) => o.status === "pending").length,
    completed: orders.filter((o) => o.status === "completed").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <p className="text-muted-foreground text-sm mt-1">{orders.length} pedido(s) no total</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total de Pedidos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <div className="text-sm text-muted-foreground">Pendentes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <div className="text-sm text-muted-foreground">Concluídos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              R$ {stats.revenue.toFixed(2)}
            </div>
            <div className="text-sm text-muted-foreground">Receita Total</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por número, cliente ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {ORDER_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">De:</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">Até:</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40"
          />
        </div>
        {(dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="text-muted-foreground"
          >
            Limpar datas
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum pedido encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-16">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-sm font-medium">
                    {order.orderNumber}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{order.customerName}</div>
                    <div className="text-xs text-muted-foreground">{order.customerEmail}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      {order.items.length} item(s)
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    R$ {parseFloat(order.totalAmount).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(order.status)}`}
                    >
                      {statusLabel(order.status)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={order.paymentStatus === "paid" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {paymentLabel(order.paymentStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setSelected(order)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pedido {selected?.orderNumber}</DialogTitle>
          </DialogHeader>
          {selected && (
            <OrderDetail
              order={selected}
              onClose={() => setSelected(null)}
              onUpdated={(updated) => {
                setOrders((o) => o.map((x) => (x.id === updated.id ? updated : x)));
                setSelected(updated);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
