import { CreditCard, CheckCircle2, Info } from "lucide-react";
import { PublicStore } from "@/lib/storeApi";
import { PAYMENT_METHODS_CONFIG } from "./constants";
import { StepPaymentSummary } from "./payment-summary";
import type { WizardState } from "./use-wizard-state";

export function StepPayment({ state, store }: { state: WizardState; store: PublicStore }) {
  const { form, set, finalTotal } = state;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-5">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          Forma de Pagamento
        </h2>

        <div className="space-y-3">
          {((store.paymentMethods ?? []).length > 0 ? (store.paymentMethods ?? []) : ["pix"]).map(
            (methodId) => {
              const config = PAYMENT_METHODS_CONFIG.find((m) => m.id === methodId);
              if (!config) return null;
              const { Icon } = config;
              const isSelected = form.paymentMethod === methodId;
              return (
                <label
                  key={methodId}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    isSelected
                      ? "border-orange-500 bg-orange-50"
                      : "border-border hover:border-gray-300 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment_method"
                    value={methodId}
                    checked={isSelected}
                    onChange={() => set("paymentMethod", methodId)}
                    className="accent-orange-500"
                  />
                  <div className={`p-2.5 rounded-lg ${config.bg}`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{config.label}</p>
                    <p className="text-xs text-muted-foreground">{config.description}</p>
                  </div>
                  {isSelected && <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0" />}
                </label>
              );
            },
          )}
        </div>

        {form.paymentMethod === "pix" && (
          <div className="mt-2 p-4 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-900">
            <p className="flex items-start gap-1.5">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              Após confirmar a reserva, você receberá o QR Code do PIX por email e WhatsApp para
              efetuar o pagamento.
            </p>
          </div>
        )}

        {form.paymentMethod === "credit_card" && (
          <div className="mt-2 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm text-blue-900 mb-3 font-medium">Parcelamento disponível:</p>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 6, 12].map((n) => (
                <button
                  key={n}
                  onClick={() => set("installments", String(n))}
                  className={`p-2 rounded-lg border text-xs font-medium transition-colors ${
                    form.installments === String(n)
                      ? "border-blue-500 bg-blue-100 text-blue-700"
                      : "border-blue-200 bg-white hover:bg-blue-50"
                  }`}
                >
                  <span className="block font-bold">{n}x</span>
                  <span className="text-blue-600">R$ {(finalTotal / n).toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {form.paymentMethod === "debit_card" && (
          <div className="mt-2 p-4 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-900">
            <p className="flex items-start gap-1.5">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              Pagamento à vista no débito. Será processado após a confirmação da reserva.
            </p>
          </div>
        )}

        {form.paymentMethod === "transfer" && (
          <div className="mt-2 p-4 bg-orange-50 border border-orange-200 rounded-xl">
            <p className="text-sm text-orange-900 font-medium mb-2">
              Dados para transferência (TED/DOC/PIX):
            </p>
            <div className="space-y-1.5 text-sm text-orange-800">
              <div className="bg-white/60 rounded-lg p-3 border border-orange-200 space-y-1">
                <p>
                  <span className="font-medium">Banco:</span> Banco do Brasil
                </p>
                <p>
                  <span className="font-medium">Agência:</span> Entre em contato para obter
                </p>
                <p>
                  <span className="font-medium">Conta:</span> Dados enviados por e-mail após confirmação
                </p>
                <p>
                  <span className="font-medium">Favorecido:</span> {store.name}
                </p>
              </div>
              {store.contactWhatsapp && (
                <p className="mt-1">
                  Dados completos também enviados via WhatsApp:{" "}
                  <strong>{store.contactWhatsapp}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        {form.paymentMethod === "boleto" && (
          <div className="mt-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 space-y-1">
            <p className="font-medium">Instruções:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>O boleto tem vencimento em 3 dias úteis</li>
              <li>Pode ser pago em qualquer banco, lotérica ou internet banking</li>
              <li>Sua reserva será confirmada após a identificação do pagamento</li>
            </ul>
          </div>
        )}

        {form.paymentMethod === "cash" && (
          <div className="mt-2 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-900">
            <p className="flex items-start gap-1.5">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              Pagamento em dinheiro deve ser realizado na agência até 48h antes da viagem.
            </p>
            {store.contactAddress && (
              <p className="mt-2 font-medium">📍 {store.contactAddress}</p>
            )}
          </div>
        )}
      </div>

      <div className="lg:col-span-1">
        <StepPaymentSummary state={state} store={store} variant="payment" />
      </div>
    </div>
  );
}
