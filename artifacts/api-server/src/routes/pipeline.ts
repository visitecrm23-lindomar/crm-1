import { Router } from "express";
import { db } from "@workspace/db";
import { pipelineStagesTable, dealsTable, clientsTable, tripsTable, usersTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { generateId } from "../lib/id";
import { CreateDealBody, UpdateDealBody, MoveDealBody } from "@workspace/api-zod";

const router = Router();

async function getTenantInfo(req: any) {
  const auth = req.auth;
  if (!auth?.userId) return null;
  const [me] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId)).limit(1);
  return me;
}

async function ensureDefaultPipeline(tenantId: string): Promise<void> {
  const existing = await db.select().from(pipelineStagesTable).where(eq(pipelineStagesTable.tenantId, tenantId)).limit(1);
  if (existing.length > 0) return;

  const pipelineId = generateId();
  const stages = [
    { name: "Novo Lead", color: "#6366f1", order: 1 },
    { name: "Contato Feito", color: "#3b82f6", order: 2 },
    { name: "Proposta Enviada", color: "#f59e0b", order: 3 },
    { name: "Negociação", color: "#ec4899", order: 4 },
    { name: "Reserva Confirmada", color: "#10b981", order: 5 },
    { name: "Pagamento Concluído", color: "#22c55e", order: 6, isFinal: true },
    { name: "Pós-Venda", color: "#8b5cf6", order: 7, isFinal: true },
  ];

  for (const stage of stages) {
    await db.insert(pipelineStagesTable).values({
      id: generateId(),
      tenantId,
      pipelineId,
      name: stage.name,
      color: stage.color,
      order: stage.order,
      isFinal: (stage as any).isFinal ?? false,
    });
  }
}

