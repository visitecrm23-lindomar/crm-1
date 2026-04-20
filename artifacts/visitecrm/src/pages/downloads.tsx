import { useState } from "react";
import { useListClients, useListReservations, useListPayments, useListTrips, useListReferrals, useListCommissions } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Download, FileText, FileSpreadsheet, Users, Map, CalendarCheck, DollarSign, Bus, Loader2, BarChart2,
} from "lucide-react";
import { format, parseISO, startOfMonth } from "date-fns";

function downloadCsv(rows: string[][], filename: string) {
  const content = rows.map(r => r.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function fmtDate(d?: string | null) { try { return d ? format(parseISO(d), "dd/MM/yyyy") : ""; } catch { return d ?? ""; } }
function fmtCur(v?: number | string | null) { if (v == null) return "0,00"; return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 }); }

const FORMAT_COLORS: Record<string, string> = {
  csv: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
  xlsx: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
  pdf: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
};
const FORMAT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  csv: FileText, xlsx: FileSpreadsheet, pdf: FileText,
};

const REPORT_TYPES = [
  { value: "financial", label: "Financeiro", description: "Receitas, despesas e balanço" },
  { value: "sales", label: "Vendas", description: "Reservas e métricas de vendas" },
  { value: "clients", label: "Clientes", description: "Cadastro e histórico de clientes" },
] as const;

type ReportType = "financial" | "sales" | "clients";
type ExportFormat = "csv" | "xlsx" | "pdf";

const FORMAT_STYLES: Record<ExportFormat, string> = {
  csv: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
  xlsx: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
  pdf: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
};

