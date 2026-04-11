import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, expensesTable, reservationsTable, clientsTable, commissionRulesTable, commissionsTable, usersTable } from "@workspace/db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import { CreatePaymentBody, UpdatePaymentBody, CreateExpenseBody, UpdateExpenseBody } from "@workspace/api-zod";

const router = Router();

async function recalculateClientFinancials(clientId: string, tenantId: string): Promise<void> {
  const result = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount::numeric ELSE 0 END), 0) AS total_spent,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'overdue') THEN amount::numeric ELSE 0 END), 0) AS outstanding_balance
    FROM payments
    WHERE client_id = ${clientId} AND tenant_id = ${tenantId}
  `);
  const row = (result as unknown as { rows: Array<{ total_spent: string; outstanding_balance: string }> }).rows[0];
  if (!row) return;
  await db.update(clientsTable).set({
    totalSpent: row.total_spent,
    outstandingBalance: row.outstanding_balance,
  }).where(and(eq(clientsTable.id, clientId), eq(clientsTable.tenantId, tenantId)));
}

async function syncReservationPaymentStatus(reservationId: string, tenantId: string): Promise<void> {
  const [reservation] = await db.select().from(reservationsTable)
    .where(and(eq(reservationsTable.id, reservationId), eq(reservationsTable.tenantId, tenantId)))
    .limit(1);
  if (!reservation) return;
  if (reservation.status === "cancelled" || reservation.status === "completed") return;

  const result = await db.execute(sql`
    SELECT COALESCE(SUM(amount::numeric), 0) AS total_paid
    FROM payments
    WHERE reservation_id = ${reservationId} AND tenant_id = ${tenantId} AND status = 'paid'
  `);
  const row = (result as unknown as { rows: Array<{ total_paid: string }> }).rows[0];
  const paidValue = parseFloat(row?.total_paid ?? "0");
  const totalValue = parseFloat(String(reservation.totalValue));
  const balance = Math.max(totalValue - paidValue, 0);

  const updates: Partial<typeof reservationsTable.$inferInsert> = {
    paidValue: String(paidValue),
    balance: String(balance),
  };

  if (paidValue >= totalValue) {
    updates.status = "confirmed";
    if (!reservation.confirmedAt) updates.confirmedAt = new Date();
  } else if (reservation.status === "confirmed") {
    updates.status = "pending";
  }

  await db.update(reservationsTable).set(updates)
    .where(and(eq(reservationsTable.id, reservationId), eq(reservationsTable.tenantId, tenantId)));
}

async function autoCreateCommission(reservationId: string, tenantId: string): Promise<void> {
  const [reservation] = await db.select().from(reservationsTable)
    .where(and(eq(reservationsTable.id, reservationId), eq(reservationsTable.tenantId, tenantId)))
    .limit(1);
  if (!reservation) return;

  const paidValue = parseFloat(String(reservation.paidValue));
  const totalValue = parseFloat(String(reservation.totalValue));
  if (paidValue < totalValue) return;

  const [creator] = await db.select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(and(eq(usersTable.id, reservation.createdById), eq(usersTable.tenantId, tenantId)))
    .limit(1);
  if (!creator || creator.role !== "vendedor") return;

  const rules = await db.select().from(commissionRulesTable)
    .where(and(eq(commissionRulesTable.tenantId, tenantId), eq(commissionRulesTable.isActive, true)));

  const tripSpecificRule = rules.find(r => r.appliesTo === "trip" && r.tripId === reservation.tripId);
  const allRule = rules.find(r => r.appliesTo === "all");
  const rule = tripSpecificRule ?? allRule;
  if (!rule) return;

  const baseAmount = totalValue;
  const commissionAmount = rule.type === "percentage"
    ? (baseAmount * parseFloat(String(rule.value))) / 100
    : parseFloat(String(rule.value));

  const [existing] = await db.select({ id: commissionsTable.id, status: commissionsTable.status })
    .from(commissionsTable)
    .where(and(
      eq(commissionsTable.reservationId, reservationId),
      eq(commissionsTable.tenantId, tenantId),
      eq(commissionsTable.userId, creator.id),
    ))
    .limit(1);

  if (existing) {
    if (existing.status === "pending") {
      await db.update(commissionsTable)
        .set({ ruleId: rule.id, baseAmount: String(baseAmount), commissionAmount: String(commissionAmount.toFixed(2)) })
        .where(eq(commissionsTable.id, existing.id));
    }
  } else {
    await db.insert(commissionsTable).values({
      id: generateId(),
      tenantId,
      ruleId: rule.id,
      userId: creator.id,
      reservationId,
      baseAmount: String(baseAmount),
      commissionAmount: String(commissionAmount.toFixed(2)),
      status: "pending",
    });
  }
}

router.get("/trips/:tripId/financial-report", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const { tripId } = req.params;

    const tripReservations = await db.select().from(reservationsTable)
      .where(and(eq(reservationsTable.tenantId, me.tenantId), eq(reservationsTable.tripId, tripId)));

    const reservationIds = tripReservations.map(r => r.id);

    let tripPayments: typeof paymentsTable.$inferSelect[] = [];
    if (reservationIds.length > 0) {
      tripPayments = await db.select().from(paymentsTable)
        .where(and(eq(paymentsTable.tenantId, me.tenantId), inArray(paymentsTable.reservationId, reservationIds)));
    }

    const tripExpenses = await db.select().from(expensesTable)
      .where(and(eq(expensesTable.tenantId, me.tenantId), eq(expensesTable.tripId, tripId)));

    const totalRevenue = tripReservations.reduce((s, r) => s + Number(r.totalValue), 0);
    const totalPaid = tripReservations.reduce((s, r) => s + Number(r.paidValue), 0);
    const totalPending = tripReservations.reduce((s, r) => s + Math.max(Number(r.balance), 0), 0);
    const totalExpenses = tripExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const netProfit = totalPaid - totalExpenses;

    const confirmedCount = tripReservations.filter(r => r.status === "confirmed").length;
    const pendingCount = tripReservations.filter(r => r.status === "pending").length;
    const cancelledCount = tripReservations.filter(r => r.status === "cancelled").length;

    const revenueByMethod: Record<string, number> = {};
    for (const p of tripPayments.filter(p => p.status === "paid")) {
      const m = p.paymentMethod ?? "other";
      revenueByMethod[m] = (revenueByMethod[m] ?? 0) + Number(p.amount);
    }

    const expensesByCategory: Record<string, number> = {};
    for (const e of tripExpenses) {
      expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + Number(e.amount);
    }

    res.json({
      reservationCount: tripReservations.length,
      confirmedCount,
      pendingCount,
      cancelledCount,
      totalRevenue,
      totalPaid,
      totalPending,
      totalExpenses,
      netProfit,
      revenueByMethod,
      expensesByCategory,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching trip financial report");
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatPayment(p: typeof paymentsTable.$inferSelect) {
  return {
    id: p.id, reservationId: p.reservationId, clientId: p.clientId,
    type: p.type, category: p.category, amount: Number(p.amount),
    paymentMethod: p.paymentMethod, installmentNumber: p.installmentNumber,
    totalInstallments: p.totalInstallments, dueDate: p.dueDate.toISOString(),
    paidAt: p.paidAt?.toISOString() ?? null, status: p.status,
    receiptUrl: p.receiptUrl ?? null,
    description: p.description, notes: p.notes,
    createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
  };
}

function formatExpense(e: typeof expensesTable.$inferSelect) {
  return {
    id: e.id, tripId: e.tripId, category: e.category, description: e.description,
    amount: Number(e.amount), supplierId: e.supplierId, paymentMethod: e.paymentMethod,
    paymentDate: e.paymentDate?.toISOString() ?? null, dueDate: e.dueDate.toISOString(),
    status: e.status, notes: e.notes, createdAt: e.createdAt.toISOString(),
  };
}

router.get("/payments/summary", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.tenantId, me.tenantId));

    let totalReceivable = 0, totalPayable = 0, overdueReceivable = 0, overduePayable = 0, collectedThisMonth = 0, paidThisMonth = 0;

    for (const p of payments) {
      const amount = Number(p.amount);
      if (p.type === "receivable") {
        if (p.status === "pending") {
          totalReceivable += amount;
          if (p.dueDate < now) overdueReceivable += amount;
        }
        if (p.paidAt && p.paidAt >= startOfMonth) collectedThisMonth += amount;
      } else {
        if (p.status === "pending") {
          totalPayable += amount;
          if (p.dueDate < now) overduePayable += amount;
        }
        if (p.paidAt && p.paidAt >= startOfMonth) paidThisMonth += amount;
      }
    }

    res.json({ totalReceivable, totalPayable, overdueReceivable, overduePayable, collectedThisMonth, paidThisMonth });
  } catch (err) {
    req.log.error({ err }, "Error fetching payments summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/payments", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const { reservationId, clientId: clientIdParam, status, type, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    const conditions: ReturnType<typeof eq>[] = [eq(paymentsTable.tenantId, me.tenantId)];
    if (reservationId) conditions.push(eq(paymentsTable.reservationId, reservationId));
    if (status) conditions.push(eq(paymentsTable.status, status));
    if (type) conditions.push(eq(paymentsTable.type, type));

    if (me.role === "cliente") {
      const [clientRecord] = await db.select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, me.tenantId), eq(clientsTable.userId, me.id)))
        .limit(1);
      if (clientRecord) {
        conditions.push(eq(paymentsTable.clientId, clientRecord.id));
      } else {
        res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
        return;
      }
    } else if (me.role === "vendedor") {
      const sellerClients = await db.select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, me.tenantId), eq(clientsTable.createdById, me.id)));
      if (!sellerClients.length) {
        res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
        return;
      }
      const sellerClientIds = sellerClients.map(c => c.id);
      if (clientIdParam) {
        if (!sellerClientIds.includes(clientIdParam)) {
          res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
          return;
        }
        conditions.push(eq(paymentsTable.clientId, clientIdParam));
      } else {
        conditions.push(inArray(paymentsTable.clientId, sellerClientIds));
      }
    } else if (clientIdParam) {
      conditions.push(eq(paymentsTable.clientId, clientIdParam));
    }

    const payments = await db.select().from(paymentsTable)
      .where(and(...conditions)).orderBy(desc(paymentsTable.dueDate))
      .limit(limitNum).offset(offset);

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(paymentsTable).where(and(...conditions));

    res.json({ data: payments.map(formatPayment), total: Number(countResult?.count ?? 0), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error({ err }, "Error listing payments");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/payments", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreatePaymentBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    if (parsed.data.reservationId) {
      const [reservation] = await db.select().from(reservationsTable)
        .where(and(eq(reservationsTable.id, parsed.data.reservationId), eq(reservationsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!reservation) { res.status(400).json({ error: "Reservation not found or not in tenant" }); return; }
    }
    if (parsed.data.clientId) {
      const [client] = await db.select().from(clientsTable)
        .where(and(eq(clientsTable.id, parsed.data.clientId), eq(clientsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!client) { res.status(400).json({ error: "Client not found or not in tenant" }); return; }
    }

    const id = generateId();
    const installments = parsed.data.installments ?? 1;
    const receiptUrl = typeof req.body.receiptUrl === "string" ? req.body.receiptUrl : null;
    const isReservationPayment = !!parsed.data.reservationId && parsed.data.type === "receivable";
    const now = new Date();

    for (let i = 1; i <= installments; i++) {
      const dueDate = new Date(parsed.data.dueDate);
      dueDate.setMonth(dueDate.getMonth() + (i - 1));
      await db.insert(paymentsTable).values({
        id: i === 1 ? id : generateId(),
        tenantId: me.tenantId,
        reservationId: parsed.data.reservationId ?? null,
        clientId: parsed.data.clientId ?? null,
        type: parsed.data.type,
        category: parsed.data.category,
        amount: String(parsed.data.amount / installments),
        paymentMethod: parsed.data.paymentMethod,
        installmentNumber: i,
        totalInstallments: installments,
        dueDate,
        description: parsed.data.description ?? null,
        notes: parsed.data.notes ?? null,
        receiptUrl,
        ...(isReservationPayment ? { status: "paid", paidAt: now } : {}),
      });
    }

    const [payment] = await db.select().from(paymentsTable)
      .where(and(eq(paymentsTable.id, id), eq(paymentsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!payment) { res.status(500).json({ error: "Failed to create payment" }); return; }
    if (parsed.data.clientId) {
      await recalculateClientFinancials(parsed.data.clientId, me.tenantId);
    }
    if (parsed.data.reservationId) {
      await syncReservationPaymentStatus(parsed.data.reservationId, me.tenantId);
      await autoCreateCommission(parsed.data.reservationId, me.tenantId);
    }
    res.status(201).json(formatPayment(payment));
  } catch (err) {
    req.log.error({ err }, "Error creating payment");
    res.status(500).json({ error: "Internal server error" });
  }
});

async function requirePaymentAccess(
  me: { id: string; tenantId: string; role: string },
  paymentId: string,
  res: import("express").Response,
): Promise<typeof paymentsTable.$inferSelect | null> {
  const [payment] = await db.select().from(paymentsTable)
    .where(and(eq(paymentsTable.id, paymentId), eq(paymentsTable.tenantId, me.tenantId)))
    .limit(1);
  if (!payment) { res.status(404).json({ error: "Not found" }); return null; }
  if (me.role === "cliente") {
    if (!payment.clientId) { res.status(404).json({ error: "Not found" }); return null; }
    const [clientRecord] = await db.select({ id: clientsTable.id }).from(clientsTable)
      .where(and(eq(clientsTable.tenantId, me.tenantId), eq(clientsTable.userId, me.id))).limit(1);
    if (!clientRecord || payment.clientId !== clientRecord.id) {
      res.status(404).json({ error: "Not found" }); return null;
    }
  } else if (me.role === "vendedor") {
    if (!payment.clientId) { res.status(404).json({ error: "Not found" }); return null; }
    const [clientRecord] = await db.select({ createdById: clientsTable.createdById }).from(clientsTable)
      .where(and(eq(clientsTable.id, payment.clientId), eq(clientsTable.tenantId, me.tenantId))).limit(1);
    if (!clientRecord || clientRecord.createdById !== me.id) {
      res.status(404).json({ error: "Not found" }); return null;
    }
  }
  return payment;
}

router.get("/payments/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const payment = await requirePaymentAccess(me, req.params.id, res);
    if (!payment) return;
    res.json(formatPayment(payment));
  } catch (err) {
    req.log.error({ err }, "Error fetching payment");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/payments/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = UpdatePaymentBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof paymentsTable.$inferInsert> = {};
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.paidAt !== undefined) updates.paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : null;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;
    await db.update(paymentsTable).set(updates)
      .where(and(eq(paymentsTable.id, req.params.id), eq(paymentsTable.tenantId, me.tenantId)));
    const [payment] = await db.select().from(paymentsTable)
      .where(and(eq(paymentsTable.id, req.params.id), eq(paymentsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!payment) { res.status(404).json({ error: "Not found" }); return; }
    if (payment.clientId) {
      await recalculateClientFinancials(payment.clientId, me.tenantId);
    }
    if (payment.reservationId) {
      await syncReservationPaymentStatus(payment.reservationId, me.tenantId);
      await autoCreateCommission(payment.reservationId, me.tenantId);
    }
    res.json(formatPayment(payment));
  } catch (err) {
    req.log.error({ err }, "Error updating payment");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/expenses", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const { tripId, status, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    const conditions: ReturnType<typeof eq>[] = [eq(expensesTable.tenantId, me.tenantId)];
    if (tripId) conditions.push(eq(expensesTable.tripId, tripId));
    if (status) conditions.push(eq(expensesTable.status, status));

    const expenses = await db.select().from(expensesTable)
      .where(and(...conditions)).orderBy(desc(expensesTable.dueDate))
      .limit(limitNum).offset(offset);

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(expensesTable).where(and(...conditions));

    res.json({ data: expenses.map(formatExpense), total: Number(countResult?.count ?? 0), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error({ err }, "Error listing expenses");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/expenses", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateExpenseBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const id = generateId();
    await db.insert(expensesTable).values({
      id,
      tenantId: me.tenantId,
      tripId: parsed.data.tripId ?? null,
      category: parsed.data.category,
      description: parsed.data.description,
      amount: String(parsed.data.amount),
      supplierId: parsed.data.supplierId ?? null,
      paymentMethod: parsed.data.paymentMethod ?? null,
      dueDate: new Date(parsed.data.dueDate),
      notes: parsed.data.notes ?? null,
      createdById: me.id,
    });

    const [expense] = await db.select().from(expensesTable)
      .where(and(eq(expensesTable.id, id), eq(expensesTable.tenantId, me.tenantId)))
      .limit(1);
    if (!expense) { res.status(500).json({ error: "Failed to create expense" }); return; }
    res.status(201).json(formatExpense(expense));
  } catch (err) {
    req.log.error({ err }, "Error creating expense");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/expenses/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = UpdateExpenseBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Partial<typeof expensesTable.$inferInsert> = {};
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.paymentDate !== undefined) updates.paymentDate = parsed.data.paymentDate ? new Date(parsed.data.paymentDate) : null;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;
    if (parsed.data.amount != null) updates.amount = String(parsed.data.amount);
    await db.update(expensesTable).set(updates)
      .where(and(eq(expensesTable.id, req.params.id), eq(expensesTable.tenantId, me.tenantId)));
    const [expense] = await db.select().from(expensesTable)
      .where(and(eq(expensesTable.id, req.params.id), eq(expensesTable.tenantId, me.tenantId)))
      .limit(1);
    if (!expense) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatExpense(expense));
  } catch (err) {
    req.log.error({ err }, "Error updating expense");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(expensesTable)
      .where(and(eq(expensesTable.id, req.params.id), eq(expensesTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting expense");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
