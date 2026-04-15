import { Router } from "express";
import { db, salesGoalsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";

const router = Router();
const ADMIN_ROLES = ["agencia", "superadmin"];

function formatGoal(g: typeof salesGoalsTable.$inferSelect) {
  return {
    id: g.id,
    tenantId: g.tenantId,
    userId: g.userId,
    month: g.month,
    goalAmount: Number(g.goalAmount),
    achievedAmount: Number(g.achievedAmount),
    status: g.status,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

const CreateGoalBody = z.object({
  userId: z.string().min(1),
  month: z.string().min(1),
  goalAmount: z.number().min(0),
});

const UpdateGoalBody = z.object({
  goalAmount: z.number().min(0).optional(),
  achievedAmount: z.number().min(0).optional(),
  status: z.string().optional(),
});

router.get("/sales-goals", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const { userId, month } = req.query as Record<string, string>;

    // Vendedores can only see their own goals; admins can query any userId
    const effectiveUserId = ADMIN_ROLES.includes(me.role)
      ? userId
      : me.id;

    const goals = await db.select().from(salesGoalsTable)
      .where(and(
        eq(salesGoalsTable.tenantId, me.tenantId),
        ...(effectiveUserId ? [eq(salesGoalsTable.userId, effectiveUserId)] : []),
        ...(month ? [eq(salesGoalsTable.month, month)] : []),
      ))
      .orderBy(desc(salesGoalsTable.createdAt));

    res.json(goals.map(formatGoal));
  } catch (err) {
    req.log.error({ err }, "Error listing sales goals");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/sales-goals", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const parsed = CreateGoalBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [user] = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.id, parsed.data.userId), eq(usersTable.tenantId, me.tenantId)))
      .limit(1);
    if (!user) { res.status(400).json({ error: "Usuário não encontrado" }); return; }

    const id = generateId();
    await db.insert(salesGoalsTable).values({
      id,
      tenantId: me.tenantId,
      userId: parsed.data.userId,
      month: parsed.data.month,
      goalAmount: String(parsed.data.goalAmount),
      achievedAmount: "0",
      status: "active",
    });

    const [goal] = await db.select().from(salesGoalsTable)
      .where(and(eq(salesGoalsTable.id, id), eq(salesGoalsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!goal) { res.status(500).json({ error: "Failed to create goal" }); return; }
    res.status(201).json(formatGoal(goal));
  } catch (err) {
    req.log.error({ err }, "Error creating sales goal");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/sales-goals/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const parsed = UpdateGoalBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updates: Partial<typeof salesGoalsTable.$inferInsert> = {};
    if (parsed.data.goalAmount != null) updates.goalAmount = String(parsed.data.goalAmount);
    if (parsed.data.achievedAmount != null) updates.achievedAmount = String(parsed.data.achievedAmount);
    if (parsed.data.status != null) updates.status = parsed.data.status;

    await db.update(salesGoalsTable).set(updates)
      .where(and(eq(salesGoalsTable.id, req.params.id), eq(salesGoalsTable.tenantId, me.tenantId)));

    const [goal] = await db.select().from(salesGoalsTable)
      .where(and(eq(salesGoalsTable.id, req.params.id), eq(salesGoalsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!goal) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatGoal(goal));
  } catch (err) {
    req.log.error({ err }, "Error updating sales goal");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/sales-goals/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.delete(salesGoalsTable)
      .where(and(eq(salesGoalsTable.id, req.params.id), eq(salesGoalsTable.tenantId, me.tenantId)));

    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting sales goal");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
