import { Router } from "express";
import { db } from "@workspace/db";
import { pipelineStagesTable, dealsTable, clientsTable } from "@workspace/db";
import { eq, and, asc, desc } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import { CreateDealBody, UpdateDealBody, MoveDealBody } from "@workspace/api-zod";

const router = Router();

const DEFAULT_STAGES = [
  { name: "Novo Lead", order: 1, color: "#6366F1" },
  { name: "Qualificado", order: 2, color: "#8B5CF6" },
  { name: "Proposta Enviada", order: 3, color: "#F59E0B" },
  { name: "Negociação", order: 4, color: "#EF4444" },
  { name: "Reserva Feita", order: 5, color: "#10B981" },
  { name: "Pago", order: 6, color: "#06B6D4" },
  { name: "Pós-Venda", order: 7, color: "#6B7280" },
];

async function ensureDefaultPipeline(tenantId: string): Promise<void> {
  const existing = await db.select().from(pipelineStagesTable)
    .where(eq(pipelineStagesTable.tenantId, tenantId));
  if (existing.length === 0) {
    for (const stage of DEFAULT_STAGES) {
      await db.insert(pipelineStagesTable).values({
        id: generateId(),
        tenantId,
        name: stage.name,
        order: stage.order,
        color: stage.color,
        isDefault: stage.order === 1,
      });
    }
  }
}

function formatStage(s: typeof pipelineStagesTable.$inferSelect) {
  return {
    id: s.id, name: s.name, order: s.order, color: s.color,
    isDefault: s.isDefault, tenantId: s.tenantId,
    createdAt: s.createdAt.toISOString(),
  };
}

function formatDeal(d: typeof dealsTable.$inferSelect) {
  return {
    id: d.id, tenantId: d.tenantId, clientId: d.clientId, stageId: d.stageId,
    title: d.title, value: Number(d.value), status: d.status,
    priority: d.priority, assignedTo: d.assignedTo,
    expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
    notes: d.notes, tags: d.tags ?? [],
    createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString(),
  };
}

router.get("/pipeline/stages", async (req, res): Promise<void> => {
  try {
    const me = await getTenantUser(req);
    if (!me) { res.json([]); return; }
    await ensureDefaultPipeline(me.tenantId);
    const stages = await db.select().from(pipelineStagesTable)
      .where(eq(pipelineStagesTable.tenantId, me.tenantId))
      .orderBy(asc(pipelineStagesTable.order));
    res.json(stages.map(formatStage));
  } catch (err) {
    req.log.error({ err }, "Error listing pipeline stages");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/pipeline/deals", async (req, res): Promise<void> => {
  try {
    const me = await getTenantUser(req);
    if (!me) { res.json([]); return; }
    const { stageId, clientId } = req.query as Record<string, string>;
    const conditions: ReturnType<typeof eq>[] = [eq(dealsTable.tenantId, me.tenantId)];
    if (stageId) conditions.push(eq(dealsTable.stageId, stageId));
    if (clientId) conditions.push(eq(dealsTable.clientId, clientId));
    const deals = await db.select().from(dealsTable)
      .where(and(...conditions)).orderBy(desc(dealsTable.createdAt));
    res.json(deals.map(formatDeal));
  } catch (err) {
    req.log.error({ err }, "Error listing deals");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/pipeline/deals", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateDealBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    if (parsed.data.clientId) {
      const [client] = await db.select().from(clientsTable)
        .where(and(eq(clientsTable.id, parsed.data.clientId), eq(clientsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!client) { res.status(400).json({ error: "Client not found or not in tenant" }); return; }
    }

    const [stage] = await db.select().from(pipelineStagesTable)
      .where(and(eq(pipelineStagesTable.id, parsed.data.stageId), eq(pipelineStagesTable.tenantId, me.tenantId)))
      .limit(1);
    if (!stage) { res.status(400).json({ error: "Stage not found or not in tenant" }); return; }

    const id = generateId();
    await db.insert(dealsTable).values({
      id,
      tenantId: me.tenantId,
      clientId: parsed.data.clientId ?? null,
      stageId: parsed.data.stageId,
      title: parsed.data.title,
      value: String(parsed.data.value ?? 0),
      priority: parsed.data.priority ?? "medium",
      status: "open",
      expectedCloseDate: parsed.data.expectedCloseDate ? new Date(parsed.data.expectedCloseDate) : null,
      notes: parsed.data.notes ?? null,
      tags: parsed.data.tags ?? [],
    });

    const [deal] = await db.select().from(dealsTable)
      .where(and(eq(dealsTable.id, id), eq(dealsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!deal) { res.status(500).json({ error: "Failed to create deal" }); return; }
    res.status(201).json(formatDeal(deal));
  } catch (err) {
    req.log.error({ err }, "Error creating deal");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/pipeline/deals/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [deal] = await db.select().from(dealsTable)
      .where(and(eq(dealsTable.id, req.params.id), eq(dealsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!deal) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatDeal(deal));
  } catch (err) {
    req.log.error({ err }, "Error fetching deal");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/pipeline/deals/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = UpdateDealBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updates: Partial<typeof dealsTable.$inferInsert> = {};
    if (parsed.data.title != null) updates.title = parsed.data.title;
    if (parsed.data.value != null) updates.value = String(parsed.data.value);
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.priority != null) updates.priority = parsed.data.priority;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;
    if (parsed.data.tags != null) updates.tags = parsed.data.tags;
    if (parsed.data.expectedCloseDate !== undefined) {
      updates.expectedCloseDate = parsed.data.expectedCloseDate ? new Date(parsed.data.expectedCloseDate) : null;
    }
    if (parsed.data.stageId != null) {
      const [stage] = await db.select().from(pipelineStagesTable)
        .where(and(eq(pipelineStagesTable.id, parsed.data.stageId), eq(pipelineStagesTable.tenantId, me.tenantId)))
        .limit(1);
      if (!stage) { res.status(400).json({ error: "Stage not found or not in tenant" }); return; }
      updates.stageId = parsed.data.stageId;
    }

    await db.update(dealsTable).set(updates)
      .where(and(eq(dealsTable.id, req.params.id), eq(dealsTable.tenantId, me.tenantId)));
    const [deal] = await db.select().from(dealsTable)
      .where(and(eq(dealsTable.id, req.params.id), eq(dealsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!deal) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatDeal(deal));
  } catch (err) {
    req.log.error({ err }, "Error updating deal");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/pipeline/deals/:id/move", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = MoveDealBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const [stage] = await db.select().from(pipelineStagesTable)
      .where(and(eq(pipelineStagesTable.id, parsed.data.stageId), eq(pipelineStagesTable.tenantId, me.tenantId)))
      .limit(1);
    if (!stage) { res.status(400).json({ error: "Stage not found or not in tenant" }); return; }
    await db.update(dealsTable).set({ stageId: parsed.data.stageId })
      .where(and(eq(dealsTable.id, req.params.id), eq(dealsTable.tenantId, me.tenantId)));
    const [deal] = await db.select().from(dealsTable)
      .where(and(eq(dealsTable.id, req.params.id), eq(dealsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!deal) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatDeal(deal));
  } catch (err) {
    req.log.error({ err }, "Error moving deal");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/pipeline/deals/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    await db.delete(dealsTable)
      .where(and(eq(dealsTable.id, req.params.id), eq(dealsTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting deal");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
