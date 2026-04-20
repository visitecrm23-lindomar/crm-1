import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2 } from "lucide-react";

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

interface MonthlyHistoryTableProps {
  data: Array<{ label: string; revenue: number; expenses: number }> | undefined;
  subtitle?: string;
  emptyMessage?: string;
}

export function MonthlyHistoryTable({
  data,
  subtitle,
  emptyMessage = "Sem dados disponíveis para o período selecionado.",
}: MonthlyHistoryTableProps) {
  const title = subtitle
    ? `Histórico Mensal — Receita vs Despesas (${subtitle})`
    : "Histórico Mensal — Receita vs Despesas";

  const rows = (data ?? []).map(d => {
    const resultado = d.revenue - d.expenses;
    const margem = d.revenue > 0 ? (resultado / d.revenue) * 100 : 0;
    return { ...d, resultado, margem };
  });

  const totRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totExpenses = rows.reduce((s, r) => s + r.expenses, 0);
  const totResultado = totRevenue - totExpenses;
  const totMargem = totRevenue > 0 ? (totResultado / totRevenue) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart2 className="w-4 h-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!rows.length ? (
          <div className="py-12 text-center text-muted-foreground text-sm">{emptyMessage}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Despesas</TableHead>
                <TableHead className="text-right">Resultado</TableHead>
                <TableHead className="text-right">Margem %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-right text-green-600 font-medium">{fmt(row.revenue)}</TableCell>
                  <TableCell className="text-right text-red-500 font-medium">{fmt(row.expenses)}</TableCell>
                  <TableCell className={`text-right font-semibold ${row.resultado >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {row.resultado >= 0 ? "+" : ""}{fmt(row.resultado)}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${row.margem >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {row.margem.toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-border bg-muted/40">
                <TableCell className="font-bold text-sm">Total Acumulado</TableCell>
                <TableCell className="text-right text-green-700 font-bold">{fmt(totRevenue)}</TableCell>
                <TableCell className="text-right text-red-600 font-bold">{fmt(totExpenses)}</TableCell>
                <TableCell className={`text-right font-bold ${totResultado >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {totResultado >= 0 ? "+" : ""}{fmt(totResultado)}
                </TableCell>
                <TableCell className={`text-right font-bold ${totMargem >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {totMargem.toFixed(1)}%
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
