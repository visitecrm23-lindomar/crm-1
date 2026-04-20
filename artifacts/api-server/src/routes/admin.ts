import { Router } from "express";
import { db, tenantsTable, usersTable, auditLogsTable, plansTable, invoicesTable, featureFlagsTable, storesTable, storeProductsTable, storeCategoriesTable, storeOrderItemsTable, storeReviewsTable, tripsTable, productCategoriesTable, productImagesTable, vehiclesTable, accommodationsTable, destinationsTable, clientsTable, hurbProductsTable } from "@workspace/db";
import { eq, desc, asc, count, sql, and, gte, lte, ne } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";
import { utapi } from "../lib/uploadthing";
import { collectReferencedUploadThingKeys } from "../lib/collectReferencedUploadThingKeys";

const router = Router();

function requireSuperAdmin(role: string, res: import("express").Response): boolean {
  if (role !== "superadmin") {
    res.status(403).json({ error: "Forbidden: superadmin only" });
    return false;
  }
  return true;
}

// ─── PLANS CRUD ──────────────────────────────────────────────────────────────

const PlanBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  priceMonthly: z.string().optional(),
  priceYearly: z.string().optional(),
  maxUsers: z.number().int().optional(),
  maxClients: z.number().int().optional(),
  maxTrips: z.number().int().optional(),
  features: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.get("/admin/plans", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;
    const plans = await db.select().from(plansTable).orderBy(asc(plansTable.sortOrder), asc(plansTable.createdAt));
    // For each plan, count tenants
    const tenantCounts = await db
      .select({ planId: tenantsTable.planId, cnt: count(tenantsTable.id) })
      .from(tenantsTable)
      .groupBy(tenantsTable.planId);
    const cmap: Record<string, number> = {};
    for (const r of tenantCounts) cmap[r.planId] = r.cnt;
    res.json(plans.map(p => ({ ...p, tenantCount: cmap[p.slug] ?? cmap[p.id] ?? 0 })));
  } catch (err) {
    req.log.error({ err }, "Error listing plans");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/plans", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;
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

router.patch("/admin/plans/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;
    const parsed = PlanBody.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    await db.update(plansTable).set(parsed.data).where(eq(plansTable.id, req.params.id));
    const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, req.params.id)).limit(1);
    if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
    res.json(plan);
  } catch (err) {
    req.log.error({ err }, "Error updating plan");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/plans/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;
    await db.delete(plansTable).where(eq(plansTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting plan");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── INVOICES ─────────────────────────────────────────────────────────────────

const InvoiceBody = z.object({
  tenantId: z.string().min(1),
  planId: z.string().optional(),
  description: z.string().min(1),
  amount: z.string(),
  status: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

router.get("/admin/invoices", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;
    const { tenantId, status } = req.query as Record<string, string>;
    let query = db.select({
      invoice: invoicesTable,
      tenantName: tenantsTable.name,
      tenantEmail: tenantsTable.email,
    }).from(invoicesTable)
      .leftJoin(tenantsTable, eq(invoicesTable.tenantId, tenantsTable.id))
      .orderBy(desc(invoicesTable.createdAt))
      .$dynamic();
    const conditions = [];
    if (tenantId) conditions.push(eq(invoicesTable.tenantId, tenantId));
    if (status) conditions.push(eq(invoicesTable.status, status));
    if (conditions.length) query = query.where(and(...conditions));
    const rows = await query.limit(200);
    res.json(rows.map(r => ({ ...r.invoice, tenantName: r.tenantName, tenantEmail: r.tenantEmail })));
  } catch (err) {
    req.log.error({ err }, "Error listing invoices");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/invoices", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;
    const parsed = InvoiceBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const id = generateId();
    await db.insert(invoicesTable).values({
      id,
      tenantId: parsed.data.tenantId,
      planId: parsed.data.planId,
      description: parsed.data.description,
      amount: parsed.data.amount,
      status: parsed.data.status ?? "pending",
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      notes: parsed.data.notes,
    });
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    res.status(201).json(invoice);
  } catch (err) {
    req.log.error({ err }, "Error creating invoice");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/invoices/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;
    const UpdateBody = z.object({
      status: z.string().optional(),
      paidAt: z.string().optional(),
      notes: z.string().optional(),
    });
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.paidAt) updateData.paidAt = new Date(parsed.data.paidAt);
    if (parsed.data.status === "paid" && !parsed.data.paidAt) updateData.paidAt = new Date();
    await db.update(invoicesTable).set(updateData).where(eq(invoicesTable.id, req.params.id));
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, req.params.id)).limit(1);
    if (!invoice) { res.status(404).json({ error: "Not found" }); return; }
    res.json(invoice);
  } catch (err) {
    req.log.error({ err }, "Error updating invoice");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── FEATURE FLAGS ────────────────────────────────────────────────────────────

const FlagBody = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
});

router.get("/admin/feature-flags", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;
    const flags = await db.select().from(featureFlagsTable).orderBy(asc(featureFlagsTable.key));
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
    if (!requireSuperAdmin(me.role, res)) return;
    const parsed = FlagBody.safeParse(req.body);
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
    if (!requireSuperAdmin(me.role, res)) return;
    const parsed = FlagBody.partial().safeParse(req.body);
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

router.delete("/admin/feature-flags/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;
    await db.delete(featureFlagsTable).where(eq(featureFlagsTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting feature flag");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── METRICS HISTÓRICAS ────────────────────────────────────────────────────────

router.get("/admin/metrics/growth", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;

    const months: { month: string; label: string; new_tenants: number; active: number }[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

      const [newRow] = await db
        .select({ cnt: count() })
        .from(tenantsTable)
        .where(and(gte(tenantsTable.createdAt, start), lte(tenantsTable.createdAt, end)));

      const [activeRow] = await db
        .select({ cnt: count() })
        .from(tenantsTable)
        .where(and(eq(tenantsTable.status, "active"), lte(tenantsTable.createdAt, end)));

      months.push({
        month: start.toISOString().slice(0, 7),
        label,
        new_tenants: newRow?.cnt ?? 0,
        active: activeRow?.cnt ?? 0,
      });
    }

    res.json(months);
  } catch (err) {
    req.log.error({ err }, "Error fetching growth metrics");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/metrics/mrr", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;

    const PLAN_MRR: Record<string, number> = { starter: 0, pro: 297, enterprise: 997 };
    const months: { month: string; label: string; mrr: number }[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

      const tenants = await db.select({ planId: tenantsTable.planId, status: tenantsTable.status })
        .from(tenantsTable)
        .where(and(eq(tenantsTable.status, "active"), lte(tenantsTable.createdAt, end)));

      const mrr = tenants.reduce((sum, t) => sum + (PLAN_MRR[t.planId] ?? 0), 0);
      months.push({ month: d.toISOString().slice(0, 7), label, mrr });
    }

    res.json(months);
  } catch (err) {
    req.log.error({ err }, "Error fetching MRR metrics");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/metrics/churn", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;

    const months: { month: string; label: string; suspended: number; churnRate: number }[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

      const [suspRow] = await db
        .select({ cnt: count() })
        .from(tenantsTable)
        .where(and(eq(tenantsTable.status, "suspended"), gte(tenantsTable.suspendedAt!, start), lte(tenantsTable.suspendedAt!, end)));

      const [totalRow] = await db
        .select({ cnt: count() })
        .from(tenantsTable)
        .where(lte(tenantsTable.createdAt, end));

      const suspended = suspRow?.cnt ?? 0;
      const total = totalRow?.cnt ?? 1;
      months.push({ month: d.toISOString().slice(0, 7), label, suspended, churnRate: Number(((suspended / total) * 100).toFixed(2)) });
    }

    res.json(months);
  } catch (err) {
    req.log.error({ err }, "Error fetching churn metrics");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── ADMIN USERS (todos da plataforma) ───────────────────────────────────────

router.get("/admin/users", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;
    const { tenantId, role } = req.query as Record<string, string>;
    const rows = await db.select({
      user: usersTable,
      tenantName: tenantsTable.name,
    }).from(usersTable)
      .leftJoin(tenantsTable, eq(usersTable.tenantId, tenantsTable.id))
      .orderBy(desc(usersTable.createdAt))
      .limit(500);

    let result = rows.map(r => ({ ...r.user, tenantName: r.tenantName }));
    if (tenantId) result = result.filter(u => u.tenantId === tenantId);
    if (role) result = result.filter(u => u.role === role);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing admin users");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GLOBAL AUDIT LOGS ────────────────────────────────────────────────────────

router.get("/admin/audit-logs", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;
    const { tenantId, entityType, action } = req.query as Record<string, string>;
    const rows = await db.select({
      log: auditLogsTable,
      tenantName: tenantsTable.name,
      userName: usersTable.name,
    }).from(auditLogsTable)
      .leftJoin(tenantsTable, eq(auditLogsTable.tenantId, tenantsTable.id))
      .leftJoin(usersTable, eq(auditLogsTable.userId, usersTable.id))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(500);

    let result = rows.map(r => ({ ...r.log, tenantName: r.tenantName, userName: r.userName }));
    if (tenantId) result = result.filter(r => r.tenantId === tenantId);
    if (entityType) result = result.filter(r => r.entityType === entityType);
    if (action) result = result.filter(r => r.action === action);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing audit logs");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── TENANT DETAILS + ACTIONS ─────────────────────────────────────────────────

router.get("/admin/tenants/:id/details", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, req.params.id)).limit(1);
    if (!tenant) { res.status(404).json({ error: "Not found" }); return; }

    const users = await db.select().from(usersTable).where(eq(usersTable.tenantId, req.params.id)).orderBy(desc(usersTable.createdAt));
    const [userCount] = await db.select({ cnt: count() }).from(usersTable).where(eq(usersTable.tenantId, req.params.id));
    const logs = await db.select().from(auditLogsTable).where(eq(auditLogsTable.tenantId, req.params.id)).orderBy(desc(auditLogsTable.createdAt)).limit(50);
    const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.tenantId, req.params.id)).orderBy(desc(invoicesTable.createdAt));

    res.json({ ...tenant, users, userCount: userCount?.cnt ?? 0, logs, invoices });
  } catch (err) {
    req.log.error({ err }, "Error fetching tenant details");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/tenants/:id/suspend", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;
    const reason = req.body?.reason as string | undefined;
    await db.update(tenantsTable).set({
      status: "suspended",
      suspendedAt: new Date(),
      suspensionReason: reason ?? "Suspensão administrativa",
    }).where(eq(tenantsTable.id, req.params.id));
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, req.params.id)).limit(1);
    res.json(tenant);
  } catch (err) {
    req.log.error({ err }, "Error suspending tenant");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/tenants/:id/activate", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;
    await db.update(tenantsTable).set({
      status: "active",
      suspendedAt: null,
      suspensionReason: null,
    }).where(eq(tenantsTable.id, req.params.id));
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, req.params.id)).limit(1);
    res.json(tenant);
  } catch (err) {
    req.log.error({ err }, "Error activating tenant");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── ORPHANED UPLOADTHING FILE CLEANUP ───────────────────────────────────────
//
// Operator runbook:
//   1. POST /admin/cleanup-orphaned-uploadthing-files          (dry-run, default)
//      Review "wouldDelete" count and "orphanedKeys" list in the response.
//   2. POST /admin/cleanup-orphaned-uploadthing-files?dryRun=false
//      Executes deletion only after you have confirmed the dry-run output.
//
// This endpoint covers all UploadThing-backed media across the entire database:
// tenant logos, store assets (logo, logoDark, favicon, banners), store product
// images/galleries, store review photos, store category images, trip covers and
// galleries, catalog product images, vehicle photos, accommodation/destination
// covers and galleries, client profile photos, user avatars, and Hurb product
// thumbnails. extractVerifiedUploadThingKey() filters out non-UploadThing URLs
// (Clerk avatars, external links, Hurb CDN images) so they are never deleted.

router.post("/admin/cleanup-orphaned-uploadthing-files", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;

    // dry-run mode: pass ?dryRun=false to actually delete; default is true (safe preview).
    const dryRun = req.query["dryRun"] !== "false";
    // verbose mode: pass ?verbose=true to include the full key list in the response.
    const verbose = req.query["verbose"] === "true";

    // 1. Collect all UploadThing file keys currently referenced anywhere in the DB.
    const referencedKeys = await collectReferencedUploadThingKeys();

    // 2. List all files in UploadThing (paginate with offset)
    const PAGE_SIZE = 500;
    const allFileKeys: string[] = [];
    let offset = 0;
    while (true) {
      const page = await utapi.listFiles({ limit: PAGE_SIZE, offset });
      for (const f of page.files) allFileKeys.push(f.key);
      if (!page.hasMore) break;
      offset += PAGE_SIZE;
    }

    // 3. Identify orphaned keys (files in UploadThing not referenced in any DB column)
    const orphanedKeys = allFileKeys.filter((key) => !referencedKeys.has(key));

    if (dryRun || orphanedKeys.length === 0) {
      res.json({
        dryRun,
        deleted: 0,
        wouldDelete: orphanedKeys.length,
        ...(verbose ? { orphanedKeys } : {}),
      });
      return;
    }

    // 4. Delete orphaned files in batches of 100; track per-batch success
    const BATCH_SIZE = 100;
    let deletedCount = 0;
    const failedKeys: string[] = [];
    for (let i = 0; i < orphanedKeys.length; i += BATCH_SIZE) {
      const batch = orphanedKeys.slice(i, i + BATCH_SIZE);
      try {
        const result = await utapi.deleteFiles(batch);
        deletedCount += result.deletedCount;
      } catch (batchErr) {
        req.log.warn({ batchErr, batchSize: batch.length }, "Failed to delete a batch of orphaned files");
        failedKeys.push(...batch);
      }
    }

    req.log.info({ deletedCount, failedCount: failedKeys.length }, "Orphaned UploadThing files cleanup complete");
    res.json({
      dryRun: false,
      deleted: deletedCount,
      failed: failedKeys.length,
      ...(verbose ? { failedKeys, orphanedKeys } : {}),
    });
  } catch (err) {
    req.log.error({ err }, "Error cleaning up orphaned UploadThing files");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/maintenance/orphaned-files
// Body: { dryRun?: boolean, keys?: string[] }
//   dryRun=true (default): scan and return orphaned file details (key, name, size, url)
//   dryRun=false, keys=[...]: delete only the supplied keys
//   dryRun=false, keys omitted: delete all orphaned files
// ---------------------------------------------------------------------------
router.post("/admin/maintenance/orphaned-files", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!requireSuperAdmin(me.role, res)) return;

    const dryRun: boolean = req.body.dryRun !== false;
    const suppliedKeys: string[] | undefined = Array.isArray(req.body.keys) ? req.body.keys : undefined;

    // Collect all DB-referenced UploadThing keys
    const referencedKeys = await collectReferencedUploadThingKeys();

    // List all files in UploadThing with details (paginate)
    const PAGE_SIZE = 500;
    const allFiles: { key: string; name: string; size: number }[] = [];
    let offset = 0;
    while (true) {
      const page = await utapi.listFiles({ limit: PAGE_SIZE, offset });
      for (const f of page.files) allFiles.push({ key: f.key, name: f.name, size: f.size });
      if (!page.hasMore) break;
      offset += PAGE_SIZE;
    }

    // Identify orphaned files
    const orphaned = allFiles
      .filter((f) => !referencedKeys.has(f.key))
      .map((f) => ({
        key: f.key,
        name: f.name,
        size: f.size,
        url: `https://utfs.io/f/${f.key}`,
      }));

    if (dryRun) {
      res.json({
        dryRun: true,
        orphanedCount: orphaned.length,
        totalSize: orphaned.reduce((acc, f) => acc + f.size, 0),
        files: orphaned,
      });
      return;
    }

    // Delete: either supplied keys (intersected with orphaned set for safety) or all orphaned
    const orphanedKeySet = new Set(orphaned.map((f) => f.key));
    const keysToDelete = suppliedKeys
      ? suppliedKeys.filter((k) => orphanedKeySet.has(k))
      : orphaned.map((f) => f.key);
    const skippedKeys = suppliedKeys ? suppliedKeys.filter((k) => !orphanedKeySet.has(k)) : [];
    if (keysToDelete.length === 0) {
      res.json({ dryRun: false, deleted: 0, failed: 0, ...(skippedKeys.length ? { skippedKeys } : {}) });
      return;
    }

    const BATCH = 100;
    let deletedCount = 0;
    const failedKeys: string[] = [];
    for (let i = 0; i < keysToDelete.length; i += BATCH) {
      const batch = keysToDelete.slice(i, i + BATCH);
      try {
        const result = await utapi.deleteFiles(batch);
        deletedCount += result.deletedCount;
      } catch (batchErr) {
        req.log.warn({ batchErr }, "Failed to delete batch of orphaned files (maintenance)");
        failedKeys.push(...batch);
      }
    }

    req.log.info({ deletedCount, failedCount: failedKeys.length, skippedCount: skippedKeys.length }, "Maintenance orphaned-files cleanup complete");
    res.json({
      dryRun: false,
      deleted: deletedCount,
      failed: failedKeys.length,
      ...(failedKeys.length ? { failedKeys } : {}),
      ...(skippedKeys.length ? { skippedKeys } : {}),
    });
  } catch (err) {
    req.log.error({ err }, "Error in maintenance/orphaned-files");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
