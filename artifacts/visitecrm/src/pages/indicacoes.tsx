import { useState } from "react";
import {
  useListReferrals,
  useUpdateReferral,
  useGetReferralStats,
  useGetReferralSettings,
  useUpdateReferralSettings,
  usePayReferralBonus,
  useResendExpiryWarning,
} from "@workspace/api-client-react";
import type { Referral, ReferralSettings, ReferralTierConfig } from "@workspace/api-client-react";
import { REFERRAL_STATUS } from "@workspace/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  DollarSign,
  TrendingUp,
  Settings,
  BarChart3,
  Check,
  Gift,
  Percent,
  Clock,
  Ban,
  Eye,
  Trophy,
  Medal,
  MessageCircle,
  Mail,
  Phone,
  Wallet,
  Star,
  ShieldAlert,
} from "lucide-react";

const DEFAULT_TIERS: ReferralTierConfig[] = [
  { level: "bronze",  label: "Bronze",   minReferrals: 0,  bonusMultiplier: 1.0 },
  { level: "silver",  label: "Prata",    minReferrals: 5,  bonusMultiplier: 1.25 },
  { level: "gold",    label: "Ouro",     minReferrals: 15, bonusMultiplier: 1.5 },
  { level: "diamond", label: "Diamante", minReferrals: 30, bonusMultiplier: 2.0 },
];

const TIER_VISUAL: Record<string, { bg: string; color: string }> = {
  bronze:  { bg: "bg-amber-100",  color: "text-amber-700" },
  silver:  { bg: "bg-slate-100",  color: "text-slate-600" },
  gold:    { bg: "bg-yellow-100", color: "text-yellow-700" },
  diamond: { bg: "bg-cyan-100",   color: "text-cyan-700" },
};

function computeAdminTier(conversions: number, tiersConfig?: ReferralTierConfig[] | null): ReferralTierConfig {
  const tiers = tiersConfig && tiersConfig.length > 0
    ? [...tiersConfig].sort((a, b) => a.minReferrals - b.minReferrals)
    : DEFAULT_TIERS;
  let current = tiers[0];
  for (const t of tiers) {
    if (conversions >= t.minReferrals) current = t;
  }
  return current;
}

