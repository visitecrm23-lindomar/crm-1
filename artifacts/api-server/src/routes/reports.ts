import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, reservationsTable, clientsTable, tripsTable, expensesTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { requireAuth } from "../lib/tenant";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { applyPlugin } from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MANAGEMENT_ROLES } from '../lib/tenant';
import { RESERVATION_STATUS, PAYMENT_STATUS } from "@workspace/permissions";

applyPlugin(jsPDF);

const router = Router();

type JsPDFWithAutoTable = InstanceType<typeof jsPDF> & {
  autoTable: (opts: Record<string, unknown>) => void;
  lastAutoTable: { finalY: number };
};

function fmtDate(d?: Date | null): string {
  if (!d) return "";
  try { return format(d, "dd/MM/yyyy", { locale: ptBR }); } catch { return ""; }
}

function fmtCur(v?: string | number | null): string {
  if (v == null || v === "") return "R$ 0,00";
  return `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function buildCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map(r => r.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function pdfHeader(doc: JsPDFWithAutoTable, title: string, period: string) {
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 18);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Período: ${period}`, 14, 25);
  doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 30);
  return 38;
}

function pdfSection(doc: JsPDFWithAutoTable, title: string, y: number): number {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, y);
  return y + 6;
}

router.post("/reports/export", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (!MANAGEMENT_ROLES.includes(me.role)) {
      res.status(403).json({ error: "Sem permissão" });
      return;
    }

    const { reportType, format: fmt, startDate, endDate } = req.body as {
      reportType: "financial" | "sales" | "clients";
      format: "csv" | "xlsx" | "pdf";
      startDate?: string;
      endDate?: string;
    };

    if (!reportType || !fmt) {
      res.status(400).json({ error: "reportType e format são obrigatórios" });
      return;
    }

    const tenantId = me.tenantId;
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : new Date();
    const periodLabel = `${fmtDate(start)} a ${fmtDate(end)}`;

    // ── FINANCIAL ──────────────────────────────────────────────────────────────
    if (reportType === "financial") {
      const [payments, expenses] = await Promise.all([
        db.select({
          id: paymentsTable.id,
          type: paymentsTable.type,
          category: paymentsTable.category,
          description: paymentsTable.description,
          amount: paymentsTable.amount,
          status: paymentsTable.status,
          paymentMethod: paymentsTable.paymentMethod,
          dueDate: paymentsTable.dueDate,
          paidAt: paymentsTable.paidAt,
          createdAt: paymentsTable.createdAt,
        }).from(paymentsTable).where(and(
          eq(paymentsTable.tenantId, tenantId),
          gte(paymentsTable.createdAt, start),
          lte(paymentsTable.createdAt, end),
        )),
        db.select().from(expensesTable).where(and(
          eq(expensesTable.tenantId, tenantId),
          gte(expensesTable.createdAt, start),
          lte(expensesTable.createdAt, end),
        )),
      ]);

      const receivables = payments.filter(p => p.type === "receivable");
      const payables = payments.filter(p => p.type === "payable");
      const totalReceived = receivables.filter(p => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
      const totalPending = receivables.filter(p => p.status === PAYMENT_STATUS.PENDING).reduce((s, p) => s + Number(p.amount), 0);
      const totalExpenses = payables.filter(p => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0) +
        expenses.reduce((s, e) => s + Number(e.amount), 0);
      const profit = totalReceived - totalExpenses;

      if (fmt === "csv") {
        const headers = ["Tipo", "Categoria", "Descrição", "Valor", "Status", "Vencimento", "Pago em", "Método"];
        const rows = receivables.map(p => [
          p.type, p.category, p.description ?? "", fmtCur(p.amount),
          p.status, fmtDate(p.dueDate), fmtDate(p.paidAt), p.paymentMethod,
        ]);
        const csv = "\uFEFF" + buildCsv([headers, ...rows]);
        res.setHeader("Content-Type", "text/csv;charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="financeiro_receitas_${format(new Date(), "yyyyMMdd")}.csv"`);
        res.send(csv);
        return;
      }

      if (fmt === "pdf") {
        const doc = new jsPDF("landscape") as JsPDFWithAutoTable;
        let y = pdfHeader(doc, "Relatório Financeiro", periodLabel);

        y = pdfSection(doc, "Resumo Financeiro", y);
        doc.autoTable({
          startY: y,
          head: [["Indicador", "Valor"]],
          body: [
            ["Total Recebido", fmtCur(totalReceived)],
            ["Receitas Pendentes", fmtCur(totalPending)],
            ["Total Despesas", fmtCur(totalExpenses)],
            ["Lucro Líquido", fmtCur(profit)],
          ],
          styles: { fontSize: 9 },
          headStyles: { fillColor: [59, 130, 246] },
          columnStyles: { 1: { halign: "right" } },
        });

        const y2 = doc.lastAutoTable.finalY + 10;
        doc.addPage();
        pdfSection(doc, "Receitas", 18);
        doc.autoTable({
          startY: 24,
          head: [["Categoria", "Descrição", "Valor", "Status", "Vencimento", "Pago em"]],
          body: receivables.map(p => [
            p.category, p.description ?? "", fmtCur(p.amount),
            p.status === "paid" ? "Pago" : "Pendente",
            fmtDate(p.dueDate), fmtDate(p.paidAt),
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [34, 197, 94] },
        });

        if (payables.length > 0 || expenses.length > 0) {
          doc.addPage();
          pdfSection(doc, "Despesas", 18);
          const allExpRows = [
            ...payables.map(p => [p.category, p.description ?? "", fmtCur(p.amount), p.status === "paid" ? "Pago" : "Pendente", fmtDate(p.dueDate), fmtDate(p.paidAt)]),
            ...expenses.map(e => [e.category, e.description, fmtCur(e.amount), e.status === "paid" ? "Pago" : "Pendente", fmtDate(e.dueDate), fmtDate(e.paymentDate)]),
          ];
          doc.autoTable({
            startY: 24,
            head: [["Categoria", "Descrição", "Valor", "Status", "Vencimento", "Pago em"]],
            body: allExpRows,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [239, 68, 68] },
          });
        }

        const buf = Buffer.from(doc.output("arraybuffer"));
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="financeiro_${format(new Date(), "yyyyMMdd")}.pdf"`);
        res.send(buf);
        return;
      }

      if (fmt === "xlsx") {
        const wb = new ExcelJS.Workbook();
        wb.creator = "VisiteCRM";
        wb.created = new Date();

        // Sheet 1: Resumo
        const ws1 = wb.addWorksheet("Resumo");
        ws1.columns = [{ header: "Indicador", key: "k", width: 30 }, { header: "Valor", key: "v", width: 20 }];
        ws1.getRow(1).font = { bold: true };
        ws1.addRows([
          { k: "Total Recebido", v: totalReceived },
          { k: "Receitas Pendentes", v: totalPending },
          { k: "Total Despesas", v: totalExpenses },
          { k: "Lucro Líquido", v: profit },
        ]);
        ws1.getColumn("v").numFmt = '"R$"#,##0.00';

        // Sheet 2: Receitas
        const ws2 = wb.addWorksheet("Receitas");
        ws2.columns = [
          { header: "Categoria", key: "category", width: 20 },
          { header: "Descrição", key: "description", width: 30 },
          { header: "Valor", key: "amount", width: 16 },
          { header: "Status", key: "status", width: 12 },
          { header: "Vencimento", key: "dueDate", width: 14 },
          { header: "Pago em", key: "paidAt", width: 14 },
          { header: "Método", key: "method", width: 16 },
        ];
        ws2.getRow(1).font = { bold: true };
        for (const p of receivables) {
          ws2.addRow({ category: p.category, description: p.description ?? "", amount: Number(p.amount), status: p.status === "paid" ? "Pago" : "Pendente", dueDate: fmtDate(p.dueDate), paidAt: fmtDate(p.paidAt), method: p.paymentMethod });
        }
        ws2.getColumn("amount").numFmt = '"R$"#,##0.00';

        // Sheet 3: Despesas
        const ws3 = wb.addWorksheet("Despesas");
        ws3.columns = [
          { header: "Categoria", key: "category", width: 20 },
          { header: "Descrição", key: "description", width: 30 },
          { header: "Valor", key: "amount", width: 16 },
          { header: "Status", key: "status", width: 12 },
          { header: "Vencimento", key: "dueDate", width: 14 },
          { header: "Pago em", key: "paidAt", width: 14 },
        ];
        ws3.getRow(1).font = { bold: true };
        for (const p of payables) {
          ws3.addRow({ category: p.category, description: p.description ?? "", amount: Number(p.amount), status: p.status === "paid" ? "Pago" : "Pendente", dueDate: fmtDate(p.dueDate), paidAt: fmtDate(p.paidAt) });
        }
        for (const e of expenses) {
          ws3.addRow({ category: e.category, description: e.description, amount: Number(e.amount), status: e.status === "paid" ? "Pago" : "Pendente", dueDate: fmtDate(e.dueDate), paidAt: fmtDate(e.paymentDate) });
        }
        ws3.getColumn("amount").numFmt = '"R$"#,##0.00';

        const buf = await wb.xlsx.writeBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="financeiro_${format(new Date(), "yyyyMMdd")}.xlsx"`);
        res.send(Buffer.from(buf));
        return;
      }
    }

    // ── SALES ──────────────────────────────────────────────────────────────────
    if (reportType === "sales") {
      const reservations = await db.select({
        id: reservationsTable.id,
        reservationNumber: reservationsTable.reservationNumber,
        status: reservationsTable.status,
        totalValue: reservationsTable.totalValue,
        paidValue: reservationsTable.paidValue,
        balance: reservationsTable.balance,
        paymentMethod: reservationsTable.paymentMethod,
        installments: reservationsTable.installments,
        seats: reservationsTable.seats,
        tripId: reservationsTable.tripId,
        clientId: reservationsTable.clientId,
        createdAt: reservationsTable.createdAt,
        confirmedAt: reservationsTable.confirmedAt,
      }).from(reservationsTable).where(and(
        eq(reservationsTable.tenantId, tenantId),
        gte(reservationsTable.createdAt, start),
        lte(reservationsTable.createdAt, end),
      ));

      const tripIds = [...new Set(reservations.map(r => r.tripId))];
      const clientIds = [...new Set(reservations.map(r => r.clientId))];

      const [tripsData, clientsData] = await Promise.all([
        tripIds.length > 0
          ? db.select({ id: tripsTable.id, name: tripsTable.name, departureDate: tripsTable.departureDate, destination: tripsTable.destination })
            .from(tripsTable).where(eq(tripsTable.tenantId, tenantId))
          : [],
        clientIds.length > 0
          ? db.select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email })
            .from(clientsTable).where(eq(clientsTable.tenantId, tenantId))
          : [],
      ]);

      const tripMap = new Map(tripsData.map(t => [t.id, t]));
      const clientMap = new Map(clientsData.map(c => [c.id, c]));

      const totalSales = reservations.filter(r => r.status === RESERVATION_STATUS.CONFIRMED).reduce((s, r) => s + Number(r.totalValue), 0);
      const totalPaid = reservations.reduce((s, r) => s + Number(r.paidValue), 0);
      const confirmedCount = reservations.filter(r => r.status === RESERVATION_STATUS.CONFIRMED).length;
      const pendingCount = reservations.filter(r => r.status === RESERVATION_STATUS.PENDING).length;

      const headers = ["Nº Reserva", "Cliente", "Email", "Viagem", "Destino", "Saída", "Status", "Assentos", "Valor Total", "Valor Pago", "Saldo", "Forma Pgto", "Parcelas", "Criado em", "Confirmado em"];
      const rows = reservations.map(r => {
        const trip = tripMap.get(r.tripId);
        const client = clientMap.get(r.clientId);
        return [
          r.reservationNumber ?? r.id.slice(0, 8),
          client?.name ?? "", client?.email ?? "",
          trip?.name ?? "", trip?.destination ?? "", fmtDate(trip?.departureDate),
          r.status, String(r.seats.length),
          fmtCur(r.totalValue), fmtCur(r.paidValue), fmtCur(r.balance),
          r.paymentMethod ?? "", String(r.installments),
          fmtDate(r.createdAt), fmtDate(r.confirmedAt),
        ];
      });

      if (fmt === "csv") {
        const csv = "\uFEFF" + buildCsv([headers, ...rows]);
        res.setHeader("Content-Type", "text/csv;charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="vendas_${format(new Date(), "yyyyMMdd")}.csv"`);
        res.send(csv);
        return;
      }

      if (fmt === "xlsx") {
        const wb = new ExcelJS.Workbook();
        wb.creator = "VisiteCRM";

        const ws1 = wb.addWorksheet("Resumo");
        ws1.columns = [{ header: "Indicador", key: "k", width: 30 }, { header: "Valor", key: "v", width: 20 }];
        ws1.getRow(1).font = { bold: true };
        ws1.addRows([
          { k: "Total de Reservas", v: reservations.length },
          { k: "Confirmadas", v: confirmedCount },
          { k: "Pendentes", v: pendingCount },
          { k: "Total Vendido (confirmadas)", v: totalSales },
          { k: "Total Recebido", v: totalPaid },
        ]);
        ws1.getColumn("v").numFmt = '#,##0.00';

        const ws2 = wb.addWorksheet("Reservas");
        ws2.columns = headers.map((h, i) => ({ header: h, key: `c${i}`, width: i < 3 ? 24 : 16 }));
        ws2.getRow(1).font = { bold: true };
        for (const row of rows) {
          const obj: Record<string, string | number> = {};
          row.forEach((v, i) => { obj[`c${i}`] = v; });
          ws2.addRow(obj);
        }

        const buf = await wb.xlsx.writeBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="vendas_${format(new Date(), "yyyyMMdd")}.xlsx"`);
        res.send(Buffer.from(buf));
        return;
      }

      if (fmt === "pdf") {
        const doc = new jsPDF("landscape") as JsPDFWithAutoTable;
        pdfHeader(doc, "Relatório de Vendas", periodLabel);

        doc.autoTable({
          startY: 38,
          head: [["Indicador", "Valor"]],
          body: [
            ["Total de Reservas", String(reservations.length)],
            ["Confirmadas", String(confirmedCount)],
            ["Pendentes", String(pendingCount)],
            ["Total Vendido", fmtCur(totalSales)],
            ["Total Recebido", fmtCur(totalPaid)],
          ],
          styles: { fontSize: 9 },
          headStyles: { fillColor: [59, 130, 246] },
          tableWidth: 100,
        });

        doc.addPage();
        doc.autoTable({
          startY: 14,
          head: [["Nº Reserva", "Cliente", "Viagem", "Status", "Assentos", "Total", "Pago", "Criado em"]],
          body: reservations.map(r => {
            const trip = tripMap.get(r.tripId);
            const client = clientMap.get(r.clientId);
            return [
              r.reservationNumber ?? r.id.slice(0, 8),
              client?.name ?? "", trip?.name ?? "",
              r.status, String(r.seats.length),
              fmtCur(r.totalValue), fmtCur(r.paidValue),
              fmtDate(r.createdAt),
            ];
          }),
          styles: { fontSize: 7 },
          headStyles: { fillColor: [59, 130, 246] },
        });

        const buf = Buffer.from(doc.output("arraybuffer"));
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="vendas_${format(new Date(), "yyyyMMdd")}.pdf"`);
        res.send(buf);
        return;
      }
    }

    // ── CLIENTS ────────────────────────────────────────────────────────────────
    if (reportType === "clients") {
      const clients = await db.select().from(clientsTable).where(and(
        eq(clientsTable.tenantId, tenantId),
        gte(clientsTable.createdAt, start),
        lte(clientsTable.createdAt, end),
      ));

      const headers = ["Nome", "Email", "WhatsApp", "CPF", "Nascimento", "Gênero", "Cidade", "Estado", "Classificação", "Status", "Total Gasto", "Saldo Devedor", "Tags", "Destinos Sonhados", "Cadastrado em"];
      const rows = clients.map(c => [
        c.name, c.email, c.whatsapp, c.cpf ?? "",
        fmtDate(c.birthDate), c.gender ?? "",
        c.addressCity ?? "", c.addressState ?? "",
        c.classification, c.status,
        fmtCur(c.totalSpent), fmtCur(c.outstandingBalance),
        (c.tags ?? []).join("; "),
        (c.dreamDestinations ?? []).join("; "),
        fmtDate(c.createdAt),
      ]);

      if (fmt === "csv") {
        const csv = "\uFEFF" + buildCsv([headers, ...rows]);
        res.setHeader("Content-Type", "text/csv;charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="clientes_${format(new Date(), "yyyyMMdd")}.csv"`);
        res.send(csv);
        return;
      }

      if (fmt === "xlsx") {
        const wb = new ExcelJS.Workbook();
        wb.creator = "VisiteCRM";
        const ws = wb.addWorksheet("Clientes");
        ws.columns = headers.map((h, i) => ({ header: h, key: `c${i}`, width: i < 4 ? 24 : 16 }));
        ws.getRow(1).font = { bold: true };
        for (const row of rows) {
          const obj: Record<string, string | number> = {};
          row.forEach((v, i) => { obj[`c${i}`] = v as string; });
          ws.addRow(obj);
        }
        const buf = await wb.xlsx.writeBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="clientes_${format(new Date(), "yyyyMMdd")}.xlsx"`);
        res.send(Buffer.from(buf));
        return;
      }

      if (fmt === "pdf") {
        const doc = new jsPDF("landscape") as JsPDFWithAutoTable;
        pdfHeader(doc, "Relatório de Clientes", periodLabel);

        doc.autoTable({
          startY: 38,
          head: [["Nome", "Email", "WhatsApp", "Cidade/Estado", "Classificação", "Total Gasto", "Status", "Cadastrado em"]],
          body: clients.map(c => [
            c.name, c.email, c.whatsapp,
            [c.addressCity, c.addressState].filter(Boolean).join("/"),
            c.classification, fmtCur(c.totalSpent), c.status,
            fmtDate(c.createdAt),
          ]),
          styles: { fontSize: 7 },
          headStyles: { fillColor: [59, 130, 246] },
        });

        const buf = Buffer.from(doc.output("arraybuffer"));
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="clientes_${format(new Date(), "yyyyMMdd")}.pdf"`);
        res.send(buf);
        return;
      }
    }

    res.status(400).json({ error: "Combinação de reportType e format inválida" });
  } catch (err) {
    req.log.error({ err }, "Error generating report");
    res.status(500).json({ error: "Erro ao gerar relatório" });
  }
});

export default router;
