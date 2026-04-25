import { Router } from "express";
import { db, referralsTable, clientsTable, referralSettingsTable, referralTrackingTable } from "@workspace/db";
import { eq, and, desc, sql, count, ilike, or } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";
import { ADMIN_ROLES } from '../lib/tenant';

const router = Router();

const CreateReferralBody = z.object({
  referrerId: z.string(),
  referredId: z.string().optional(),
  referredEmail: z.string().email().optional(),
  code: z.string(),
  bonusAmount: z.string().optional(),
});

router.get("/referrals/validate/:code", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const { code } = req.params;

    const [referral] = await db.select().from(referralsTable)
      .where(and(
        eq(referralsTable.tenantId, me.tenantId),
        eq(referralsTable.code, code),
        eq(referralsTable.status, "pending"),
      )).limit(1);

    if (!referral) {
      res.json({ valid: false, bonusAmount: 0, message: "Código de indicação inválido ou já utilizado" });
      return;
    }

    res.json({
      valid: true,
      referralId: referral.id,
      bonusAmount: referral.bonusAmount != null ? Number(referral.bonusAmount) : 0,
      message: null,
    });
  } catch (err) {
    req.log.error({ err }, "Error validating referral code");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/referrals/stats", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const rows = await db.select({
      status: referralsTable.status,
      cnt: count(),
    }).from(referralsTable)
      .where(eq(referralsTable.tenantId, me.tenantId))
      .groupBy(referralsTable.status);

    const stats: Record<string, number> = { pending: 0, completed: 0, expired: 0 };
    for (const r of rows) {
      stats[r.status] = Number(r.cnt);
    }
    const total = Object.values(stats).reduce((a, b) => a + b, 0);

    const [earningsRow] = await db.select({
      total: sql<string>`COALESCE(SUM(bonus_amount),0)`,
    }).from(referralsTable)
      .where(and(
        eq(referralsTable.tenantId, me.tenantId),
        eq(referralsTable.status, "completed"),
      ));

    const [discountRow] = await db.select({
      total: sql<string>`COALESCE(SUM(discount_amount),0)`,
    }).from(referralsTable)
      .where(and(
        eq(referralsTable.tenantId, me.tenantId),
        eq(referralsTable.status, "completed"),
      ));

    const conversionRate = total > 0 ? Math.round((stats.completed / total) * 100) : 0;

    res.json({
      total,
      pending: stats.pending,
      completed: stats.completed,
      expired: stats.expired,
      conversionRate,
      totalBonusPaid: Number(earningsRow?.total ?? 0),
      totalDiscountGiven: Number(discountRow?.total ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching referral stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/referrals", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    const conditions = [eq(referralsTable.tenantId, me.tenantId)];
    if (status) conditions.push(eq(referralsTable.status, status));
    if (search) {
      conditions.push(or(
        ilike(referralsTable.code, `%${search}%`),
        ilike(referralsTable.referrerName, `%${search}%`),
        ilike(referralsTable.referredEmail, `%${search}%`),
        ilike(referralsTable.referredName, `%${search}%`),
      )!);
    }

    const [totalRow] = await db.select({ total: count() }).from(referralsTable)
      .where(and(...conditions));
    const total = Number(totalRow?.total ?? 0);

    const referrals = await db.select().from(referralsTable)
      .where(and(...conditions))
      .orderBy(desc(referralsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      data: referrals,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
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
      isActive: z.boolean().optional(),
      notes: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.bonusPaid != null) updates.bonusPaid = parsed.data.bonusPaid;
    if (parsed.data.convertedAt) updates.convertedAt = new Date(parsed.data.convertedAt);
    if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
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

router.get("/referral-settings", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const [settings] = await db.select().from(referralSettingsTable)
      .where(eq(referralSettingsTable.tenantId, me.tenantId)).limit(1);
    if (!settings) {
      const defaults = {
        id: generateId(),
        tenantId: me.tenantId,
        isEnabled: true,
        discountType: "percentage",
        discountValue: "5.00",
        bonusType: "credit",
        bonusValue: "10.00",
        expirationDays: 30,
        allowSelfReferral: false,
        requireFirstPurchase: true,
        shareMessage: "Use meu código de indicação e ganhe desconto na sua viagem!",
      };
      await db.insert(referralSettingsTable).values(defaults);
      res.json(defaults);
      return;
    }
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "Error fetching referral settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/referral-settings", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const parsed = z.object({
      isEnabled: z.boolean().optional(),
      discountType: z.string().optional(),
      discountValue: z.number().optional(),
      bonusType: z.string().optional(),
      bonusValue: z.number().optional(),
      expirationDays: z.number().optional(),
      allowSelfReferral: z.boolean().optional(),
      requireFirstPurchase: z.boolean().optional(),
      shareMessage: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.isEnabled != null) updates.isEnabled = parsed.data.isEnabled;
    if (parsed.data.discountType) updates.discountType = parsed.data.discountType;
    if (parsed.data.discountValue != null) updates.discountValue = parsed.data.discountValue.toFixed(2);
    if (parsed.data.bonusType) updates.bonusType = parsed.data.bonusType;
    if (parsed.data.bonusValue != null) updates.bonusValue = parsed.data.bonusValue.toFixed(2);
    if (parsed.data.expirationDays != null) updates.expirationDays = parsed.data.expirationDays;
    if (parsed.data.allowSelfReferral != null) updates.allowSelfReferral = parsed.data.allowSelfReferral;
    if (parsed.data.requireFirstPurchase != null) updates.requireFirstPurchase = parsed.data.requireFirstPurchase;
    if (parsed.data.shareMessage !== undefined) updates.shareMessage = parsed.data.shareMessage;

    const [existing] = await db.select({ id: referralSettingsTable.id })
      .from(referralSettingsTable).where(eq(referralSettingsTable.tenantId, me.tenantId)).limit(1);
    if (!existing) {
      const id = generateId();
      await db.insert(referralSettingsTable).values({
        id,
        tenantId: me.tenantId,
        isEnabled: (updates.isEnabled as boolean | undefined) ?? true,
        discountType: (updates.discountType as string | undefined) ?? "percentage",
        discountValue: (updates.discountValue as string | undefined) ?? "5.00",
        bonusType: (updates.bonusType as string | undefined) ?? "credit",
        bonusValue: (updates.bonusValue as string | undefined) ?? "10.00",
        expirationDays: (updates.expirationDays as number | undefined) ?? 30,
        allowSelfReferral: (updates.allowSelfReferral as boolean | undefined) ?? false,
        requireFirstPurchase: (updates.requireFirstPurchase as boolean | undefined) ?? true,
        shareMessage: (updates.shareMessage as string | undefined) ?? null,
      });
      const [settings] = await db.select().from(referralSettingsTable)
        .where(eq(referralSettingsTable.id, id)).limit(1);
      res.json(settings);
    } else {
      await db.update(referralSettingsTable).set(updates as Partial<typeof referralSettingsTable.$inferInsert>)
        .where(eq(referralSettingsTable.tenantId, me.tenantId));
      const [settings] = await db.select().from(referralSettingsTable)
        .where(eq(referralSettingsTable.tenantId, me.tenantId)).limit(1);
      res.json(settings);
    }
  } catch (err) {
    req.log.error({ err }, "Error updating referral settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
