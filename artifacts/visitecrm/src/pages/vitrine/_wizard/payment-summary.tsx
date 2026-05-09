import { PublicStore } from "@/lib/storeApi";
import { TRIP_TYPE_LABELS } from "@/lib/labels";
import { PAYMENT_LABELS } from "./constants";
import type { WizardState } from "./use-wizard-state";

export function StepPaymentSummary({
  state,
  store,
  variant,
}: {
  state: WizardState;
  store: PublicStore;
  variant: "review" | "payment";
}) {
  const {
    product,
    qty,
    unitPrice,
    subtotal,
    referralDiscount,
    referralDiscountPct,
    couponDiscount,
    finalTotal,
    effectiveSeats,
    form,
  } = state;

  if (variant === "review") {
    return (
      <div className="border rounded-2xl p-5 space-y-3 lg:sticky lg:top-4">
        <h3 className="font-bold text-base">Resumo Financeiro</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Preço por pessoa</span>
            <span className="font-medium">R$ {unitPrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Quantidade</span>
            <span className="font-medium">× {qty}</span>
          </div>
          <div className="border-t pt-2 flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">R$ {subtotal.toFixed(2)}</span>
          </div>
          {referralDiscount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Desconto Indicação</span>
              <span>− R$ {referralDiscount.toFixed(2)}</span>
            </div>
          )}
          {couponDiscount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Desconto Cupom</span>
              <span>− R$ {couponDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t pt-2 flex justify-between font-bold text-base">
            <span>Total</span>
            <span style={{ color: store.primaryColor }}>R$ {finalTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-2xl p-5 space-y-3 lg:sticky lg:top-4">
      <h3 className="font-bold text-base">Resumo Final</h3>
      <div className="space-y-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Viagem</p>
          <p className="font-medium leading-tight">{product?.name}</p>
          {product?.tripType && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              {TRIP_TYPE_LABELS[product.tripType] ?? product.tripType}
            </span>
          )}
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Passageiros</span>
          <span className="font-medium">{qty}</span>
        </div>
        {effectiveSeats.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Assentos</p>
            <div className="flex flex-wrap gap-1">
              {effectiveSeats.map((s) => (
                <span
                  key={s}
                  className="px-1.5 py-0.5 rounded text-white text-xs font-semibold"
                  style={{ backgroundColor: store.accentColor || store.primaryColor }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="border-t pt-2 flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>R$ {subtotal.toFixed(2)}</span>
        </div>
        {referralDiscount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Desc. Indicação</span>
            <span>− R$ {referralDiscount.toFixed(2)}</span>
          </div>
        )}
        {couponDiscount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Desc. Cupom</span>
            <span>− R$ {couponDiscount.toFixed(2)}</span>
          </div>
        )}
        <div className="border-t pt-2 flex justify-between font-bold text-base">
          <span>Total</span>
          <span style={{ color: store.primaryColor }}>R$ {finalTotal.toFixed(2)}</span>
        </div>
        {form.paymentMethod && (
          <div className="pt-1">
            <span
              className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
              style={{ backgroundColor: store.accentColor || store.primaryColor }}
            >
              {PAYMENT_LABELS[form.paymentMethod] ?? form.paymentMethod}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
