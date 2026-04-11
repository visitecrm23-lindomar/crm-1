import { useState } from "react";
import {
  useListReferrals,
  useGetMe,
  useUpdateReferral,
  useUpsertSystemConfig,
} from "@workspace/api-client-react";
import type { Referral } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  DollarSign,
  Copy,
  Share2,
  Check,
  Trophy,
  Link,
} from "lucide-react";

function fmtCurrency(v: string | number | null | undefined) {
  if (v == null) return "R$ 0,00";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  converted: "Convertido",
  expired: "Expirado",
};

export default function Indicacoes() {
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const { data: referrals = [], refetch } = useListReferrals();
  const updateReferral = useUpdateReferral();
  const upsertConfig = useUpsertSystemConfig();

  const [copied, setCopied] = useState(false);
  const [bonusModalOpen, setBonusModalOpen] = useState(false);
  const [bonusPerReferral, setBonusPerReferral] = useState("50.00");
  const [discountForReferred, setDiscountForReferred] = useState("10.00");

  const referralCode = me?.referralCode ?? "SEU-CODIGO";
  const referralBalance = me?.referralBalance ?? 0;
  const referralLink = `https://visitecrm.app/r/${referralCode}`;

  const myReferrals = referrals.filter((r) => r.referrerId === me?.id);
  const converted = myReferrals.filter((r) => r.status === "converted").length;
  const pending = myReferrals.filter((r) => r.status === "pending").length;
  const earned = myReferrals
    .filter((r) => r.bonusPaid)
    .reduce((sum, r) => sum + parseFloat(r.bonusAmount ?? "0"), 0);

  function copyLink() {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function shareLink() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Meu link de indicação", url: referralLink });
      } catch {
        // user cancelled or error — do nothing
      }
    } else {
      navigator.clipboard.writeText(referralLink).then(() => {
        toast({ title: "Link copiado!", description: "Cole e envie para quem quiser indicar." });
      });
    }
  }

  // Leaderboard: group all referrals by referrerId
  const leaderMap: Record<string, { count: number; bonus: number; referrerId: string }> =
    {};
  referrals.forEach((r) => {
    if (!leaderMap[r.referrerId]) {
      leaderMap[r.referrerId] = { count: 0, bonus: 0, referrerId: r.referrerId };
    }
    if (r.status === "converted") leaderMap[r.referrerId].count++;
    if (r.bonusPaid) {
      leaderMap[r.referrerId].bonus += parseFloat(r.bonusAmount ?? "0");
    }
  });
  const leaderboard = Object.values(leaderMap).sort((a, b) => b.count - a.count);

  async function handleMarkPaid(r: Referral) {
    try {
      await updateReferral.mutateAsync({
        id: r.id,
        data: { bonusPaid: true, status: "converted" },
      });
      toast({ title: "Bônus marcado como pago" });
      refetch();
    } catch {
      toast({ title: "Erro ao atualizar indicação", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Programa de Indicações</h1>
          <p className="text-sm text-muted-foreground">
            Convide amigos e ganhe bônus por cada conversão
          </p>
        </div>
        <Button variant="outline" onClick={() => setBonusModalOpen(true)}>
          Configurar Bônus
        </Button>
      </div>

      {/* My referral card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Seu código de indicação
              </p>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold tracking-widest font-mono text-primary">
                  {referralCode}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  value={referralLink}
                  readOnly
                  className="text-xs max-w-xs bg-background"
                />
                <Button size="sm" variant="outline" onClick={copyLink}>
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
                <Button size="sm" variant="outline" onClick={shareLink}>
                  <Share2 className="w-4 h-4 mr-1" />
                  Compartilhar
                </Button>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Saldo de bônus</p>
              <p className="text-3xl font-bold text-green-600">{fmtCurrency(referralBalance)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              Indicações totais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{myReferrals.length}</p>
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
            <p className="text-3xl font-bold text-green-600">{converted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Link className="w-4 h-4" />
              Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-600">{pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Bônus recebido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmtCurrency(earned)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* My referrals list */}
        <div className="lg:col-span-2 space-y-2">
          <h2 className="font-semibold">Minhas Indicações</h2>
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>E-mail indicado</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Bônus</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myReferrals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      Nenhuma indicação realizada ainda
                    </TableCell>
                  </TableRow>
                ) : (
                  myReferrals.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.code}</TableCell>
                      <TableCell>{r.referredEmail ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === "converted"
                              ? "default"
                              : r.status === "expired"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{fmtCurrency(r.bonusAmount)}</TableCell>
                      <TableCell>
                        {r.bonusPaid ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        {r.status === "converted" && !r.bonusPaid && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleMarkPaid(r)}
                            disabled={updateReferral.isPending}
                          >
                            Pagar bônus
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="space-y-2">
          <h2 className="font-semibold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" />
            Ranking da Agência
          </h2>
          <Card>
            <CardContent className="p-0">
              {leaderboard.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  Nenhum dado disponível
                </div>
              ) : (
                <div className="divide-y">
                  {leaderboard.slice(0, 10).map((entry, idx) => (
                    <div
                      key={entry.referrerId}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span
                        className={`text-lg font-bold w-6 text-center ${
                          idx === 0
                            ? "text-yellow-500"
                            : idx === 1
                            ? "text-gray-400"
                            : idx === 2
                            ? "text-orange-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {entry.referrerId.slice(0, 8)}...
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.count} conversão(ões)
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600">
                          {fmtCurrency(entry.bonus)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bonus configuration modal */}
      <Dialog open={bonusModalOpen} onOpenChange={setBonusModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Configurar Bônus de Indicação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Bônus por indicação convertida (R$)</Label>
              <Input
                type="number"
                value={bonusPerReferral}
                onChange={(e) => setBonusPerReferral(e.target.value)}
                min={0}
                step={0.01}
              />
            </div>
            <div className="space-y-1">
              <Label>Desconto para o indicado (%)</Label>
              <Input
                type="number"
                value={discountForReferred}
                onChange={(e) => setDiscountForReferred(e.target.value)}
                min={0}
                max={100}
                step={0.5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBonusModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={upsertConfig.isPending}
              onClick={async () => {
                try {
                  await upsertConfig.mutateAsync({
                    data: {
                      key: "referral_bonus_config",
                      value: { bonusPerReferral, discountForReferred },
                    },
                  });
                  toast({ title: "Configurações de bônus salvas" });
                  setBonusModalOpen(false);
                } catch {
                  toast({ title: "Erro ao salvar configurações", variant: "destructive" });
                }
              }}
            >
              {upsertConfig.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
