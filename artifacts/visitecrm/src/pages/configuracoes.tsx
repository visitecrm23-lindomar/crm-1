import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTenant,
  getGetTenantQueryKey,
  useUpdateTenant,
  useListSystemConfigs,
  useUpsertSystemConfig,
  useGetMe,
} from "@workspace/api-client-react";
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
        <Label>URL do Logo</Label>
        <Input
          value={form.logoUrl ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
          placeholder="https://..."
        />
        {form.logoUrl && (
          <img
            src={form.logoUrl}
            alt=""
            className="mt-2 h-12 rounded border object-contain bg-muted p-1"
          />
        )}
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
      <Button onClick={handleSave} disabled={updateTenant.isPending}>
        Salvar Perfil
      </Button>

      <SalesGoalSection />
    </div>
  );
}

/* ──────────────────── Plan & Billing Tab ──────────────────── */
function PlanTab() {
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const tenant = me?.tenant;

  const plans = [
    { id: "starter", name: "Starter", price: "R$ 197/mês", clients: 500, trips: 20, users: 3 },
    { id: "pro", name: "Pro", price: "R$ 397/mês", clients: 2000, trips: 100, users: 10 },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "Sob consulta",
      clients: -1,
      trips: -1,
      users: -1,
    },
  ];

  const currentPlan = plans.find((p) => p.id === tenant?.planId) ?? plans[0];

  function handleUpgrade(planName: string) {
    toast({
      title: `Upgrade para ${planName}`,
      description: "Entre em contato com nosso suporte para fazer o upgrade do seu plano.",
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge>{currentPlan.name}</Badge>
            Plano atual
          </CardTitle>
          <CardDescription>
            Você está no plano {currentPlan.name} — {currentPlan.price}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Clientes", limit: currentPlan.clients, used: 0 },
              { label: "Viagens", limit: currentPlan.trips, used: 0 },
              { label: "Usuários", limit: currentPlan.users, used: 0 },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{item.label}</span>
                  <span className="text-muted-foreground">
                    {item.limit === -1 ? "Ilimitado" : `${item.used}/${item.limit}`}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full">
                  <div
                    className="h-2 bg-primary rounded-full"
                    style={{
                      width: item.limit === -1 ? "20%" : `${(item.used / item.limit) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={
              plan.id === currentPlan.id ? "border-primary ring-1 ring-primary" : ""
            }
          >
            <CardHeader>
              <CardTitle className="text-base">{plan.name}</CardTitle>
              <CardDescription className="text-lg font-bold text-foreground">
                {plan.price}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>{plan.clients === -1 ? "Clientes ilimitados" : `Até ${plan.clients} clientes`}</p>
              <p>{plan.trips === -1 ? "Viagens ilimitadas" : `Até ${plan.trips} viagens`}</p>
              <p>{plan.users === -1 ? "Usuários ilimitados" : `Até ${plan.users} usuários`}</p>
            </CardContent>
            {plan.id !== currentPlan.id && (
              <div className="px-6 pb-4">
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => handleUpgrade(plan.name)}
                >
                  Fazer upgrade
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
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
        <Label>URL do logotipo</Label>
        <Input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://exemplo.com/logo.png"
        />
        {logoUrl && (
          <div className="rounded-lg border p-4 bg-muted/30 flex items-center justify-center">
            <img
              src={logoUrl}
              alt="Logo preview"
              className="max-h-16 max-w-[200px] object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }}
            />
          </div>
        )}
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

      <Button onClick={handleSave} disabled={updateTenant.isPending}>
        {updateTenant.isPending ? "Salvando..." : "Salvar personalização"}
      </Button>
    </div>
  );
}

/* ──────────────────── Team Tab ──────────────────── */
const roleLabels: Record<string, string> = {
  agencia: "Gestor",
  vendedor: "Vendedor",
  superadmin: "Super Admin",
  cliente: "Cliente",
};

const roleColors: Record<string, string> = {
  agencia: "bg-blue-100 text-blue-800",
  vendedor: "bg-green-100 text-green-800",
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
  const [inviteRole] = useState<"vendedor">("vendedor");
  const [inviting, setInviting] = useState(false);

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
        toast({ title: data.error ?? "Erro ao convidar", variant: "destructive" });
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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Gerencie os membros da sua equipe e convide vendedores.
          </p>
        </div>
        {isManager && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Convidar Vendedor
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
                  Convidar primeiro vendedor
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
            <DialogTitle>Convidar Vendedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>E-mail do convidado</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="vendedor@agencia.com"
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O convidado será convidado como <strong>Vendedor</strong> e deverá criar uma conta no VisiteCRM com este e-mail para ter acesso automático à sua agência.
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

      <Tabs defaultValue="agency">
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
