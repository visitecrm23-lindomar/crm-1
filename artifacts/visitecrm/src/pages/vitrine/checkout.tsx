import { useState } from "react";
import { useLocation } from "wouter";
import { publicStoreApi, PublicStore, CouponValidation } from "@/lib/storeApi";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, CheckCircle, Tag, X, ChevronLeft } from "lucide-react";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  boleto: "Boleto Bancário",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  transfer: "Transferência Bancária",
};

export default function VitrineCheckout({
  slug,
  store,
}: {
  slug: string;
  store: PublicStore;
}) {
  const [, navigate] = useLocation();
  const { items, total, clearCart } = useCart();
  const [step, setStep] = useState<"dados" | "pagamento" | "confirmado">("dados");
  const [loading, setLoading] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerCpf: "",
    notes: "",
    paymentMethod: store.paymentMethods[0] ?? "pix",
    couponCode: "",
  });

  const [couponResult, setCouponResult] = useState<CouponValidation | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  function set(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  const discount = couponResult?.valid ? (couponResult.discountAmount ?? 0) : 0;
  const finalTotal = Math.max(0, total - discount);

  async function validateCoupon() {
    if (!form.couponCode) return;
    setValidatingCoupon(true);
    try {
      const res = await publicStoreApi.validateCoupon(slug, form.couponCode, total);
      setCouponResult(res);
    } catch {
      setCouponResult({ valid: false, error: "Cupom inválido" });
    } finally {
      setValidatingCoupon(false);
    }
  }

  function removeCoupon() {
    setCouponResult(null);
    setForm((p) => ({ ...p, couponCode: "" }));
  }

  async function submit() {
    if (!form.customerName || !form.customerEmail) return;
    setLoading(true);
    try {
      const order = await publicStoreApi.createOrder(slug, {
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone || undefined,
        customerCpf: form.customerCpf || undefined,
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          variantLabel: i.variantLabel,
        })),
        couponCode: couponResult?.valid ? form.couponCode : undefined,
        paymentMethod: form.paymentMethod,
        notes: form.notes || undefined,
      });
      setOrderNumber(order.orderNumber);
      clearCart();
      setStep("confirmado");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao finalizar pedido");
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0 && step !== "confirmado") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-xl font-medium mb-4">Seu carrinho está vazio</p>
        <Button onClick={() => navigate(`/loja/${slug}/catalogo`)}>
          Ver Pacotes
        </Button>
      </div>
    );
  }

  if (step === "confirmado") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-12 h-12 text-green-500" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Pedido Confirmado!</h1>
        <p className="text-muted-foreground mb-2">
          Obrigado pela sua compra, {form.customerName}!
        </p>
        <p className="text-muted-foreground mb-6">
          Seu número de pedido é:{" "}
          <strong className="font-mono text-foreground">{orderNumber}</strong>
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          Você receberá uma confirmação no e-mail <strong>{form.customerEmail}</strong>.
          Nossa equipe entrará em contato em breve.
        </p>
        <div className="flex gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() =>
              navigate(`/loja/${slug}/pedido/${orderNumber}`)
            }
          >
            Acompanhar Pedido
          </Button>
          <Button
            onClick={() => navigate(`/loja/${slug}`)}
            style={{ backgroundColor: store.primaryColor }}
            className="text-white"
          >
            Voltar à Loja
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button
        onClick={() => navigate(`/loja/${slug}/catalogo`)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ChevronLeft className="w-4 h-4" />
        Continuar Comprando
      </button>

      <h1 className="text-2xl font-bold mb-6">Finalizar Pedido</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Seus Dados</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <Label>Nome Completo *</Label>
                <Input
                  value={form.customerName}
                  onChange={(e) => set("customerName", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>E-mail *</Label>
                <Input
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) => set("customerEmail", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Telefone / WhatsApp</Label>
                <Input
                  value={form.customerPhone}
                  onChange={(e) => set("customerPhone", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>CPF</Label>
                <Input
                  value={form.customerCpf}
                  onChange={(e) => set("customerCpf", e.target.value)}
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Observações</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Alguma informação importante?"
                />
              </div>
            </CardContent>
          </Card>

          {store.paymentMethods.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Forma de Pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {store.paymentMethods.map((m) => (
                    <button
                      key={m}
                      onClick={() => set("paymentMethod", m)}
                      className={`p-3 rounded-lg border text-sm font-medium text-left transition-colors ${
                        form.paymentMethod === m
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:bg-muted"
                      }`}
                    >
                      {PAYMENT_LABELS[m] ?? m}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Cupom de Desconto
              </CardTitle>
            </CardHeader>
            <CardContent>
              {couponResult?.valid ? (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                  <div className="flex-1">
                    <p className="font-mono font-bold text-green-700">{couponResult.code}</p>
                    <p className="text-xs text-green-600">
                      Desconto de R$ {(couponResult.discountAmount ?? 0).toFixed(2)} aplicado!
                    </p>
                  </div>
                  <button onClick={removeCoupon} className="text-green-600 hover:text-green-800">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={form.couponCode}
                      onChange={(e) => set("couponCode", e.target.value.toUpperCase())}
                      placeholder="SEUCUPOM"
                      className="font-mono uppercase"
                    />
                    <Button
                      variant="outline"
                      onClick={validateCoupon}
                      disabled={!form.couponCode || validatingCoupon}
                    >
                      {validatingCoupon ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Aplicar"
                      )}
                    </Button>
                  </div>
                  {couponResult && !couponResult.valid && (
                    <p className="text-xs text-red-500">{couponResult.error}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="text-base">Resumo do Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={`${item.productId}::${item.variantLabel}`}
                    className="flex justify-between text-sm"
                  >
                    <span className="line-clamp-2 flex-1 mr-2">
                      {item.productName}
                      {item.variantLabel && (
                        <span className="text-muted-foreground ml-1">
                          ({item.variantLabel})
                        </span>
                      )}
                      <span className="text-muted-foreground ml-1">x{item.quantity}</span>
                    </span>
                    <span className="shrink-0 font-medium">
                      R$ {(item.unitPrice * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t pt-2 space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>R$ {total.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Desconto ({couponResult?.code})</span>
                    <span>- R$ {discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2 mt-1">
                  <span>Total</span>
                  <span style={{ color: store.primaryColor }}>
                    R$ {finalTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <Button
                className="w-full h-11 text-white font-bold"
                style={{ backgroundColor: store.primaryColor }}
                onClick={submit}
                disabled={loading || !form.customerName || !form.customerEmail}
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Confirmar Pedido
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Ao confirmar, você concorda com os termos da loja.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
