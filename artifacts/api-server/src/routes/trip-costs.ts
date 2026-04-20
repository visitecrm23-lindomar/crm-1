import { Router } from "express";
import { db } from "@workspace/db";
import { tripCostsTable, tripsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";

const router = Router();

const CATEGORIES = ["Transporte", "Hospedagem", "Alimentação", "Guia", "Marketing", "Seguro", "Taxas", "Outros"] as const;
const STATUSES = ["pending", "paid", "overdue"] as const;

function formatCost(c: typeof tripCostsTable.$inferSelect) {
  return {
    id: c.id,
    tripId: c.tripId,
    category: c.category,
    description: c.description,
    supplierId: c.supplierId ?? null,
    supplierName: c.supplierName ?? null,
    amount: Number(c.amount),
    status: c.status,
    dueDate: c.dueDate?.toISOString() ?? null,
    paidAt: c.paidAt?.toISOString() ?? null,
    notes: c.notes ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/trips/:id/costs", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const [trip] = await db.select({ id: tripsTable.id })
      .from(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { res.status(404).json({ error: "Viagem não encontrada" }); return; }

    const costs = await db.select()
      .from(tripCostsTable)
      .where(and(eq(tripCostsTable.tripId, req.params.id), eq(tripCostsTable.tenantId, me.tenantId)))
      .orderBy(tripCostsTable.createdAt);

    const [tripRow] = await db.select({
      priceAdult: tripsTable.priceAdult,
      confirmedSeats: tripsTable.confirmedSeats,
      fixedCosts: tripsTable.fixedCosts,
      variableCosts: tripsTable.variableCosts,
    }).from(tripsTable).where(eq(tripsTable.id, req.params.id)).limit(1);

    const totalRealCosts = costs.reduce((s, c) => s + Number(c.amount), 0);
    const totalPaidCosts = costs.filter(c => c.status === "paid").reduce((s, c) => s + Number(c.amount), 0);
    const totalPendingCosts = costs.filter(c => c.status !== "paid").reduce((s, c) => s + Number(c.amount), 0);

    const priceAdult = Number(tripRow?.priceAdult ?? 0);
    const confirmedSeats = tripRow?.confirmedSeats ?? 0;
    const expectedRevenue2 = priceAdult * confirmedSeats;
    const profit = expectedRevenue2 - totalRealCosts;
    const margin = expectedRevenue2 > 0 ? (profit / expectedRevenue2) * 100 : 0;

    const fixedCosts = Array.isArray(tripRow?.fixedCosts) ? tripRow.fixedCosts as Array<{ id: string; category: string; description: string; value: number }> : [];
    const variableCosts = Array.isArray(tripRow?.variableCosts) ? tripRow.variableCosts as Array<{ id: string; category: string; description: string; valuePax: number }> : [];
    const plannedFixed = fixedCosts.reduce((s, c) => s + (c.value ?? 0), 0);
    const plannedVariable = variableCosts.reduce((s, c) => s + (c.valuePax ?? 0) * confirmedSeats, 0);
    const totalPlanned = plannedFixed + plannedVariable;

    res.json({
      costs: costs.map(formatCost),
      summary: {
        expectedRevenue: expectedRevenue2,
        totalRealCosts,
        totalPaidCosts,
        totalPendingCosts,
        profit,
        margin: Math.round(margin * 10) / 10,
        plannedBudget: totalPlanned,
        budgetVariance: totalRealCosts - totalPlanned,
        confirmedSeats,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching trip costs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/trips/:id/costs", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin", "vendedor"].includes(me.role)) {
      res.status(403).json({ error: "Sem permissão" }); return;
    }

    const [trip] = await db.select({ id: tripsTable.id })
      .from(tripsTable)
      .where(and(eq(tripsTable.id, req.params.id), eq(tripsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!trip) { res.status(404).json({ error: "Viagem não encontrada" }); return; }

    const { category, description, supplierName, amount, status, dueDate, paidAt, notes } = req.body;
    if (!category || !description || amount == null) {
      res.status(400).json({ error: "Campos obrigatórios: category, description, amount" }); return;
    }

    const id = generateId();
    await db.insert(tripCostsTable).values({
      id,
      tenantId: me.tenantId,
      tripId: req.params.id,
      category: String(category),
      description: String(description),
      supplierName: supplierName ? String(supplierName) : null,
      amount: String(Number(amount)),
      status: STATUSES.includes(status) ? status : "pending",
      dueDate: dueDate ? new Date(dueDate) : null,
      paidAt: paidAt ? new Date(paidAt) : (status === "paid" ? new Date() : null),
      notes: notes ? String(notes) : null,
    });

    const [cost] = await db.select().from(tripCostsTable).where(eq(tripCostsTable.id, id)).limit(1);
    res.status(201).json(formatCost(cost!));
  } catch (err) {
    req.log.error({ err }, "Error creating trip cost");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/trips/:id/costs/:costId", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin", "vendedor"].includes(me.role)) {
      res.status(403).json({ error: "Sem permissão" }); return;
    }

    const [existing] = await db.select()
      .from(tripCostsTable)
      .where(and(
        eq(tripCostsTable.id, req.params.costId),
        eq(tripCostsTable.tripId, req.params.id),
        eq(tripCostsTable.tenantId, me.tenantId),
      ))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Custo não encontrado" }); return; }

    const { category, description, supplierName, amount, status, dueDate, paidAt, notes } = req.body;
    const updates: Partial<typeof tripCostsTable.$inferInsert> = {};
    if (category != null) updates.category = String(category);
    if (description != null) updates.description = String(description);
    if (supplierName !== undefined) updates.supplierName = supplierName ? String(supplierName) : null;
    if (amount != null) updates.amount = String(Number(amount));
    if (status != null && STATUSES.includes(status)) updates.status = status;
    if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
    if (paidAt !== undefined) updates.paidAt = paidAt ? new Date(paidAt) : null;
    else if (status === "paid" && !existing.paidAt) updates.paidAt = new Date();
    if (notes !== undefined) updates.notes = notes ? String(notes) : null;

    await db.update(tripCostsTable).set(updates)
      .where(eq(tripCostsTable.id, req.params.costId));

    const [cost] = await db.select().from(tripCostsTable).where(eq(tripCostsTable.id, req.params.costId)).limit(1);
    res.json(formatCost(cost!));
  } catch (err) {
    req.log.error({ err }, "Error updating trip cost");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/trips/:id/costs/:costId", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) {
      res.status(403).json({ error: "Sem permissão" }); return;
    }

    const [existing] = await db.select({ id: tripCostsTable.id })
      .from(tripCostsTable)
      .where(and(
        eq(tripCostsTable.id, req.params.costId),
        eq(tripCostsTable.tripId, req.params.id),
        eq(tripCostsTable.tenantId, me.tenantId),
      ))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Custo não encontrado" }); return; }

    await db.delete(tripCostsTable)
      .where(eq(tripCostsTable.id, req.params.costId));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting trip cost");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
