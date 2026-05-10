import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { User, Users, Info, AlertTriangle } from "lucide-react";
import type { WizardState } from "./use-wizard-state";
import { validateCpf } from "@/lib/utils";

export function StepPassengerForm({ state }: { state: WizardState }) {
  const { form, set, qty, changeQty, isSoldOut, maxSeats, passengerOptions, product } = state;
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <User className="w-5 h-5 text-primary" />
        Seus Dados
      </h2>
      <div className="border rounded-2xl p-6 space-y-5">
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
            <Label htmlFor="cpf">
              CPF <span className="text-red-500">*</span>
            </Label>
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
                    .slice(0, 14),
                )
              }
              placeholder="000.000.000-00"
              maxLength={14}
              className={
                form.customerCpf.length > 0 && !validateCpf(form.customerCpf)
                  ? "border-red-400 focus-visible:ring-red-400"
                  : ""
              }
            />
            {form.customerCpf.length > 0 && !validateCpf(form.customerCpf) && (
              <p className="text-xs text-red-500 flex items-center gap-1 mt-0.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                CPF inválido
              </p>
            )}
          </div>
        </div>

        <div className="border-t pt-4">
          <Label className="flex items-center gap-1.5 mb-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            Quantidade de Passageiros <span className="text-red-500">*</span>
          </Label>
          <select
            value={qty}
            onChange={(e) => changeQty(Number(e.target.value))}
            disabled={isSoldOut}
            className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white"
          >
            {passengerOptions.map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "passageiro" : "passageiros"}
              </option>
            ))}
          </select>
          {product?.availableSeats != null && (
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
              <Info className="w-3.5 h-3.5" />
              {maxSeats} vaga{maxSeats !== 1 ? "s" : ""} disponível{maxSeats !== 1 ? "is" : ""}
            </p>
          )}
          {isSoldOut && (
            <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Produto esgotado
            </p>
          )}
        </div>

        <div className="border-t pt-4 space-y-1">
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
  );
}
