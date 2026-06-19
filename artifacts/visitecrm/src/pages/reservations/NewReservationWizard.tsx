import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTrips, useListClients, useListBoardingLocations, useListUsers,
  useCreateReservation, useUpdateReservation, useUpdateDeal,
  useValidateReservationCoupon, useGetTrip, useGetClientLoyalty,
  useCreateClient,
  validateReferralCode,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { XCircle } from "lucide-react";
import { PAYMENT_METHOD_LABELS as PAYMENT_LABELS } from "@/lib/labels";
import { WizardStep1 } from "./WizardStep1";
import { WizardStep2 } from "./WizardStep2";
import { computeReservationTotal, roundMoney } from "@/lib/reservationPricing";

function WizardStepIndicator({ step }: { step: number }) {
  const steps = ["Seleção", "Pagamento", "Confirmação"];
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((label, idx) => {
        const n = idx + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={n} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${done ? "bg-primary border-primary text-primary-foreground" : active ? "border-primary text-primary bg-primary/10" : "border-muted-foreground/30 text-muted-foreground"}`}>
                {done ? "✓" : n}
              </div>
              <span className={`text-xs whitespace-nowrap ${active ? "text-primary font-semibold" : "text-muted-foreground"}`}>{label}</span>
            </div>
            {idx < steps.length - 1 && <div className={`flex-1 h-0.5 mx-1 mt-[-12px] transition-colors ${done ? "bg-primary" : "bg-muted"}`} />}
          </div>
        );
      })}
    </div>
  );
}

export function NewReservationWizard({ open, onClose, onSuccess, initialTripId, initialClientId, initialAmount, dealId }: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialTripId?: string;
  initialClientId?: string;
  initialAmount?: number;
  dealId?: string;
}) {
  const { data: tripsData } = useListTrips({ limit: 200 });
  const { data: clientsData } = useListClients({ limit: 300 });
  const { data: boardingRaw } = useListBoardingLocations();
  const { data: usersForWizard } = useListUsers();
  const createReservation = useCreateReservation();
  const updateReservation = useUpdateReservation();
  const updateDeal = useUpdateDeal();
  const createClient = useCreateClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [selectedTripId, setSelectedTripId] = useState(initialTripId ?? "");
  const [selectedClientId, setSelectedClientId] = useState(initialClientId ?? "");
  const [boardingLocationId, setBoardingLocationId] = useState("");
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [manualSeats, setManualSeats] = useState("");
  const [tripComboOpen, setTripComboOpen] = useState(false);
  const [clientComboOpen, setClientComboOpen] = useState(false);
  const [totalValue, setTotalValue] = useState<number>(initialAmount ?? 0);
  const [paidValue, setPaidValue] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [installments, setInstallments] = useState(1);
  const [firstDueDate, setFirstDueDate] = useState("");
  const [hasInsurance, setHasInsurance] = useState(false);
  const [notes, setNotes] = useState("");
  const [commissionAmount, setCommissionAmount] = useState<number>(0);
  const [sellerId, setSellerId] = useState<string>("none");
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState<{ code: string; amount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [redeemLoyalty, setRedeemLoyalty] = useState(false);
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState<number>(0);
  const [loyaltyAmountApplied, setLoyaltyAmountApplied] = useState<number>(0);
  const [referralCode, setReferralCode] = useState("");
  const [referralApplied, setReferralApplied] = useState<{ id: string; code: string; amount: number } | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [discountsOpen, setDiscountsOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [clientSearch, setClientSearch] = useState("");
  const [pendingClient, setPendingClient] = useState<{ id: string; name: string; whatsapp?: string | null } | null>(null);
  const [showNewClientDialog, setShowNewClientDialog] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientWhatsapp, setNewClientWhatsapp] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientError, setNewClientError] = useState<string | null>(null);

  const cpfClean = useMemo(() => clientSearch.replace(/\D/g, ""), [clientSearch]);
  const isCpfMode = cpfClean.length === 11;

  const { data: cpfData, isLoading: cpfSearchLoading } = useListClients(
    { cpf: cpfClean, limit: 5 },
    { query: { queryKey: ["cpf-client-search", cpfClean], enabled: isCpfMode } }
  );
  const cpfMatches = cpfData?.data ?? [];

  const validateCoupon = useValidateReservationCoupon();
  const { data: selectedTripFull } = useGetTrip(selectedTripId, { query: { queryKey: ["wizard-trip", selectedTripId], enabled: !!selectedTripId } });
  const { data: loyaltyInfo } = useGetClientLoyalty(selectedClientId, { query: { queryKey: ["wizard-loyalty", selectedClientId], enabled: !!selectedClientId, retry: false } });

  const allTrips = tripsData?.data ?? [];
  const allClients = clientsData?.data ?? [];
  const selectedTrip = tripsData?.data.find(t => t.id === selectedTripId);
  const selectedClient = (() => {
    if (!selectedClientId) return undefined;
    if (pendingClient?.id === selectedClientId) return pendingClient;
    return clientsData?.data.find(c => c.id === selectedClientId);
  })();
  const selectedBoarding = (boardingRaw ?? []).find(b => b.id === boardingLocationId);

  const effectiveSeats = useMemo(() => {
    if (selectedSeats.length > 0) return selectedSeats;
    if (manualSeats.trim()) return manualSeats.split(",").map(s => s.trim()).filter(Boolean);
    return [];
  }, [selectedSeats, manualSeats]);

  useEffect(() => {
    if (selectedTripFull) setTotalValue(computeReservationTotal(selectedTripFull.priceAdult ?? 0, effectiveSeats));
  }, [selectedTripFull, effectiveSeats.length]);

  useEffect(() => {
    if (open) { setSelectedTripId(initialTripId ?? ""); setSelectedClientId(initialClientId ?? ""); setTotalValue(initialAmount ?? 0); }
  }, [open, initialTripId, initialClientId, initialAmount]);

  const uiCouponApplied = roundMoney(Math.min(couponApplied?.amount ?? 0, totalValue));
  const uiRemaining1 = roundMoney(totalValue - uiCouponApplied);
  const uiLoyaltyApplied = roundMoney(Math.min(loyaltyAmountApplied, uiRemaining1));
  const uiRemaining2 = roundMoney(uiRemaining1 - uiLoyaltyApplied);
  const uiReferralApplied = roundMoney(Math.min(referralApplied?.amount ?? 0, uiRemaining2));
  const totalDiscount = roundMoney(uiCouponApplied + uiLoyaltyApplied + uiReferralApplied);
  const finalTotal = Math.max(0, roundMoney(totalValue - totalDiscount));

  const resetWizard = () => {
    setStep(1); setSelectedTripId(""); setSelectedClientId(""); setBoardingLocationId("");
    setSelectedSeats([]); setManualSeats(""); setTripComboOpen(false); setClientComboOpen(false);
    setTotalValue(0); setPaidValue(0); setPaymentMethod("pix"); setInstallments(1); setFirstDueDate("");
    setHasInsurance(false); setNotes(""); setCreateError(null); setCommissionAmount(0); setSellerId("none");
    setCouponCode(""); setCouponApplied(null); setCouponError(null);
    setRedeemLoyalty(false); setLoyaltyPointsToRedeem(0); setLoyaltyAmountApplied(0);
    setReferralCode(""); setReferralApplied(null); setReferralError(null); setDiscountsOpen(false);
    setClientSearch(""); setPendingClient(null);
    setShowNewClientDialog(false); setNewClientName(""); setNewClientWhatsapp(""); setNewClientEmail(""); setNewClientError(null);
  };
  const handleClose = () => { resetWizard(); onClose(); };
  const canGoNext1 = !!selectedTripId && !!selectedClientId && effectiveSeats.length > 0;

  const handleSelectClient = (id: string) => {
    setSelectedClientId(id);
    setClientComboOpen(false);
    if (isCpfMode) {
      const matched = cpfMatches.find(c => c.id === id);
      if (matched) {
        setPendingClient(matched);
        toast({ title: "Cliente identificado pelo CPF", description: `${matched.name} foi vinculado à reserva.` });
      }
    }
    setClientSearch("");
  };

  const handleOpenNewClientDialog = () => {
    setNewClientName("");
    setNewClientWhatsapp("");
    setNewClientEmail("");
    setNewClientError(null);
    setShowNewClientDialog(true);
  };

  const handleCreateNewClient = async () => {
    setNewClientError(null);
    if (!newClientName.trim() || !newClientWhatsapp.trim()) {
      setNewClientError("Nome e WhatsApp são obrigatórios.");
      return;
    }
    try {
      const result = await createClient.mutateAsync({
        data: {
          name: newClientName.trim(),
          email: newClientEmail.trim() || "",
          whatsapp: newClientWhatsapp.trim(),
          cpf: cpfClean,
        },
      });
      const isNew = result.isNew ?? true;
      setPendingClient({ id: result.id, name: result.name, whatsapp: result.whatsapp ?? null });
      setSelectedClientId(result.id);
      setShowNewClientDialog(false);
      setClientSearch("");
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({
        title: isNew ? "Novo cliente cadastrado" : "Cliente vinculado pelo CPF",
        description: isNew
          ? `${result.name} foi cadastrado e vinculado à reserva.`
          : `${result.name} já estava cadastrado e foi vinculado à reserva.`,
      });
    } catch (err: unknown) {
      const apiMsg = (err as { data?: { error?: string } })?.data?.error;
      setNewClientError(apiMsg ?? (err instanceof Error ? err.message : "Erro ao cadastrar cliente."));
    }
  };

  const handleCouponApply = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true); setCouponError(null);
    try {
      const result = await validateCoupon.mutateAsync({ data: { code: couponCode.trim(), subtotal: totalValue } });
      if (result.valid) { setCouponApplied({ code: result.couponCode, amount: result.discountAmount }); setCouponError(null); }
      else { setCouponError(result.message ?? "Cupom inválido"); setCouponApplied(null); }
    } catch { setCouponError("Erro ao validar cupom"); }
    finally { setCouponLoading(false); }
  };

  const handleReferralApply = async () => {
    if (!referralCode.trim()) return;
    setReferralLoading(true); setReferralError(null);
    try {
      const result = await validateReferralCode(referralCode.trim());
      if (result.valid) { setReferralApplied({ id: result.referralId ?? "", code: referralCode.trim(), amount: result.bonusAmount }); setReferralError(null); }
      else { setReferralError(result.message ?? "Código inválido"); setReferralApplied(null); }
    } catch { setReferralError("Erro ao validar código de indicação"); }
    finally { setReferralLoading(false); }
  };

  const handleConfirm = async () => {
    setCreateError(null);
    if (effectiveSeats.length === 0) { setCreateError("Selecione pelo menos um assento antes de confirmar."); return; }
    try {
      const created = await createReservation.mutateAsync({
        data: {
          tripId: selectedTripId, clientId: selectedClientId, seats: effectiveSeats,
          totalValue, paidValue: paidValue || undefined, paymentMethod, installments,
          firstDueDate: firstDueDate || undefined,
          notes: notes || undefined, hasInsurance,
          commissionAmount: commissionAmount > 0 ? commissionAmount : null,
          sellerId: sellerId !== "none" ? sellerId : null,
          discountCouponCode: couponApplied?.code ?? null, discountCouponAmount: null,
          discountLoyaltyPoints: loyaltyPointsToRedeem > 0 ? loyaltyPointsToRedeem : null, discountLoyaltyAmount: null,
          discountReferralCode: referralApplied?.code ?? null, discountReferralAmount: null, discountTotal: null,
        },
      });
      const effectiveBoardingId = boardingLocationId && boardingLocationId !== "__none__" ? boardingLocationId : null;
      if (effectiveBoardingId && created?.id) {
        try { await updateReservation.mutateAsync({ id: created.id, data: { boardingLocationId: effectiveBoardingId } }); }
        catch { toast({ title: "Reserva criada", description: "Não foi possível salvar o ponto de embarque. Edite a reserva para ajustar." }); }
      }
      if (dealId && created?.id) {
        try { await updateDeal.mutateAsync({ id: dealId, data: { reservationId: created.id, status: "won" } }); await queryClient.invalidateQueries({ queryKey: ["/api/deals"] }); }
        catch { toast({ title: "Reserva criada", description: "Não foi possível vincular ao deal. Ligue manualmente se necessário." }); }
      }
      resetWizard(); onSuccess(); onClose();
    } catch (err: unknown) {
      const apiError = (err as { data?: { error?: string } })?.data?.error;
      setCreateError(apiError ?? (err instanceof Error ? err.message : null) ?? "Erro ao criar reserva");
    }
  };

  const balance = Math.max(0, finalTotal - paidValue);

  const step2Props = {
    totalValue, setTotalValue, paidValue, setPaidValue, paymentMethod, setPaymentMethod,
    installments, setInstallments, firstDueDate, setFirstDueDate, notes, setNotes, commissionAmount, setCommissionAmount,
    sellerId, setSellerId, hasInsurance, setHasInsurance,
    couponCode, setCouponCode, couponApplied, setCouponApplied, couponError, setCouponError, couponLoading,
    redeemLoyalty, setRedeemLoyalty, loyaltyPointsToRedeem, setLoyaltyPointsToRedeem, setLoyaltyAmountApplied,
    referralCode, setReferralCode, referralApplied, setReferralApplied, referralError, setReferralError, referralLoading,
    discountsOpen, setDiscountsOpen, loyaltyInfo, usersForWizard, selectedTripFull, selectedClientId, effectiveSeats,
    uiCouponApplied, uiLoyaltyApplied, uiReferralApplied, totalDiscount,
    handleCouponApply, handleReferralApply,
    onBack: () => setStep(1), onNext: () => setStep(3),
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Reserva</DialogTitle></DialogHeader>
          <WizardStepIndicator step={step} />

          {step === 1 && (
            <WizardStep1
              allTrips={allTrips} allClients={allClients} boardingRaw={boardingRaw}
              selectedTripFull={selectedTripFull} selectedTripId={selectedTripId}
              selectedClientId={selectedClientId} boardingLocationId={boardingLocationId}
              selectedSeats={selectedSeats} manualSeats={manualSeats}
              tripComboOpen={tripComboOpen} clientComboOpen={clientComboOpen} canGoNext={canGoNext1}
              clientSearch={clientSearch} isCpfMode={isCpfMode}
              cpfMatches={cpfMatches} cpfSearchLoading={cpfSearchLoading}
              pendingClient={pendingClient}
              setTripComboOpen={setTripComboOpen} setClientComboOpen={setClientComboOpen}
              onSelectTrip={id => { setSelectedTripId(id); setSelectedSeats([]); setManualSeats(""); setTripComboOpen(false); }}
              onSelectClient={handleSelectClient}
              onClientSearchChange={setClientSearch}
              onCreateNewClient={handleOpenNewClientDialog}
              onCloseClientCombo={() => setClientSearch("")}
              onSelectBoarding={setBoardingLocationId}
              onSelectSeats={setSelectedSeats}
              onManualSeatsChange={setManualSeats}
              onClose={handleClose}
              onNext={() => setStep(2)}
            />
          )}

          {step === 2 && <WizardStep2 {...step2Props} />}

          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-xl border p-4 space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Resumo da Reserva</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-muted-foreground text-xs mb-0.5">Viagem</p><p className="font-semibold">{selectedTrip?.name ?? "—"}</p>{selectedTrip?.destination && <p className="text-xs text-muted-foreground">{selectedTrip.destination}</p>}</div>
                  <div><p className="text-muted-foreground text-xs mb-0.5">Cliente</p><p className="font-semibold">{selectedClient?.name ?? "—"}</p>{selectedClient?.whatsapp && <p className="text-xs text-muted-foreground">{selectedClient.whatsapp}</p>}</div>
                  {selectedBoarding && <div><p className="text-muted-foreground text-xs mb-0.5">Ponto de Embarque</p><p className="font-semibold">{selectedBoarding.name}</p></div>}
                  <div><p className="text-muted-foreground text-xs mb-0.5">Assentos</p><p className="font-semibold">{effectiveSeats.length > 0 ? effectiveSeats.join(", ") : "A definir"}</p></div>
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="text-center"><p className="text-muted-foreground text-xs mb-0.5">Valor Base</p><p className={`font-bold text-base ${totalDiscount > 0 ? "line-through text-muted-foreground" : ""}`}>R$ {totalValue.toFixed(2)}</p></div>
                  <div className="text-center"><p className="text-muted-foreground text-xs mb-0.5">Valor Pago</p><p className="font-bold text-base text-green-600">R$ {paidValue.toFixed(2)}</p></div>
                  <div className="text-center"><p className="text-muted-foreground text-xs mb-0.5">Saldo</p><p className={`font-bold text-base ${balance > 0 ? "text-destructive" : "text-green-600"}`}>R$ {balance.toFixed(2)}</p></div>
                </div>
                {totalDiscount > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1.5 text-sm">
                    <p className="font-semibold text-green-800 text-xs uppercase tracking-wide">Descontos Aplicados</p>
                    {uiCouponApplied > 0 && couponApplied && <div className="flex justify-between text-green-700"><span>Cupom ({couponApplied.code})</span><span>−R$ {uiCouponApplied.toFixed(2)}</span></div>}
                    {uiLoyaltyApplied > 0 && <div className="flex justify-between text-green-700"><span>Fidelidade ({loyaltyPointsToRedeem} pts)</span><span>−R$ {uiLoyaltyApplied.toFixed(2)}</span></div>}
                    {uiReferralApplied > 0 && referralApplied && <div className="flex justify-between text-green-700"><span>Indicação ({referralApplied.code})</span><span>−R$ {uiReferralApplied.toFixed(2)}</span></div>}
                    <div className="flex justify-between font-bold text-green-800 pt-1 border-t border-green-200"><span>Total com Desconto</span><span>R$ {finalTotal.toFixed(2)}</span></div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-muted-foreground text-xs mb-0.5">Forma de Pagamento</p><p className="font-semibold">{PAYMENT_LABELS[paymentMethod] ?? paymentMethod}</p></div>
                  <div><p className="text-muted-foreground text-xs mb-0.5">Parcelas</p><p className="font-semibold">{installments}×</p></div>
                  {hasInsurance && <div><p className="text-muted-foreground text-xs mb-0.5">Seguro</p><p className="font-semibold">Incluso</p></div>}
                  {notes && <div className="col-span-2"><p className="text-muted-foreground text-xs mb-0.5">Observações</p><p className="font-semibold">{notes}</p></div>}
                </div>
              </div>
              {createError && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <XCircle className="w-4 h-4 shrink-0" /><span>{createError}</span>
                </div>
              )}
              <div className="flex justify-between gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(2)}>← Anterior</Button>
                <Button onClick={handleConfirm} disabled={createReservation.isPending}>
                  {createReservation.isPending ? "Criando..." : "Confirmar Reserva"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showNewClientDialog} onOpenChange={(o) => { if (!o) setShowNewClientDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastrar Novo Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>CPF</Label>
              <Input
                value={cpfClean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-name">Nome completo *</Label>
              <Input
                id="nc-name"
                placeholder="Nome completo"
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-wa">WhatsApp *</Label>
              <Input
                id="nc-wa"
                placeholder="(00) 00000-0000"
                value={newClientWhatsapp}
                onChange={e => setNewClientWhatsapp(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-email" className="text-muted-foreground">E-mail <span className="font-normal">(opcional)</span></Label>
              <Input
                id="nc-email"
                type="email"
                placeholder="email@exemplo.com"
                value={newClientEmail}
                onChange={e => setNewClientEmail(e.target.value)}
              />
            </div>
            {newClientError && (
              <p className="text-sm text-destructive">{newClientError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewClientDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateNewClient}
              disabled={createClient.isPending || !newClientName.trim() || !newClientWhatsapp.trim()}
            >
              {createClient.isPending ? "Salvando..." : "Cadastrar e Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
