import { Router, type NextFunction } from "express";
import { db } from "@workspace/db";
import { pipelinesTable, pipelineStagesTable, dealsTable, clientsTable, reservationsTable } from "@workspace/db";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import { generateId } from "../lib/id";
import { requireAuth, getTenantUser, ADMIN_ROLES } from '../lib/tenant';
import { z } from "zod";
import { ROLES, DEAL_STATUS, type DealStatus } from "@workspace/permissions";
import { parseDealStatus } from "../lib/status-validators";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";

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
  reservationId: z.string().optional(),
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
  reservationId: z.string().optional().nullable(),
  tripId: z.string().optional().nullable(),
});

const MoveDealBody = z.object({ stageId: z.string() });

const DEFAULT_STAGES = [
  { name: "Lead", order: 1, color: "#6366F1", isFinal: false, isDefaultWeb: false },
  { name: "Vitrine", order: 2, color: "#3B82F6", isFinal: false, isDefaultWeb: true },
  { name: "Reserva Criada", order: 3, color: "#0EA5E9", isFinal: false, isDefaultWeb: false },
  { name: "Pagamento Confirmado", order: 4, color: "#10B981", isFinal: false, isDefaultWeb: false },
  { name: "Em Viagem", order: 5, color: "#06B6D4", isFinal: false, isDefaultWeb: false },
  { name: "Pós Viagem", order: 6, color: "#6B7280", isFinal: true, isDefaultWeb: false },
];

const STAGE_RENAMES: { oldName: string; newName: string }[] = [
  { oldName: "Interessado", newName: "Reserva Criada" },
  { oldName: "Cliente", newName: "Pagamento Confirmado" },
  { oldName: "Pós-venda", newName: "Pós Viagem" },
];

async function ensureDefaultPipeline(tenantId: string): Promise<string> {
  const existing = await db.select().from(pipelineStagesTable)
    .where(eq(pipelineStagesTable.tenantId, tenantId));
  if (existing.length > 0) {
    for (const r of STAGE_RENAMES) {
      await db.update(pipelineStagesTable)
        .set({ name: r.newName })
        .where(and(eq(pipelineStagesTable.tenantId, tenantId), eq(pipelineStagesTable.name, r.oldName)));
    }
    return existing[0].pipelineId;
  }
  const pipelineId = generateId();
  await db.insert(pipelinesTable).values({
    id: pipelineId,
    tenantId,
    name: "Pipeline Principal",
    isDefault: true,
    isActive: true,
  });
  for (const stage of DEFAULT_STAGES) {
    await db.insert(pipelineStagesTable).values({
      id: generateId(),
      tenantId,
      pipelineId,
      name: stage.name,
      order: stage.order,
      color: stage.color,
      isFinal: stage.isFinal,
      isDefaultWeb: stage.isDefaultWeb,
    });
  }
  return pipelineId;
}

function formatStage(s: typeof pipelineStagesTable.$inferSelect) {
  return {
    id: s.id, name: s.name, order: s.order, color: s.color,
    isFinal: s.isFinal, isDefaultWeb: s.isDefaultWeb,
    tenantId: s.tenantId, pipelineId: s.pipelineId,
    createdAt: s.createdAt.toISOString(),
  };
}

function formatDeal(d: typeof dealsTable.$inferSelect, seats: string[] = [], reservationNumber: string | null = null) {
  return {
    id: d.id, tenantId: d.tenantId, clientId: d.clientId, stageId: d.stageId,
    title: d.title, description: d.description, value: Number(d.value),
    status: d.status, ownerId: d.ownerId,
    leadName: d.leadName, leadEmail: d.leadEmail, leadWhatsapp: d.leadWhatsapp,
    tripId: d.tripId, lostReason: d.lostReason,
    reservationId: d.reservationId ?? null,
    reservationNumber,
    source: d.source ?? "manual",
    autoCreated: d.autoCreated ?? false,
    seats,
    expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
    closedAt: d.closedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString(),
  };
}

interface ReservationInfo { seats: string[]; reservationNumber: string | null }

async function getReservationInfoForDeals(deals: typeof dealsTable.$inferSelect[], tenantId: string): Promise<Map<string, ReservationInfo>> {
  const resIds = deals.map(d => d.reservationId).filter(Boolean) as string[];
  const infoMap = new Map<string, ReservationInfo>();
  if (resIds.length === 0) return infoMap;
  const rows = await db.select({ id: reservationsTable.id, seats: reservationsTable.seats, reservationNumber: reservationsTable.reservationNumber })
    .from(reservationsTable)
    .where(and(inArray(reservationsTable.id, resIds), eq(reservationsTable.tenantId, tenantId)));
  for (const r of rows) infoMap.set(r.id, { seats: r.seats ?? [], reservationNumber: r.reservationNumber ?? null });
  return infoMap;
}

