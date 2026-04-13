import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { publicStoreApi, PublicStore, StoreProduct, CouponValidation } from "@/lib/storeApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  User,
  ClipboardList,
  Armchair,
  CreditCard,
  Ticket,
  MapPin,
  Calendar,
  Clock,
  Users,
  Tag,
  X,
  Copy,
  Check,
  Printer,
  Search,
  Bus,
  AlertTriangle,
} from "lucide-react";

type Step = "dados" | "revisao" | "assento" | "pagamento" | "confirmado";

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "dados", label: "Dados", icon: <User className="w-4 h-4" /> },
  { key: "revisao", label: "Revisão", icon: <ClipboardList className="w-4 h-4" /> },
  { key: "assento", label: "Assento", icon: <Armchair className="w-4 h-4" /> },
  { key: "pagamento", label: "Pagamento", icon: <CreditCard className="w-4 h-4" /> },
  { key: "confirmado", label: "Confirmação", icon: <Ticket className="w-4 h-4" /> },
];

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  boleto: "Boleto Bancário",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  transfer: "Transferência Bancária",
};

function fmtDate(d?: string | null) {
  if (!d) return null;
  const clean = d.length <= 10 ? d + "T12:00:00" : d;
  return new Date(clean).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center justify-center mb-8 print:hidden">
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
                className={`h-0.5 w-8 sm:w-12 mx-1 ${done ? "bg-green-500" : "bg-muted"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProductCard({ product, store }: { product: StoreProduct; store: PublicStore }) {
  const images = product.images ?? [];
  const startDate = product.departureDate ?? product.startDate;
  return (
    <div className="flex gap-4 p-4 border rounded-xl bg-muted/30">
      <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-muted flex items-center justify-center">
        {images[0] ? (
          <img src={images[0]} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <Bus className="w-8 h-8 text-muted-foreground/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm leading-tight mb-1 line-clamp-2">{product.name}</p>
        {product.destination && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <MapPin className="w-3 h-3 shrink-0" />
            {product.destination}
          </p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {startDate && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {fmtDate(startDate)}
            </p>
          )}
          {product.durationDays && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {product.durationDays}d{product.durationNights ? ` / ${product.durationNights}n` : ""}
            </p>
          )}
        </div>
        <p
          className="text-base font-bold mt-1"
          style={{ color: store.primaryColor }}
        >
          R$ {parseFloat(product.salePrice ?? product.price).toFixed(2)}
          <span className="text-xs font-normal text-muted-foreground ml-1">/ pessoa</span>
        </p>
      </div>
    </div>
  );
}

function PixPayment({ store }: { store: PublicStore }) {
  const [copied, setCopied] = useState(false);
  const pixKey =
    store.contactWhatsapp?.replace(/\D/g, "") ?? store.contactEmail ?? "contato@agencia.com.br";
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
          <div className="text-xs text-muted-foreground leading-tight text-center">
            QR Code PIX
            <br />
            <span className="text-primary font-bold">{store.name}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">ou copie a chave PIX abaixo:</p>
        <div className="flex items-center gap-2 bg-white rounded-lg border px-3 py-2">
          <code className="flex-1 text-sm font-mono truncate">{pixKey}</code>
          <button onClick={copy} className="text-primary hover:text-primary/80 shrink-0">
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Após o pagamento, nossa equipe confirmará sua reserva em até 24h.
      </p>
    </div>
  );
}

function BoletoPayment() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Após confirmar a reserva, você receberá o boleto por e-mail.
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-sm">
        <p className="font-semibold text-amber-800">Instruções:</p>
        <ul className="list-disc list-inside space-y-1 text-amber-700">
          <li>O boleto tem vencimento em 3 dias úteis</li>
          <li>Pode ser pago em qualquer banco, lotérica ou internet banking</li>
          <li>Após o pagamento, aguarde até 2 dias úteis para a compensação</li>
          <li>Sua reserva será confirmada após a identificação do pagamento</li>
        </ul>
      </div>
    </div>
  );
}

function CardPayment({
  form,
  set,
}: {
  form: { cardNumber: string; cardName: string; cardExpiry: string; cardCvv: string; installments: string };
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
              set("cardNumber", e.target.value.replace(/\D/g, "").replace(/(\d{4})/g, "$1 ").trim().slice(0, 19))
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
                set("cardExpiry", e.target.value.replace(/\D/g, "").replace(/(\d{2})(\d)/, "$1/$2").slice(0, 5))
              }
              placeholder="MM/AA"
              maxLength={5}
            />
          </div>
          <div className="space-y-1">
            <Label>CVV</Label>
            <Input
              value={form.cardCvv}
              onChange={(e) => set("cardCvv", e.target.value.replace(/\D/g, "").slice(0, 4))}
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

function SeatGrid({
  totalCapacity,
  occupiedSeats,
  qty,
  selected,
  onToggle,
  accentColor,
}: {
  totalCapacity: number;
  occupiedSeats: number[];
  qty: number;
  selected: number[];
  onToggle: (n: number) => void;
  accentColor?: string;
}) {
  const accent = accentColor || "#f97316";
  const availableCount = totalCapacity - occupiedSeats.length;
  const rowCount = Math.ceil(totalCapacity / 4);

  function SeatBtn({ seatNum }: { seatNum: number }) {
    const isOccupied = occupiedSeats.includes(seatNum);
    const isSelected = selected.includes(seatNum);
    const canSelect = !isOccupied && (isSelected || selected.length < qty);
    let style: React.CSSProperties = {};
    let cls =
      "w-9 h-9 sm:w-10 sm:h-10 rounded-lg border-2 flex items-center justify-center text-xs font-bold transition-all select-none ";
    if (isOccupied) {
      cls += "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed";
    } else if (isSelected) {
      cls += "border-transparent text-white cursor-pointer";
      style = { backgroundColor: accent, borderColor: accent };
    } else if (canSelect) {
      cls += "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 cursor-pointer";
    } else {
      cls += "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed";
    }
    return (
      <button
        onClick={() => canSelect && onToggle(seatNum)}
        disabled={isOccupied}
        title={isOccupied ? `Assento ${seatNum} — Ocupado` : `Assento ${seatNum}`}
        className={cls}
        style={style}
      >
        {seatNum}
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/70">Layout: 2×2 Padrão</span>
        <span>
          <strong className="text-foreground">{availableCount}</strong> disponíveis &middot; {totalCapacity} total
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded border-2 border-gray-300 bg-white inline-block" />
          Disponível
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded border-2 border-gray-200 bg-gray-100 inline-block" />
          Ocupado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded inline-block" style={{ backgroundColor: accent }} />
          Selecionado
        </span>
      </div>

      <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-gray-800 text-white text-xs font-bold py-2.5 text-center tracking-[0.15em]">
          FRENTE DO ÔNIBUS
        </div>
        <div className="bg-gray-50 p-3 space-y-2">
          {Array.from({ length: rowCount }, (_, rowIdx) => {
            const s1 = rowIdx * 4 + 1;
            const s2 = rowIdx * 4 + 2;
            const s3 = rowIdx * 4 + 3;
            const s4 = rowIdx * 4 + 4;
            return (
              <div key={rowIdx} className="flex items-center justify-center gap-1">
                <div className="flex gap-1">
                  {s1 <= totalCapacity && <SeatBtn seatNum={s1} />}
                  {s2 <= totalCapacity && <SeatBtn seatNum={s2} />}
                </div>
                <div className="w-6 flex items-center justify-center text-gray-300 text-sm font-light select-none">
                  |
                </div>
                <div className="flex gap-1">
                  {s3 <= totalCapacity && <SeatBtn seatNum={s3} />}
                  {s4 <= totalCapacity && <SeatBtn seatNum={s4} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-3">
        Selecione exatamente {qty} assento{qty !== 1 ? "s" : ""} para continuar
        {" "}({selected.length}/{qty} selecionado{qty !== 1 ? "s" : ""})
      </p>
    </div>
  );
}

function Voucher({
  order,
  product,
  store,
  customerName,
  seats,
  paymentMethod,
}: {
  order: { orderNumber: string; totalAmount: string; createdAt: string };
  product: StoreProduct;
  store: PublicStore;
  customerName: string;
  seats: number[];
  paymentMethod: string;
}) {
  const startDate = product.departureDate ?? product.startDate;
  const images = product.images ?? [];

  return (
    <div
      id="voucher"
      className="border-2 border-dashed border-primary/40 rounded-2xl p-6 bg-white max-w-lg mx-auto print:block print:border-solid print:border-gray-300"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          {store.logoUrl ? (
            <img src={store.logoUrl} alt={store.name} className="h-10 object-contain" />
          ) : (
            <p className="font-bold text-lg" style={{ color: store.primaryColor }}>
              {store.name}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">Voucher de Reserva</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Pedido</p>
          <p className="font-mono font-bold text-primary text-lg">{order.orderNumber}</p>
        </div>
      </div>

      <div
        className="h-1 rounded-full mb-4"
        style={{ background: `linear-gradient(90deg, ${store.primaryColor}, ${store.secondaryColor})` }}
      />

      <div className="flex gap-4 mb-4">
        {images[0] && (
          <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0">
            <img src={images[0]} alt={product.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-base leading-tight mb-1">{product.name}</p>
          {product.destination && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 shrink-0" /> {product.destination}
            </p>
          )}
          {startDate && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 shrink-0" /> {fmtDate(startDate)}
            </p>
          )}
          {product.durationDays && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 shrink-0" /> {product.durationDays}d{product.durationNights ? ` / ${product.durationNights}n` : ""}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm mb-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-0.5">Passageiro</p>
          <p className="font-semibold">{customerName}</p>
        </div>
        {seats.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
              <Armchair className="w-3 h-3" /> Assento(s)
            </p>
            <p className="font-semibold">{seats.join(", ")}</p>
          </div>
        )}
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-0.5">Pagamento</p>
          <p className="font-semibold">{PAYMENT_LABELS[paymentMethod] ?? paymentMethod}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-0.5">Total</p>
          <p className="font-bold text-green-700 text-base">
            R$ {parseFloat(order.totalAmount).toFixed(2)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 border-t pt-4">
        <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center shrink-0 text-center">
          <div className="text-xs text-muted-foreground leading-tight">
            <p className="font-mono font-bold text-primary text-xs break-all">{order.orderNumber}</p>
            <p className="text-[10px] mt-1">QR Code</p>
          </div>
        </div>
        <div className="flex-1 text-xs text-muted-foreground leading-relaxed">
          <p>
            Apresente este voucher no embarque. Em caso de dúvidas, entre em contato com nossa equipe.
          </p>
          {store.contactWhatsapp && (
            <p className="mt-1 font-medium text-foreground">
              WhatsApp: {store.contactWhatsapp}
            </p>
          )}
          {store.contactEmail && (
            <p className="font-medium text-foreground">{store.contactEmail}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReservationWizard({
  slug,
  productSlug,
  store,
}: {
  slug: string;
  productSlug: string;
  store: PublicStore;
}) {
  const [, navigate] = useLocation();
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [step, setStep] = useState<Step>("dados");
  const [submitting, setSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<{ orderNumber: string; totalAmount: string; createdAt: string } | null>(null);

  const [form, setFormState] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerCpf: "",
    notes: "",
    paymentMethod: store.paymentMethods[0] ?? "pix",
    couponCode: "",
    cardNumber: "",
    cardName: "",
    cardExpiry: "",
    cardCvv: "",
    installments: "1",
  });
  const [qty, setQty] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<{ variantName: string; label: string; price: number } | null>(null);
  const [couponResult, setCouponResult] = useState<CouponValidation | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);

  useEffect(() => {
    setLoadingProduct(true);
    publicStoreApi
      .getProduct(slug, productSlug)
      .then((p) => setProduct(p))
      .catch(() => setNotFound(true))
      .finally(() => setLoadingProduct(false));
  }, [slug, productSlug]);

  function set(field: string, value: string) {
    setFormState((p) => ({ ...p, [field]: value }));
  }

  const basePrice = product ? parseFloat(product.salePrice ?? product.price) : 0;
  const unitPrice = selectedVariant ? selectedVariant.price : basePrice;
  const subtotal = unitPrice * qty;
  const couponDiscount = couponResult?.valid ? Number(couponResult.discountAmount ?? 0) : 0;
  const finalTotal = Math.max(0, subtotal - couponDiscount);

  const showSeatGrid =
    product?.totalCapacity != null && product.totalCapacity > 0 && product.totalCapacity <= 60;

  const maxSeats = (() => {
    if (product?.availableSeats != null) return product.availableSeats;
    if (showSeatGrid && product?.totalCapacity) return product.totalCapacity;
    return 99;
  })();

  const isSoldOut = maxSeats === 0;

  const occupiedSeats: number[] = (() => {
    if (!product?.totalCapacity) return [];
    const taken = product.totalCapacity - (product.availableSeats ?? product.totalCapacity);
    return Array.from({ length: Math.max(0, taken) }, (_, i) => i + 1);
  })();

  async function validateCoupon() {
    if (!form.couponCode || !product) return;
    setValidatingCoupon(true);
    try {
      const res = await publicStoreApi.validateCoupon(slug, form.couponCode, subtotal);
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

  function toggleSeat(n: number) {
    setSelectedSeats((prev) => {
      if (prev.includes(n)) return prev.filter((s) => s !== n);
      if (prev.length < qty) return [...prev, n].sort((a, b) => a - b);
      return prev;
    });
  }

  function canProceedFromDados() {
    return !!form.customerName.trim() && !!form.customerEmail.trim() && !!form.customerPhone.trim();
  }

  function canProceedFromRevisao() {
    if (isSoldOut) return false;
    if (product?.hasVariants && !selectedVariant) return false;
    if (showSeatGrid && product?.totalCapacity && qty > product.totalCapacity) return false;
    return qty >= 1;
  }

  function canProceedFromAssento() {
    if (showSeatGrid) return selectedSeats.length === qty;
    return true;
  }

  function canProceedFromPagamento() {
    if (form.paymentMethod === "credit_card" || form.paymentMethod === "debit_card") {
      return !!form.cardNumber && !!form.cardName && !!form.cardExpiry && !!form.cardCvv;
    }
    return true;
  }

  async function submit() {
    if (!product) return;
    setSubmitting(true);
    try {
      const seatNotes =
        selectedSeats.length > 0
          ? `Assentos selecionados: ${selectedSeats.join(", ")}.`
          : showSeatGrid
          ? ""
          : `${qty} vaga(s) reservada(s).`;
      const extraNotes = [seatNotes, form.notes].filter(Boolean).join(" ");

      const order = await publicStoreApi.createOrder(slug, {
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone || undefined,
        customerCpf: form.customerCpf || undefined,
        items: [
          {
            productId: product.id,
            productName: product.name,
            quantity: qty,
            unitPrice,
            variantLabel: selectedVariant?.label,
          },
        ],
        couponCode: couponResult?.valid ? form.couponCode : undefined,
        paymentMethod: form.paymentMethod,
        notes: extraNotes || undefined,
      });
      setCompletedOrder({
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
      });
      setStep("confirmado");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao finalizar reserva. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  function goNext() {
    const order: Step[] = ["dados", "revisao", "assento", "pagamento", "confirmado"];
    const idx = order.indexOf(step);
    if (idx < order.length - 1) setStep(order[idx + 1]);
  }

  function goBack() {
    const order: Step[] = ["dados", "revisao", "assento", "pagamento", "confirmado"];
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
    else navigate(`/loja/${slug}/produtos/${productSlug}`);
  }

  function handlePrint() {
    window.print();
  }

  if (loadingProduct) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-bold mb-2">Produto não encontrado</h2>
        <Button variant="outline" onClick={() => navigate(`/loja/${slug}/produtos`)}>
          Ver Catálogo
        </Button>
      </div>
    );
  }

  if (step === "confirmado" && completedOrder) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 pb-20">
        <StepIndicator current="confirmado" />

        <div className="text-center mb-8 print:hidden">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold mb-1">Reserva Confirmada!</h1>
          <p className="text-muted-foreground">
            Obrigado, <strong>{form.customerName}</strong>! Sua reserva foi registrada com sucesso.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Confirmação enviada para <strong>{form.customerEmail}</strong>
          </p>
        </div>

        <Voucher
          order={completedOrder}
          product={product}
          store={store}
          customerName={form.customerName}
          seats={selectedSeats}
          paymentMethod={form.paymentMethod}
        />

        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8 print:hidden">
          <Button
            variant="outline"
            onClick={handlePrint}
            className="flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Imprimir / Salvar Voucher
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(`/loja/${slug}/consultar-pedido`)}
            className="flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            Consultar Pedido
          </Button>
          <Button
            onClick={() => navigate(`/loja/${slug}/produtos`)}
            style={{ backgroundColor: store.primaryColor }}
            className="text-white flex items-center gap-2"
          >
            Ver mais pacotes
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 pb-24">
      <div className="flex items-center gap-2 mb-6 print:hidden">
        <button
          onClick={goBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {step === "dados" ? "Voltar ao Produto" : "Voltar"}
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-2 print:hidden">Reservar Viagem</h1>
      <p className="text-muted-foreground text-sm mb-6 print:hidden">{product.name}</p>

      <StepIndicator current={step} />

      {step === "dados" && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Seus Dados
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1">
              <Label htmlFor="name">
                Nome Completo <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={form.customerName}
                onChange={(e) => set("customerName", e.target.value)}
                placeholder="Seu nome completo"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">
                E-mail <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={form.customerEmail}
                onChange={(e) => set("customerEmail", e.target.value)}
                placeholder="seu@email.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">
                WhatsApp / Telefone <span className="text-red-500">*</span>
              </Label>
              <Input
                id="phone"
                value={form.customerPhone}
                onChange={(e) => set("customerPhone", e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                value={form.customerCpf}
                onChange={(e) =>
                  set(
                    "customerCpf",
                    e.target.value
                      .replace(/\D/g, "")
                      .replace(/(\d{3})(\d)/, "$1.$2")
                      .replace(/(\d{3})(\d)/, "$1.$2")
                      .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
                      .slice(0, 14)
                  )
                }
                placeholder="000.000.000-00"
                maxLength={14}
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Restrições alimentares, necessidades especiais, etc."
                rows={3}
              />
            </div>
          </div>
        </div>
      )}

      {step === "revisao" && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Revisão do Pedido
          </h2>

          <ProductCard product={product} store={store} />

          {product.hasVariants && (product.variants ?? []).length > 0 && (
            <div className="space-y-3">
              {(product.variants ?? []).map((v) => (
                <div key={v.name}>
                  <Label className="text-sm font-medium mb-2 block">{v.name} <span className="text-red-500">*</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {v.options.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => setSelectedVariant({ variantName: v.name, label: opt.label, price: opt.price })}
                        className={`px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                          selectedVariant?.label === opt.label
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                        {opt.price !== basePrice && (
                          <span className="ml-1 text-xs opacity-70">(R$ {opt.price.toFixed(2)})</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!selectedVariant && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  Selecione uma opção para continuar
                </p>
              )}
            </div>
          )}

          {isSoldOut && (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Este produto está esgotado e não pode ser reservado no momento.
            </div>
          )}

          <div className={`flex items-center justify-between p-4 border rounded-xl ${isSoldOut ? "opacity-50 pointer-events-none" : ""}`}>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Quantidade de passageiros</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setQty((q) => Math.max(1, q - 1)); setSelectedSeats([]); }}
                className="w-8 h-8 rounded-full border flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors"
                disabled={qty <= 1}
              >
                −
              </button>
              <span className="w-8 text-center font-bold text-lg">{qty}</span>
              <button
                onClick={() => { setQty((q) => Math.min(maxSeats, q + 1)); setSelectedSeats([]); }}
                className="w-8 h-8 rounded-full border flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors"
                disabled={qty >= maxSeats}
              >
                +
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" /> Cupom de Desconto
            </Label>
            {couponResult?.valid ? (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                <span className="flex-1 text-green-700">
                  Cupom <strong>{couponResult.code}</strong> aplicado! Desconto:{" "}
                  <strong>R$ {couponDiscount.toFixed(2)}</strong>
                </span>
                <button onClick={removeCoupon} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={form.couponCode}
                  onChange={(e) => set("couponCode", e.target.value.toUpperCase())}
                  placeholder="CODIGO"
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  onClick={validateCoupon}
                  disabled={!form.couponCode || validatingCoupon}
                >
                  {validatingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aplicar"}
                </Button>
              </div>
            )}
            {couponResult && !couponResult.valid && (
              <p className="text-xs text-red-600">{couponResult.error ?? "Cupom inválido"}</p>
            )}
          </div>

          <div className="border rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {qty}× R$ {unitPrice.toFixed(2)}
              </span>
              <span>R$ {subtotal.toFixed(2)}</span>
            </div>
            {couponDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Desconto</span>
                <span>– R$ {couponDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t pt-2 flex justify-between font-bold text-base">
              <span>Total</span>
              <span style={{ color: store.primaryColor }}>R$ {finalTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {step === "assento" && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Armchair className="w-5 h-5 text-primary" />
              Seleção de Assentos{" "}
              <span className="text-sm font-normal text-muted-foreground">
                * (obrigatório)
              </span>
            </h2>
          </div>

          {showSeatGrid && product.totalCapacity ? (
            <SeatGrid
              totalCapacity={product.totalCapacity}
              occupiedSeats={occupiedSeats}
              qty={qty}
              selected={selectedSeats}
              onToggle={toggleSeat}
              accentColor={store?.accentColor || store?.primaryColor}
            />
          ) : (
            <div className="space-y-4">
              <div className="p-6 border-2 border-dashed border-primary/30 rounded-xl text-center bg-primary/5">
                <Armchair className="w-12 h-12 text-primary/50 mx-auto mb-3" />
                <p className="text-lg font-semibold mb-1">
                  {qty} vaga{qty !== 1 ? "s" : ""} reservada{qty !== 1 ? "s" : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  Os assentos serão designados pelo motorista no embarque.
                </p>
                {product.availableSeats != null && (
                  <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-white border rounded-full px-3 py-1">
                    <Users className="w-3 h-3" />
                    {product.availableSeats} vagas disponíveis
                  </div>
                )}
              </div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <p className="font-semibold mb-1">Ponto de embarque</p>
                {product.destination ? (
                  <p>Destino: {product.destination}</p>
                ) : (
                  <p>O ponto de embarque será informado por e-mail após a confirmação.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {step === "pagamento" && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Pagamento
          </h2>

          <ProductCard product={product} store={store} />

          <div className="p-3 bg-muted/50 rounded-lg flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {qty} passageiro{qty !== 1 ? "s" : ""}
            </span>
            <span className="font-bold" style={{ color: store.primaryColor }}>
              Total: R$ {finalTotal.toFixed(2)}
            </span>
          </div>

          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            <div className="grid grid-cols-2 gap-2">
              {(store.paymentMethods.length > 0
                ? store.paymentMethods
                : ["pix"]
              ).map((method) => (
                <button
                  key={method}
                  onClick={() => set("paymentMethod", method)}
                  className={`px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                    form.paymentMethod === method
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {PAYMENT_LABELS[method] ?? method}
                </button>
              ))}
            </div>
          </div>

          <div className="border rounded-xl p-4">
            {form.paymentMethod === "pix" && <PixPayment store={store} />}
            {form.paymentMethod === "boleto" && <BoletoPayment />}
            {(form.paymentMethod === "credit_card" || form.paymentMethod === "debit_card") && (
              <CardPayment form={form} set={set} />
            )}
            {form.paymentMethod === "transfer" && (
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Realize uma transferência bancária para nossa conta.</p>
                <p className="text-xs">Os dados bancários serão enviados por e-mail após a confirmação.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg print:hidden">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === "dados" ? "Cancelar" : "Voltar"}
          </button>

          {step !== "pagamento" ? (
            <Button
              onClick={goNext}
              disabled={
                (step === "dados" && !canProceedFromDados()) ||
                (step === "revisao" && !canProceedFromRevisao()) ||
                (step === "assento" && !canProceedFromAssento())
              }
              style={{ backgroundColor: store.primaryColor }}
              className="text-white font-semibold px-8 flex items-center gap-2"
            >
              Continuar
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={submitting || !canProceedFromPagamento()}
              style={{ backgroundColor: store.accentColor || store.primaryColor }}
              className="text-white font-bold px-8 flex items-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Ticket className="w-4 h-4" />
              )}
              Confirmar Reserva
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