router.get("/pipeline/stages", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.json([]); return; }

    await ensureDefaultPipeline(me.tenantId);

    const stages = await db.select().from(pipelineStagesTable)
      .where(eq(pipelineStagesTable.tenantId, me.tenantId))
      .orderBy(pipelineStagesTable.order);

    const dealsAgg = await db.select({
      stageId: dealsTable.stageId,
      count: sql<number>`count(*)`,
      value: sql<number>`sum(cast(value as numeric))`,
    }).from(dealsTable)
      .where(and(eq(dealsTable.tenantId, me.tenantId), eq(dealsTable.status, "open")))
      .groupBy(dealsTable.stageId);

    const agg = Object.fromEntries(dealsAgg.map(a => [a.stageId, { count: Number(a.count), value: Number(a.value ?? 0) }]));

    res.json(stages.map(s => ({
      id: s.id, name: s.name, color: s.color, order: s.order, isFinal: s.isFinal,
      dealsCount: agg[s.id]?.count ?? 0,
      dealsValue: agg[s.id]?.value ?? 0,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing pipeline stages");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/deals", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me?.tenantId) { res.json([]); return; }

    const { stageId, status, ownerId } = req.query as Record<string, string>;

    let conditions: any[] = [eq(dealsTable.tenantId, me.tenantId)];
    if (stageId) conditions.push(eq(dealsTable.stageId, stageId));
    if (status) conditions.push(eq(dealsTable.status, status));
    if (ownerId) conditions.push(eq(dealsTable.ownerId, ownerId));

    const deals = await db.select().from(dealsTable)
      .where(and(...conditions)).orderBy(desc(dealsTable.createdAt));

    const stagesMap: Record<string, any> = {};
    const stages = await db.select().from(pipelineStagesTable).where(eq(pipelineStagesTable.tenantId, me.tenantId));
    stages.forEach(s => { stagesMap[s.id] = s; });

    const usersMap: Record<string, any> = {};
    const users = await db.select().from(usersTable).where(eq(usersTable.tenantId, me.tenantId));
    users.forEach(u => { usersMap[u.id] = u; });

    const clientsMap: Record<string, any> = {};
    const clients = await db.select().from(clientsTable).where(eq(clientsTable.tenantId, me.tenantId));
    clients.forEach(c => { clientsMap[c.id] = c; });

    res.json(deals.map(d => ({
      id: d.id, stageId: d.stageId, title: d.title, description: d.description,
      value: Number(d.value), clientId: d.clientId, leadName: d.leadName,
      leadEmail: d.leadEmail, leadWhatsapp: d.leadWhatsapp, tripId: d.tripId,
      ownerId: d.ownerId, expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
      status: d.status, lostReason: d.lostReason,
      createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString(),
      stageName: stagesMap[d.stageId]?.name ?? null,
      stageColor: stagesMap[d.stageId]?.color ?? null,
      clientName: d.clientId ? clientsMap[d.clientId]?.name ?? null : null,
      ownerName: usersMap[d.ownerId]?.name ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing deals");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/deals", async (req, res): Promise<void> => {
  try {
    const me = await getTenantInfo(req);
    if (!me) { res.status(401).json({ error: "Not authenticated" }); return; }
    const parsed = CreateDealBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const id = generateId();
    await db.insert(dealsTable).values({
      id,
      tenantId: me.tenantId ?? "default-tenant",
      stageId: parsed.data.stageId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      value: String(parsed.data.value),
      clientId: parsed.data.clientId ?? null,
      leadName: parsed.data.leadName ?? null,
      leadEmail: parsed.data.leadEmail ?? null,
      leadWhatsapp: parsed.data.leadWhatsapp ?? null,
      tripId: parsed.data.tripId ?? null,
      ownerId: me.id,
      expectedCloseDate: parsed.data.expectedCloseDate ? new Date(parsed.data.expectedCloseDate) : null,
    });

    const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
    res.status(201).json({
      id: deal.id, stageId: deal.stageId, title: deal.title, description: deal.description,
      value: Number(deal.value), clientId: deal.clientId, leadName: deal.leadName,
      leadEmail: deal.leadEmail, leadWhatsapp: deal.leadWhatsapp, tripId: deal.tripId,
      ownerId: deal.ownerId, expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
      status: deal.status, lostReason: deal.lostReason,
      createdAt: deal.createdAt.toISOString(), updatedAt: deal.updatedAt.toISOString(),
      stageName: null, stageColor: null, clientName: null, ownerName: null,
    });
  } catch (err) {
    req.log.error({ err }, "Error creating deal");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/deals/:id", async (req, res): Promise<void> => {
  try {
    const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, req.params.id)).limit(1);
    if (!deal) { res.status(404).json({ error: "Not found" }); return; }
    res.json({
      id: deal.id, stageId: deal.stageId, title: deal.title, description: deal.description,
      value: Number(deal.value), clientId: deal.clientId, leadName: deal.leadName,
      leadEmail: deal.leadEmail, leadWhatsapp: deal.leadWhatsapp, tripId: deal.tripId,
      ownerId: deal.ownerId, expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
      status: deal.status, lostReason: deal.lostReason,
      createdAt: deal.createdAt.toISOString(), updatedAt: deal.updatedAt.toISOString(),
      stageName: null, stageColor: null, clientName: null, ownerName: null,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching deal");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/deals/:id", async (req, res): Promise<void> => {
  try {
    const parsed = UpdateDealBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: any = {};
    if (parsed.data.stageId != null) updates.stageId = parsed.data.stageId;
    if (parsed.data.title != null) updates.title = parsed.data.title;
    if (parsed.data.value != null) updates.value = String(parsed.data.value);
    if (parsed.data.status != null) {
      updates.status = parsed.data.status;
      if (parsed.data.status === "won" || parsed.data.status === "lost") updates.closedAt = new Date();
    }
    if (parsed.data.lostReason !== undefined) updates.lostReason = parsed.data.lostReason;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.expectedCloseDate !== undefined) updates.expectedCloseDate = parsed.data.expectedCloseDate ? new Date(parsed.data.expectedCloseDate) : null;

    await db.update(dealsTable).set(updates).where(eq(dealsTable.id, req.params.id));
    const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, req.params.id)).limit(1);
    if (!deal) { res.status(404).json({ error: "Not found" }); return; }
    res.json({
      id: deal.id, stageId: deal.stageId, title: deal.title, description: deal.description,
      value: Number(deal.value), clientId: deal.clientId, leadName: deal.leadName,
      leadEmail: deal.leadEmail, leadWhatsapp: deal.leadWhatsapp, tripId: deal.tripId,
      ownerId: deal.ownerId, expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
      status: deal.status, lostReason: deal.lostReason,
      createdAt: deal.createdAt.toISOString(), updatedAt: deal.updatedAt.toISOString(),
      stageName: null, stageColor: null, clientName: null, ownerName: null,
    });
  } catch (err) {
    req.log.error({ err }, "Error updating deal");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/deals/:id", async (req, res): Promise<void> => {
  try {
    await db.delete(dealsTable).where(eq(dealsTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting deal");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/deals/:id/move", async (req, res): Promise<void> => {
  try {
    const { stageId } = req.body;
    if (!stageId) { res.status(400).json({ error: "stageId required" }); return; }
    await db.update(dealsTable).set({ stageId }).where(eq(dealsTable.id, req.params.id));
    const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, req.params.id)).limit(1);
    if (!deal) { res.status(404).json({ error: "Not found" }); return; }
    res.json({
      id: deal.id, stageId: deal.stageId, title: deal.title, description: deal.description,
      value: Number(deal.value), clientId: deal.clientId, leadName: deal.leadName,
      leadEmail: deal.leadEmail, leadWhatsapp: deal.leadWhatsapp, tripId: deal.tripId,
      ownerId: deal.ownerId, expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
      status: deal.status, lostReason: deal.lostReason,
      createdAt: deal.createdAt.toISOString(), updatedAt: deal.updatedAt.toISOString(),
      stageName: null, stageColor: null, clientName: null, ownerName: null,
    });
  } catch (err) {
    req.log.error({ err }, "Error moving deal");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
