import { useState, FormEvent, useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { publicStoreApi, PublicStore, StoreOrder } from "@/lib/storeApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Package, CheckCircle, Clock, XCircle } from "lucide-react";

const STATUS_INFO: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  pending: {
    label: "Aguardando Confirmação",
    icon: <Clock className="w-5 h-5" />,
    color: "text-yellow-600 bg-yellow-50 border-yellow-200",
  },
  confirmed: {
    label: "Confirmado",
    icon: <CheckCircle className="w-5 h-5" />,
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  processing: {
    label: "Em Processamento",
    icon: <Package className="w-5 h-5" />,
    color: "text-purple-600 bg-purple-50 border-purple-200",
  },
  completed: {
    label: "Concluído",
    icon: <CheckCircle className="w-5 h-5" />,
    color: "text-green-600 bg-green-50 border-green-200",
  },
  cancelled: {
    label: "Cancelado",
    icon: <XCircle className="w-5 h-5" />,
    color: "text-red-600 bg-red-50 border-red-200",
  },
};

export default function VitrineOrderTracking({
  slug,
  store,
  initialOrderNumber,
}: {
  slug: string;
  store: PublicStore;
  initialOrderNumber?: string;
}) {
  const [, navigate] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const { data: me } = useGetMe();
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber ?? "");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && me?.role === "cliente") {
      navigate("/perfil");
    } else if (!isSignedIn) {
      navigate("/sign-in?redirect_url=%2Fperfil");
    }
  }, [isLoaded, isSignedIn, me?.role]);

  async function searchByNumber(num: string, emailAddress: string) {
    const trimmed = num.trim().toUpperCase();
    const emailTrimmed = emailAddress.trim();
    if (!trimmed || !emailTrimmed) return;
    setLoading(true);
    setError(null);
    setOrder(null);
    try {
      const o = await publicStoreApi.getOrder(slug, trimmed, emailTrimmed);
      setOrder(o);
    } catch {
      setError("Pedido não encontrado. Verifique o número e o e-mail e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function search(e?: FormEvent) {
    e?.preventDefault();
    await searchByNumber(orderNumber, email);
  }

  const statusInfo = order
    ? STATUS_INFO[order.status] ?? {
        label: order.status,
        icon: <Package className="w-5 h-5" />,
        color: "text-gray-600 bg-gray-50 border-gray-200",
      }
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <Package className="w-14 h-14 mx-auto mb-4 text-muted-foreground/40" />
        <h1 className="text-3xl font-bold mb-2">Consultar Pedido</h1>
        <p className="text-muted-foreground">
          Informe o número do pedido e o e-mail usado na compra para acompanhar o status.
        </p>
      </div>

      <form onSubmit={search} className="space-y-3 mb-8">
        <Input
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
          placeholder="Número do pedido (Ex: #2024-12345)"
          className="font-mono"
        />
        <div className="flex gap-3">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail usado na compra"
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={loading || !orderNumber.trim() || !email.trim()}
            style={{ backgroundColor: store.primaryColor }}
            className="text-white"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>
      </form>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm text-center">
          {error}
        </div>
      )}

      {order && statusInfo && (
        <div className="space-y-4">
          <div className={`p-4 rounded-xl border flex items-center gap-3 ${statusInfo.color}`}>
            {statusInfo.icon}
            <div>
              <p className="font-bold">{statusInfo.label}</p>
              <p className="text-sm opacity-75">Pedido {order.orderNumber}</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações do Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Cliente</p>
                  <p className="font-medium">{order.customerName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">E-mail</p>
                  <p className="font-medium">{order.customerEmail}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Data</p>
                  <p className="font-medium">
                    {new Date(order.createdAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pagamento</p>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={order.paymentStatus === "paid" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {order.paymentStatus === "paid"
                        ? "Pago"
                        : order.paymentStatus === "pending"
                        ? "Aguardando"
                        : order.paymentStatus}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Itens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm py-2 border-b last:border-0">
                    <span>
                      {item.productName}
                      {item.variantLabel && (
                        <span className="text-muted-foreground ml-1">
                          ({item.variantLabel})
                        </span>
                      )}
                      <span className="text-muted-foreground ml-1">x{item.quantity}</span>
                    </span>
                    <span className="font-medium">
                      R$ {(item.unitPrice * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 mt-2 space-y-1">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span>R$ {parseFloat(order.subtotal).toFixed(2)}</span>
                </div>
                {parseFloat(order.discountAmount) > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Desconto</span>
                    <span>- R$ {parseFloat(order.discountAmount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
                  <span>Total</span>
                  <span style={{ color: store.primaryColor }}>
                    R$ {parseFloat(order.totalAmount).toFixed(2)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {(order.notes || order.customerNotes) && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Observações:</strong> {order.notes || order.customerNotes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
