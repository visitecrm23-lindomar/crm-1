import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { publicStoreApi, PublicStore, StoreProduct, CouponValidation } from "@/lib/storeApi";
import { validateCpf } from "@/lib/utils";
import { useSeatStream } from "@/hooks/useSeatStream";
import type { LayoutSeatMap, Step } from "./constants";
import { CLICKABLE_SEAT_TYPES, STEP_ORDER } from "./constants";

export type WizardForm = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCpf: string;
  customerBirthdate: string;
  notes: string;
  paymentMethod: string;
  couponCode: string;
  cardNumber: string;
  cardName: string;
  cardExpiry: string;
  cardCvv: string;
  installments: string;
};

export type CompletedOrder = {
  orderNumber: string;
  totalAmount: string;
  createdAt: string;
  reservationExpiresAt?: string | null;
};

export type WizardSelectedVariant = { variantName: string; label: string; price: number };

export function useWizardState({
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
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [expiryCountdown, setExpiryCountdown] = useState<string | null>(null);

  const [form, setFormState] = useState<WizardForm>({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerCpf: "",
    customerBirthdate: "",
    notes: "",
    paymentMethod: (store.paymentMethods ?? [])[0] ?? "pix",
    couponCode: "",
    cardNumber: "",
    cardName: "",
    cardExpiry: "",
    cardCvv: "",
    installments: "1",
  });
  const [qty, setQty] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<WizardSelectedVariant | null>(null);
  const [couponResult, setCouponResult] = useState<CouponValidation | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [layoutSeats, setLayoutSeats] = useState<string[]>([]);
  const [layoutSeatMap, setLayoutSeatMap] = useState<LayoutSeatMap | null>(null);
  const [loadingLayoutMap, setLoadingLayoutMap] = useState(false);

  const { occupiedSeats: streamOccupied, eventCount: sseEventCount } = useSeatStream({
    tripId: product?.tripId,
    slug,
    isPublic: true,
    enabled: step === "assento" && !!product?.tripId,
  });

  const liveLayoutSeatMap = useMemo(() => {
    if (!layoutSeatMap) return null;
    if (sseEventCount === 0) return layoutSeatMap;
    // SSE is authoritative: recompute all seat statuses from base layout + current SSE snapshot.
    // Seats absent from streamOccupied are reset to "available" (for bookable seat types).
    return {
      ...layoutSeatMap,
      seats: layoutSeatMap.seats.map((seat) => {
        if (streamOccupied[seat.number]) {
          return { ...seat, status: streamOccupied[seat.number] };
        }
        if (CLICKABLE_SEAT_TYPES.includes(seat.type)) {
          return { ...seat, status: "available" };
        }
        return seat;
      }),
    };
  }, [layoutSeatMap, streamOccupied, sseEventCount]);

  useEffect(() => {
    if (sseEventCount === 0) return;
    setLayoutSeats((prev) => prev.filter((s) => !streamOccupied[s]));
    setSelectedSeats((prev) => prev.filter((n) => !streamOccupied[String(n)]));
  }, [streamOccupied, sseEventCount]);

  const [referralCode, setReferralCode] = useState(() => localStorage.getItem("referral_code") ?? "");
  const [referralApplied, setReferralApplied] = useState(false);
  const [referralDiscountPct, setReferralDiscountPct] = useState(5);
  const [referralDiscountType, setReferralDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [referralDiscountValue, setReferralDiscountValue] = useState(5);

  useEffect(() => {
    setLoadingProduct(true);
    publicStoreApi
      .getProduct(slug, productSlug)
      .then((p) => setProduct(p))
      .catch(() => setNotFound(true))
      .finally(() => setLoadingProduct(false));
  }, [slug, productSlug]);

  useEffect(() => {
    if (!product?.tripId) {
      setLayoutSeatMap(null);
      return;
    }
    setLoadingLayoutMap(true);
    publicStoreApi
      .getTripSeatMap(slug, product.tripId)
      .then((data) => setLayoutSeatMap(data))
      .catch(() => setLayoutSeatMap(null))
      .finally(() => setLoadingLayoutMap(false));
  }, [slug, product?.tripId]);

  useEffect(() => {
    const savedCode = localStorage.getItem("referral_code");
    if (savedCode) {
      publicStoreApi
        .validateReferral(slug, savedCode)
        .then((res) => {
          if (res.valid) {
            setReferralCode(savedCode);
            setReferralApplied(true);
            const rType = (res.discountType ?? "percentage") as "percentage" | "fixed";
            const rVal = res.discountValue ?? res.discountPercent ?? 5;
            setReferralDiscountType(rType);
            setReferralDiscountValue(rVal);
            setReferralDiscountPct(rType === "percentage" ? rVal : 0);
          }
        })
        .catch(() => {
          /* Silently ignore */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(field: keyof WizardForm, value: string) {
    setFormState((p) => ({ ...p, [field]: value }));
  }

  const basePrice = product ? parseFloat(product.salePrice ?? product.price) : 0;
  const unitPrice = selectedVariant ? selectedVariant.price : basePrice;
  const subtotal = unitPrice * qty;
  const couponDiscount = couponResult?.valid ? Number(couponResult.discountAmount ?? 0) : 0;
  const referralDiscount = referralApplied
    ? (referralDiscountType === "fixed"
        ? Math.min(referralDiscountValue, subtotal)
        : subtotal * (referralDiscountPct / 100))
    : 0;
  const finalTotal = Math.max(0, subtotal - couponDiscount - referralDiscount);

  const showSeatGrid =
    product?.totalCapacity != null && product.totalCapacity > 0 && product.totalCapacity <= 60;

  const effectiveSeats: string[] = layoutSeatMap ? layoutSeats : selectedSeats.map(String);

  const maxSeats = (() => {
    if (product?.availableSeats != null) return product.availableSeats;
    if (showSeatGrid && product?.totalCapacity) return product.totalCapacity;
    return 99;
  })();

  const isSoldOut = maxSeats === 0;

  const occupiedSeats: number[] = (() => {
    if (Object.keys(streamOccupied).length > 0) {
      return Object.keys(streamOccupied)
        .map(Number)
        .filter((n) => !isNaN(n));
    }
    if (!product?.totalCapacity) return [];
    const taken = product.totalCapacity - (product.availableSeats ?? product.totalCapacity);
    return Array.from({ length: Math.max(0, taken) }, (_, i) => i + 1);
  })();

  const passengerOptions = Array.from(
    { length: Math.max(1, Math.min(maxSeats, 10)) },
    (_, i) => i + 1,
  );

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
    set("couponCode", "");
  }

  async function applyReferral() {
    if (!referralCode.trim()) return;
    try {
      const res = await publicStoreApi.validateReferral(slug, referralCode.trim().toUpperCase());
      if (res.valid) {
        setReferralApplied(true);
        const rType = (res.discountType ?? "percentage") as "percentage" | "fixed";
        const rVal = res.discountValue ?? res.discountPercent ?? 5;
        setReferralDiscountType(rType);
        setReferralDiscountValue(rVal);
        setReferralDiscountPct(rType === "percentage" ? rVal : 0);
        localStorage.setItem("referral_code", referralCode.trim().toUpperCase());
      } else {
        alert(res.error ?? "Código inválido");
      }
    } catch {
      alert("Erro ao validar código de indicação");
    }
  }

  function removeReferral() {
    setReferralApplied(false);
    setReferralCode("");
  }

  function toggleSeat(n: number) {
    setSelectedSeats((prev) => {
      if (prev.includes(n)) return prev.filter((s) => s !== n);
      if (prev.length < qty) return [...prev, n].sort((a, b) => a - b);
      return prev;
    });
  }

  function toggleLayoutSeat(n: string) {
    setLayoutSeats((prev) =>
      prev.includes(n) ? prev.filter((s) => s !== n) : prev.length < qty ? [...prev, n] : prev,
    );
  }

  function changeQty(newQty: number) {
    setQty(newQty);
    setSelectedSeats([]);
    setLayoutSeats([]);
  }

  function incrementQty() {
    setQty((q) => Math.min(maxSeats, q + 1));
    setSelectedSeats([]);
    setLayoutSeats([]);
  }

  function decrementQty() {
    setQty((q) => Math.max(1, q - 1));
    setSelectedSeats([]);
    setLayoutSeats([]);
  }

  function canProceedFromDados() {
    return (
      !!form.customerName.trim() &&
      !!form.customerEmail.trim() &&
      !!form.customerPhone.trim() &&
      validateCpf(form.customerCpf)
    );
  }

  function canProceedFromRevisao() {
    if (isSoldOut) return false;
    if (product?.hasVariants && !selectedVariant) return false;
    if (showSeatGrid && product?.totalCapacity && qty > product.totalCapacity) return false;
    return qty >= 1;
  }

  function canProceedFromAssento() {
    if (layoutSeatMap) return layoutSeats.length === qty;
    if (showSeatGrid) return selectedSeats.length === qty;
    return true;
  }

  function canProceedFromPagamento() {
    return !!form.paymentMethod;
  }

  async function submit() {
    if (!product) return;
    setSubmitting(true);
    try {
      const seatNotes =
        effectiveSeats.length > 0
          ? `Assentos selecionados: ${effectiveSeats.join(", ")}.`
          : showSeatGrid
            ? ""
            : `${qty} vaga(s) reservada(s).`;
      const birthdateNote = form.customerBirthdate
        ? `Data de nascimento: ${form.customerBirthdate}.`
        : "";
      const referralNote = referralApplied
        ? `Código de indicação: ${referralCode}. Desconto de indicação: R$ ${referralDiscount.toFixed(2)}.`
        : "";
      const extraNotes = [seatNotes, birthdateNote, referralNote, form.notes]
        .filter(Boolean)
        .join(" ");

      const order = await publicStoreApi.createOrder(slug, {
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone || undefined,
        customerCpf: form.customerCpf || undefined,
        customerBirthdate: form.customerBirthdate || undefined,
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
        referralCode: referralApplied ? referralCode.trim().toUpperCase() : undefined,
        referralCookieId: referralApplied
          ? (localStorage.getItem("referral_server_cookie_id") ?? undefined)
          : undefined,
        paymentMethod: form.paymentMethod,
        notes: extraNotes || undefined,
        seats: effectiveSeats.length > 0 ? effectiveSeats : undefined,
      });
      setCompletedOrder({
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
        reservationExpiresAt: order.reservationExpiresAt,
      });
      localStorage.removeItem("referral_code");
      localStorage.removeItem("referral_code_expiry");
      localStorage.removeItem("referral_referrer_name");
      localStorage.removeItem("referral_server_cookie_id");
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
      setStep("confirmado");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao finalizar reserva. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  function goNext() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]);
  }

  function goBack() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
    else navigate(`/loja/${slug}/produtos/${productSlug}`);
  }

  useEffect(() => {
    const expiresAt = completedOrder?.reservationExpiresAt;
    if (!expiresAt) return;
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setExpiryCountdown("00:00");
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setExpiryCountdown(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [completedOrder?.reservationExpiresAt]);

  return {
    navigate,
    product,
    loadingProduct,
    notFound,
    step,
    setStep,
    submitting,
    completedOrder,
    showConfetti,
    expiryCountdown,
    form,
    set,
    qty,
    changeQty,
    incrementQty,
    decrementQty,
    selectedVariant,
    setSelectedVariant,
    couponResult,
    validatingCoupon,
    validateCoupon,
    removeCoupon,
    selectedSeats,
    layoutSeats,
    setLayoutSeats,
    layoutSeatMap,
    loadingLayoutMap,
    liveLayoutSeatMap,
    referralCode,
    setReferralCode,
    referralApplied,
    referralDiscountPct,
    referralDiscountType,
    referralDiscountValue,
    applyReferral,
    removeReferral,
    basePrice,
    unitPrice,
    subtotal,
    couponDiscount,
    referralDiscount,
    finalTotal,
    showSeatGrid,
    effectiveSeats,
    maxSeats,
    isSoldOut,
    occupiedSeats,
    passengerOptions,
    canProceedFromDados,
    canProceedFromRevisao,
    canProceedFromAssento,
    canProceedFromPagamento,
    submit,
    goNext,
    goBack,
    toggleSeat,
    toggleLayoutSeat,
  };
}

export type WizardState = ReturnType<typeof useWizardState>;
