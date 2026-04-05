import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, expensesTable, reservationsTable, clientsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import { CreatePaymentBody, UpdatePaymentBody, CreateExpenseBody, UpdateExpenseBody } from "@workspace/api-zod";

const router = Router();

function formatPayment(p: typeof paymentsTable.$inferSelect) {
  return {
    id: p.id, reservationId: p.reservationId, clientId: p.clientId,
    type: p.type, category: p.category, amount: Number(p.amount),
    paymentMethod: p.paymentMethod, installmentNumber: p.installmentNumber,
    totalInstallments: p.totalInstallments, dueDate: p.dueDate.toISOString(),
    paidAt: p.paidAt?.toISOString() ?? null, status: p.status,
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
    const me = await getTenantUser(req);
    if (!me) {
      res.json({ totalReceivable: 0, totalPayable: 0, overdueReceivable: 0, overduePayable: 0, collectedThisMonth: 0, paidThisMonth: 0 });
      return;
    }
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
    const me = await getTenantUser(req);
    if (!me) { res.json({ data: [], total: 0, page: 1, limit: 20 }); return; }

    const { reservationId, clientId, status, type, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    const conditions: ReturnType<typeof eq>[] = [eq(paymentsTable.tenantId, me.tenantId)];
    if (reservationId) conditions.push(eq(paymentsTable.reservationId, reservationId));
    if (clientId) conditions.push(eq(paymentsTable.clientId, clientId));
    if (status) conditions.push(eq(paymentsTable.status, status));
    if (type) conditions.push(eq(paymentsTable.type, type));

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
      });
    }

    const [payment] = await db.select().from(paymentsTable)
      .where(and(eq(paymentsTable.id, id), eq(paymentsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!payment) { res.status(500).json({ error: "Failed to create payment" }); return; }
    res.status(201).json(formatPayment(payment));
  } catch (err) {
    req.log.error({ err }, "Error creating payment");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/payments/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [payment] = await db.select().from(paymentsTable)
      .where(and(eq(paymentsTable.id, req.params.id), eq(paymentsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!payment) { res.status(404).json({ error: "Not found" }); return; }
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
    res.json(formatPayment(payment));
  } catch (err) {
    req.log.error({ err }, "Error updating payment");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/expenses", async (req, res): Promise<void> => {
  try {
    const me = await getTenantUser(req);
    if (!me) { res.json({ data: [], total: 0, page: 1, limit: 20 }); return; }

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
    await db.delete(expensesTable)
      .where(and(eq(expensesTable.id, req.params.id), eq(expensesTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting expense");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
