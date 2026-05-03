import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Ticket,
  MapPin,
  Users,
  CreditCard,
  Info,
  Printer,
  MessageSquare,
  Search,
  Mail,
  Phone,
  UserCircle,
} from "lucide-react";
import { PublicStore } from "@/lib/storeApi";
import { calculateTripDuration } from "@/lib/tripDuration";
import { StepIndicator } from "./step-indicator";
import { ConfettiAnimation } from "./confetti";
import { Voucher } from "./voucher";
import { fmtDateLong, PAYMENT_LABELS } from "./constants";
import type { WizardState } from "./use-wizard-state";

export function StepConfirmation({
  state,
  store,
  slug,
}: {
  state: WizardState;
  store: PublicStore;
  slug: string;
}) {
  const { product, completedOrder, showConfetti, expiryCountdown, qty, effectiveSeats, form, navigate } =
    state;
  if (!product || !completedOrder) return null;
  const totalAmt = parseFloat(completedOrder.totalAmount);
  const startDate = product.departureDate ?? product.startDate;

  function handlePrint() {
    window.print();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 pb-20">
      {showConfetti && <ConfettiAnimation />}

      <StepIndicator current="confirmado" />

      <div className="space-y-6">
        <div
          className="rounded-2xl p-8 text-center border"
          style={{
            background: `linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)`,
            borderColor: "#bbf7d0",
          }}
        >
          <div className="flex justify-center mb-4">
            <div className="bg-green-500 rounded-full p-4">
              <CheckCircle2 className="w-14 h-14 text-white" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-green-900 mb-2">Reserva Confirmada! 🎉</h2>
          <p className="text-lg text-green-800 mb-6">Sua reserva foi realizada com sucesso!</p>
          <div className="inline-flex items-center gap-2 bg-white px-6 py-3 rounded-xl shadow-sm border border-green-200">
            <Ticket className="w-5 h-5 text-green-600" />
            <div className="text-left">
              <p className="text-xs text-muted-foreground">Número do Pedido</p>
              <p className="text-2xl font-bold text-green-600 font-mono">
                {completedOrder.orderNumber}
              </p>
            </div>
          </div>
          {expiryCountdown !== null && (
            <div className="mt-4 inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-5 py-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="text-sm">
                Conclua o pagamento em{" "}
                <strong className="font-mono text-base">{expiryCountdown}</strong> ou a reserva será
                cancelada automaticamente.
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              Detalhes da Viagem
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Viagem</p>
                <p className="font-semibold">{product.name}</p>
                {product.destination && (
                  <p className="text-muted-foreground">📍 {product.destination}</p>
                )}
              </div>
              {startDate && (
                <div>
                  <p className="text-muted-foreground text-xs">Data de Saída</p>
                  <p className="font-semibold">{fmtDateLong(startDate)}</p>
                </div>
              )}
              {(() => {
                const dur =
                  calculateTripDuration(
                    product.departureDate ?? product.startDate,
                    product.endDate,
                    product.departureTime,
                    product.returnTime,
                  ) ??
                  (product.durationDays
                    ? {
                        formatted: `${product.durationDays} ${product.durationDays === 1 ? "dia" : "dias"}`,
                      }
                    : null);
                return dur ? (
                  <div>
                    <p className="text-muted-foreground text-xs">Duração</p>
                    <p className="font-semibold">{dur.formatted}</p>
                  </div>
                ) : null;
              })()}
              <div>
                <p className="text-muted-foreground text-xs">Passageiros</p>
                <p className="font-semibold">
                  {qty} passageiro{qty !== 1 ? "s" : ""}
                </p>
              </div>
              {effectiveSeats.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Assentos</p>
                  <div className="flex flex-wrap gap-1.5">
                    {effectiveSeats.map((s) => (
                      <span
                        key={s}
                        className="px-2.5 py-1 rounded-full text-white text-xs font-semibold"
                        style={{ backgroundColor: store.accentColor || store.primaryColor }}
                      >
                        Assento {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              Suas Informações
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Nome</p>
                <p className="font-semibold">{form.customerName}</p>
              </div>
              {form.customerCpf && (
                <div>
                  <p className="text-muted-foreground text-xs">CPF</p>
                  <p className="font-semibold">{form.customerCpf}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground text-xs">Email</p>
                <p className="font-semibold">{form.customerEmail}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Telefone</p>
                <p className="font-semibold">{form.customerPhone}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Número do Pedido</p>
                <div className="mt-1">
                  <span
                    className="px-3 py-1.5 rounded-lg text-white text-sm font-mono font-bold"
                    style={{ backgroundColor: store.primaryColor }}
                  >
                    {completedOrder.orderNumber}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border rounded-2xl p-6">
          <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5 text-green-600" />
            Resumo Financeiro
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Valor Total</p>
              <p className="text-2xl font-bold text-gray-900">R$ {totalAmt.toFixed(2)}</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Valor Pago</p>
              <p className="text-2xl font-bold text-green-600">R$ 0,00</p>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Saldo Pendente</p>
              <p className="text-2xl font-bold text-orange-600">R$ {totalAmt.toFixed(2)}</p>
            </div>
          </div>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-900">
            <p>
              <strong>Forma de Pagamento:</strong>{" "}
              {PAYMENT_LABELS[form.paymentMethod] ?? form.paymentMethod}
            </p>
            <p className="mt-1.5 flex items-center gap-1">
              <Info className="w-3.5 h-3.5" />
              Aguardando confirmação do pagamento. Você receberá um email assim que o pagamento for
              confirmado.
            </p>
          </div>
        </div>

        <div className="border rounded-2xl p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <h3 className="text-lg font-bold mb-4">📋 Próximos Passos</h3>
          <div className="space-y-3">
            {[
              "Você receberá um email de confirmação com todos os detalhes da sua reserva e o voucher em anexo.",
              "Também enviaremos uma mensagem no WhatsApp com as informações de embarque.",
              "Apresente o voucher e documento com foto no dia do embarque.",
              "Chegue ao ponto de embarque com 30 minutos de antecedência.",
            ].map((stepText, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div
                  className="text-white rounded-full w-6 h-6 flex items-center justify-center shrink-0 font-bold text-sm"
                  style={{ backgroundColor: store.primaryColor }}
                >
                  {idx + 1}
                </div>
                <p className="text-gray-700 text-sm">{stepText}</p>
              </div>
            ))}
          </div>
        </div>

        <Voucher
          order={completedOrder}
          product={product}
          store={store}
          customerName={form.customerName}
          seats={effectiveSeats}
          paymentMethod={form.paymentMethod}
        />

        <div className="rounded-2xl p-6 text-center border-2 print:hidden"
          style={{ borderColor: store.primaryColor + "40", background: `${store.primaryColor}08` }}
        >
          <div className="flex justify-center mb-3">
            <div
              className="rounded-full p-3"
              style={{ backgroundColor: store.primaryColor + "20" }}
            >
              <UserCircle className="w-8 h-8" style={{ color: store.primaryColor }} />
            </div>
          </div>
          <h3 className="text-lg font-bold mb-1">Acompanhe sua reserva</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Acesse sua Área do Cliente para ver vouchers, pagamentos e todas as suas viagens.
          </p>
          <Button
            onClick={() => navigate("/perfil")}
            className="text-white font-semibold px-8"
            style={{ backgroundColor: store.primaryColor }}
          >
            <UserCircle className="w-4 h-4 mr-2" />
            Acessar Meu Perfil
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            Use o e-mail e a senha enviados para <strong>{form.customerEmail}</strong>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center print:hidden">
          <Button onClick={handlePrint} variant="outline" className="flex items-center gap-2">
            <Printer className="w-4 h-4" />
            Imprimir / Salvar Voucher
          </Button>
          {store.contactWhatsapp && (
            <Button
              onClick={() => {
                const phone = store.contactWhatsapp!.replace(/\D/g, "");
                const msg = `Olá! Acabei de fazer uma reserva (${completedOrder.orderNumber}) para a viagem ${product.name}. Gostaria de mais informações.`;
                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
              }}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              <MessageSquare className="w-4 h-4" />
              Falar no WhatsApp
            </Button>
          )}
          <Button
            onClick={() => navigate(`/loja/${slug}/consultar-pedido`)}
            variant="outline"
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

        {(store.contactWhatsapp || store.contactEmail || store.contactPhone) && (
          <div className="border rounded-2xl p-6 bg-gray-50 print:hidden">
            <h3 className="text-lg font-bold mb-3">📞 Precisa de Ajuda?</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Nossa equipe está pronta para atendê-lo!
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {store.contactWhatsapp && (
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-green-600 shrink-0" />
                  <div>
                    <p className="text-muted-foreground text-xs">WhatsApp</p>
                    <p className="font-semibold">{store.contactWhatsapp}</p>
                  </div>
                </div>
              )}
              {store.contactEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-muted-foreground text-xs">Email</p>
                    <p className="font-semibold">{store.contactEmail}</p>
                  </div>
                </div>
              )}
              {store.contactPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-600 shrink-0" />
                  <div>
                    <p className="text-muted-foreground text-xs">Telefone</p>
                    <p className="font-semibold">{store.contactPhone}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
