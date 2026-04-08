import { Router } from "express";
import { db, plansTable, featureFlagsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";

const router = Router();

const PlanBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  monthlyPrice: z.string().optional(),
  annualPrice: z.string().optional(),
  maxUsers: z.number().int().optional(),
  maxClients: z.number().int().optional(),
  maxTrips: z.number().int().optional(),
  features: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
});

router.get("/plans", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== "superadmin") { res.status(403).json({ error: "Forbidden" }); return; }
    const plans = await db.select().from(plansTable).orderBy(desc(plansTable.createdAt));
    res.json(plans);
  } catch (err) {
    req.log.error({ err }, "Error listing plans");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/plans", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== "superadmin") { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = PlanBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(plansTable).values({ id, ...parsed.data });
    const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, id)).limit(1);
    res.status(201).json(plan);
  } catch (err) {
    req.log.error({ err }, "Error creating plan");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/plans/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== "superadmin") { res.status(403).json({ error: "Forbidden" }); return; }
    const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, req.params.id)).limit(1);
    if (!plan) { res.status(404).json({ error: "Not found" }); return; }
    res.json(plan);
  } catch (err) {
    req.log.error({ err }, "Error fetching plan");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/plans/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== "superadmin") { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = PlanBody.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    await db.update(plansTable).set(parsed.data).where(eq(plansTable.id, req.params.id));
    const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, req.params.id)).limit(1);
    if (!plan) { res.status(404).json({ error: "Not found" }); return; }
    res.json(plan);
  } catch (err) {
    req.log.error({ err }, "Error updating plan");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/plans/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== "superadmin") { res.status(403).json({ error: "Forbidden" }); return; }
    await db.update(plansTable).set({ isActive: false }).where(eq(plansTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error archiving plan");
    res.status(500).json({ error: "Internal server error" });
  }
});

const FeatureFlagBody = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  isEnabled: z.boolean().optional(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
});

router.get("/admin/feature-flags", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== "superadmin") { res.status(403).json({ error: "Forbidden" }); return; }
    const flags = await db.select().from(featureFlagsTable).orderBy(featureFlagsTable.key);
    res.json(flags);
  } catch (err) {
    req.log.error({ err }, "Error listing feature flags");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/feature-flags", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== "superadmin") { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = FeatureFlagBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(featureFlagsTable).values({ id, ...parsed.data });
    const [flag] = await db.select().from(featureFlagsTable).where(eq(featureFlagsTable.id, id)).limit(1);
    res.status(201).json(flag);
  } catch (err) {
    req.log.error({ err }, "Error creating feature flag");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/feature-flags/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== "superadmin") { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = FeatureFlagBody.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    await db.update(featureFlagsTable).set(parsed.data).where(eq(featureFlagsTable.id, req.params.id));
    const [flag] = await db.select().from(featureFlagsTable).where(eq(featureFlagsTable.id, req.params.id)).limit(1);
    if (!flag) { res.status(404).json({ error: "Not found" }); return; }
    res.json(flag);
  } catch (err) {
    req.log.error({ err }, "Error updating feature flag");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