async function requireDealAccess(me: { id: string; tenantId: string; role: string }, dealId: string): Promise<typeof dealsTable.$inferSelect> {
  if (me.role === ROLES.CLIENT) {
    throw new ForbiddenError("Access denied", "FORBIDDEN_ROLE");
  }
  const dealConditions: ReturnType<typeof eq>[] = [eq(dealsTable.id, dealId), eq(dealsTable.tenantId, me.tenantId)];
  if (me.role === ROLES.SALES) dealConditions.push(eq(dealsTable.ownerId, me.id));
  const [deal] = await db.select().from(dealsTable).where(and(...dealConditions)).limit(1);
  if (!deal) { throw new NotFoundError("Not found", "NOT_FOUND"); }
  return deal;
}

router.get("/pipeline/stages", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    await ensureDefaultPipeline(me.tenantId);
    const stages = await db.select().from(pipelineStagesTable)
      .where(eq(pipelineStagesTable.tenantId, me.tenantId))
      .orderBy(asc(pipelineStagesTable.order));
    res.json(stages.map(formatStage));
  } catch (err) {
    next(err);
  }
});

router.get("/deals", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === ROLES.CLIENT) {
      next(new ForbiddenError("Access denied", "FORBIDDEN_ROLE"));
      return;
    }
    const { stageId, clientId, ownerId, status } = req.query as Record<string, string>;
    const conditions: ReturnType<typeof eq>[] = [eq(dealsTable.tenantId, me.tenantId)];
    if (stageId) conditions.push(eq(dealsTable.stageId, stageId));
    if (clientId) conditions.push(eq(dealsTable.clientId, clientId));
    if (ownerId) conditions.push(eq(dealsTable.ownerId, ownerId));
    if (status) conditions.push(eq(dealsTable.status, parseDealStatus(status)));
    if (me.role === ROLES.SALES) conditions.push(eq(dealsTable.ownerId, me.id));
    const deals = await db.select().from(dealsTable)
      .where(and(...conditions)).orderBy(desc(dealsTable.createdAt));
    const resInfoMap = await getReservationInfoForDeals(deals, me.tenantId);
    res.json(deals.map(d => {
      const info = d.reservationId ? resInfoMap.get(d.reservationId) : undefined;
      return formatDeal(d, info?.seats ?? [], info?.reservationNumber ?? null);
    }));
  } catch (err) {
    next(err);
  }
});

router.post("/deals", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateDealBody.safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }

    if (parsed.data.clientId) {
      const [client] = await db.select().from(clientsTable)
        .where(and(eq(clientsTable.id, parsed.data.clientId), eq(clientsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!client) { next(new ValidationError("Client not found or not in tenant", "CLIENT_NOT_FOUND")); return; }
    }

    const [stage] = await db.select().from(pipelineStagesTable)
      .where(and(eq(pipelineStagesTable.id, parsed.data.stageId), eq(pipelineStagesTable.tenantId, me.tenantId)))
      .limit(1);
    if (!stage) { next(new ValidationError("Stage not found or not in tenant", "STAGE_NOT_FOUND")); return; }

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
      status: parseDealStatus(parsed.data.status ?? DEAL_STATUS.OPEN),
      leadName: parsed.data.leadName ?? null,
      leadEmail: parsed.data.leadEmail ?? null,
      leadWhatsapp: parsed.data.leadWhatsapp ?? null,
      tripId: parsed.data.tripId ?? null,
      reservationId: parsed.data.reservationId ?? null,
      expectedCloseDate: parsed.data.expectedCloseDate ? new Date(parsed.data.expectedCloseDate) : null,
    });

    const [deal] = await db.select().from(dealsTable)
      .where(and(eq(dealsTable.id, id), eq(dealsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!deal) { next(new Error("Failed to create deal")); return; }
    res.status(201).json(formatDeal(deal));
  } catch (err) {
    next(err);
  }
});

router.get("/deals/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const deal = await requireDealAccess(me, req.params.id);
    res.json(formatDeal(deal));
  } catch (err) {
    next(err);
  }
});

