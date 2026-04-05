import { Router } from "express";
import { db } from "@workspace/db";
import { pipelineStagesTable, dealsTable, clientsTable } from "@workspace/db";
import { eq, and, asc, desc } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import { z } from "zod";

const router = Router();

const CreateDealBody = z.object({
  clientId: z.string().optional(),
  stageId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  value: z.number().optional(),
  leadName: z.string().optional(),
  leadEmail: z.string().optional(),
  leadWhatsapp: z.string().optional(),
  tripId: z.string().optional(),
  expectedCloseDate: z.string().optional(),
  status: z.string().optional(),
});

const UpdateDealBody = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  value: z.number().optional(),
  status: z.string().optional(),
  expectedCloseDate: z.string().optional().nullable(),
  stageId: z.string().optional(),
  lostReason: z.string().optional(),
});

const MoveDealBody = z.object({ stageId: z.string() });

const DEFAULT_STAGES = [
  { name: "Novo Lead", order: 1, color: "#6366F1", isFinal: false },
  { name: "Qualificado", order: 2, color: "#8B5CF6", isFinal: false },
  { name: "Proposta Enviada", order: 3, color: "#F59E0B", isFinal: false },
  { name: "Negociação", order: 4, color: "#EF4444", isFinal: false },
  { name: "Reserva Feita", order: 5, color: "#10B981", isFinal: false },
  { name: "Pago", order: 6, color: "#06B6D4", isFinal: false },
  { name: "Pós-Venda", order: 7, color: "#6B7280", isFinal: true },
];

async function ensureDefaultPipeline(tenantId: string): Promise<string> {
  const existing = await db.select().from(pipelineStagesTable)
    .where(eq(pipelineStagesTable.tenantId, tenantId));
  if (existing.length > 0) return existing[0].pipelineId;
  const pipelineId = generateId();
  for (const stage of DEFAULT_STAGES) {
    await db.insert(pipelineStagesTable).values({
      id: generateId(),
      tenantId,
      pipelineId,
      name: stage.name,
      order: stage.order,
      color: stage.color,
      isFinal: stage.isFinal,
    });
  }
  return pipelineId;
}

function formatStage(s: typeof pipelineStagesTable.$inferSelect) {
  return {
    id: s.id, name: s.name, order: s.order, color: s.color,
    isFinal: s.isFinal, tenantId: s.tenantId, pipelineId: s.pipelineId,
    createdAt: s.createdAt.toISOString(),
  };
}

function formatDeal(d: typeof dealsTable.$inferSelect) {
  return {
    id: d.id, tenantId: d.tenantId, clientId: d.clientId, stageId: d.stageId,
    title: d.title, description: d.description, value: Number(d.value),
    status: d.status, ownerId: d.ownerId,
    leadName: d.leadName, leadEmail: d.leadEmail, leadWhatsapp: d.leadWhatsapp,
    tripId: d.tripId, lostReason: d.lostReason,
    expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
    closedAt: d.closedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString(),
  };
}

router.get("/pipeline/stages", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
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

router.get("/deals", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
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

router.post("/deals", async (req, res): Promise<void> => {
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
      description: parsed.data.description ?? null,
      value: String(parsed.data.value ?? 0),
      ownerId: me.id,
      status: parsed.data.status ?? "open",
      leadName: parsed.data.leadName ?? null,
      leadEmail: parsed.data.leadEmail ?? null,
      leadWhatsapp: parsed.data.leadWhatsapp ?? null,
      tripId: parsed.data.tripId ?? null,
      expectedCloseDate: parsed.data.expectedCloseDate ? new Date(parsed.data.expectedCloseDate) : null,
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

router.get("/deals/:id", async (req, res): Promise<void> => {
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

router.patch("/deals/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = UpdateDealBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updates: Partial<typeof dealsTable.$inferInsert> = {};
    if (parsed.data.title != null) updates.title = parsed.data.title;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description ?? null;
    if (parsed.data.value != null) updates.value = String(parsed.data.value);
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.lostReason != null) updates.lostReason = parsed.data.lostReason;
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

router.post("/deals/:id/move", async (req, res): Promise<void> => {
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

router.delete("/deals/:id", async (req, res): Promise<void> => {
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