export default function Downloads() {
  const { toast } = useToast();

  const [reportType, setReportType] = useState<ReportType>("financial");
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  async function serverExport(fmt: ExportFormat) {
    setExporting(fmt);
    try {
      const res = await fetch("/api/reports/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, format: fmt, startDate, endDate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Erro ao gerar relatório");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `relatorio.${fmt}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Relatório exportado com sucesso!" });
    } catch (err) {
      toast({ title: "Erro na exportação", description: String(err), variant: "destructive" });
    } finally {
      setExporting(null);
    }
  }

  const { data: clientsData } = useListClients({ limit: 5000, page: 1 });
  const { data: reservationsData } = useListReservations({ limit: 5000 });
  const { data: paymentsData } = useListPayments({ limit: 5000 });
  const { data: tripsData } = useListTrips({ limit: 1000 });
  const { data: referralsData } = useListReferrals();
  const { data: commissionsData } = useListCommissions();

  function exportClients() {
    const clients = clientsData?.data ?? [];
    if (!clients.length) { toast({ title: "Sem dados de clientes para exportar" }); return; }
    const headers = ["Nome", "E-mail", "WhatsApp", "Telefone", "CPF", "Nascimento", "Gênero", "Cidade", "Estado", "Instagram", "Classificação", "Status", "Pipeline", "Total Gasto (R$)", "Saldo Devedor (R$)", "Tags", "Destinos Sonhados", "Observações", "Cadastrado em"];
    const rows = clients.map(c => [
      c.name, c.email, c.whatsapp, c.phone ?? "", c.cpf ?? "",
      fmtDate(c.birthDate), c.gender ?? "", c.addressCity ?? "", c.addressState ?? "", c.instagram ?? "",
      c.classification ?? "", c.status ?? "", c.pipelineStage ?? "",
      fmtCur(c.totalSpent), fmtCur(c.outstandingBalance),
      (c.tags ?? []).join("; "), (c.dreamDestinations ?? []).join("; "),
      c.observations ?? "", fmtDate(c.createdAt),
    ]);
    downloadCsv([headers, ...rows], `clientes_${format(new Date(), "yyyyMMdd")}.csv`);
    toast({ title: `${clients.length} clientes exportados!` });
  }

  function exportTrips() {
    const trips = tripsData?.data ?? [];
    if (!trips.length) { toast({ title: "Sem dados de viagens para exportar" }); return; }
    const headers = ["Nome", "Destino", "Cidade", "Estado", "Tipo", "Categoria", "Saída", "Retorno", "Capacidade Total", "Vagas Disponíveis", "Vagas Reservadas", "Preço Adulto (R$)", "Preço Criança (R$)", "Preço Sênior (R$)", "Status", "Pública", "Criado em"];
    const rows = trips.map(t => [
      t.name, t.destination, t.destinationCity, t.destinationState,
      t.type, t.category, fmtDate(t.departureDate), fmtDate(t.returnDate ?? undefined),
      String(t.totalCapacity), String(t.availableSeats), String(t.reservedSeats),
      fmtCur(t.priceAdult), fmtCur(t.priceChild ?? 0), fmtCur(t.priceSenior ?? 0),
      t.status, t.isPublic ? "Sim" : "Não", fmtDate(t.createdAt),
    ]);
    downloadCsv([headers, ...rows], `viagens_${format(new Date(), "yyyyMMdd")}.csv`);
    toast({ title: `${trips.length} viagens exportadas!` });
  }

  function exportReservations() {
    const reservations = reservationsData?.data ?? [];
    if (!reservations.length) { toast({ title: "Sem dados de reservas para exportar" }); return; }
    const headers = ["ID", "Cliente", "Viagem", "Saída", "Status", "Assentos", "Valor Total (R$)", "Valor Pago (R$)", "Saldo (R$)", "Forma de Pagamento", "Parcelas", "Criado em"];
    const rows = reservations.map(r => [
      r.id, r.client?.name ?? "", r.trip?.name ?? "",
      fmtDate(r.trip?.departureDate),
      r.status, String(r.seats?.length ?? 0),
      fmtCur(r.totalValue), fmtCur(r.paidValue),
      fmtCur(r.balance),
      r.paymentMethod ?? "", String(r.installments ?? 1),
      fmtDate(r.createdAt),
    ]);
    downloadCsv([headers, ...rows], `reservas_${format(new Date(), "yyyyMMdd")}.csv`);
    toast({ title: `${reservations.length} reservas exportadas!` });
  }

  function exportPayments() {
    const payments = paymentsData?.data ?? [];
    if (!payments.length) { toast({ title: "Sem dados financeiros para exportar" }); return; }
    const headers = ["ID", "Tipo", "Categoria", "Descrição", "Valor (R$)", "Status", "Vencimento", "Pagamento", "Forma", "Parcela", "Criado em"];
    const rows = payments.map(p => [
      p.id, p.type, p.category, p.description ?? "",
      fmtCur(p.amount), p.status,
      fmtDate(p.dueDate), fmtDate(p.paidAt ?? undefined),
      p.paymentMethod ?? "",
      String(p.installmentNumber ?? ""),
      fmtDate(p.createdAt),
    ]);
    downloadCsv([headers, ...rows], `financeiro_${format(new Date(), "yyyyMMdd")}.csv`);
    toast({ title: `${payments.length} lançamentos exportados!` });
  }

  function exportPassengerManifest() {
    const reservations = reservationsData?.data ?? [];
    if (!reservations.length) { toast({ title: "Sem reservas para gerar manifesto" }); return; }
    const headers = ["Viagem", "Data de Saída", "Passageiro", "WhatsApp", "Assento", "Status", "Reserva"];
    const rows: string[][] = [];
    for (const r of reservations) {
      for (const seat of r.seats ?? []) {
        rows.push([
          r.trip?.name ?? "", fmtDate(r.trip?.departureDate),
          r.client?.name ?? "",
          r.client?.whatsapp ?? "",
          String(seat), r.status, r.id,
        ]);
      }
    }
    if (!rows.length) { toast({ title: "Nenhuma reserva com assentos encontrada" }); return; }
    downloadCsv([headers, ...rows], `manifesto_passageiros_${format(new Date(), "yyyyMMdd")}.csv`);
    toast({ title: `Manifesto com ${rows.length} registros exportado!` });
  }

  function exportReferrals() {
    const referrals = referralsData?.data ?? [];
    if (!referrals.length) { toast({ title: "Sem indicações para exportar" }); return; }
    const headers = ["ID", "Código", "ID do Indicador", "ID do Indicado", "E-mail do Indicado", "Status", "Bônus (R$)", "Bônus Pago", "Convertido em", "Criado em"];
    const rows = referrals.map(r => [
      r.id, r.code, r.referrerId, r.referredId ?? "",
      r.referredEmail ?? "", r.status,
      fmtCur(r.bonusAmount), r.bonusPaid ? "Sim" : "Não",
      fmtDate(r.convertedAt ?? undefined), fmtDate(r.createdAt),
    ]);
    downloadCsv([headers, ...rows], `indicacoes_${format(new Date(), "yyyyMMdd")}.csv`);
    toast({ title: `${referrals.length} indicações exportadas!` });
  }

  function exportCommissions() {
    const commissions = commissionsData ?? [];
    if (!commissions.length) { toast({ title: "Sem comissões para exportar" }); return; }
    const headers = ["ID", "ID do Vendedor", "ID da Reserva", "Status", "Valor Base (R$)", "Valor Comissão (R$)", "Pago em", "Criado em"];
    const rows = commissions.map(c => [
      c.id, c.userId, c.reservationId ?? "",
      c.status, fmtCur(c.baseAmount), fmtCur(c.commissionAmount),
      fmtDate(c.paidAt ?? undefined), fmtDate(c.createdAt),
    ]);
    downloadCsv([headers, ...rows], `comissoes_${format(new Date(), "yyyyMMdd")}.csv`);
    toast({ title: `${commissions.length} comissões exportadas!` });
  }

  const exports = [
    {
      label: "Clientes",
      description: "Lista completa de clientes com dados de contato e histórico",
      icon: Users,
      formats: [{ label: "CSV", format: "csv", action: exportClients }],
    },
    {
      label: "Viagens",
      description: "Catálogo de viagens com datas, preços e ocupação",
      icon: Map,
      formats: [{ label: "CSV", format: "csv", action: exportTrips }],
    },
    {
      label: "Reservas",
      description: "Relatório de reservas com status e valores",
      icon: CalendarCheck,
      formats: [{ label: "CSV", format: "csv", action: exportReservations }],
    },
    {
      label: "Relatório Financeiro",
      description: "Receitas, despesas, pagamentos e balanço",
      icon: DollarSign,
      formats: [{ label: "CSV", format: "csv", action: exportPayments }],
    },
    {
      label: "Lista de Passageiros (ANTT)",
      description: "Manifesto de passageiros para viagens de ônibus",
      icon: Bus,
      formats: [{ label: "CSV", format: "csv", action: exportPassengerManifest }],
    },
    {
      label: "Relatório de Indicações",
      description: "Programa de indicações e bônus pagos",
      icon: Users,
      formats: [{ label: "CSV", format: "csv", action: exportReferrals }],
    },
    {
      label: "Comissões de Vendedores",
      description: "Relatório de comissões por vendedor e por período",
      icon: DollarSign,
      formats: [{ label: "CSV", format: "csv", action: exportCommissions }],
    },
  ];

  const selectedReport = REPORT_TYPES.find(r => r.value === reportType);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Downloads e Exportações</h1>
        <p className="text-sm text-muted-foreground">
          Exporte relatórios completos em CSV, Excel ou PDF, ou faça downloads rápidos em CSV diretamente no navegador.
        </p>
      </div>

      {/* Server-side reports panel */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            Exportar Relatório
          </CardTitle>
          <CardDescription className="text-xs">
            Gera relatórios completos com múltiplas abas (Excel) ou tabelas formatadas (PDF)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <Label className="text-xs">Tipo de relatório</Label>
              <Select value={reportType} onValueChange={v => setReportType(v as ReportType)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedReport && (
                <p className="text-[11px] text-muted-foreground">{selectedReport.description}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Data início</Label>
              <Input
                type="date"
                className="h-8 text-sm w-[140px]"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Data fim</Label>
              <Input
                type="date"
                className="h-8 text-sm w-[140px]"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              {(["csv", "xlsx", "pdf"] as ExportFormat[]).map(fmt => {
                const FmtIcon = fmt === "xlsx" ? FileSpreadsheet : FileText;
                const isLoading = exporting === fmt;
                return (
                  <Button
                    key={fmt}
                    variant="outline"
                    size="sm"
                    className={`${FORMAT_STYLES[fmt]} border`}
                    onClick={() => serverExport(fmt)}
                    disabled={exporting !== null}
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <FmtIcon className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {fmt.toUpperCase()}
                    {!isLoading && <Download className="w-3 h-3 ml-1.5" />}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-base font-semibold mb-3 text-muted-foreground">Downloads rápidos (CSV)</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exports.map((exp) => {
          const Icon = exp.icon;
          return (
            <Card key={exp.label}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  {exp.label}
                </CardTitle>
                <CardDescription className="text-xs">{exp.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 flex-wrap">
                  {exp.formats.map(({ label, format: fmt, action }) => {
                    const FmtIcon = FORMAT_ICON[fmt] ?? FileText;
                    return (
                      <Button
                        key={fmt}
                        variant="outline"
                        size="sm"
                        className={`${FORMAT_COLORS[fmt] ?? ""} border`}
                        onClick={action}
                      >
                        <FmtIcon className="w-3.5 h-3.5 mr-1.5" />
                        {label}
                        <Download className="w-3 h-3 ml-1.5" />
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
