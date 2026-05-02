import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { publicStoreApi, PublicStore, CouponValidation, ReferralValidation } from "@/lib/storeApi";
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
import {
  Loader2,
  CheckCircle,
  Tag,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  ShoppingBag,
  CreditCard,
  PartyPopper,
  Copy,
  Check,
} from "lucide-react";
const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  bank_transfer: "Transferência Bancária",
  transfer: "Transferência Bancária",
  cash: "Dinheiro",
  boleto: "Boleto Bancário",
  installment: "Parcelado",
};

type Step = "dados" | "revisao" | "pagamento" | "confirmado";

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "dados", label: "Dados", icon: <User className="w-4 h-4" /> },
  { key: "revisao", label: "Revisão", icon: <ShoppingBag className="w-4 h-4" /> },
  { key: "pagamento", label: "Pagamento", icon: <CreditCard className="w-4 h-4" /> },
  { key: "confirmado", label: "Confirmação", icon: <PartyPopper className="w-4 h-4" /> },
];

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  done
                    ? "bg-green-500 text-white"
                    : active
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <Check className="w-4 h-4" /> : step.icon}
              </div>
              <span
                className={`text-xs mt-1 hidden sm:block ${
                  active ? "font-semibold text-primary" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-10 sm:w-16 mx-1 ${done ? "bg-green-500" : "bg-muted"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PixPayment({ store }: { store: PublicStore }) {
  const [copied, setCopied] = useState(false);
  const pixKey =
    store.contactWhatsapp?.replace(/\D/g, "") ??
    store.contactEmail ??
    "contato@agencia.com.br";

  function copy() {
    navigator.clipboard.writeText(pixKey).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Use o aplicativo do seu banco para realizar o pagamento via PIX.
      </p>
      <div className="bg-muted rounded-xl p-6 text-center space-y-3">
        <div className="w-32 h-32 mx-auto bg-white rounded-lg border-4 border-primary/20 flex items-center justify-center">
          <div className="text-xs text-muted-foreground leading-tight">
            QR Code PIX<br />
            <span className="text-primary font-bold">{store.name}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">ou copie a chave PIX abaixo:</p>
        <div className="flex items-center gap-2 bg-white rounded-lg border px-3 py-2">
          <code className="flex-1 text-sm font-mono truncate">{pixKey}</code>
          <button
            onClick={copy}
            className="text-primary hover:text-primary/80 shrink-0"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Após o pagamento, nossa equipe confirmará seu pedido em até 24h.
      </p>
    </div>
  );
}

function BoletoPayment() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Após confirmar o pedido, você receberá o boleto por e-mail.
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-sm">
        <p className="font-semibold text-amber-800">Instruções:</p>
        <ul className="list-disc list-inside space-y-1 text-amber-700">
          <li>O boleto tem vencimento em 3 dias úteis</li>
          <li>Pode ser pago em qualquer banco, lotérica ou internet banking</li>
          <li>Após o pagamento, aguarde até 2 dias úteis para a compensação</li>
          <li>Seu pedido será confirmado após a identificação do pagamento</li>
        </ul>
      </div>
    </div>
  );
}

function CardPayment({
  form,
  set,
}: {
  form: {
    cardNumber: string;
    cardName: string;
    cardExpiry: string;
    cardCvv: string;
    installments: string;
  };
  set: (field: string, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Preencha os dados do seu cartão. Seus dados são protegidos com criptografia.
      </p>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Número do Cartão</Label>
          <Input
            value={form.cardNumber}
            onChange={(e) =>
              set(
                "cardNumber",
                e.target.value
                  .replace(/\D/g, "")
                  .replace(/(\d{4})/g, "$1 ")
                  .trim()
                  .slice(0, 19)
              )
            }
            placeholder="0000 0000 0000 0000"
            className="font-mono"
            maxLength={19}
          />
        </div>
        <div className="space-y-1">
          <Label>Nome no Cartão</Label>
          <Input
            value={form.cardName}
            onChange={(e) => set("cardName", e.target.value.toUpperCase())}
            placeholder="NOME COMO NO CARTÃO"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Validade</Label>
            <Input
              value={form.cardExpiry}
              onChange={(e) =>
                set(
                  "cardExpiry",
                  e.target.value
                    .replace(/\D/g, "")
                    .replace(/(\d{2})(\d)/, "$1/$2")
                    .slice(0, 5)
                )
              }
              placeholder="MM/AA"
              maxLength={5}
            />
          </div>
          <div className="space-y-1">
            <Label>CVV</Label>
            <Input
              value={form.cardCvv}
              onChange={(e) =>
                set("cardCvv", e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="000"
              maxLength={4}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Parcelamento</Label>
          <select
            value={form.installments}
            onChange={(e) => set("installments", e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {[1, 2, 3, 6, 12].map((n) => (
              <option key={n} value={String(n)}>
                {n}x sem juros
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        🔒 Dados protegidos com SSL. Não armazenamos informações do cartão.
      </p>
    </div>
  );
}

export default function VitrineCheckout({
  slug,
  store,
}: {
  slug: string;
  store: PublicStore;
}) {
  const [, navigate] = useLocation();
  const { items, total, clearCart } = useCart();
  const [step, setStep] = useState<Step>("dados");
  const [loading, setLoading] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  const [form, setFormState] = useState(() => {
    const savedCode = localStorage.getItem("referral_code") ?? "";
    return {
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      customerCpf: "",
      notes: "",
      paymentMethod: (store.paymentMethods ?? [])[0] ?? "pix",
      couponCode: "",
      referralCode: savedCode,
      cardNumber: "",
      cardName: "",
      cardExpiry: "",
      cardCvv: "",
      installments: "1",
    };
  });

  const [couponResult, setCouponResult] = useState<CouponValidation | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [referralResult, setReferralResult] = useState<ReferralValidation | null>(null);
  const [validatingReferral, setValidatingReferral] = useState(false);

  // Auto-validate referral code from localStorage on mount
  useEffect(() => {
    const savedCode = localStorage.getItem("referral_code");
    if (savedCode && !referralResult) {
      publicStoreApi.validateReferral(slug, savedCode).then((res) => {
        if (res.valid) setReferralResult(res);
      }).catch(() => {
        // Silently fail — user can still enter it manually
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(field: string, value: string) {
    setFormState((p) => ({ ...p, [field]: value }));
  }

  const referralDiscountPct = referralResult?.discountPercent ?? 5;
  const couponDiscount = couponResult?.valid ? Number(couponResult.discountAmount ?? 0) : 0;
  const referralDiscount = referralResult?.valid && !couponResult?.valid ? total * (referralDiscountPct / 100) : 0;
  const discount = couponDiscount + referralDiscount;
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
    setFormState((p) => ({ ...p, couponCode: "" }));
  }

  async function validateReferral() {
    if (!form.referralCode) return;
    setValidatingReferral(true);
    try {
      const res = await publicStoreApi.validateReferral(slug, form.referralCode);
      setReferralResult(res);
    } catch {
      setReferralResult({ valid: false, error: "Código de indicação inválido" });
    } finally {
      setValidatingReferral(false);
    }
  }

  function removeReferral() {
    setReferralResult(null);
    setFormState((p) => ({ ...p, referralCode: "" }));
  }

  function canGoNextFromDados() {
    return !!form.customerName && !!form.customerEmail;
  }

  async function submit() {
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
        referralCode: referralResult?.valid && !couponResult?.valid ? form.referralCode : undefined,
        referralCookieId: referralResult?.valid && !couponResult?.valid
          ? (localStorage.getItem("referral_server_cookie_id") ?? undefined)
          : undefined,
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
        <Button onClick={() => navigate(`/loja/${slug}/produtos`)}>Ver Pacotes</Button>
      </div>
    );
  }

  if (step === "confirmado") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <StepIndicator current="confirmado" />
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-12 h-12 text-green-500" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Pedido Confirmado!</h1>
        <p className="text-muted-foreground mb-2">
          Obrigado pela sua compra, {form.customerName}!
        </p>
        <p className="text-muted-foreground mb-2">
          Seu número de pedido é:{" "}
          <strong className="font-mono text-foreground">{orderNumber}</strong>
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          Você receberá uma confirmação no e-mail <strong>{form.customerEmail}</strong>.
          Nossa equipe entrará em contato em breve.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Button
            variant="outline"
            onClick={() => navigate(`/loja/${slug}/pedido/${encodeURIComponent(orderNumber ?? "")}`)}
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

  const OrderSummary = () => (
    <Card className="sticky top-20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Resumo do Pedido</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={`${item.productId}::${item.variantLabel}`}
              className="flex justify-between text-sm"
            >
              <span className="line-clamp-2 flex-1 mr-2">
                {item.productName}
                {item.variantLabel && (
                  <span className="text-muted-foreground ml-1">({item.variantLabel})</span>
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
          {couponDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Cupom ({couponResult?.code})</span>
              <span>- R$ {couponDiscount.toFixed(2)}</span>
            </div>
          )}
          {referralDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Indicação ({referralResult?.code}) −{referralDiscountPct}%</span>
              <span>- R$ {referralDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg border-t pt-2 mt-1">
            <span>Total</span>
            <span style={{ color: store.primaryColor }}>R$ {finalTotal.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const effectivePaymentMethods = (store.paymentMethods ?? []).length > 0
    ? (store.paymentMethods ?? [])
    : ["pix"];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button
        onClick={() => {
          if (step === "dados") navigate(`/loja/${slug}/produtos`);
          else if (step === "revisao") setStep("dados");
          else if (step === "pagamento") setStep("revisao");
        }}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ChevronLeft className="w-4 h-4" />
        {step === "dados" ? "Continuar Comprando" : "Voltar"}
      </button>

      <h1 className="text-2xl font-bold mb-6">Finalizar Pedido</h1>
      <StepIndicator current={step} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {step === "dados" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="w-4 h-4" /> Seus Dados
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2">
                    <Label>
                      Nome Completo <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={form.customerName}
                      onChange={(e) => set("customerName", e.target.value)}
                      placeholder="Seu nome completo"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>
                      E-mail <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="email"
                      value={form.customerEmail}
                      onChange={(e) => set("customerEmail", e.target.value)}
                      placeholder="seu@email.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Telefone / WhatsApp</Label>
                    <Input
                      value={form.customerPhone}
                      onChange={(e) => set("customerPhone", e.target.value)}
                      placeholder="(11) 99999-9999"
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

              <Button
                className="w-full h-11 text-white font-bold"
                style={{ backgroundColor: store.primaryColor }}
                disabled={!canGoNextFromDados()}
                onClick={() => setStep("revisao")}
              >
                Continuar
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </>
          )}

          {step === "revisao" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4" /> Revisão dos Itens
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {items.map((item) => (
                      <div
                        key={`${item.productId}::${item.variantLabel}`}
                        className="flex gap-3 py-2 border-b last:border-0"
                      >
                        {item.image && (
                          <img
                            src={item.image}
                            alt={item.productName}
                            className="w-14 h-14 object-cover rounded-lg shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm line-clamp-2">{item.productName}</p>
                          {item.variantLabel && (
                            <p className="text-xs text-muted-foreground">{item.variantLabel}</p>
                          )}
                          <p className="text-xs text-muted-foreground">Qtd: {item.quantity}</p>
                        </div>
                        <p className="font-semibold text-sm shrink-0">
                          R$ {(item.unitPrice * item.quantity).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Tag className="w-4 h-4" /> Cupom de Desconto
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="w-4 h-4" /> Código de Indicação
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {referralResult?.valid ? (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                      <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                      <div className="flex-1">
                        <p className="font-mono font-bold text-green-700">{referralResult.code}</p>
                        <p className="text-xs text-green-600">
                          {couponResult?.valid
                            ? "Desconto de indicação não aplicável junto com cupom"
                            : "Desconto de 5% por indicação aplicado!"}
                        </p>
                      </div>
                      <button onClick={removeReferral} className="text-green-600 hover:text-green-800">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={form.referralCode}
                          onChange={(e) => set("referralCode", e.target.value.toUpperCase())}
                          placeholder="Código de quem te indicou"
                          className="font-mono uppercase"
                        />
                        <Button
                          variant="outline"
                          onClick={validateReferral}
                          disabled={!form.referralCode || validatingReferral}
                        >
                          {validatingReferral ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Aplicar"
                          )}
                        </Button>
                      </div>
                      {referralResult && !referralResult.valid && (
                        <p className="text-xs text-red-500">{referralResult.error}</p>
                      )}
                      <p className="text-xs text-muted-foreground">Se alguém te indicou, insira o código deles para ganhar 5% de desconto.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button
                className="w-full h-11 text-white font-bold"
                style={{ backgroundColor: store.primaryColor }}
                onClick={() => setStep("pagamento")}
              >
                Ir para Pagamento
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </>
          )}

          {step === "pagamento" && (
            <>
              <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CreditCard className="w-4 h-4" /> Forma de Pagamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      {effectivePaymentMethods.map((m) => (
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

                    <div className="mt-4 pt-4 border-t">
                      {form.paymentMethod === "pix" && <PixPayment store={store} />}
                      {form.paymentMethod === "boleto" && <BoletoPayment />}
                      {(form.paymentMethod === "credit_card" ||
                        form.paymentMethod === "debit_card") && (
                        <CardPayment
                          form={{
                            cardNumber: form.cardNumber,
                            cardName: form.cardName,
                            cardExpiry: form.cardExpiry,
                            cardCvv: form.cardCvv,
                            installments: form.installments,
                          }}
                          set={set}
                        />
                      )}
                      {form.paymentMethod === "transfer" && (
                        <div className="text-sm text-muted-foreground space-y-2">
                          <p>Realize uma transferência bancária para:</p>
                          <div className="bg-muted rounded-lg p-3 space-y-1 text-sm font-mono">
                            <p>Banco: 001 – Banco do Brasil</p>
                            <p>Agência: 0001-1</p>
                            <p>Conta: 12345-6</p>
                            <p>Titular: {store.name}</p>
                          </div>
                          <p className="text-xs">
                            Envie o comprovante para{" "}
                            <strong>{store.contactEmail ?? store.contactWhatsapp}</strong>
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

              <Button
                className="w-full h-11 text-white font-bold"
                style={{ backgroundColor: store.primaryColor }}
                onClick={submit}
                disabled={loading}
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Confirmar Pedido
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Ao confirmar, você concorda com os termos da loja.
              </p>
            </>
          )}
        </div>

        <div>
          <OrderSummary />
        </div>
      </div>
    </div>
  );
}