router.patch("/deals/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    await requireDealAccess(me, req.params.id);

    const parsed = UpdateDealBody.safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }

    const updates: Partial<typeof dealsTable.$inferInsert> = {};
    if (parsed.data.title != null) updates.title = parsed.data.title;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description ?? null;
    if (parsed.data.value != null) updates.value = String(parsed.data.value);
    if (parsed.data.status != null) updates.status = parseDealStatus(parsed.data.status);
    if (parsed.data.lostReason != null) updates.lostReason = parsed.data.lostReason;
    if (parsed.data.expectedCloseDate !== undefined) {
      updates.expectedCloseDate = parsed.data.expectedCloseDate ? new Date(parsed.data.expectedCloseDate) : null;
    }
    if (parsed.data.stageId != null) {
      const [stage] = await db.select().from(pipelineStagesTable)
        .where(and(eq(pipelineStagesTable.id, parsed.data.stageId), eq(pipelineStagesTable.tenantId, me.tenantId)))
        .limit(1);
      if (!stage) { next(new ValidationError("Stage not found or not in tenant", "STAGE_NOT_FOUND")); return; }
      updates.stageId = parsed.data.stageId;
    }
    if (parsed.data.reservationId !== undefined) {
      updates.reservationId = parsed.data.reservationId ?? null;
    }
    if (parsed.data.tripId !== undefined) {
      updates.tripId = parsed.data.tripId ?? null;
    }

    await db.update(dealsTable).set(updates)
      .where(and(eq(dealsTable.id, req.params.id), eq(dealsTable.tenantId, me.tenantId)));
    const [deal] = await db.select().from(dealsTable)
      .where(and(eq(dealsTable.id, req.params.id), eq(dealsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!deal) { next(new NotFoundError("Not found", "NOT_FOUND")); return; }
    res.json(formatDeal(deal));
  } catch (err) {
    next(err);
  }
});

router.patch("/deals/:id/move", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    await requireDealAccess(me, req.params.id);

    const parsed = MoveDealBody.safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }
    const [stage] = await db.select().from(pipelineStagesTable)
      .where(and(eq(pipelineStagesTable.id, parsed.data.stageId), eq(pipelineStagesTable.tenantId, me.tenantId)))
      .limit(1);
    if (!stage) { next(new ValidationError("Stage not found or not in tenant", "STAGE_NOT_FOUND")); return; }
    await db.update(dealsTable).set({ stageId: parsed.data.stageId })
      .where(and(eq(dealsTable.id, req.params.id), eq(dealsTable.tenantId, me.tenantId)));
    const [deal] = await db.select().from(dealsTable)
      .where(and(eq(dealsTable.id, req.params.id), eq(dealsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!deal) { next(new NotFoundError("Not found", "NOT_FOUND")); return; }
    res.json(formatDeal(deal));
  } catch (err) {
    next(err);
  }
});

router.delete("/deals/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    await requireDealAccess(me, req.params.id);
    await db.delete(dealsTable)
      .where(and(eq(dealsTable.id, req.params.id), eq(dealsTable.tenantId, me.tenantId)));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/pipelines", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    await ensureDefaultPipeline(me.tenantId);
    const pipelines = await db.select().from(pipelinesTable)
      .where(eq(pipelinesTable.tenantId, me.tenantId));
    res.json(pipelines.map((p) => ({
      id: p.id, name: p.name, description: p.description,
      isDefault: p.isDefault, isActive: p.isActive, tenantId: p.tenantId,
      createdAt: p.createdAt.toISOString(),
    })));
  } catch (err) {
    next(err);
  }
});

router.post("/pipelines", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE"));
      return;
    }
    const parsed = z.object({ name: z.string().min(1), description: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }
    const id = generateId();
    await db.insert(pipelinesTable).values({ id, tenantId: me.tenantId, name: parsed.data.name, description: parsed.data.description });
    const [pipeline] = await db.select().from(pipelinesTable).where(eq(pipelinesTable.id, id));
    res.status(201).json(pipeline);
  } catch (err) {
    next(err);
  }
});

router.patch("/pipelines/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) {
      next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE"));
      return;
    }
    const parsed = z.object({ name: z.string().min(1).optional(), isActive: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }
    await db.update(pipelinesTable).set(parsed.data).where(and(eq(pipelinesTable.id, req.params.id), eq(pipelinesTable.tenantId, me.tenantId)));
    const [pipeline] = await db.select().from(pipelinesTable).where(and(eq(pipelinesTable.id, req.params.id), eq(pipelinesTable.tenantId, me.tenantId)));
    if (!pipeline) { next(new NotFoundError("Not found", "NOT_FOUND")); return; }
    res.json(pipeline);
  } catch (err) {
    next(err);
  }
});

export default router;
