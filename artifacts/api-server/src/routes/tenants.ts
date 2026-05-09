import { Router } from "express";
import { db, tenantsTable, usersTable, plansTable, referralSettingsTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";
import { deleteOrphanedFile } from "../lib/uploadthing";
import { ROLES } from "@workspace/permissions";

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
  cnpj: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  maxUsersOverride: z.number().int().nullable().optional(),
  maxClientsOverride: z.number().int().nullable().optional(),
  maxTripsOverride: z.number().int().nullable().optional(),
  website: z.string().nullable().optional(),
  reservationPrefix: z.string().max(5).optional().nullable(),
  birthdayMessagesEnabled: z.boolean().nullable().optional(),
  couponsEnabled: z.boolean().nullable().optional(),
  referralsEnabled: z.boolean().nullable().optional(),
});

router.get("/admin/stats", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.SUPER_ADMIN) { res.status(403).json({ error: "Forbidden: superadmin only" }); return; }

    const [tenants, allPlans] = await Promise.all([
      db.select().from(tenantsTable),
      db.select({ id: plansTable.id, slug: plansTable.slug, monthlyPrice: plansTable.monthlyPrice }).from(plansTable),
    ]);

    const planPriceMap: Record<string, number> = {};
    for (const p of allPlans) {
      const price = Number(p.monthlyPrice) || 0;
      planPriceMap[p.id] = price;
      if (p.slug) planPriceMap[p.slug] = price;
    }

    const totalTenants = tenants.length;
    const byStatus: Record<string, number> = {};
    const byPlan: Record<string, number> = {};
    let mrr = 0;

    for (const t of tenants) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      byPlan[t.planId] = (byPlan[t.planId] ?? 0) + 1;
      if (t.status === "active") {
        mrr += planPriceMap[t.planId] ?? 0;
      }
    }

    res.json({
      totalTenants,
      byStatus,
      byPlan,
      mrr,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching admin stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/tenants", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.SUPER_ADMIN) { res.status(403).json({ error: "Forbidden: superadmin only" }); return; }

    const tenants = await db.select().from(tenantsTable).orderBy(desc(tenantsTable.createdAt));

    const userCounts = await db
      .select({ tenantId: usersTable.tenantId, userCount: count(usersTable.id) })
      .from(usersTable)
      .groupBy(usersTable.tenantId);

    const countMap: Record<string, number> = {};
    for (const row of userCounts) {
      if (row.tenantId) countMap[row.tenantId] = row.userCount;
    }

    const result = tenants.map((t) => ({ ...t, userCount: countMap[t.id] ?? 0 }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing tenants");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/tenants/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.SUPER_ADMIN && me.tenantId !== req.params.id) {
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
    if (me.role !== ROLES.SUPER_ADMIN) { res.status(403).json({ error: "Forbidden: superadmin only" }); return; }
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
    const isAdminOfTenant = (me.role === ROLES.AGENCY_ADMIN || me.role === ROLES.SUPER_ADMIN) && me.tenantId === req.params.id;
    const isSuperadmin = me.role === ROLES.SUPER_ADMIN;
    if (!isAdminOfTenant && !isSuperadmin) { res.status(403).json({ error: "Forbidden" }); return; }
    if (me.role !== ROLES.SUPER_ADMIN && (req.body.planId || req.body.status !== undefined || req.body.maxUsersOverride !== undefined || req.body.maxClientsOverride !== undefined || req.body.maxTripsOverride !== undefined)) {
      res.status(403).json({ error: "Forbidden: apenas superadmin pode alterar plano, status ou limites do tenant" }); return;
    }
    const parsed = UpdateTenantBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { birthdayMessagesEnabled, couponsEnabled, referralsEnabled, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (me.role !== ROLES.SUPER_ADMIN) {
      delete updateData.planId;
      delete updateData.status;
      delete updateData.maxUsersOverride;
      delete updateData.maxClientsOverride;
      delete updateData.maxTripsOverride;
    }
    if (updateData.reservationPrefix != null) {
      updateData.reservationPrefix = (updateData.reservationPrefix as string).trim().toUpperCase().slice(0, 5) || null;
    }
    const [existing] = await db.select({ settings: tenantsTable.settings, logoUrl: tenantsTable.logoUrl }).from(tenantsTable).where(eq(tenantsTable.id, req.params.id)).limit(1);
    const settingsUpdates: Record<string, unknown> = {};
    if (birthdayMessagesEnabled !== undefined) settingsUpdates.birthdayMessagesEnabled = birthdayMessagesEnabled ?? true;
    if (couponsEnabled !== undefined) settingsUpdates.couponsEnabled = couponsEnabled ?? true;
    if (referralsEnabled !== undefined) settingsUpdates.referralsEnabled = referralsEnabled ?? true;
    if (Object.keys(settingsUpdates).length > 0) {
      const currentSettings = (existing?.settings ?? {}) as Record<string, unknown>;
      updateData.settings = { ...currentSettings, ...settingsUpdates };
    }
    const oldLogoUrl = existing?.logoUrl;
    await db.update(tenantsTable).set(updateData).where(eq(tenantsTable.id, req.params.id));
    if (referralsEnabled !== undefined) {
      await db.update(referralSettingsTable)
        .set({ isEnabled: referralsEnabled ?? true })
        .where(eq(referralSettingsTable.tenantId, req.params.id));
    }
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, req.params.id)).limit(1);
    if (!tenant) { res.status(404).json({ error: "Not found" }); return; }
    if ("logoUrl" in parsed.data) {
      await deleteOrphanedFile(oldLogoUrl, parsed.data.logoUrl, req.log);
    }
    res.json(tenant);
  } catch (err) {
    req.log.error({ err }, "Error updating tenant");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
