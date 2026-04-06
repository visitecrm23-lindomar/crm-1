import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Download,
  FileText,
  FileSpreadsheet,
  Users,
  Map,
  CalendarCheck,
  DollarSign,
  Bus,
  Clock,
  CheckCircle2,
} from "lucide-react";

interface DownloadEntry {
  id: string;
  name: string;
  format: string;
  generatedAt: string;
  size: string;
  status: "ready" | "generating" | "error";
}

interface ExportAction {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  formats: { label: string; format: string }[];
}

const EXPORTS: ExportAction[] = [
  {
    label: "Clientes",
    description: "Lista completa de clientes com dados de contato e histórico",
    icon: Users,
    formats: [
      { label: "CSV", format: "csv" },
      { label: "Excel", format: "xlsx" },
    ],
  },
  {
    label: "Viagens",
    description: "Catálogo de viagens com datas, preços e ocupação",
    icon: Map,
    formats: [
      { label: "PDF", format: "pdf" },
      { label: "Excel", format: "xlsx" },
    ],
  },
  {
    label: "Reservas",
    description: "Relatório de reservas com status e valores",
    icon: CalendarCheck,
    formats: [
      { label: "CSV", format: "csv" },
      { label: "Excel", format: "xlsx" },
    ],
  },
  {
    label: "Relatório Financeiro",
    description: "Receitas, despesas, pagamentos e balanço",
    icon: DollarSign,
    formats: [
      { label: "PDF", format: "pdf" },
      { label: "Excel", format: "xlsx" },
    ],
  },
  {
    label: "Lista de Passageiros (ANTT)",
    description: "Manifesto de passageiros no formato ANTT para viagens de ônibus",
    icon: Bus,
    formats: [{ label: "PDF", format: "pdf" }],
  },
  {
    label: "Relatório de NPS",
    description: "Scores NPS, feedback e análise de satisfação",
    icon: FileText,
    formats: [
      { label: "PDF", format: "pdf" },
      { label: "CSV", format: "csv" },
    ],
  },
  {
    label: "Comissões de Vendedores",
    description: "Relatório de comissões por vendedor e por período",
    icon: DollarSign,
    formats: [
      { label: "CSV", format: "csv" },
      { label: "Excel", format: "xlsx" },
    ],
  },
  {
    label: "Relatório de Indicações",
    description: "Programa de indicações e bônus pagos",
    icon: Users,
    formats: [{ label: "CSV", format: "csv" }],
  },
];

const FORMAT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  csv: FileText,
  xlsx: FileSpreadsheet,
  pdf: FileText,
};

const FORMAT_COLORS: Record<string, string> = {
  csv: "bg-green-50 text-green-700 border-green-200",
  xlsx: "bg-blue-50 text-blue-700 border-blue-200",
  pdf: "bg-red-50 text-red-700 border-red-200",
};

export default function Downloads() {
  const { toast } = useToast();
  const [history, setHistory] = useState<DownloadEntry[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);

  function handleExport(label: string, format: string) {
    const id = `${label}-${format}-${Date.now()}`;
    setGenerating(id);

    const entry: DownloadEntry = {
      id,
      name: `${label}.${format}`,
      format,
      generatedAt: new Date().toISOString(),
      size: "—",
      status: "generating",
    };
    setHistory((prev) => [entry, ...prev]);

    // Simulate generation
    setTimeout(() => {
      setGenerating(null);
      setHistory((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: "ready",
                size: `${(Math.random() * 2 + 0.1).toFixed(1)} MB`,
              }
            : e
        )
      );
      toast({ title: `${label} (${format.toUpperCase()}) pronto para download` });
    }, 1800);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Downloads e Exportações</h1>
        <p className="text-sm text-muted-foreground">
          Exporte dados do sistema em diferentes formatos
        </p>
      </div>

      {/* Export cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {EXPORTS.map((exp) => {
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
                  {exp.formats.map(({ label, format }) => {
                    const FmtIcon = FORMAT_ICON[format] ?? FileText;
                    const key = `${exp.label}-${format}-${Date.now()}`;
                    const isGenerating =
                      generating !== null &&
                      history.some(
                        (h) =>
                          h.name === `${exp.label}.${format}` &&
                          h.status === "generating"
                      );
                    return (
                      <Button
                        key={format}
                        variant="outline"
                        size="sm"
                        className={`${FORMAT_COLORS[format] ?? ""} border`}
                        onClick={() => handleExport(exp.label, format)}
                        disabled={isGenerating}
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

      {/* Download history */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">Histórico de Downloads</h2>
          <div className="rounded-md border bg-background divide-y">
            {history.map((entry) => {
              const FmtIcon = FORMAT_ICON[entry.format] ?? FileText;
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <FmtIcon className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{entry.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {new Date(entry.generatedAt).toLocaleString("pt-BR")}
                      {entry.size !== "—" && (
                        <span>· {entry.size}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {entry.status === "generating" ? (
                      <Badge variant="secondary" className="text-xs">
                        <span className="animate-pulse">Gerando...</span>
                      </Badge>
                    ) : entry.status === "ready" ? (
                      <>
                        <Badge className="text-xs bg-green-50 text-green-700 border border-green-200">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Pronto
                        </Badge>
                        <Button size="sm" variant="outline">
                          <Download className="w-3.5 h-3.5 mr-1" />
                          Baixar
                        </Button>
                      </>
                    ) : (
                      <Badge variant="destructive" className="text-xs">
                        Erro
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
