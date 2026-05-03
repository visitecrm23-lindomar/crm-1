import { useState } from "react";
import {
  useListReferrals,
  useUpdateReferral,
  useGetReferralStats,
  useGetReferralSettings,
  useUpdateReferralSettings,
} from "@workspace/api-client-react";
import type { Referral, ReferralSettings } from "@workspace/api-client-react";
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
} from "lucide-react";

import { formatCurrency as _fmtCurrencyLib, formatDate as _formatDate } from "@/lib/utils";
function fmtCurrency(v: string | number | null | undefined) {
  if (v == null) return "R$ 0,00";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return _fmtCurrencyLib(isNaN(n) ? 0 : n);
}
const fmtDate = (v: string | null | undefined) => v ? _formatDate(v) : "—";

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

export default function Indicacoes() {
  const { toast } = useToast();
  const { data: referralsResponse, refetch } = useListReferrals();
  const referrals = (referralsResponse as { data?: Referral[] } | undefined)?.data ?? (Array.isArray(referralsResponse) ? referralsResponse as Referral[] : []);
  const { data: stats } = useGetReferralStats();
  const { data: settings, refetch: refetchSettings } = useGetReferralSettings();
  const updateReferral = useUpdateReferral();
  const updateSettings = useUpdateReferralSettings();

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Settings form state
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
        },
      });
      toast({ title: "Configurações salvas com sucesso" });
      refetchSettings();
      setSettingsModalOpen(false);
    } catch {
      toast({ title: "Erro ao salvar configurações", variant: "destructive" });
    }
  }

  async function handleDeactivate(r: Referral) {
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

  async function handleMarkPaid(r: Referral) {
    try {
      await updateReferral.mutateAsync({
        id: r.id,
        data: { bonusPaid: true },
      });
      toast({ title: "Bônus marcado como pago" });
      refetch();
      setDetailModalOpen(false);
    } catch {
      toast({ title: "Erro ao atualizar indicação", variant: "destructive" });
    }
  }

  function openDetail(r: Referral) {
    setSelectedReferral(r);
    setDetailModalOpen(true);
  }

  // Filtered referrals
  const filtered = referrals.filter((r) => {
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q
      || r.code.toLowerCase().includes(q)
      || (r.referrerName ?? "").toLowerCase().includes(q)
      || (r.referredEmail ?? "").toLowerCase().includes(q)
      || (r.referredName ?? "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const settingsDiscountPct = settings ? parseFloat(String(settings.discountValue)) : 5;
  const settingsBonusVal = settings ? parseFloat(String(settings.bonusValue)) : 10;
  const isEnabled = settings?.isEnabled ?? true;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Programa de Indicações</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie indicações, conversões e configurações do programa
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isEnabled && (
            <Badge variant="destructive" className="text-sm px-3 py-1">
              Programa desativado
            </Badge>
          )}
          <Button variant="outline" onClick={openSettings}>
            <Settings className="w-4 h-4 mr-2" />
            Configurações
          </Button>
        </div>
      </div>

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
        const rankMap = new Map<string, { name: string; code: string; total: number; conversions: number; earnings: number }>();
        for (const r of referrals) {
          const key = r.referrerId;
          const existing = rankMap.get(key);
          const bonus = parseFloat(String(r.bonusAmount ?? "0")) || 0;
          if (existing) {
            existing.total += 1;
            if (r.status === REFERRAL_STATUS.COMPLETED) { existing.conversions += 1; existing.earnings += bonus; }
          } else {
            rankMap.set(key, {
              name: r.referrerName ?? r.referrerId.slice(0, 8),
              code: r.code,
              total: 1,
              conversions: r.status === REFERRAL_STATUS.COMPLETED ? 1 : 0,
              earnings: r.status === REFERRAL_STATUS.COMPLETED ? bonus : 0,
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
                    <TableHead>Nome</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="text-center">Indicações</TableHead>
                    <TableHead className="text-center">Convertidas</TableHead>
                    <TableHead className="text-right">Bônus ganho</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranked.map((r, i) => (
                    <TableRow key={r.code + i}>
                      <TableCell className="py-2">{rankIcon(i)}</TableCell>
                      <TableCell className="font-medium py-2">{r.name}</TableCell>
                      <TableCell className="font-mono text-primary py-2">{r.code}</TableCell>
                      <TableCell className="text-center py-2">{r.total}</TableCell>
                      <TableCell className="text-center py-2">
                        <Badge variant={r.conversions > 0 ? "default" : "secondary"}>{r.conversions}</Badge>
                      </TableCell>
                      <TableCell className="text-right py-2 text-green-600 font-medium">{fmtCurrency(r.earnings)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })()}

      {/* Referrals Table */}
      <Tabs defaultValue="all">
        <div className="flex items-center gap-3 mb-3">
          <TabsList>
            <TabsTrigger value="all" onClick={() => setStatusFilter("all")}>Todas</TabsTrigger>
            <TabsTrigger value="pending" onClick={() => setStatusFilter("pending")}>Pendentes</TabsTrigger>
            <TabsTrigger value="completed" onClick={() => setStatusFilter("completed")}>Convertidas</TabsTrigger>
            <TabsTrigger value="expired" onClick={() => setStatusFilter("expired")}>Expiradas</TabsTrigger>
          </TabsList>
          <Input
            placeholder="Buscar por código, nome ou e-mail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-xs"
          />
          <span className="text-sm text-muted-foreground ml-auto">{filtered.length} indicações</span>
        </div>

        <TabsContent value={statusFilter}>
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhuma indicação encontrada
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
                    <TableHead>Desconto</TableHead>
                    <TableHead>Visitas</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono font-semibold text-primary">{r.code}</TableCell>
                      <TableCell>{r.referrerName ?? r.referrerId.slice(0, 8)}</TableCell>
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
                      <TableCell>
                        {r.discountApplied
                          ? fmtCurrency(r.discountAmount)
                          : `${r.discountValue}%`}
                      </TableCell>
                      <TableCell>{r.visitsCount ?? 0}</TableCell>
                      <TableCell>{fmtDate(r.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openDetail(r)}>
                            <Eye className="w-3 h-3" />
                          </Button>
                          {r.isActive && r.status === "pending" && (
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeactivate(r)}>
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
        <TabsContent value="pending" />
        <TabsContent value="completed" />
        <TabsContent value="expired" />
      </Tabs>

      {/* Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da Indicação</DialogTitle>
          </DialogHeader>
          {selectedReferral && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Código</p>
                  <p className="font-mono font-bold text-primary">{selectedReferral.code}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <StatusBadge status={selectedReferral.status} />
                </div>
                <div>
                  <p className="text-muted-foreground">Quem indicou</p>
                  <p>{selectedReferral.referrerName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{selectedReferral.referrerEmail ?? ""}</p>
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
                  <p className="text-green-600">{fmtCurrency(selectedReferral.bonusAmount)}</p>
                  <p className="text-xs text-muted-foreground">{selectedReferral.bonusPaid ? "Pago" : "Pendente"}</p>
                </div>
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
            {selectedReferral && selectedReferral.status === REFERRAL_STATUS.COMPLETED && !selectedReferral.bonusPaid && (
              <Button onClick={() => handleMarkPaid(selectedReferral)}>
                <Check className="w-4 h-4 mr-2" />
                Marcar bônus como pago
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailModalOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Modal */}
      <Dialog open={settingsModalOpen} onOpenChange={setSettingsModalOpen}>
        <DialogContent className="sm:max-w-md">
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
