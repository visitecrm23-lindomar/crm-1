import { Label } from "@/components/ui/label";
import { ClipboardList, AlertTriangle, Users, Armchair } from "lucide-react";
import { PublicStore } from "@/lib/storeApi";
import { ProductCard } from "./product-card";
import { StepCouponReferral } from "./coupon-referral";
import { StepPaymentSummary } from "./payment-summary";
import { fmtDate } from "./constants";
import type { WizardState } from "./use-wizard-state";

export function StepReview({ state, store }: { state: WizardState; store: PublicStore }) {
  const {
    product,
    basePrice,
    selectedVariant,
    setSelectedVariant,
    isSoldOut,
    qty,
    maxSeats,
    incrementQty,
    decrementQty,
    form,
  } = state;
  if (!product) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-5">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          Revisão do Pedido
        </h2>

        <ProductCard product={product} store={store} />

        {product.hasVariants && (product.variants ?? []).length > 0 && (
          <div className="border rounded-xl p-4 space-y-3">
            {(product.variants ?? []).map((v) => (
              <div key={v.name}>
                <Label className="text-sm font-medium mb-2 block">
                  {v.name} <span className="text-red-500">*</span>
                </Label>
                <div className="flex flex-wrap gap-2">
                  {v.options.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() =>
                        setSelectedVariant({
                          variantName: v.name,
                          label: opt.label,
                          price: opt.price,
                        })
                      }
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
              <p className="text-xs text-amber-600">Selecione uma opção para continuar</p>
            )}
          </div>
        )}

        {isSoldOut && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Este produto está esgotado e não pode ser reservado no momento.
          </div>
        )}

        <div
          className={`flex items-center justify-between p-4 border rounded-xl ${
            isSoldOut ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Quantidade de passageiros</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={decrementQty}
              className="w-8 h-8 rounded-full border flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors"
              disabled={qty <= 1}
            >
              −
            </button>
            <span className="w-8 text-center font-bold text-lg">{qty}</span>
            <button
              onClick={incrementQty}
              className="w-8 h-8 rounded-full border flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors"
              disabled={qty >= maxSeats}
            >
              +
            </button>
          </div>
        </div>

        {product.showSeatMap === false && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
            <Armchair className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              {qty > 1
                ? "Seus assentos serão atribuídos automaticamente após a confirmação da reserva."
                : "Seu assento será atribuído automaticamente após a confirmação da reserva."}
            </p>
          </div>
        )}

        <div className="border rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold">Resumo do Passageiro</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Nome</p>
              <p className="font-medium">{form.customerName}</p>
            </div>
            {form.customerCpf && (
              <div>
                <p className="text-muted-foreground text-xs">CPF</p>
                <p className="font-medium">{form.customerCpf}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">E-mail</p>
              <p className="font-medium">{form.customerEmail}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Telefone</p>
              <p className="font-medium">{form.customerPhone}</p>
            </div>
            {form.customerBirthdate && (
              <div>
                <p className="text-muted-foreground text-xs">Data de Nascimento</p>
                <p className="font-medium">{fmtDate(form.customerBirthdate)}</p>
              </div>
            )}
          </div>
        </div>

        <StepCouponReferral
          state={state}
          couponsEnabled={store.couponsEnabled !== false}
          referralsEnabled={store.referralsEnabled !== false}
        />
      </div>

      <div className="lg:col-span-1">
        <StepPaymentSummary state={state} store={store} variant="review" />
      </div>
    </div>
  );
}
