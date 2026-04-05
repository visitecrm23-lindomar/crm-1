import { Router } from "express";
import { db, tenantsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";

const router = Router();

const UpdateTenantBody = z.object({
  name: z.string().min(1).optional(),
  planId: z.string().optional(),
  status: z.string().optional(),
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  whatsapp: z.string().optional(),
  phone: z.string().optional(),
});

router.get("/tenants", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== "superadmin") { res.status(403).json({ error: "Forbidden: superadmin only" }); return; }
    const tenants = await db.select().from(tenantsTable)
      .orderBy(desc(tenantsTable.createdAt));
    res.json(tenants);
  } catch (err) {
    req.log.error({ err }, "Error listing tenants");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/tenants/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== "superadmin" && me.tenantId !== req.params.id) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, req.params.id)).limit(1);
    if (!tenant) { res.status(404).json({ error: "Not found" }); return; }
    res.json(tenant);
  } catch (err) {
    req.log.error({ err }, "Error fetching tenant");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/tenants", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== "superadmin") { res.status(403).json({ error: "Forbidden: superadmin only" }); return; }
    const parsed = z.object({
      name: z.string().min(1),
      slug: z.string().min(1),
      email: z.string().email(),
      planId: z.string().optional(),
      status: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(tenantsTable).values({ id, ...parsed.data });
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id)).limit(1);
    res.status(201).json(tenant);
  } catch (err) {
    req.log.error({ err }, "Error creating tenant");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/tenants/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const isAdminOfTenant = (me.role === "agencia" || me.role === "superadmin") && me.tenantId === req.params.id;
    const isSuperadmin = me.role === "superadmin";
    if (!isAdminOfTenant && !isSuperadmin) { res.status(403).json({ error: "Forbidden" }); return; }
    if (me.role !== "superadmin" && (req.body.status === "suspended" || req.body.planId)) {
      res.status(403).json({ error: "Forbidden: apenas superadmin pode alterar plano ou suspender tenant" }); return;
    }
    const parsed = UpdateTenantBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    await db.update(tenantsTable).set(parsed.data).where(eq(tenantsTable.id, req.params.id));
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, req.params.id)).limit(1);
    if (!tenant) { res.status(404).json({ error: "Not found" }); return; }
    res.json(tenant);
  } catch (err) {
    req.log.error({ err }, "Error updating tenant");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
