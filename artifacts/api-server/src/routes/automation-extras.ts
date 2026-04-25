import { Router } from "express";
import { db, automationActionsTable, automationLogsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";
import { ADMIN_ROLES } from '../lib/tenant';

const router = Router();
const ADMIN_ROLES = ADMIN_ROLES;

const CreateAutomationActionBody = z.object({
  automationId: z.string(),
  type: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

router.get("/automation-actions", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const actions = await db.select().from(automationActionsTable)
      .where(eq(automationActionsTable.tenantId, me.tenantId))
      .orderBy(automationActionsTable.order);
    res.json(actions);
  } catch (err) {
    req.log.error({ err }, "Error listing automation actions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/automation-actions", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateAutomationActionBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(automationActionsTable).values({
      id, tenantId: me.tenantId,
      automationId: parsed.data.automationId,
      type: parsed.data.type,
      ...(parsed.data.config && { config: parsed.data.config }),
      ...(parsed.data.order != null && { order: parsed.data.order }),
      ...(parsed.data.isActive != null && { isActive: parsed.data.isActive }),
    });
    const [action] = await db.select().from(automationActionsTable).where(eq(automationActionsTable.id, id)).limit(1);
    res.status(201).json(action);
  } catch (err) {
    req.log.error({ err }, "Error creating automation action");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/automation-actions/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateAutomationActionBody.partial().omit({ automationId: true }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    await db.update(automationActionsTable).set(parsed.data as Record<string, unknown>)
      .where(and(eq(automationActionsTable.id, req.params.id), eq(automationActionsTable.tenantId, me.tenantId)));
    const [action] = await db.select().from(automationActionsTable)
      .where(and(eq(automationActionsTable.id, req.params.id), eq(automationActionsTable.tenantId, me.tenantId))).limit(1);
    if (!action) { res.status(404).json({ error: "Not found" }); return; }
    res.json(action);
  } catch (err) {
    req.log.error({ err }, "Error updating automation action");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/automation-actions/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(automationActionsTable)
      .where(and(eq(automationActionsTable.id, req.params.id), eq(automationActionsTable.tenantId, me.tenantId)));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting automation action");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/automation-logs", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const logs = await db.select().from(automationLogsTable)
      .where(eq(automationLogsTable.tenantId, me.tenantId))
      .orderBy(desc(automationLogsTable.executedAt))
      .limit(500);
    res.json(logs);
  } catch (err) {
    req.log.error({ err }, "Error listing automation logs");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