function ReferralTierBadge({ level, label }: { level: string; label: string }) {
  const visual = TIER_VISUAL[level] ?? { bg: "bg-gray-100", color: "text-gray-600" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${visual.bg} ${visual.color}`}>
      <Star className="w-3 h-3" />
      {label}
    </span>
  );
}

import { formatCurrency as _fmtCurrencyLib, formatDate as _formatDate, formatDateTime as _formatDateTime } from "@/lib/utils";
function fmtCurrency(v: string | number | null | undefined) {
  if (v == null) return "R$ 0,00";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return _fmtCurrencyLib(isNaN(n) ? 0 : n);
}
const fmtDate = (v: string | null | undefined) => v ? _formatDate(v) : "—";
const fmtDateTime = (v: string | null | undefined) => v ? _formatDateTime(v) : "—";

function fmtWhatsapp(w: string | null | undefined) {
  if (!w) return null;
  return w.replace(/\D/g, "");
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "secondary" },
  completed: { label: "Convertida", variant: "default" },
  expired: { label: "Expirada", variant: "destructive" },
  converted: { label: "Convertida", variant: "default" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

type EnrichedReferral = Referral & { referrerWhatsapp?: string | null };

export default function Indicacoes() {
  const { toast } = useToast();
  const { data: referralsResponse, refetch } = useListReferrals();
  const referrals = ((referralsResponse as { data?: EnrichedReferral[] } | undefined)?.data ?? (Array.isArray(referralsResponse) ? referralsResponse as EnrichedReferral[] : [])) as EnrichedReferral[];
  const { data: stats } = useGetReferralStats();
  const { data: settings, refetch: refetchSettings } = useGetReferralSettings();
  const updateReferral = useUpdateReferral();
  const updateSettings = useUpdateReferralSettings();
  const payBonus = usePayReferralBonus();
  const resendWarning = useResendExpiryWarning();

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<EnrichedReferral | null>(null);
  const [payBonusDialogOpen, setPayBonusDialogOpen] = useState(false);
  const [payBonusTarget, setPayBonusTarget] = useState<EnrichedReferral | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bonusFilter, setBonusFilter] = useState<"all" | "unpaid">("all");
  const [fraudFilter, setFraudFilter] = useState(false);

  const [localSettings, setLocalSettings] = useState<Partial<ReferralSettings>>({});

  function openSettings() {
    setLocalSettings({
      isEnabled: settings?.isEnabled ?? true,
      discountType: settings?.discountType ?? "percentage",
      discountValue: settings?.discountValue ?? "5.00",
      bonusType: settings?.bonusType ?? "credit",
      bonusValue: settings?.bonusValue ?? "10.00",
      expirationDays: settings?.expirationDays ?? 30,
      allowSelfReferral: settings?.allowSelfReferral ?? false,
      requireFirstPurchase: settings?.requireFirstPurchase ?? true,
      shareMessage: settings?.shareMessage ?? "",
      tiersConfig: settings?.tiersConfig ?? DEFAULT_TIERS,
      whatsappEnabled: settings?.whatsappEnabled ?? false,
      whatsappPhoneNumber: settings?.whatsappPhoneNumber ?? "",
      whatsappConvertedMessage: settings?.whatsappConvertedMessage ?? "",
      whatsappBonusPaidMessage: settings?.whatsappBonusPaidMessage ?? "",
      expiryWarning7DaysEnabled: settings?.expiryWarning7DaysEnabled ?? true,
      expiryWarning1DayEnabled: settings?.expiryWarning1DayEnabled ?? true,
    });
    setSettingsModalOpen(true);
  }

  async function saveSettings() {
    try {
      await updateSettings.mutateAsync({
        data: {
          isEnabled: localSettings.isEnabled,
          discountType: localSettings.discountType,
          discountValue: localSettings.discountValue != null ? parseFloat(String(localSettings.discountValue)) : undefined,
          bonusType: localSettings.bonusType,
          bonusValue: localSettings.bonusValue != null ? parseFloat(String(localSettings.bonusValue)) : undefined,
          expirationDays: localSettings.expirationDays != null ? Number(localSettings.expirationDays) : undefined,
          allowSelfReferral: localSettings.allowSelfReferral,
          requireFirstPurchase: localSettings.requireFirstPurchase,
          shareMessage: localSettings.shareMessage as string | undefined,
          tiersConfig: localSettings.tiersConfig as ReferralTierConfig[] | undefined,
          whatsappEnabled: localSettings.whatsappEnabled,
          whatsappPhoneNumber: localSettings.whatsappPhoneNumber as string | undefined,
          whatsappConvertedMessage: localSettings.whatsappConvertedMessage as string | undefined,
          whatsappBonusPaidMessage: localSettings.whatsappBonusPaidMessage as string | undefined,
          expiryWarning7DaysEnabled: localSettings.expiryWarning7DaysEnabled,
          expiryWarning1DayEnabled: localSettings.expiryWarning1DayEnabled,
        },
      });
      toast({ title: "Configurações salvas com sucesso" });
      refetchSettings();
      setSettingsModalOpen(false);
    } catch {
      toast({ title: "Erro ao salvar configurações", variant: "destructive" });
    }
  }

  async function handleDeactivate(r: EnrichedReferral) {
    try {
      await updateReferral.mutateAsync({
        id: r.id,
        data: { isActive: false, status: "expired" },
      });
      toast({ title: "Indicação desativada" });
      refetch();
    } catch {
      toast({ title: "Erro ao desativar indicação", variant: "destructive" });
    }
  }

  function openPayBonusDialog(r: EnrichedReferral) {
    setPayBonusTarget(r);
    setPayBonusDialogOpen(true);
  }

  async function confirmPayBonus() {
    if (!payBonusTarget) return;
    try {
      const updated = await payBonus.mutateAsync({ id: payBonusTarget.id });
      toast({ title: "Bônus marcado como pago! E-mail de confirmação enviado ao indicador." });
      refetch();
      setPayBonusDialogOpen(false);
      setPayBonusTarget(null);
      if (selectedReferral?.id === updated.id) {
        setSelectedReferral(updated as EnrichedReferral);
      }
    } catch {
      toast({ title: "Erro ao registrar pagamento de bônus", variant: "destructive" });
    }
  }

  function openDetail(r: EnrichedReferral) {
    setSelectedReferral(r);
    setDetailModalOpen(true);
  }

  const suspiciousCount = referrals.filter((r) => r.fraudFlag).length;

  // Compute expiring-soon count from loaded referrals using expiresAt
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const expiringSoonCount = referrals.filter((r) => {
    if (r.status !== REFERRAL_STATUS.PENDING || !r.expiresAt) return false;
    const exp = new Date(r.expiresAt).getTime();
    return exp > now && exp <= now + sevenDaysMs;
  }).length;

  const filtered = referrals.filter((r) => {
    if (fraudFilter) return r.fraudFlag === true;
    if (statusFilter === "expiringSoon") {
      const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : null;
      return r.status === REFERRAL_STATUS.PENDING && exp !== null && exp > now && exp <= now + sevenDaysMs;
    }
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const matchBonus = bonusFilter === "all" || (bonusFilter === "unpaid" && !r.bonusPaid);
    const q = searchQuery.toLowerCase();
    const matchSearch = !q
      || r.code.toLowerCase().includes(q)
      || (r.referrerName ?? "").toLowerCase().includes(q)
      || (r.referrerEmail ?? "").toLowerCase().includes(q)
      || ((r as EnrichedReferral).referrerWhatsapp ?? "").toLowerCase().includes(q)
      || (r.referredEmail ?? "").toLowerCase().includes(q)
      || (r.referredName ?? "").toLowerCase().includes(q);
    return matchStatus && matchSearch && matchBonus;
  });

  const settingsDiscountPct = settings ? parseFloat(String(settings.discountValue)) : 5;
  const settingsBonusVal = settings ? parseFloat(String(settings.bonusValue)) : 10;
  const isEnabled = settings?.isEnabled ?? true;

  const pendingBonusCount = referrals.filter(r => r.status === REFERRAL_STATUS.COMPLETED && !r.bonusPaid).length;

  // Derive controlled tab value from filter state so the banner CTA is always reflected visually
  const activeTab = fraudFilter
    ? "suspicious"
    : statusFilter === "expiringSoon"
    ? "expiringSoon"
    : statusFilter === "completed" && bonusFilter === "unpaid"
    ? "completed-unpaid"
    : statusFilter === "all" || statusFilter === "pending" || statusFilter === "completed" || statusFilter === "expired"
    ? statusFilter
    : "all";

  function applyTab(tab: string) {
    setFraudFilter(tab === "suspicious");
    setBonusFilter(tab === "completed-unpaid" ? "unpaid" : "all");
    setStatusFilter(
      tab === "suspicious" ? "all"
      : tab === "completed-unpaid" ? "completed"
      : tab === "expiringSoon" ? "expiringSoon"
      : tab
    );
    if (tab === "expiringSoon") setSearchQuery("");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Programa de Indicações</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie indicações, conversões e pagamentos de bônus
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isEnabled && (
            <Badge variant="destructive" className="text-sm px-3 py-1">
              Programa desativado
            </Badge>
          )}
          {pendingBonusCount > 0 && (
            <Badge variant="outline" className="text-sm px-3 py-1 border-amber-400 text-amber-700 bg-amber-50">
              <Wallet className="w-3 h-3 mr-1" />
              {pendingBonusCount} bônus pendente{pendingBonusCount > 1 ? "s" : ""}
            </Badge>
          )}
          <Button variant="outline" onClick={openSettings}>
            <Settings className="w-4 h-4 mr-2" />
            Configurações
          </Button>
        </div>
      </div>

      {/* Expiring soon alert — count derived from loaded referrals using expiresAt */}
      {expiringSoonCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <Clock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              {expiringSoonCount} {expiringSoonCount === 1 ? "código de indicação expira" : "códigos de indicação expiram"} nos próximos 7 dias
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Entre em contato com os clientes antes que percam o benefício.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100"
            onClick={() => applyTab("expiringSoon")}
          >
            Ver que expiram em breve
          </Button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              Total de indicações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.total ?? referrals.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Check className="w-4 h-4" />
              Convertidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{stats?.completed ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Taxa de conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{stats?.conversionRate ?? 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Desconto concedido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmtCurrency(stats?.totalDiscountGiven ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Program Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Percent className="w-4 h-4 text-primary" />
              Desconto para o indicado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{settingsDiscountPct}%</p>
            <p className="text-xs text-muted-foreground">{settings?.discountType === "percentage" ? "percentual" : "valor fixo"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Gift className="w-4 h-4 text-primary" />
              Bônus para quem indica
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmtCurrency(settingsBonusVal)}</p>
            <p className="text-xs text-muted-foreground">{settings?.bonusType === "credit" ? "crédito" : "dinheiro"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Validade do código
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{settings?.expirationDays ?? 30} dias</p>
            <p className="text-xs text-muted-foreground">após criação</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Referrers Ranking */}
      {(() => {
        type RankEntry = {
          name: string;
          email: string | null;
          whatsapp: string | null;
          code: string;
          total: number;
          conversions: number;
          earnings: number;
          paidEarnings: number;
        };
        const rankMap = new Map<string, RankEntry>();
        for (const r of referrals) {
          const key = r.referrerId;
          const existing = rankMap.get(key);
          const bonus = parseFloat(String(r.bonusAmount ?? "0")) || 0;
          const isPaid = r.bonusPaid;
          if (existing) {
            existing.total += 1;
            if (r.status === REFERRAL_STATUS.COMPLETED) {
              existing.conversions += 1;
              existing.earnings += bonus;
              if (isPaid) existing.paidEarnings += bonus;
            }
          } else {
            rankMap.set(key, {
              name: r.referrerName ?? r.referrerId.slice(0, 8),
              email: r.referrerEmail ?? null,
              whatsapp: (r as EnrichedReferral).referrerWhatsapp ?? null,
              code: r.code,
              total: 1,
              conversions: r.status === REFERRAL_STATUS.COMPLETED ? 1 : 0,
              earnings: r.status === REFERRAL_STATUS.COMPLETED ? bonus : 0,
              paidEarnings: r.status === REFERRAL_STATUS.COMPLETED && isPaid ? bonus : 0,
            });
          }
        }
        const ranked = Array.from(rankMap.values())
          .sort((a, b) => b.conversions - a.conversions || b.total - a.total)
          .slice(0, 10);

        if (ranked.length === 0) return null;

        const rankIcon = (i: number) => {
          if (i === 0) return <Trophy className="w-4 h-4 text-yellow-500" />;
          if (i === 1) return <Medal className="w-4 h-4 text-gray-400" />;
          if (i === 2) return <Medal className="w-4 h-4 text-orange-400" />;
          return <span className="text-xs font-bold text-muted-foreground w-4 text-center">{i + 1}</span>;
        };

        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-500" />
                Ranking de Top Indicadores
              </CardTitle>
              <CardDescription>Clientes que mais geraram conversões</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Indicador</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="text-center">Indicações</TableHead>
                    <TableHead className="text-center">Convertidas</TableHead>
                    <TableHead className="text-right">Bônus total</TableHead>
                    <TableHead className="text-right">Já pago</TableHead>
                    <TableHead className="text-right">A pagar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranked.map((r, i) => {
                    const pendingEarnings = r.earnings - r.paidEarnings;
                    return (
                      <TableRow key={r.code + i}>
                        <TableCell className="py-2">{rankIcon(i)}</TableCell>
                        <TableCell className="py-2">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <p className="font-medium leading-tight">{r.name}</p>
                            {(() => {
                              const t = computeAdminTier(r.conversions, settings?.tiersConfig);
                              return <ReferralTierBadge level={t.level} label={t.label} />;
                            })()}
                          </div>
                          {r.email && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Mail className="w-2.5 h-2.5" />
                              {r.email}
                            </p>
                          )}
                          {r.whatsapp && (
                            <a
                              href={`https://wa.me/55${fmtWhatsapp(r.whatsapp)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-green-600 flex items-center gap-1 mt-0.5 hover:underline"
                            >
                              <MessageCircle className="w-2.5 h-2.5" />
                              {r.whatsapp}
                            </a>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-primary py-2">{r.code}</TableCell>
                        <TableCell className="text-center py-2">{r.total}</TableCell>
                        <TableCell className="text-center py-2">
                          <Badge variant={r.conversions > 0 ? "default" : "secondary"}>{r.conversions}</Badge>
                        </TableCell>
                        <TableCell className="text-right py-2 text-green-600 font-medium">{fmtCurrency(r.earnings)}</TableCell>
                        <TableCell className="text-right py-2">
                          {r.paidEarnings > 0
                            ? <span className="text-green-700 font-medium">{fmtCurrency(r.paidEarnings)}</span>
                            : <span className="text-muted-foreground text-xs">—</span>
                          }
                        </TableCell>
                        <TableCell className="text-right py-2">
                          {pendingEarnings > 0
                            ? <span className="text-amber-600 font-medium">{fmtCurrency(pendingEarnings)}</span>
                            : <span className="text-muted-foreground text-xs">—</span>
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })()}

      {/* Referrals Table */}
      <Tabs value={activeTab} onValueChange={applyTab}>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="expiringSoon">
              <Clock className="w-3.5 h-3.5 mr-1 text-amber-500" />
              Expiram em breve
              {expiringSoonCount > 0 && (
                <Badge variant="outline" className="ml-1.5 px-1.5 py-0 text-xs h-4 border-amber-400 text-amber-700">
                  {expiringSoonCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed">Convertidas</TabsTrigger>
            <TabsTrigger value="completed-unpaid">
              Bônus pendente
              {pendingBonusCount > 0 && (
                <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-xs h-4">
                  {pendingBonusCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="expired">Expiradas</TabsTrigger>
            <TabsTrigger value="suspicious">
              <ShieldAlert className="w-3.5 h-3.5 mr-1" />
              Suspeitas
              {suspiciousCount > 0 && (
                <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-xs h-4">
                  {suspiciousCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <Input
            placeholder="Buscar por código, nome, e-mail ou WhatsApp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-xs"
            disabled={fraudFilter || statusFilter === "expiringSoon"}
          />
          <span className="text-sm text-muted-foreground ml-auto">{filtered.length} indicações</span>
        </div>

        {["all", "pending", "expiringSoon", "completed", "completed-unpaid", "expired", "suspicious"].map((tabVal) => (
          <TabsContent key={tabVal} value={tabVal}>
            {filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {tabVal === "suspicious" ? "Nenhuma indicação suspeita encontrada" : "Nenhuma indicação encontrada"}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Quem indicou</TableHead>
                      <TableHead>Indicado</TableHead>
                      <TableHead>Status</TableHead>
                      {tabVal === "suspicious" && <TableHead className="text-red-600">Motivo</TableHead>}
                      <TableHead>Bônus</TableHead>
                      <TableHead>Desconto</TableHead>
                      <TableHead>Visitas</TableHead>
                      <TableHead>Última visita</TableHead>
                      <TableHead>Expira em</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono font-semibold text-primary">{r.code}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm leading-tight">
                              {r.referrerName ?? r.referrerId.slice(0, 8)}
                            </p>
                            {r.referrerEmail && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Mail className="w-2.5 h-2.5 shrink-0" />
                                {r.referrerEmail}
                              </p>
                            )}
                            {(r as EnrichedReferral).referrerWhatsapp && (
                              <a
                                href={`https://wa.me/55${fmtWhatsapp((r as EnrichedReferral).referrerWhatsapp)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-green-600 flex items-center gap-1 mt-0.5 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MessageCircle className="w-2.5 h-2.5 shrink-0" />
                                {(r as EnrichedReferral).referrerWhatsapp}
                              </a>
                            )}
                            {r.referrerPhone && !(r as EnrichedReferral).referrerWhatsapp && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Phone className="w-2.5 h-2.5 shrink-0" />
                                {r.referrerPhone}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{r.referredName ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">{r.referredEmail ?? ""}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                          {!r.isActive && <Badge variant="outline" className="ml-1 text-xs">inativo</Badge>}
                        </TableCell>
                        {tabVal === "suspicious" && (
                          <TableCell>
                            <div className="flex items-start gap-1 text-red-600">
                              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span className="text-xs leading-snug">{r.fraudReason ?? "—"}</span>
                            </div>
                          </TableCell>
                        )}
                        <TableCell>
                          {r.status === REFERRAL_STATUS.COMPLETED ? (
                            <div>
                              <p className="text-sm font-medium text-green-600">{fmtCurrency(r.bonusAmount)}</p>
                              {r.bonusPaid ? (
                                <p className="text-xs text-green-700 flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" />
                                  Pago {r.bonusPaidAt ? `em ${fmtDate(r.bonusPaidAt)}` : ""}
                                </p>
                              ) : (
                                <p className="text-xs text-amber-600">Pendente</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.discountApplied
                            ? fmtCurrency(r.discountAmount)
                            : `${r.discountValue}%`}
                        </TableCell>
                        <TableCell>{r.visitsCount ?? 0}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(r.lastVisit)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.expiresAt ? (() => {
                            const daysLeft = Math.ceil((new Date(r.expiresAt).getTime() - Date.now()) / 86400000);
                            if (daysLeft <= 0) return <Badge variant="destructive" className="text-xs">Expirado</Badge>;
                            if (daysLeft <= 3) return <Badge variant="outline" className="text-xs text-amber-600 border-amber-400 gap-1"><Clock className="w-3 h-3" />{fmtDate(r.expiresAt)}</Badge>;
                            return <span className="text-xs text-muted-foreground">{fmtDate(r.expiresAt)}</span>;
                          })() : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openDetail(r)} title="Ver detalhes">
                              <Eye className="w-3 h-3" />
                            </Button>
                            {r.status === REFERRAL_STATUS.COMPLETED && !r.bonusPaid && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => openPayBonusDialog(r)}
                                title="Pagar bônus"
                              >
                                <Wallet className="w-3 h-3" />
                              </Button>
                            )}
                            {r.isActive && r.status === REFERRAL_STATUS.PENDING && (
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeactivate(r)} title="Desativar">
                                <Ban className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Pay Bonus Confirmation Dialog */}
      <Dialog open={payBonusDialogOpen} onOpenChange={setPayBonusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento de Bônus</DialogTitle>
            <DialogDescription>
              Isso marcará o bônus como pago e enviará um e-mail de confirmação ao indicador.
            </DialogDescription>
          </DialogHeader>
          {payBonusTarget && (
            <div className="space-y-3 py-2">
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Indicador</span>
                  <span className="font-medium">{payBonusTarget.referrerName ?? payBonusTarget.referrerId.slice(0, 8)}</span>
                </div>
                {payBonusTarget.referrerEmail && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">E-mail</span>
                    <span className="text-sm">{payBonusTarget.referrerEmail}</span>
                  </div>
                )}
                {(payBonusTarget as EnrichedReferral).referrerWhatsapp && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">WhatsApp</span>
                    <span className="text-sm">{(payBonusTarget as EnrichedReferral).referrerWhatsapp}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2">
                  <span className="text-muted-foreground">Valor do bônus</span>
                  <span className="font-bold text-green-600 text-base">{fmtCurrency(payBonusTarget.bonusAmount)}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayBonusDialogOpen(false)} disabled={payBonus.isPending}>
              Cancelar
            </Button>
            <Button onClick={confirmPayBonus} disabled={payBonus.isPending} className="bg-green-600 hover:bg-green-700">
              <Check className="w-4 h-4 mr-2" />
              {payBonus.isPending ? "Processando..." : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da Indicação</DialogTitle>
          </DialogHeader>
          {selectedReferral && (
            <div className="space-y-4">
              {/* Referrer info block */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do Indicador</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <p className="font-medium text-sm">{selectedReferral.referrerName ?? "—"}</p>
                    <span className="text-xs text-muted-foreground font-mono ml-auto">{selectedReferral.code}</span>
                  </div>
                  {selectedReferral.referrerEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <a href={`mailto:${selectedReferral.referrerEmail}`} className="text-sm hover:underline text-blue-600">
                        {selectedReferral.referrerEmail}
                      </a>
                    </div>
                  )}
                  {(selectedReferral as EnrichedReferral).referrerWhatsapp && (
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
                      <a
                        href={`https://wa.me/55${fmtWhatsapp((selectedReferral as EnrichedReferral).referrerWhatsapp)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-green-600 hover:underline"
                      >
                        {(selectedReferral as EnrichedReferral).referrerWhatsapp}
                      </a>
                    </div>
                  )}
                  {selectedReferral.referrerPhone && !(selectedReferral as EnrichedReferral).referrerWhatsapp && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <p className="text-sm">{selectedReferral.referrerPhone}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <StatusBadge status={selectedReferral.status} />
                </div>
                <div>
                  <p className="text-muted-foreground">Indicado</p>
                  <p>{selectedReferral.referredName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{selectedReferral.referredEmail ?? ""}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Desconto concedido</p>
                  <p>{selectedReferral.discountApplied ? fmtCurrency(selectedReferral.discountAmount) : "Não aplicado"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Bônus</p>
                  <p className="text-green-600 font-semibold">{fmtCurrency(selectedReferral.bonusAmount)}</p>
                  {selectedReferral.bonusPaid ? (
                    <p className="text-xs text-green-700 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Pago {selectedReferral.bonusPaidAt ? `em ${fmtDateTime(selectedReferral.bonusPaidAt)}` : ""}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600">Pendente</p>
                  )}
                </div>
                {(() => {
                  const allByReferrer = referrals.filter(r => r.referrerId === selectedReferral.referrerId && r.status === REFERRAL_STATUS.COMPLETED);
                  const totalBonus = allByReferrer.reduce((s, r) => s + (parseFloat(String(r.bonusAmount ?? "0")) || 0), 0);
                  if (allByReferrer.length < 2) return null;
                  return (
                    <div>
                      <p className="text-muted-foreground">Total acumulado (indicador)</p>
                      <p className="font-semibold text-green-600">{fmtCurrency(totalBonus)}</p>
                      <p className="text-xs text-muted-foreground">{allByReferrer.length} conversões</p>
                    </div>
                  );
                })()}
                <div>
                  <p className="text-muted-foreground">Visitas</p>
                  <p>{selectedReferral.visitsCount ?? 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Última visita</p>
                  <p>{fmtDate(selectedReferral.lastVisit)}</p>
                </div>
                {selectedReferral.utmSource && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">UTM</p>
                    <p className="text-xs">{[selectedReferral.utmSource, selectedReferral.utmMedium, selectedReferral.utmCampaign].filter(Boolean).join(" / ")}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Criado em</p>
                  <p>{fmtDate(selectedReferral.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Expira em</p>
                  <p>{fmtDate(selectedReferral.expiresAt)}</p>
                </div>
                {selectedReferral.expiresAt && (
                  <>
                    <div>
                      <p className="text-muted-foreground">Aviso D-7 enviado em</p>
                      {selectedReferral.expiryWarning7SentAt ? (
                        <p className="text-xs text-amber-700 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          {fmtDateTime(selectedReferral.expiryWarning7SentAt)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Não enviado</p>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground">Aviso D-1 enviado em</p>
                      {selectedReferral.expiryWarning1SentAt ? (
                        <p className="text-xs text-amber-700 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          {fmtDateTime(selectedReferral.expiryWarning1SentAt)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Não enviado</p>
                      )}
                    </div>
                  </>
                )}
              </div>
              {selectedReferral.notes && (
                <div>
                  <p className="text-muted-foreground text-sm">Notas</p>
                  <p className="text-sm">{selectedReferral.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {selectedReferral && selectedReferral.expiresAt && (() => {
              const daysLeft = Math.ceil((new Date(selectedReferral.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              if (daysLeft <= 0) return null;
              return (
                <>
                  <Button
                    variant="outline"
                    className="border-amber-400 text-amber-700 hover:bg-amber-50"
                    disabled={resendWarning.isPending}
                    onClick={() => {
                      resendWarning.mutate(
                        { id: selectedReferral.id, window: 7 },
                        {
                          onSuccess: (updated) => {
                            setSelectedReferral((prev) => prev ? { ...prev, ...updated } : prev);
                            refetch();
                            toast({ title: "Aviso D-7 reenviado com sucesso" });
                          },
                          onError: () => toast({ title: "Erro ao reenviar aviso D-7", variant: "destructive" }),
                        },
                      );
                    }}
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Reenviar D-7
                  </Button>
                  <Button
                    variant="outline"
                    className="border-amber-400 text-amber-700 hover:bg-amber-50"
                    disabled={resendWarning.isPending}
                    onClick={() => {
                      resendWarning.mutate(
                        { id: selectedReferral.id, window: 1 },
                        {
                          onSuccess: (updated) => {
                            setSelectedReferral((prev) => prev ? { ...prev, ...updated } : prev);
                            refetch();
                            toast({ title: "Aviso D-1 reenviado com sucesso" });
                          },
                          onError: () => toast({ title: "Erro ao reenviar aviso D-1", variant: "destructive" }),
                        },
                      );
                    }}
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Reenviar D-1
                  </Button>
                </>
              );
            })()}
            {selectedReferral && selectedReferral.status === REFERRAL_STATUS.COMPLETED && !selectedReferral.bonusPaid && (
              <Button
                onClick={() => { setDetailModalOpen(false); openPayBonusDialog(selectedReferral); }}
                className="bg-green-600 hover:bg-green-700"
              >
                <Wallet className="w-4 h-4 mr-2" />
                Pagar Bônus
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailModalOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Modal */}
      <Dialog open={settingsModalOpen} onOpenChange={setSettingsModalOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurações do Programa de Indicações</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label>Programa ativo</Label>
                <p className="text-xs text-muted-foreground">Ativar ou desativar o programa</p>
              </div>
              <Switch
                checked={localSettings.isEnabled ?? true}
                onCheckedChange={(v) => setLocalSettings((s) => ({ ...s, isEnabled: v }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de desconto</Label>
                <Select
                  value={localSettings.discountType ?? "percentage"}
                  onValueChange={(v) => setLocalSettings((s) => ({ ...s, discountType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentual (%)</SelectItem>
                    <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>
                  {localSettings.discountType === "fixed" ? "Desconto (R$)" : "Desconto (%)"}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={localSettings.discountValue ?? "5.00"}
                  onChange={(e) => setLocalSettings((s) => ({ ...s, discountValue: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de bônus</Label>
                <Select
                  value={localSettings.bonusType ?? "credit"}
                  onValueChange={(v) => setLocalSettings((s) => ({ ...s, bonusType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Crédito</SelectItem>
                    <SelectItem value="cash">Dinheiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Bônus (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={localSettings.bonusValue ?? "10.00"}
                  onChange={(e) => setLocalSettings((s) => ({ ...s, bonusValue: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Validade do código (dias)</Label>
              <Input
                type="number"
                value={localSettings.expirationDays ?? 30}
                onChange={(e) => setLocalSettings((s) => ({ ...s, expirationDays: parseInt(e.target.value) || 30 }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Permitir auto-indicação</Label>
                <p className="text-xs text-muted-foreground">Permite que alguém use seu próprio código</p>
              </div>
              <Switch
                checked={localSettings.allowSelfReferral ?? false}
                onCheckedChange={(v) => setLocalSettings((s) => ({ ...s, allowSelfReferral: v }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Exigir primeira compra</Label>
                <p className="text-xs text-muted-foreground">Bônus só é liberado após a primeira compra</p>
              </div>
              <Switch
                checked={localSettings.requireFirstPurchase ?? true}
                onCheckedChange={(v) => setLocalSettings((s) => ({ ...s, requireFirstPurchase: v }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Mensagem de compartilhamento</Label>
              <Input
                value={localSettings.shareMessage as string ?? ""}
                onChange={(e) => setLocalSettings((s) => ({ ...s, shareMessage: e.target.value }))}
                placeholder="Use meu código e ganhe desconto na sua viagem!"
              />
            </div>

            <div className="space-y-3 border rounded-lg p-3 bg-amber-50/50">
              <Label className="flex items-center gap-1.5 font-semibold text-amber-800">
                <span className="text-base">⏰</span>
                Avisos de vencimento por e-mail
              </Label>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-normal">Aviso 7 dias antes</Label>
                  <p className="text-xs text-muted-foreground">Envia e-mail quando faltam 7 dias para o código vencer</p>
                </div>
                <Switch
                  checked={localSettings.expiryWarning7DaysEnabled ?? true}
                  onCheckedChange={(v) => setLocalSettings((s) => ({ ...s, expiryWarning7DaysEnabled: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-normal">Aviso 1 dia antes</Label>
                  <p className="text-xs text-muted-foreground">Envia e-mail quando falta 1 dia para o código vencer</p>
                </div>
                <Switch
                  checked={localSettings.expiryWarning1DayEnabled ?? true}
                  onCheckedChange={(v) => setLocalSettings((s) => ({ ...s, expiryWarning1DayEnabled: v }))}
                />
              </div>
            </div>

            <div className="space-y-3 border rounded-lg p-3 bg-green-50/50">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 font-semibold text-green-800">
                  <span className="text-base">📱</span>
                  Notificações WhatsApp
                </Label>
                <Switch
                  checked={localSettings.whatsappEnabled ?? false}
                  onCheckedChange={(v) => setLocalSettings((s) => ({ ...s, whatsappEnabled: v }))}
                />
              </div>
              {localSettings.whatsappEnabled && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Número WhatsApp Business da agência</Label>
                    <Input
                      value={localSettings.whatsappPhoneNumber as string ?? ""}
                      onChange={(e) => setLocalSettings((s) => ({ ...s, whatsappPhoneNumber: e.target.value }))}
                      placeholder="5511999999999 (código do país + DDD + número)"
                    />
                    <p className="text-[11px] text-muted-foreground">Número configurado na sua instância Z-API. Apenas para referência — as mensagens são enviadas via Z-API.</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mensagem — conversão confirmada</Label>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px] resize-y"
                      value={localSettings.whatsappConvertedMessage as string ?? ""}
                      onChange={(e) => setLocalSettings((s) => ({ ...s, whatsappConvertedMessage: e.target.value }))}
                      placeholder="Boa notícia! {{nome}} usou seu código {{codigo}} e comprou com a {{agencia}}. Seu bônus de R$ {{valor}} está sendo processado."
                    />
                    <p className="text-[11px] text-muted-foreground">Variáveis: {"{{nome}}"}, {"{{codigo}}"}, {"{{agencia}}"}, {"{{valor}}"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mensagem — bônus pago</Label>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px] resize-y"
                      value={localSettings.whatsappBonusPaidMessage as string ?? ""}
                      onChange={(e) => setLocalSettings((s) => ({ ...s, whatsappBonusPaidMessage: e.target.value }))}
                      placeholder="Seu bônus de R$ {{valor}} foi pago! Obrigado por indicar clientes para a {{agencia}}."
                    />
                    <p className="text-[11px] text-muted-foreground">Variáveis: {"{{valor}}"}, {"{{agencia}}"}</p>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5" />
                Níveis de Gamificação
              </Label>
              <p className="text-xs text-muted-foreground">
                Configure os limiares de indicações convertidas e o multiplicador de bônus de cada nível.
              </p>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Nível</th>
                      <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Mín. convert.</th>
                      <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Multiplicador</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(localSettings.tiersConfig ?? DEFAULT_TIERS).map((tier, idx) => {
                      const visual = TIER_VISUAL[tier.level] ?? { bg: "bg-gray-100", color: "text-gray-600" };
                      return (
                        <tr key={tier.level}>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${visual.bg} ${visual.color}`}>
                              <Star className="w-3 h-3" />
                              {tier.label}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              value={tier.minReferrals}
                              disabled={idx === 0}
                              className="h-7 w-20 text-xs"
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setLocalSettings((s) => {
                                  const tiers = [...(s.tiersConfig ?? DEFAULT_TIERS)];
                                  tiers[idx] = { ...tiers[idx], minReferrals: val };
                                  return { ...s, tiersConfig: tiers };
                                });
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min={0.1}
                                step={0.05}
                                value={tier.bonusMultiplier}
                                className="h-7 w-20 text-xs"
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 1;
                                  setLocalSettings((s) => {
                                    const tiers = [...(s.tiersConfig ?? DEFAULT_TIERS)];
                                    tiers[idx] = { ...tiers[idx], bonusMultiplier: val };
                                    return { ...s, tiersConfig: tiers };
                                  });
                                }}
                              />
                              <span className="text-xs text-muted-foreground">×</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveSettings} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
