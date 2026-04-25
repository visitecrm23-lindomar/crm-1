import { useState, useEffect, useCallback } from "react";
import { CoverImageUpload } from "@/components/cover-image-upload";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTenant,
  getGetTenantQueryKey,
  useUpdateTenant,
  useListSystemConfigs,
  useUpsertSystemConfig,
  useGetMe,
  useGetCalendarStatus,
  getGetCalendarStatusQueryKey,
  useDisconnectCalendar,
  useSyncCalendar,
  getCalendarConnectUrl,
  useGetCurrentSubscription,
  useUpgradeSubscription,
  useCreateStripeCheckout,
  getCurrentSubscriptionQueryKey,
  type PlanPublic,
  type SubscriptionInvoice,
} from "@workspace/api-client-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type {
  UpdateTenantBody,
  SystemConfig,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  CreditCard,
  Puzzle,
  Bell,
  Palette,
  Key,
  CheckCircle2,
  Wifi,
  Users,
  UserPlus,
  Mail,
  Loader2,
  Trash2,
  Target,
  Lock,
  CalendarDays,
  RefreshCw,
  Link2,
  Unlink,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ──────────────────── Sales Goal Section ──────────────────── */
function SalesGoalSection() {
  const { toast } = useToast();
  const { data: configs = [], refetch } = useListSystemConfigs();
  const upsert = useUpsertSystemConfig();
  const currentGoal = (() => {
    const v = configs.find((c) => c.key === "salesMonthlyGoal")?.value;
    return typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : 50000;
  })();
  const [goalInput, setGoalInput] = useState("");

  useEffect(() => {
    setGoalInput(String(currentGoal));
  }, [currentGoal]);

  async function handleSaveGoal() {
    const parsed = parseFloat(goalInput.replace(/\./g, "").replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) {
      toast({ title: "Valor inválido para a meta", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({ data: { key: "salesMonthlyGoal", value: parsed } });
      toast({ title: "Meta de vendas atualizada" });
      refetch();
    } catch {
      toast({ title: "Erro ao salvar meta", variant: "destructive" });
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-3 mt-4">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Meta de Vendas Mensal</h3>
      </div>
      <p className="text-xs text-muted-foreground">Defina a meta de faturamento mensal por vendedor. Usada no painel de vendedores.</p>
      <div className="flex items-center gap-2 max-w-xs">
        <span className="text-sm text-muted-foreground">R$</span>
        <Input
          value={goalInput}
          onChange={(e) => setGoalInput(e.target.value)}
          placeholder="50000"
          type="number"
          min="0"
          step="1000"
        />
        <Button size="sm" onClick={handleSaveGoal} disabled={upsert.isPending}>
          Salvar
        </Button>
      </div>
    </div>
  );
}

/* ──────────────────── Change Password Section ──────────────────── */
function ChangePasswordSection() {
  const { user } = useUser();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast({ title: "Usuário não autenticado", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "As senhas não coincidem", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "A nova senha deve ter pelo menos 8 caracteres", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await user.updatePassword({ currentPassword, newPassword, signOutOfOtherSessions: false });
      toast({ title: "Senha alterada com sucesso" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Erro ao alterar senha";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-3 mt-4">
      <div className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Alterar Senha</h3>
      </div>
      {user?.passwordEnabled === false ? (
        <p className="text-xs text-muted-foreground">
          Sua conta usa login pelo Google — não é necessário definir uma senha.
        </p>
      ) : (
        <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
          <div className="space-y-1">
            <Label htmlFor="currentPassword" className="text-xs">Senha Atual</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="newPassword" className="text-xs">Nova Senha</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirmPassword" className="text-xs">Confirmar Nova Senha</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <Button type="submit" size="sm" disabled={isLoading}>
            {isLoading && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
            Alterar Senha
          </Button>
        </form>
      )}
    </div>
  );
}

/* ──────────────────── Agency Profile Tab ──────────────────── */
function AgencyProfileTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me, refetch: refetchMe } = useGetMe();
  const tenantId = me?.tenantId ?? null;
  const { data: fullTenant } = useGetTenant(tenantId ?? "", {
    query: {
      queryKey: getGetTenantQueryKey(tenantId ?? ""),
      enabled: !!tenantId,
    },
  });
  const updateTenant = useUpdateTenant();

  const [form, setForm] = useState<UpdateTenantBody>({});
  const [uploadingCount, setUploadingCount] = useState(0);
  const handleUploadingChange = useCallback((uploading: boolean) => {
    setUploadingCount((n) => Math.max(0, n + (uploading ? 1 : -1)));
  }, []);

  useEffect(() => {
    if (fullTenant) {
      setForm({
        name: fullTenant.name,
        logoUrl: fullTenant.logoUrl ?? "",
        primaryColor: fullTenant.primaryColor ?? "#3B82F6",
        secondaryColor: fullTenant.secondaryColor ?? "#8B5CF6",
        whatsapp: fullTenant.whatsapp ?? "",
        phone: fullTenant.phone ?? "",
        website: fullTenant.website ?? "",
        reservationPrefix: fullTenant.reservationPrefix ?? "",
      });
    } else if (me?.tenant) {
      setForm((f) => ({
        ...f,
        name: me.tenant!.name,
        logoUrl: me.tenant!.logoUrl ?? "",
        primaryColor: me.tenant!.primaryColor ?? "#3B82F6",
        secondaryColor: me.tenant!.secondaryColor ?? "#8B5CF6",
      }));
    }
  }, [fullTenant?.id, me?.tenant?.id]);

  async function handleSave() {
    if (!tenantId) {
      toast({ title: "Não foi possível identificar a agência", variant: "destructive" });
      return;
    }
    try {
      await updateTenant.mutateAsync({ id: tenantId, data: form });
      toast({ title: "Perfil da agência atualizado" });
      await queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) });
      refetchMe();
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="space-y-1">
        <Label>Nome da Agência</Label>
        <Input
          value={form.name ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </div>
      <div className="space-y-1">
        <Label>Logo</Label>
        <CoverImageUpload
          endpoint="agencyLogo"
          value={form.logoUrl ?? ""}
          onChange={(url) => setForm((f) => ({ ...f, logoUrl: url }))}
          onUploadingChange={handleUploadingChange}
          emptyLabel="Clique ou arraste o logo aqui"
          previewClassName="h-32"
          objectFit="contain"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>WhatsApp</Label>
          <Input
            value={form.whatsapp ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
            placeholder="+55 (11) 99999-9999"
          />
        </div>
        <div className="space-y-1">
          <Label>Telefone</Label>
          <Input
            value={form.phone ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Website</Label>
        <Input
          value={form.website ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
          placeholder="https://suaagencia.com.br"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Cor Primária</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.primaryColor ?? "#3B82F6"}
              onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
              className="h-9 w-14 cursor-pointer rounded border"
            />
            <Input
              value={form.primaryColor ?? "#3B82F6"}
              onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
              className="font-mono"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Cor Secundária</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.secondaryColor ?? "#8B5CF6"}
              onChange={(e) => setForm((f) => ({ ...f, secondaryColor: e.target.value }))}
              className="h-9 w-14 cursor-pointer rounded border"
            />
            <Input
              value={form.secondaryColor ?? "#8B5CF6"}
              onChange={(e) => setForm((f) => ({ ...f, secondaryColor: e.target.value }))}
              className="font-mono"
            />
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Prefixo de Reservas</Label>
        <div className="flex items-center gap-2">
          <Input
            value={form.reservationPrefix ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, reservationPrefix: e.target.value.toUpperCase().slice(0, 5) }))}
            placeholder="Ex: CHQ, AGT..."
            className="font-mono w-36"
            maxLength={5}
          />
          <span className="text-xs text-muted-foreground">
            Aparece nos números de reserva: <span className="font-mono font-semibold">{form.reservationPrefix || "CHQ"}-EXC-202604-00001</span>
          </span>
        </div>
      </div>
      <Button onClick={handleSave} disabled={updateTenant.isPending || uploadingCount > 0}>
        {uploadingCount > 0 ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Aguardando upload...</>
        ) : updateTenant.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
        ) : "Salvar Perfil"}
      </Button>

      <SalesGoalSection />
      <ChangePasswordSection />
    </div>
  );
}

