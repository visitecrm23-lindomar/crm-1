import { Router } from "express";
import { db, couponsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";

const router = Router();
const ADMIN_ROLES = ["agencia", "superadmin"];

const CreateCouponBody = z.object({
  code: z.string().min(1),
  type: z.enum(["percentage", "fixed"]).optional(),
  value: z.string(),
  minOrderValue: z.string().optional(),
  maxUses: z.number().int().optional(),
  isActive: z.boolean().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
});

router.get("/coupons", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const coupons = await db.select().from(couponsTable)
      .where(eq(couponsTable.tenantId, me.tenantId))
      .orderBy(desc(couponsTable.createdAt));
    res.json(coupons);
  } catch (err) {
    req.log.error({ err }, "Error listing coupons");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/coupons", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateCouponBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(couponsTable).values({
      id, tenantId: me.tenantId, code: parsed.data.code, value: parsed.data.value,
      ...(parsed.data.type && { type: parsed.data.type }),
      ...(parsed.data.minOrderValue && { minOrderValue: parsed.data.minOrderValue }),
      ...(parsed.data.maxUses != null && { maxUses: parsed.data.maxUses }),
      ...(parsed.data.isActive != null && { isActive: parsed.data.isActive }),
      ...(parsed.data.validFrom && { validFrom: new Date(parsed.data.validFrom) }),
      ...(parsed.data.validUntil && { validUntil: new Date(parsed.data.validUntil) }),
    });
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.id, id)).limit(1);
    res.status(201).json(coupon);
  } catch (err) {
    req.log.error({ err }, "Error creating coupon");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/coupons/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = CreateCouponBody.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Record<string, unknown> = {};
    if (parsed.data.code) updates.code = parsed.data.code;
    if (parsed.data.type) updates.type = parsed.data.type;
    if (parsed.data.value) updates.value = parsed.data.value;
    if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
    if (parsed.data.maxUses != null) updates.maxUses = parsed.data.maxUses;
    if (parsed.data.validFrom) updates.validFrom = new Date(parsed.data.validFrom);
    if (parsed.data.validUntil) updates.validUntil = new Date(parsed.data.validUntil);
    await db.update(couponsTable).set(updates)
      .where(and(eq(couponsTable.id, req.params.id), eq(couponsTable.tenantId, me.tenantId)));
    const [coupon] = await db.select().from(couponsTable)
      .where(and(eq(couponsTable.id, req.params.id), eq(couponsTable.tenantId, me.tenantId))).limit(1);
    if (!coupon) { res.status(404).json({ error: "Not found" }); return; }
    res.json(coupon);
  } catch (err) {
    req.log.error({ err }, "Error updating coupon");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/coupons/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(couponsTable)
      .where(and(eq(couponsTable.id, req.params.id), eq(couponsTable.tenantId, me.tenantId)));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Error deleting coupon");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
