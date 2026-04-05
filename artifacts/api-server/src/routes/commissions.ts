import { Router } from "express";
import { db, commissionRulesTable, commissionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";

const router = Router();
const ADMIN_ROLES = ["agencia", "superadmin"];

const CreateRuleBody = z.object({
  name: z.string().min(1),
  type: z.enum(["percentage", "fixed"]).optional(),
  value: z.string(),
  appliesTo: z.string().optional(),
  tripId: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.get("/commission-rules", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const rules = await db.select().from(commissionRulesTable)
      .where(eq(commissionRulesTable.tenantId, me.tenantId))
      .orderBy(desc(commissionRulesTable.createdAt));
    res.json(rules);
  } catch (err) {
    req.log.error({ err }, "Error listing commission rules");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/commission-rules", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateRuleBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(commissionRulesTable).values({ id, tenantId: me.tenantId, ...parsed.data });
    const [rule] = await db.select().from(commissionRulesTable).where(eq(commissionRulesTable.id, id)).limit(1);
    res.status(201).json(rule);
  } catch (err) {
    req.log.error({ err }, "Error creating commission rule");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/commission-rules/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateRuleBody.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    await db.update(commissionRulesTable).set(parsed.data)
      .where(and(eq(commissionRulesTable.id, req.params.id), eq(commissionRulesTable.tenantId, me.tenantId)));
    const [rule] = await db.select().from(commissionRulesTable)
      .where(and(eq(commissionRulesTable.id, req.params.id), eq(commissionRulesTable.tenantId, me.tenantId))).limit(1);
    if (!rule) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rule);
  } catch (err) {
    req.log.error({ err }, "Error updating commission rule");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/commission-rules/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(commissionRulesTable)
      .where(and(eq(commissionRulesTable.id, req.params.id), eq(commissionRulesTable.tenantId, me.tenantId)));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting commission rule");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/commissions", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const commissions = await db.select().from(commissionsTable)
      .where(eq(commissionsTable.tenantId, me.tenantId))
      .orderBy(desc(commissionsTable.createdAt));
    res.json(commissions);
  } catch (err) {
    req.log.error({ err }, "Error listing commissions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/commissions/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = z.object({ status: z.string().optional(), paidAt: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Record<string, unknown> = {};
    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.paidAt) updates.paidAt = new Date(parsed.data.paidAt);
    await db.update(commissionsTable).set(updates)
      .where(and(eq(commissionsTable.id, req.params.id), eq(commissionsTable.tenantId, me.tenantId)));
    const [commission] = await db.select().from(commissionsTable)
      .where(and(eq(commissionsTable.id, req.params.id), eq(commissionsTable.tenantId, me.tenantId))).limit(1);
    if (!commission) { res.status(404).json({ error: "Not found" }); return; }
    res.json(commission);
  } catch (err) {
    req.log.error({ err }, "Error updating commission");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
