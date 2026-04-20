import jsPDF from "jspdf";
import ExcelJS from "exceljs";

const fmtMoney = (v: number | string) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `R$ ${(isNaN(n) ? 0 : n).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
};

const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
  approved: "Aprovado",
};

const METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  bank_transfer: "Transferência",
  cash: "Dinheiro",
  boleto: "Boleto",
};

const EXPENSE_CATEGORIES: Record<string, string> = {
  transport: "Transporte",
  accommodation: "Hospedagem",
  food: "Alimentação",
  marketing: "Marketing",
  administrative: "Administrativo",
  commission: "Comissão",
  other: "Outro",
};

export interface FinancialExportData {
  receivables: Array<{
    description?: string;
    clientName?: string;
    category?: string;
    dueDate: string;
    amount: number | string;
    paymentMethod?: string;
    status: string;
  }>;
  payables: Array<{
    description?: string;
    category?: string;
    dueDate: string;
    amount: number | string;
    status: string;
  }>;
  expenses: Array<{
    description: string;
    category: string;
    supplierName?: string;
    dueDate: string;
    amount: number | string;
    status: string;
  }>;
  commissions: Array<{
    sellerName?: string;
    reservationId?: string;
    baseAmount?: number | string;
    commissionAmount: number | string;
    status: string;
    paidAt?: string;
  }>;
  kpis: {
    netProfit: number;
    grossRevenue: number;
    totalExpensesPaid: number;
    totalReceivable: number;
    totalPayable: number;
    overdueExpenses: number;
    collectedThisMonth: number;
    margin: number;
  };
  chartData?: Array<{ label: string; revenue: number; expenses: number }>;
  dateFrom?: string;
  dateTo?: string;
}

export function exportFinancialPDF(data: FinancialExportData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const checkPage = (neededH: number) => {
    if (y + neededH > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const sectionTitle = (text: string) => {
    checkPage(14);
    doc.setFillColor(30, 64, 175);
    doc.rect(margin, y, contentW, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin + 3, y + 5.5);
    doc.setTextColor(0, 0, 0);
    y += 11;
  };

  const tableHeader = (cols: Array<{ label: string; w: number }>) => {
    checkPage(8);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentW, 7, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    let x = margin + 2;
    for (const col of cols) {
      doc.text(col.label, x, y + 5);
      x += col.w;
    }
    doc.setTextColor(0, 0, 0);
    y += 7;
  };

  const tableRow = (
    cols: Array<{ label: string; w: number }>,
    values: string[],
    rowIndex: number
  ) => {
    checkPage(6);
    if (rowIndex % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentW, 6, "F");
    }
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    let x = margin + 2;
    for (let i = 0; i < cols.length; i++) {
      const val = values[i] ?? "";
      const maxChars = Math.floor(cols[i].w / 2.2);
      const truncated = val.length > maxChars ? val.slice(0, maxChars - 1) + "…" : val;
      doc.text(truncated, x, y + 4.5);
      x += cols[i].w;
    }
    y += 6;
  };

  const kpiBox = (label: string, value: string, color: [number, number, number], x: number, bw: number, bh = 16) => {
    doc.setFillColor(...color);
    doc.roundedRect(x, y, bw, bh, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text(label, x + 3, y + 5);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const maxValueChars = Math.floor(bw / 2.4);
    const truncatedVal = value.length > maxValueChars ? value.slice(0, maxValueChars - 1) + "…" : value;
    doc.text(truncatedVal, x + 3, y + 13);
    doc.setTextColor(0, 0, 0);
  };

  const now = new Date();
  const period =
    data.dateFrom && data.dateTo
      ? `${fmtDate(data.dateFrom)} – ${fmtDate(data.dateTo)}`
      : data.dateFrom
      ? `A partir de ${fmtDate(data.dateFrom)}`
      : data.dateTo
      ? `Até ${fmtDate(data.dateTo)}`
      : "Período completo";

  const headerH = 26;
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, pageW, headerH, "F");

  doc.setFillColor(255, 255, 255, 0.15);
  doc.setFillColor(59, 89, 201);
  doc.roundedRect(margin, 5, 14, 14, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("V", margin + 4.8, 14.5);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("VisiteCRM", margin + 17, 12);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text("Relatório Financeiro Completo", margin + 17, 19);

  doc.setFontSize(7.5);
  doc.text(`Gerado em: ${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, pageW - margin, 12, { align: "right" });
  doc.text(`Período: ${period}`, pageW - margin, 19, { align: "right" });

  doc.setTextColor(0, 0, 0);
  y = headerH + 4;

  sectionTitle("RESUMO FINANCEIRO — KPIs");

  const { kpis } = data;
  const gap = 2;
  const boxW4 = (contentW - gap * 3) / 4;
  kpiBox("Resultado Líquido", fmtMoney(kpis.netProfit), kpis.netProfit >= 0 ? [5, 150, 105] : [220, 38, 38], margin, boxW4);
  kpiBox("Receita Bruta", fmtMoney(kpis.grossRevenue), [22, 163, 74], margin + (boxW4 + gap), boxW4);
  kpiBox("Despesas Pagas", fmtMoney(kpis.totalExpensesPaid), [220, 38, 38], margin + (boxW4 + gap) * 2, boxW4);
  kpiBox("Margem", `${kpis.margin.toFixed(1)}%`, [99, 102, 241], margin + (boxW4 + gap) * 3, boxW4);
  y += 19;

  kpiBox("A Receber", fmtMoney(kpis.totalReceivable), [37, 99, 235], margin, boxW4);
  kpiBox("A Pagar", fmtMoney(kpis.totalPayable), [234, 88, 12], margin + (boxW4 + gap), boxW4);
  kpiBox("Rec. no Mês", fmtMoney(kpis.collectedThisMonth), [14, 165, 233], margin + (boxW4 + gap) * 2, boxW4);
  kpiBox("Despesas Vencidas", fmtMoney(kpis.overdueExpenses), kpis.overdueExpenses > 0 ? [220, 38, 38] : [100, 116, 139], margin + (boxW4 + gap) * 3, boxW4);
  y += 22;

  if (data.chartData && data.chartData.length > 0) {
    checkPage(50);
    sectionTitle("EVOLUÇÃO — RECEITA × DESPESAS (12 MESES)");
    const chartH = 35;
    const chartX = margin;
    const chartW = contentW;
    const barCount = data.chartData.length;
    const maxVal = Math.max(...data.chartData.map(d => Math.max(d.revenue, d.expenses)), 1);
    const barGroupW = chartW / barCount;
    const barW = barGroupW * 0.3;

    doc.setDrawColor(226, 232, 240);
    for (let i = 0; i <= 4; i++) {
      const lineY = y + chartH - (i / 4) * chartH;
      doc.line(chartX, lineY, chartX + chartW, lineY);
    }

    data.chartData.forEach((point, i) => {
      const gx = chartX + i * barGroupW;
      const revH = Math.max((point.revenue / maxVal) * chartH, 0.5);
      const expH = Math.max((point.expenses / maxVal) * chartH, 0.5);

      doc.setFillColor(37, 99, 235);
      doc.rect(gx + barGroupW * 0.05, y + chartH - revH, barW, revH, "F");
      doc.setFillColor(220, 38, 38, 0.6);
      doc.setFillColor(239, 68, 68);
      doc.rect(gx + barGroupW * 0.05 + barW + 1, y + chartH - expH, barW, expH, "F");

      doc.setFontSize(5.5);
      doc.setTextColor(100, 116, 139);
      doc.text(point.label, gx + barGroupW * 0.5, y + chartH + 4, { align: "center" });
    });

    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    doc.setFillColor(37, 99, 235);
    doc.rect(margin, y + chartH + 8, 5, 3, "F");
    doc.text("Receita", margin + 7, y + chartH + 10.5);
    doc.setFillColor(239, 68, 68);
    doc.rect(margin + 25, y + chartH + 8, 5, 3, "F");
    doc.text("Despesas", margin + 32, y + chartH + 10.5);
    doc.setTextColor(0, 0, 0);
    y += chartH + 16;
  }

  sectionTitle("RECEITAS (A RECEBER)");
  const recCols = [
    { label: "Descrição", w: 47 },
    { label: "Cliente", w: 33 },
    { label: "Vencimento", w: 26 },
    { label: "Valor", w: 26 },
    { label: "Forma Pgto.", w: 26 },
    { label: "Status", w: 22 },
  ];
  tableHeader(recCols);
  data.receivables.forEach((r, i) => {
    tableRow(recCols, [
      r.description ?? "—",
      r.clientName ?? "—",
      fmtDate(r.dueDate),
      fmtMoney(r.amount),
      METHOD_LABELS[r.paymentMethod ?? ""] ?? r.paymentMethod ?? "—",
      STATUS_LABELS[r.status] ?? r.status,
    ], i);
  });
  if (data.receivables.length === 0) {
    checkPage(8);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Nenhum lançamento encontrado.", margin + 3, y + 5);
    y += 8;
  }
  y += 4;

  sectionTitle("CONTAS A PAGAR");
  const payCols = [
    { label: "Descrição", w: 64 },
    { label: "Categoria", w: 36 },
    { label: "Vencimento", w: 28 },
    { label: "Valor", w: 26 },
    { label: "Status", w: 26 },
  ];
  tableHeader(payCols);
  data.payables.forEach((p, i) => {
    tableRow(payCols, [
      p.description ?? "—",
      p.category ?? "—",
      fmtDate(p.dueDate),
      fmtMoney(p.amount),
      STATUS_LABELS[p.status] ?? p.status,
    ], i);
  });
  if (data.payables.length === 0) {
    checkPage(8);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Nenhum lançamento encontrado.", margin + 3, y + 5);
    y += 8;
  }
  y += 4;

  sectionTitle("DESPESAS OPERACIONAIS");
  const expCols = [
    { label: "Descrição", w: 50 },
    { label: "Categoria", w: 28 },
    { label: "Fornecedor", w: 28 },
    { label: "Vencimento", w: 24 },
    { label: "Valor", w: 24 },
    { label: "Status", w: 26 },
  ];
  tableHeader(expCols);
  data.expenses.forEach((e, i) => {
    tableRow(expCols, [
      e.description,
      EXPENSE_CATEGORIES[e.category] ?? e.category,
      e.supplierName ?? "—",
      fmtDate(e.dueDate),
      fmtMoney(e.amount),
      STATUS_LABELS[e.status] ?? e.status,
    ], i);
  });
  if (data.expenses.length === 0) {
    checkPage(8);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Nenhuma despesa registrada.", margin + 3, y + 5);
    y += 8;
  }
  y += 4;

  sectionTitle("COMISSÕES");
  const comCols = [
    { label: "Vendedor", w: 40 },
    { label: "Reserva", w: 30 },
    { label: "Base Cálculo", w: 32 },
    { label: "Comissão", w: 32 },
    { label: "Status", w: 22 },
    { label: "Pago em", w: 24 },
  ];
  tableHeader(comCols);
  data.commissions.forEach((c, i) => {
    tableRow(comCols, [
      c.sellerName ?? "—",
      c.reservationId ? `#${c.reservationId.slice(0, 8)}` : "—",
      fmtMoney(c.baseAmount ?? 0),
      fmtMoney(c.commissionAmount),
      STATUS_LABELS[c.status] ?? c.status,
      c.paidAt ? fmtDate(c.paidAt) : "—",
    ], i);
  });
  if (data.commissions.length === 0) {
    checkPage(8);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Nenhuma comissão registrada.", margin + 3, y + 5);
    y += 8;
  }

  const totalPages = (doc.internal as { getNumberOfPages?: () => number }).getNumberOfPages?.() ?? 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Página ${i} de ${totalPages}  |  VisiteCRM — Relatório Financeiro`, pageW / 2, pageH - 6, { align: "center" });
  }

  const filename = `relatorio-financeiro-${now.toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

export async function exportFinancialXLSX(data: FinancialExportData): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "VisiteCRM";
  wb.created = new Date();

  const boldHeader = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
  };

  // ── Resumo ──────────────────────────────────────────────────────────────────
  const wsResumo = wb.addWorksheet("Resumo");
  wsResumo.columns = [
    { header: "Indicador", key: "k", width: 32 },
    { header: "Valor", key: "v", width: 20 },
    { header: "", key: "c", width: 20 },
    { header: "", key: "d", width: 20 },
  ];
  boldHeader(wsResumo);
  wsResumo.addRows([
    { k: "Relatório Financeiro — VisiteCRM" },
    { k: `Gerado em: ${new Date().toLocaleDateString("pt-BR")}` },
    {},
    { k: "RESUMO FINANCEIRO" },
    { k: "Resultado Líquido", v: Number(data.kpis.netProfit) },
    { k: "Receita Bruta (Recebida)", v: Number(data.kpis.grossRevenue) },
    { k: "Despesas Pagas", v: Number(data.kpis.totalExpensesPaid) },
    { k: "Margem (%)", v: Number(data.kpis.margin.toFixed(2)) },
    { k: "A Receber", v: Number(data.kpis.totalReceivable) },
    { k: "Recebido no Mês", v: Number(data.kpis.collectedThisMonth) },
    { k: "Despesas Vencidas", v: Number(data.kpis.overdueExpenses) },
  ]);

  if (data.chartData && data.chartData.length > 0) {
    wsResumo.addRow({});
    wsResumo.addRow({ k: "EVOLUÇÃO MENSAL (12 MESES)" });
    wsResumo.addRow({ k: "Mês", v: "Receita", c: "Despesas", d: "Resultado" });
    for (const d of data.chartData) {
      wsResumo.addRow({ k: d.label, v: d.revenue, c: d.expenses, d: d.revenue - d.expenses });
    }
  }

  // ── Receitas ─────────────────────────────────────────────────────────────────
  const wsRec = wb.addWorksheet("Receitas");
  wsRec.columns = [
    { header: "Descrição", key: "desc", width: 37 },
    { header: "Cliente", key: "client", width: 24 },
    { header: "Categoria", key: "cat", width: 18 },
    { header: "Vencimento", key: "due", width: 14 },
    { header: "Valor (R$)", key: "amount", width: 16 },
    { header: "Forma de Pagamento", key: "method", width: 22 },
    { header: "Status", key: "status", width: 14 },
  ];
  boldHeader(wsRec);
  for (const r of data.receivables) {
    wsRec.addRow({
      desc: r.description ?? "",
      client: r.clientName ?? "",
      cat: r.category ?? "",
      due: fmtDate(r.dueDate),
      amount: Number(r.amount),
      method: METHOD_LABELS[r.paymentMethod ?? ""] ?? r.paymentMethod ?? "",
      status: STATUS_LABELS[r.status] ?? r.status,
    });
  }
  wsRec.getColumn("amount").numFmt = '"R$"#,##0.00';

  // ── A Pagar ───────────────────────────────────────────────────────────────────
  const wsPay = wb.addWorksheet("A Pagar");
  wsPay.columns = [
    { header: "Descrição", key: "desc", width: 37 },
    { header: "Categoria", key: "cat", width: 20 },
    { header: "Vencimento", key: "due", width: 14 },
    { header: "Valor (R$)", key: "amount", width: 16 },
    { header: "Status", key: "status", width: 14 },
  ];
  boldHeader(wsPay);
  for (const p of data.payables) {
    wsPay.addRow({
      desc: p.description ?? "",
      cat: p.category ?? "",
      due: fmtDate(p.dueDate),
      amount: Number(p.amount),
      status: STATUS_LABELS[p.status] ?? p.status,
    });
  }
  wsPay.getColumn("amount").numFmt = '"R$"#,##0.00';

  // ── Despesas ──────────────────────────────────────────────────────────────────
  const wsExp = wb.addWorksheet("Despesas");
  wsExp.columns = [
    { header: "Descrição", key: "desc", width: 37 },
    { header: "Categoria", key: "cat", width: 20 },
    { header: "Fornecedor", key: "supplier", width: 22 },
    { header: "Vencimento", key: "due", width: 14 },
    { header: "Valor (R$)", key: "amount", width: 16 },
    { header: "Status", key: "status", width: 14 },
  ];
  boldHeader(wsExp);
  for (const e of data.expenses) {
    wsExp.addRow({
      desc: e.description,
      cat: EXPENSE_CATEGORIES[e.category] ?? e.category,
      supplier: e.supplierName ?? "",
      due: fmtDate(e.dueDate),
      amount: Number(e.amount),
      status: STATUS_LABELS[e.status] ?? e.status,
    });
  }
  wsExp.getColumn("amount").numFmt = '"R$"#,##0.00';

  // ── Comissões ─────────────────────────────────────────────────────────────────
  const wsCom = wb.addWorksheet("Comissões");
  wsCom.columns = [
    { header: "Vendedor", key: "seller", width: 27 },
    { header: "Reserva", key: "res", width: 22 },
    { header: "Base de Cálculo (R$)", key: "base", width: 24 },
    { header: "Comissão (R$)", key: "commission", width: 20 },
    { header: "Status", key: "status", width: 14 },
    { header: "Pago em", key: "paidAt", width: 16 },
  ];
  boldHeader(wsCom);
  for (const c of data.commissions) {
    wsCom.addRow({
      seller: c.sellerName ?? "",
      res: c.reservationId ?? "",
      base: Number(c.baseAmount ?? 0),
      commission: Number(c.commissionAmount),
      status: STATUS_LABELS[c.status] ?? c.status,
      paidAt: c.paidAt ? fmtDate(c.paidAt) : "",
    });
  }
  wsCom.getColumn("base").numFmt = '"R$"#,##0.00';
  wsCom.getColumn("commission").numFmt = '"R$"#,##0.00';

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `relatorio-financeiro-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
