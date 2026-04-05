import { Router } from "express";
import { db, referralsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";

const router = Router();
const ADMIN_ROLES = ["agencia", "superadmin"];

const CreateReferralBody = z.object({
  referrerId: z.string(),
  referredId: z.string().optional(),
  referredEmail: z.string().email().optional(),
  code: z.string(),
  bonusAmount: z.string().optional(),
});

router.get("/referrals", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const referrals = await db.select().from(referralsTable)
      .where(eq(referralsTable.tenantId, me.tenantId))
      .orderBy(desc(referralsTable.createdAt));
    res.json(referrals);
  } catch (err) {
    req.log.error({ err }, "Error listing referrals");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/referrals", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateReferralBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(referralsTable).values({ id, tenantId: me.tenantId, ...parsed.data });
    const [referral] = await db.select().from(referralsTable).where(eq(referralsTable.id, id)).limit(1);
    res.status(201).json(referral);
  } catch (err) {
    req.log.error({ err }, "Error creating referral");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/referrals/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = z.object({
      status: z.string().optional(),
      bonusPaid: z.boolean().optional(),
      convertedAt: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Record<string, unknown> = {};
    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.bonusPaid != null) updates.bonusPaid = parsed.data.bonusPaid;
    if (parsed.data.convertedAt) updates.convertedAt = new Date(parsed.data.convertedAt);
    await db.update(referralsTable).set(updates)
      .where(and(eq(referralsTable.id, req.params.id), eq(referralsTable.tenantId, me.tenantId)));
    const [referral] = await db.select().from(referralsTable)
      .where(and(eq(referralsTable.id, req.params.id), eq(referralsTable.tenantId, me.tenantId))).limit(1);
    if (!referral) { res.status(404).json({ error: "Not found" }); return; }
    res.json(referral);
  } catch (err) {
    req.log.error({ err }, "Error updating referral");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