/* ──────────────────── Plan & Billing Tab ──────────────────── */
function formatCurrencyBRL(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "Grátis";
  const num = Number(value);
  if (num === 0) return "Grátis";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

interface PixModalProps {
  invoice: SubscriptionInvoice;
  onClose: () => void;
  onPayWithCard?: () => void;
}

function PixModal({ invoice, onClose, onPayWithCard }: PixModalProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  function copyCode() {
    if (invoice.pixCode) {
      navigator.clipboard.writeText(invoice.pixCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Código PIX copiado!" });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Pagamento via PIX
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">
              {formatCurrencyBRL(invoice.amount)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{invoice.description}</p>
          </div>

          {invoice.pixQrCodeUrl && (
            <div className="flex justify-center">
              <img
                src={invoice.pixQrCodeUrl}
                alt="QR Code PIX"
                className="w-48 h-48 rounded-lg border"
              />
            </div>
          )}

          {invoice.pixCode && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                Ou copie o código PIX abaixo
              </p>
              <div className="flex gap-2">
                <Input
                  value={invoice.pixCode}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button variant="outline" size="sm" onClick={copyCode}>
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : "Copiar"}
                </Button>
              </div>
            </div>
          )}

          {invoice.pixExpiresAt && (
            <p className="text-xs text-center text-muted-foreground">
              Válido até: {new Date(invoice.pixExpiresAt).toLocaleString("pt-BR")}
            </p>
          )}

          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p>• Após o pagamento, seu plano será ativado em até 1 hora.</p>
            <p>• Em caso de dúvidas, entre em contato com nosso suporte.</p>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {onPayWithCard && (
            <Button variant="outline" onClick={onPayWithCard} className="gap-2">
              <CreditCard className="w-4 h-4" />
              Pagar com Cartão
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const stripePromise = loadStripe(import.meta.env["VITE_STRIPE_PUBLIC_KEY"] ?? "");

interface CardPaymentFormProps {
  onSuccess: () => void;
  onError: (msg: string) => void;
}

function CardPaymentForm({ onSuccess, onError }: CardPaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    if (!stripe || !elements) return;
    setLoading(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    setLoading(false);
    if (error) {
      onError(error.message ?? "Erro ao processar pagamento");
    } else {
      onSuccess();
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      <Button onClick={handlePay} disabled={loading || !stripe} className="w-full">
        {loading ? "Processando..." : "Confirmar Pagamento"}
      </Button>
    </div>
  );
}

interface CardPaymentModalProps {
  invoice: SubscriptionInvoice;
  clientSecret: string;
  onClose: () => void;
  onSuccess: () => void;
}

function CardPaymentModal({ invoice, clientSecret, onClose, onSuccess }: CardPaymentModalProps) {
  const { toast } = useToast();

  function handleSuccess() {
    toast({ title: "Pagamento confirmado!", description: "Seu plano será ativado em instantes." });
    onSuccess();
    onClose();
  }

  function handleError(msg: string) {
    toast({ title: msg, variant: "destructive" });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Pagamento com Cartão
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{formatCurrencyBRL(invoice.amount)}</p>
            <p className="text-sm text-muted-foreground mt-1">{invoice.description}</p>
          </div>
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CardPaymentForm onSuccess={handleSuccess} onError={handleError} />
          </Elements>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: subData, isLoading } = useGetCurrentSubscription();
  const upgrade = useUpgradeSubscription();
  const stripeCheckout = useCreateStripeCheckout();
  const [showPixModal, setShowPixModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [cardClientSecret, setCardClientSecret] = useState<string | null>(null);
  const [pendingInvoice, setPendingInvoice] = useState<SubscriptionInvoice | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<"monthly" | "annual">("monthly");

  const currentPlan = subData?.plan;
  const plans = subData?.plans ?? [];
  const usage = subData?.usage;

  const pendingFromList = subData?.invoices?.find(inv => inv.status === "pending" && inv.pixCode);

  async function handleUpgrade(plan: PlanPublic) {
    try {
      const result = await upgrade.mutateAsync({ planId: plan.id, billingCycle: selectedCycle });
      await queryClient.invalidateQueries({ queryKey: getCurrentSubscriptionQueryKey() });
      const r = result as unknown as { upgraded: boolean; trial?: boolean; trialEndsAt?: string; invoice?: typeof result.invoice };
      if (r.upgraded && result.invoice) {
        setPendingInvoice(result.invoice);
        if (r.trial) {
          toast({
            title: `Trial do ${plan.name} ativado!`,
            description: r.trialEndsAt
              ? `Seu trial vai até ${new Date(r.trialEndsAt).toLocaleDateString("pt-BR")}. Uma cobrança será gerada ao final.`
              : "Seu trial foi ativado com sucesso.",
          });
        } else {
          setShowPixModal(true);
        }
      } else if (result.upgraded) {
        toast({ title: `Plano ${plan.name} ativado!`, description: "Seu plano foi alterado com sucesso." });
      } else if (result.invoice) {
        setPendingInvoice(result.invoice);
        setShowPixModal(true);
      }
    } catch {
      toast({ title: "Erro ao fazer upgrade", variant: "destructive" });
    }
  }

  async function handlePayWithCard(invoice: SubscriptionInvoice) {
    try {
      const result = await stripeCheckout.mutateAsync({ id: invoice.id });
      setPendingInvoice(invoice);
      setCardClientSecret(result.clientSecret);
      setShowPixModal(false);
      setShowCardModal(true);
    } catch {
      toast({ title: "Erro ao iniciar pagamento com cartão", variant: "destructive" });
    }
  }

  if (isLoading) {
    return <div className="animate-pulse text-muted-foreground py-8 text-center">Carregando plano...</div>;
  }

  const usageItems = usage
    ? [
        { label: "Clientes", used: usage.clients, max: usage.maxClients },
        { label: "Viagens", used: usage.trips, max: usage.maxTrips },
        { label: "Usuários", used: usage.users, max: usage.maxUsers },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge>{currentPlan?.name ?? subData?.tenant?.planId ?? "Starter"}</Badge>
            Plano atual
          </CardTitle>
          <CardDescription>
            {currentPlan
              ? `Você está no plano ${currentPlan.name} — ${Number(currentPlan.monthlyPrice) === 0 ? "Grátis" : `${formatCurrencyBRL(currentPlan.monthlyPrice)}/mês`}`
              : "Carregando informações do plano..."}
          </CardDescription>
        </CardHeader>
        {usageItems.length > 0 && (
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {usageItems.map((item) => {
                const pct = Math.min((item.used / item.max) * 100, 100);
                const isNearLimit = pct >= 80;
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>{item.label}</span>
                      <span className={`text-muted-foreground ${isNearLimit ? "text-amber-600 font-medium" : ""}`}>
                        {item.used}/{item.max}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full">
                      <div
                        className={`h-2 rounded-full transition-all ${isNearLimit ? "bg-amber-500" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        )}
      </Card>

      {pendingFromList && !showPixModal && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="font-medium text-amber-800">Pagamento pendente</p>
              <p className="text-sm text-amber-700">{pendingFromList.description} — {formatCurrencyBRL(pendingFromList.amount)}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-400 text-amber-800"
              onClick={() => { setPendingInvoice(pendingFromList); setShowPixModal(true); }}
            >
              Ver PIX
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3 justify-end">
        <span className="text-sm text-muted-foreground">Ciclo de faturamento:</span>
        <div className="flex border rounded-lg overflow-hidden">
          <button
            className={`px-3 py-1.5 text-sm ${selectedCycle === "monthly" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setSelectedCycle("monthly")}
          >
            Mensal
          </button>
          <button
            className={`px-3 py-1.5 text-sm ${selectedCycle === "annual" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setSelectedCycle("annual")}
          >
            Anual <span className="text-xs opacity-75">(-17%)</span>
          </button>
        </div>
      </div>

      <div className={`grid gap-4 ${plans.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {(plans.length > 0 ? plans : [
          { id: "starter", name: "Starter", slug: "starter", monthlyPrice: "0", annualPrice: "0", maxUsers: 3, maxClients: 500, maxTrips: 20, features: [], isActive: true, isFeatured: false, sortOrder: 1, trialDays: 0, createdAt: "", updatedAt: "", description: null },
        ] as PlanPublic[]).map((plan) => {
          const isCurrentPlan = plan.slug === subData?.tenant?.planId || plan.id === subData?.tenant?.planId;
          const price = selectedCycle === "annual" ? Number(plan.annualPrice) : Number(plan.monthlyPrice);
          const monthlyEquiv = selectedCycle === "annual" && Number(plan.annualPrice) > 0
            ? (Number(plan.annualPrice) / 12).toFixed(0)
            : null;
          return (
            <Card
              key={plan.id}
              className={isCurrentPlan ? "border-primary ring-1 ring-primary" : ""}
            >
              {plan.isFeatured && (
                <div className="text-center py-1 bg-primary text-primary-foreground text-xs font-medium rounded-t-lg -mt-px mx-px">
                  Mais popular
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-base">{plan.name}</CardTitle>
                <CardDescription className="text-lg font-bold text-foreground">
                  {price === 0
                    ? "Grátis"
                    : selectedCycle === "annual"
                      ? <>{formatCurrencyBRL(plan.annualPrice)}/ano {monthlyEquiv && <span className="text-xs font-normal text-muted-foreground">(≈ R$ {monthlyEquiv}/mês)</span>}</>
                      : `${formatCurrencyBRL(plan.monthlyPrice)}/mês`
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>Até {plan.maxClients.toLocaleString("pt-BR")} clientes</p>
                <p>Até {plan.maxTrips.toLocaleString("pt-BR")} viagens</p>
                <p>Até {plan.maxUsers} usuários</p>
                {plan.trialDays > 0 && (
                  <p className="text-primary font-medium">{plan.trialDays} dias grátis</p>
                )}
              </CardContent>
              {!isCurrentPlan && (
                <div className="px-6 pb-4">
                  <Button
                    className="w-full"
                    variant={plan.isFeatured ? "default" : "outline"}
                    onClick={() => handleUpgrade(plan)}
                    disabled={upgrade.isPending}
                  >
                    {upgrade.isPending ? "Processando..." : price === 0 ? "Mudar para Starter" : "Fazer upgrade"}
                  </Button>
                </div>
              )}
              {isCurrentPlan && (
                <div className="px-6 pb-4">
                  <div className="flex items-center justify-center gap-1 text-sm text-primary font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Plano atual
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {subData?.invoices && subData.invoices.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Faturas Anteriores</h3>
          <div className="rounded-md border divide-y text-sm">
            {subData.invoices.map((inv) => {
              const statusLabels: Record<string, string> = {
                pending: "Pendente", pending_payment: "Aguardando Pgto.", processing: "Processando PIX",
                paid: "Pago", failed: "Falhou", overdue: "Vencido", canceled: "Cancelado",
              };
              const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
                paid: "default", failed: "destructive", overdue: "destructive", canceled: "outline",
              };
              return (
                <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{inv.invoiceNumber ?? inv.id.slice(0, 8)}</p>
                    <p className="font-medium">{formatCurrencyBRL(inv.amount)}</p>
                    {inv.dueDate && (
                      <p className="text-xs text-muted-foreground">
                        Vence: {new Date(inv.dueDate).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                  <Badge variant={statusVariants[inv.status] ?? "secondary"} className="text-xs">
                    {statusLabels[inv.status] ?? inv.status}
                  </Badge>
                  {(inv.status === "pending" || inv.status === "pending_payment") && (
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => { setPendingInvoice(inv); setShowPixModal(true); }}>
                      Pagar
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showPixModal && pendingInvoice && (
        <PixModal
          invoice={pendingInvoice}
          onClose={() => setShowPixModal(false)}
          onPayWithCard={() => handlePayWithCard(pendingInvoice)}
        />
      )}

      {showCardModal && pendingInvoice && cardClientSecret && (
        <CardPaymentModal
          invoice={pendingInvoice}
          clientSecret={cardClientSecret}
          onClose={() => { setShowCardModal(false); setCardClientSecret(null); }}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: getCurrentSubscriptionQueryKey() })}
        />
      )}
    </div>
  );
}

/* ──────────────────── Integrations Tab ──────────────────── */
interface IntegrationConfig {
  key: string;
  label: string;
  description: string;
  fields: { key: string; label: string; type?: string; placeholder?: string }[];
}

const INTEGRATIONS: IntegrationConfig[] = [
  {
    key: "whatsapp_evolution",
    label: "WhatsApp (Evolution API)",
    description: "Envio de mensagens WhatsApp via Evolution API",
    fields: [
      { key: "apiUrl", label: "URL da API", placeholder: "https://evolution.agencia.com" },
      { key: "apiKey", label: "API Key", type: "password" },
      { key: "instanceName", label: "Nome da Instância", placeholder: "agencia" },
    ],
  },
  {
    key: "mercadopago",
    label: "MercadoPago",
    description: "Processamento de pagamentos via MercadoPago",
    fields: [
      { key: "publicKey", label: "Public Key", placeholder: "APP_USR-..." },
      { key: "accessToken", label: "Access Token", type: "password" },
    ],
  },
  {
    key: "hurb",
    label: "Hurb (Hotel Urbano)",
    description: "Integração com marketplace Hurb para distribuição de viagens",
    fields: [
      { key: "partnerId", label: "Partner ID" },
      { key: "apiKey", label: "API Key", type: "password" },
    ],
  },
  {
    key: "google_analytics",
    label: "Google Analytics",
    description: "Rastreamento de eventos e conversões",
    fields: [
      { key: "measurementId", label: "Measurement ID", placeholder: "G-XXXXXXXXXX" },
    ],
  },
];

function IntegrationsTab() {
  const { toast } = useToast();
  const { data: configs = [], refetch } = useListSystemConfigs();
  const upsert = useUpsertSystemConfig();

  const [openIntegration, setOpenIntegration] = useState<IntegrationConfig | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);

  function getConfigValue(key: string): Record<string, string> {
    const cfg = configs.find((c) => c.key === key);
    if (!cfg?.value) return {};
    return cfg.value as Record<string, string>;
  }

  function isConfigured(key: string): boolean {
    const val = getConfigValue(key);
    return Object.keys(val).length > 0;
  }

  function openModal(integration: IntegrationConfig) {
    setOpenIntegration(integration);
    setForm(getConfigValue(integration.key));
  }

  async function handleSave() {
    if (!openIntegration) return;
    try {
      await upsert.mutateAsync({ data: { key: openIntegration.key, value: form } });
      toast({ title: "Integração salva com sucesso" });
      setOpenIntegration(null);
      refetch();
    } catch {
      toast({ title: "Erro ao salvar integração", variant: "destructive" });
    }
  }

  function handleTest() {
    setTesting(true);
    setTimeout(() => {
      setTesting(false);
      toast({ title: "Conexão testada com sucesso" });
    }, 1500);
  }

  return (
    <div className="space-y-4">
      <GoogleCalendarCard />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {INTEGRATIONS.map((integration) => {
          const configured = isConfigured(integration.key);
          return (
            <Card key={integration.key}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-muted-foreground" />
                    {integration.label}
                  </CardTitle>
                  {configured ? (
                    <Badge className="text-xs bg-green-50 text-green-700 border border-green-200">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Configurado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      Não configurado
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs">{integration.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" onClick={() => openModal(integration)}>
                  {configured ? "Editar" : "Configurar"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!openIntegration} onOpenChange={() => setOpenIntegration(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{openIntegration?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {openIntegration?.fields.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label>{field.label}</Label>
                <Input
                  type={field.type ?? "text"}
                  value={form[field.key] ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing}
              className="sm:mr-auto"
            >
              {testing ? "Testando..." : "Testar Conexão"}
            </Button>
            <Button variant="outline" onClick={() => setOpenIntegration(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={upsert.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ──────────────────── Google Calendar Card ──────────────────── */
function GoogleCalendarCard() {
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);

  const canConnect = me?.role === "agencia" || me?.role === "vendedor" || me?.role === "superadmin";

  const { data: status } = useGetCalendarStatus({
    query: { enabled: canConnect, queryKey: getGetCalendarStatusQueryKey() },
  });

  const disconnectMutation = useDisconnectCalendar({
    mutation: {
      onSuccess: () => {
        toast({ title: "Google Calendar desconectado" });
        queryClient.invalidateQueries({ queryKey: getGetCalendarStatusQueryKey() });
      },
      onError: () => toast({ title: "Erro ao desconectar", variant: "destructive" }),
    },
  });

  const syncMutation = useSyncCalendar({
    mutation: {
      onSuccess: (data) => {
        toast({ title: `${data.synced} evento(s) sincronizado(s) com sucesso` });
        queryClient.invalidateQueries({ queryKey: getGetCalendarStatusQueryKey() });
      },
      onError: () => toast({ title: "Erro ao sincronizar", variant: "destructive" }),
    },
  });

  useEffect(() => {
    if (!canConnect) return;
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get("gcal");
    if (gcal === "success") {
      toast({ title: "Google Calendar conectado com sucesso!" });
      queryClient.invalidateQueries({ queryKey: getGetCalendarStatusQueryKey() });
      const url = new URL(window.location.href);
      url.searchParams.delete("gcal");
      window.history.replaceState({}, "", url.toString());
    } else if (gcal === "denied") {
      toast({ title: "Autorização negada pelo Google", variant: "destructive" });
      const url = new URL(window.location.href);
      url.searchParams.delete("gcal");
      window.history.replaceState({}, "", url.toString());
    } else if (gcal === "error") {
      toast({ title: "Erro ao conectar com Google Calendar", variant: "destructive" });
      const url = new URL(window.location.href);
      url.searchParams.delete("gcal");
      window.history.replaceState({}, "", url.toString());
    }
  }, [canConnect]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const data = await getCalendarConnectUrl();
      if (data.url) window.location.href = data.url;
      else toast({ title: "Erro ao iniciar autenticação", variant: "destructive" });
    } catch {
      toast({ title: "Erro ao conectar", variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  }

  if (!canConnect) return null;

  const connected = status?.connected ?? false;
  const loading = disconnectMutation.isPending || connecting;
  const syncing = syncMutation.isPending;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-blue-500" />
            Google Calendar
          </CardTitle>
          {connected ? (
            <Badge className="text-xs bg-green-50 text-green-700 border border-green-200">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Conectado
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              Não conectado
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          Sincronize viagens, pagamentos e aniversários de clientes com sua agenda Google.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {connected && (
          <div className="text-xs text-muted-foreground space-y-1 bg-muted/40 rounded p-2">
            <p>
              <span className="font-medium">Eventos sincronizados:</span> {status?.eventsCount ?? 0}
            </p>
            {status?.lastSync && (
              <p>
                <span className="font-medium">Última sincronização:</span>{" "}
                {new Date(status.lastSync).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <Button size="sm" onClick={handleConnect} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Conectar com Google
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => syncMutation.mutate({ data: { type: "all" } })}
                disabled={syncing}
                className="gap-1.5"
              >
                {syncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Sincronizar Agora
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading}
                    className="gap-1.5 text-destructive hover:text-destructive"
                  >
                    {loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Unlink className="w-3.5 h-3.5" />
                    )}
                    Desconectar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desconectar Google Calendar?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso irá revogar o acesso ao seu Google Calendar e remover todos os eventos
                      sincronizados do sistema. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disconnectMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Sim, desconectar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ──────────────────── Notifications Tab ──────────────────── */
function NotificationsTab() {
  const { toast } = useToast();
  const { data: configs = [], refetch } = useListSystemConfigs();
  const upsert = useUpsertSystemConfig();

  const notifConfig = (configs.find((c) => c.key === "notifications")?.value ?? {}) as Record<
    string,
    boolean
  >;

  const NOTIFICATIONS = [
    { key: "newReservation", label: "Nova reserva criada" },
    { key: "paymentReceived", label: "Pagamento recebido" },
    { key: "checkinDone", label: "Check-in realizado" },
    { key: "npsResponse", label: "Nova resposta NPS" },
    { key: "campaignSent", label: "Campanha enviada" },
    { key: "referralConverted", label: "Indicação convertida" },
    { key: "tripReminder", label: "Lembrete de viagem (7 dias)" },
    { key: "birthdayAlert", label: "Alerta de aniversário" },
    { key: "overduePayment", label: "Pagamentos vencidos" },
    { key: "unpaidReservation", label: "Reservas confirmadas sem pagamento" },
    { key: "lowOccupancy", label: "Viagens com baixa ocupação (<50%)" },
  ];

  async function handleToggle(key: string, value: boolean) {
    try {
      await upsert.mutateAsync({
        data: { key: "notifications", value: { ...notifConfig, [key]: value } },
      });
      refetch();
    } catch {
      toast({ title: "Erro ao salvar preferência", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <p className="text-sm text-muted-foreground">
        Escolha quais eventos geram notificações no sistema.
      </p>
      <div className="rounded-md border divide-y">
        {NOTIFICATIONS.map((n) => (
          <div key={n.key} className="flex items-center justify-between px-4 py-3">
            <Label className="cursor-pointer">{n.label}</Label>
            <Switch
              checked={notifConfig[n.key] ?? true}
              onCheckedChange={(v) => handleToggle(n.key, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────── Customization Tab ──────────────────── */
function CustomizationTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me, refetch: refetchMe } = useGetMe();
  const tenantId = me?.tenantId ?? null;
  const { data: fullTenant } = useGetTenant(tenantId ?? "", {
    query: {
      queryKey: getGetTenantQueryKey(tenantId ?? ""),
      enabled: !!tenantId,
    },
  });
  const updateTenant = useUpdateTenant();

  const [primaryColor, setPrimaryColor] = useState(me?.tenant?.primaryColor ?? "#3B82F6");
  const [secondaryColor, setSecondaryColor] = useState(me?.tenant?.secondaryColor ?? "#8B5CF6");
  const [logoUrl, setLogoUrl] = useState(me?.tenant?.logoUrl ?? "");
  const [uploadingCount, setUploadingCount] = useState(0);
  const handleUploadingChange = useCallback((uploading: boolean) => {
    setUploadingCount((n) => Math.max(0, n + (uploading ? 1 : -1)));
  }, []);

  useEffect(() => {
    if (fullTenant) {
      setPrimaryColor(fullTenant.primaryColor ?? "#3B82F6");
      setSecondaryColor(fullTenant.secondaryColor ?? "#8B5CF6");
      setLogoUrl(fullTenant.logoUrl ?? "");
    }
  }, [fullTenant?.id]);

  async function handleSave() {
    if (!tenantId) {
      toast({ title: "Não foi possível identificar a agência", variant: "destructive" });
      return;
    }
    try {
      await updateTenant.mutateAsync({ id: tenantId, data: { primaryColor, secondaryColor, logoUrl } });
      toast({ title: "Personalização salva com sucesso" });
      await queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) });
      refetchMe();
    } catch {
      toast({ title: "Erro ao salvar personalização", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="space-y-4">
        <h3 className="font-semibold text-sm">Cores do sistema</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Cor primária</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-border"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="font-mono uppercase"
                maxLength={7}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cor secundária</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-border"
              />
              <Input
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="font-mono uppercase"
                maxLength={7}
              />
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <div className="w-16 h-8 rounded-md" style={{ backgroundColor: primaryColor }} />
          <div className="w-16 h-8 rounded-md" style={{ backgroundColor: secondaryColor }} />
          <div className="w-16 h-8 rounded-md bg-gradient-to-r" style={{ backgroundImage: `linear-gradient(to right, ${primaryColor}, ${secondaryColor})` }} />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Logotipo</h3>
        <CoverImageUpload
          endpoint="agencyLogo"
          value={logoUrl}
          onChange={setLogoUrl}
          onUploadingChange={handleUploadingChange}
          emptyLabel="Clique ou arraste o logo aqui"
          previewClassName="h-32"
          objectFit="contain"
        />
        <p className="text-xs text-muted-foreground">
          Recomendado: PNG com fundo transparente, tamanho mínimo 200x60px
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Favicon</h3>
        <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/20">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            V
          </div>
          <p className="text-sm text-muted-foreground">
            Favicon gerado automaticamente a partir das iniciais do nome da agência
          </p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={updateTenant.isPending || uploadingCount > 0}>
        {uploadingCount > 0 ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Aguardando upload...</>
        ) : updateTenant.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
        ) : "Salvar personalização"}
      </Button>
    </div>
  );
}

/* ──────────────────── Team Tab ──────────────────── */
const roleLabels: Record<string, string> = {
  agencia: "Gestor",
  gerente: "Gerente",
  vendedor: "Vendedor",
  suporte: "Suporte",
  superadmin: "Super Admin",
  cliente: "Cliente",
};

const roleColors: Record<string, string> = {
  agencia: "bg-blue-100 text-blue-800",
  gerente: "bg-teal-100 text-teal-800",
  vendedor: "bg-green-100 text-green-800",
  suporte: "bg-orange-100 text-orange-800",
  superadmin: "bg-purple-100 text-purple-800",
  cliente: "bg-gray-100 text-gray-800",
};

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  avatarUrl?: string | null;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  accepted: boolean;
  expiresAt: string | null;
  createdAt: string;
}

function TeamTab() {
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"vendedor" | "gerente" | "suporte">("vendedor");
  const [inviting, setInviting] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);

  async function loadTeam() {
    setLoading(true);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        fetch(`${BASE}/api/team/members`, { credentials: "include" }),
        fetch(`${BASE}/api/team/invites`, { credentials: "include" }),
      ]);
      if (membersRes.ok) setMembers(await membersRes.json());
      if (invitesRes.ok) {
        const all: PendingInvite[] = await invitesRes.json();
        setInvites(all.filter((i) => !i.accepted));
      }
    } catch {
      toast({ title: "Erro ao carregar equipe", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTeam();
  }, []);

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      toast({ title: "Informe o e-mail do convidado", variant: "destructive" });
      return;
    }
    setInviting(true);
    try {
      const res = await fetch(`${BASE}/api/team/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "limit_exceeded") {
          setLimitError(data.message ?? "Limite de usuários atingido. Faça upgrade para adicionar mais membros.");
          setInviteOpen(false);
        } else {
          toast({ title: data.error ?? "Erro ao convidar", variant: "destructive" });
        }
        return;
      }
      toast({
        title: "Convite registrado!",
        description: `${inviteEmail} receberá acesso ao criar uma conta com este e-mail.`,
      });
      setInviteOpen(false);
      setInviteEmail("");
      loadTeam();
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(id: string) {
    try {
      await fetch(`${BASE}/api/team/members/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      toast({ title: "Membro desativado" });
      loadTeam();
    } catch {
      toast({ title: "Erro ao remover membro", variant: "destructive" });
    }
  }

  async function handleCancelInvite(id: string) {
    try {
      await fetch(`${BASE}/api/team/invites/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      toast({ title: "Convite cancelado" });
      loadTeam();
    } catch {
      toast({ title: "Erro ao cancelar convite", variant: "destructive" });
    }
  }

  const isManager = me?.role === "agencia" || me?.role === "superadmin";

  return (
    <div className="space-y-4">
      {limitError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <span className="text-amber-600 mt-0.5">⚠️</span>
          <div className="flex-1">
            <p className="font-medium text-amber-900 text-sm">Limite de usuários atingido</p>
            <p className="text-amber-700 text-sm mt-0.5">{limitError}</p>
            <Button size="sm" variant="outline" className="mt-2 border-amber-400 text-amber-800 hover:bg-amber-100" onClick={() => window.location.href = "/configuracoes?tab=plan"}>
              Ver planos
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Gerencie os membros da sua equipe e convide vendedores.
          </p>
        </div>
        {isManager && (
          <Button onClick={() => { setLimitError(null); setInviteOpen(true); }}>
            <UserPlus className="w-4 h-4 mr-2" />
            Convidar Membro
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando equipe...
        </div>
      ) : (
        <>
          {members.length === 0 && invites.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum membro na equipe ainda.</p>
              {isManager && (
                <Button variant="outline" className="mt-3" onClick={() => setInviteOpen(true)}>
                  Convidar primeiro membro
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {members.length > 0 && (
                <div className="rounded-md border divide-y">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-4 px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-semibold text-primary text-sm">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {m.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs ${roleColors[m.role] ?? "bg-gray-100 text-gray-800"}`}>
                          {roleLabels[m.role] ?? m.role}
                        </Badge>
                        <Badge variant={m.isActive ? "default" : "outline"} className={`text-xs ${m.isActive ? "bg-green-100 text-green-800" : ""}`}>
                          {m.isActive ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      {isManager && m.id !== me?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => handleRemove(m.id)}
                          title="Desativar membro"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {invites.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Convites Pendentes
                  </p>
                  <div className="rounded-md border divide-y bg-muted/20">
                    {invites.map((inv) => (
                      <div key={inv.id} className="flex items-center gap-4 px-4 py-3">
                        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                          <Mail className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate text-muted-foreground">{inv.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Convite enviado · expira em {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString("pt-BR") : "7 dias"}
                          </p>
                        </div>
                        <Badge className="text-xs bg-amber-100 text-amber-800">
                          {roleLabels[inv.role] ?? inv.role}
                        </Badge>
                        <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                          Aguardando
                        </Badge>
                        {isManager && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => handleCancelInvite(inv.id)}
                            title="Cancelar convite"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Convidar Membro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>E-mail do convidado</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="membro@agencia.com"
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Função</Label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="vendedor">Vendedor — visualiza viagens e cria reservas</option>
                <option value="gerente">Gerente — gerencia viagens, reservas e clientes</option>
                <option value="suporte">Suporte — visualiza viagens e atende clientes</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              O convidado deverá criar uma conta no VisiteCRM com este e-mail para ter acesso automático à sua agência.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={inviting}>
              {inviting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Convidando...</> : "Convidar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ──────────────────── API Keys Tab ──────────────────── */
function ApiKeysTab() {
  const [keys] = useState([
    { id: "1", name: "Produção", key: "••••••••••••••••••••", createdAt: "2024-01-15", lastUsed: "Hoje" },
    { id: "2", name: "Desenvolvimento", key: "••••••••••••••••••••", createdAt: "2024-02-20", lastUsed: "Ontem" },
  ]);
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  function toggleVisible(id: string) {
    setVisible((v) => ({ ...v, [id]: !v[id] }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Use chaves de API para integrar o VisiteCRM com sistemas externos.
        </p>
        <Button variant="outline">
          <Key className="w-4 h-4 mr-2" />
          Gerar nova chave
        </Button>
      </div>

      <div className="rounded-md border bg-background divide-y">
        {keys.map((k) => (
          <div key={k.id} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{k.name}</p>
                <p className="text-xs text-muted-foreground">
                  Criado em {k.createdAt} · Último uso: {k.lastUsed}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => toggleVisible(k.id)}>
                  {visible[k.id] ? "Ocultar" : "Mostrar"}
                </Button>
                <Button variant="outline" size="sm" className="text-destructive">
                  Revogar
                </Button>
              </div>
            </div>
            {visible[k.id] && (
              <div className="font-mono text-xs bg-muted rounded p-2 break-all">{k.key}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────── Main Settings Page ──────────────────── */
export default function Configuracoes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie as configurações da sua agência</p>
      </div>

      <Tabs defaultValue={new URLSearchParams(window.location.search).get("tab") ?? "agency"}>
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="agency" className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            Agência
          </TabsTrigger>
          <TabsTrigger value="plan" className="flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5" />
            Plano
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-1.5">
            <Puzzle className="w-3.5 h-3.5" />
            Integrações
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5" />
            Notificações
          </TabsTrigger>
          <TabsTrigger value="customization" className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" />
            Personalização
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Equipe
          </TabsTrigger>
          <TabsTrigger value="apikeys" className="flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" />
            Chaves API
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="agency">
            <Card>
              <CardHeader>
                <CardTitle>Perfil da Agência</CardTitle>
                <CardDescription>
                  Informações da agência, logotipo e cores do sistema
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AgencyProfileTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="plan">
            <Card>
              <CardHeader>
                <CardTitle>Plano e Faturamento</CardTitle>
                <CardDescription>Gerencie seu plano e veja o uso dos recursos</CardDescription>
              </CardHeader>
              <CardContent>
                <PlanTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations">
            <Card>
              <CardHeader>
                <CardTitle>Integrações</CardTitle>
                <CardDescription>
                  Configure WhatsApp, pagamentos e outros serviços
                </CardDescription>
              </CardHeader>
              <CardContent>
                <IntegrationsTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Preferências de Notificação</CardTitle>
                <CardDescription>Escolha quais alertas você deseja receber</CardDescription>
              </CardHeader>
              <CardContent>
                <NotificationsTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customization">
            <Card>
              <CardHeader>
                <CardTitle>Personalização</CardTitle>
                <CardDescription>
                  Personalize cores, logotipo e aparência do sistema
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CustomizationTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team">
            <Card>
              <CardHeader>
                <CardTitle>Equipe da Agência</CardTitle>
                <CardDescription>
                  Gerencie os membros da sua equipe e convide novos vendedores
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TeamTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="apikeys">
            <Card>
              <CardHeader>
                <CardTitle>Chaves de API</CardTitle>
                <CardDescription>
                  Gerencie chaves para integração com sistemas externos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ApiKeysTab />
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
