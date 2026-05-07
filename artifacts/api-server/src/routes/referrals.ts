import { Router } from "express";
import { db, referralsTable, clientsTable, referralSettingsTable, referralTrackingTable, tenantsTable } from "@workspace/db";
import { eq, and, desc, sql, count, ilike, or, inArray, getTableColumns } from "drizzle-orm";
import { z } from "zod/v4";
import { generateId } from "../lib/id";
import { requireAuth } from "../lib/tenant";
import { ADMIN_ROLES } from '../lib/tenant';
import { REFERRAL_STATUS } from "@workspace/permissions";
import { enqueueReferralBonusPaidEmail, dispatchReferralExpiringSoonEmail } from "../queues/email-helpers";
import { dispatchWhatsAppReferralBonusPaid } from "../queues/whatsapp-helpers";
import { DEFAULT_TIERS as DEFAULT_TIERS_CONFIG, computeReferralTier } from "../lib/referral-tiers";
import type { ReferralTier } from "../lib/referral-tiers";

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
        eq(referralsTable.status, REFERRAL_STATUS.PENDING),
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
        eq(referralsTable.status, REFERRAL_STATUS.COMPLETED),
      ));

    const [discountRow] = await db.select({
      total: sql<string>`COALESCE(SUM(discount_amount),0)`,
    }).from(referralsTable)
      .where(and(
        eq(referralsTable.tenantId, me.tenantId),
        eq(referralsTable.status, REFERRAL_STATUS.COMPLETED),
      ));

    const conversionRate = total > 0 ? Math.round((stats.completed / total) * 100) : 0;

    const [refSettings] = await db
      .select({ tiersConfig: referralSettingsTable.tiersConfig })
      .from(referralSettingsTable)
      .where(eq(referralSettingsTable.tenantId, me.tenantId))
      .limit(1);

    const tiersConfig = refSettings?.tiersConfig ?? DEFAULT_TIERS_CONFIG;

    const tierDistRows = await db
      .select({
        referrerId: referralsTable.referrerId,
        conversions: sql<number>`COUNT(*) FILTER (WHERE ${referralsTable.status} = ${REFERRAL_STATUS.COMPLETED})`,
      })
      .from(referralsTable)
      .where(eq(referralsTable.tenantId, me.tenantId))
      .groupBy(referralsTable.referrerId);

    const tierDistribution: Record<string, number> = {};
    let topTierLevel = tiersConfig[0]?.level ?? "bronze";
    let topTierMinReferrals = -1;
    for (const row of tierDistRows) {
      const { tier } = computeReferralTier(Number(row.conversions), tiersConfig);
      tierDistribution[tier.level] = (tierDistribution[tier.level] ?? 0) + 1;
      if (tier.minReferrals > topTierMinReferrals) {
        topTierLevel = tier.level;
        topTierMinReferrals = tier.minReferrals;
      }
    }

    const topTierConfig = tiersConfig.find((t) => t.level === topTierLevel);
    const sortedTiers = [...tiersConfig].sort((a, b) => a.minReferrals - b.minReferrals);
    const topTierIdx = sortedTiers.findIndex((t) => t.level === topTierLevel);
    const nextTierForTop = sortedTiers[topTierIdx + 1] ?? null;
    const totalReferrers = tierDistRows.length;
    const topTierCount = tierDistribution[topTierLevel] ?? 0;
    const tierProgress = totalReferrers > 0 ? Math.round((topTierCount / totalReferrers) * 100) : 0;

    res.json({
      total,
      pending: stats.pending,
      completed: stats.completed,
      expired: stats.expired,
      conversionRate,
      totalBonusPaid: Number(earningsRow?.total ?? 0),
      totalDiscountGiven: Number(discountRow?.total ?? 0),
      tiersConfig,
      tierDistribution,
      currentTier: {
        level: topTierConfig?.level ?? "bronze",
        label: topTierConfig?.label ?? "Bronze",
        bonusMultiplier: topTierConfig?.bonusMultiplier ?? 1,
        minReferrals: topTierConfig?.minReferrals ?? 0,
        nextTierLabel: nextTierForTop?.label ?? null,
        nextTierMin: nextTierForTop?.minReferrals ?? null,
      },
      tierProgress,
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
        ilike(clientsTable.name, `%${search}%`),
        ilike(clientsTable.email, `%${search}%`),
      )!);
    }

    const [totalRow] = await db.select({ total: count() }).from(referralsTable)
      .leftJoin(clientsTable, and(
        eq(referralsTable.referrerId, clientsTable.id),
        eq(clientsTable.tenantId, me.tenantId),
      ))
      .where(and(...conditions));
    const total = Number(totalRow?.total ?? 0);

    const rows = await db.select({
      ...getTableColumns(referralsTable),
      referrerClientName: clientsTable.name,
      referrerClientEmail: clientsTable.email,
      referrerClientWhatsapp: clientsTable.whatsapp,
      referrerClientPhone: clientsTable.phone,
    }).from(referralsTable)
      .leftJoin(clientsTable, and(
        eq(referralsTable.referrerId, clientsTable.id),
        eq(clientsTable.tenantId, me.tenantId),
      ))
      .where(and(...conditions))
      .orderBy(desc(referralsTable.createdAt))
      .limit(limit)
      .offset(offset);

    // Backfill lastVisit and visitsCount from referral_tracking for referrals
    // that predate the forward-sync logic (historical data reconciliation).
    const codes = [...new Set(rows.map((r) => r.code))];
    const trackingMap = new Map<string, { lastVisit: Date | null; visitsCount: number }>();
    if (codes.length > 0) {
      const trackingAgg = await db
        .select({
          referralCode: referralTrackingTable.referralCode,
          lastVisit: sql<string | null>`MAX(${referralTrackingTable.lastVisit})`,
          visitsCount: sql<number>`SUM(${referralTrackingTable.visitsCount})`,
        })
        .from(referralTrackingTable)
        .where(and(
          eq(referralTrackingTable.tenantId, me.tenantId),
          inArray(referralTrackingTable.referralCode, codes),
        ))
        .groupBy(referralTrackingTable.referralCode);
      for (const t of trackingAgg) {
        trackingMap.set(t.referralCode, {
          lastVisit: t.lastVisit ? new Date(t.lastVisit) : null,
          visitsCount: Number(t.visitsCount) || 0,
        });
      }
    }

    const referrals = rows.map(({ referrerClientName, referrerClientEmail, referrerClientWhatsapp, referrerClientPhone, ...r }) => {
      const tracking = trackingMap.get(r.code);
      return {
        ...r,
        referrerName: referrerClientName ?? r.referrerName,
        referrerEmail: referrerClientEmail ?? r.referrerEmail,
        referrerPhone: referrerClientPhone ?? r.referrerPhone,
        referrerWhatsapp: referrerClientWhatsapp ?? null,
        // Use tracking aggregate as fallback when forward-sync hasn't run yet
        lastVisit: r.lastVisit ?? tracking?.lastVisit ?? null,
        visitsCount: Math.max(r.visitsCount ?? 0, tracking?.visitsCount ?? 0),
      };
    });

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

    const [refSettings] = await db
      .select({ expirationDays: referralSettingsTable.expirationDays })
      .from(referralSettingsTable)
      .where(eq(referralSettingsTable.tenantId, me.tenantId))
      .limit(1);
    const expirationDays = refSettings?.expirationDays ?? 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    await db.insert(referralsTable).values({ id, tenantId: me.tenantId, expiresAt, ...parsed.data });
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

router.post("/referrals/:id/pay-bonus", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const [row] = await db.select({
      ...getTableColumns(referralsTable),
      referrerClientName: clientsTable.name,
      referrerClientEmail: clientsTable.email,
      referrerClientWhatsapp: clientsTable.whatsapp,
      referrerClientPhone: clientsTable.phone,
      tenantName: tenantsTable.name,
      tenantLogo: tenantsTable.logoUrl,
    }).from(referralsTable)
      .leftJoin(clientsTable, and(
        eq(referralsTable.referrerId, clientsTable.id),
        eq(clientsTable.tenantId, me.tenantId),
      ))
      .leftJoin(tenantsTable, eq(referralsTable.tenantId, tenantsTable.id))
      .where(and(eq(referralsTable.id, req.params.id), eq(referralsTable.tenantId, me.tenantId)))
      .limit(1);

    if (!row) { res.status(404).json({ error: "Indicação não encontrada" }); return; }
    if (row.status !== REFERRAL_STATUS.COMPLETED) {
      res.status(422).json({ error: "Bônus só pode ser pago em indicações convertidas" });
      return;
    }
    if (row.bonusPaid) {
      res.status(422).json({ error: "Bônus já foi pago anteriormente" });
      return;
    }

    const now = new Date();
    await db.update(referralsTable)
      .set({ bonusPaid: true, bonusPaidAt: now, updatedAt: now })
      .where(and(
        eq(referralsTable.id, req.params.id),
        eq(referralsTable.tenantId, me.tenantId),
        eq(referralsTable.bonusPaid, false),
      ));

    const referrerEmail = row.referrerClientEmail ?? row.referrerEmail;
    const referrerName = row.referrerClientName ?? row.referrerName ?? "Indicador";
    const agencyName = row.tenantName ?? "Agência";
    const bonusValue = parseFloat(String(row.bonusAmount ?? "0"));
    const paidDateStr = now.toLocaleDateString("pt-BR");

    if (referrerEmail) {
      try {
        const agencyLogoUrl = row.tenantLogo ?? null;
        await enqueueReferralBonusPaidEmail(
          {
            referrerName,
            referrerEmail,
            bonusAmount: bonusValue,
            paidDate: paidDateStr,
            agencyName,
            agencyLogo: agencyLogoUrl,
          },
          me.tenantId,
        );
      } catch (emailErr) {
        req.log.warn({ emailErr }, "Failed to enqueue bonus payment email — bonus still marked as paid");
      }
    }

    dispatchWhatsAppReferralBonusPaid({
      referrerId: row.referrerId,
      referrerPhone: row.referrerClientWhatsapp ?? row.referrerClientPhone ?? null,
      bonusAmount: bonusValue,
      tenantId: me.tenantId,
      tenantName: agencyName,
    }).catch((err) => {
      req.log.warn({ err }, "Failed to dispatch WhatsApp bonus-paid notification");
    });

    const [updated] = await db.select({
      ...getTableColumns(referralsTable),
      referrerClientName: clientsTable.name,
      referrerClientEmail: clientsTable.email,
      referrerClientWhatsapp: clientsTable.whatsapp,
      referrerClientPhone: clientsTable.phone,
    }).from(referralsTable)
      .leftJoin(clientsTable, and(
        eq(referralsTable.referrerId, clientsTable.id),
        eq(clientsTable.tenantId, me.tenantId),
      ))
      .where(and(eq(referralsTable.id, req.params.id), eq(referralsTable.tenantId, me.tenantId)))
      .limit(1);

    if (!updated) { res.status(404).json({ error: "Not found" }); return; }

    const { referrerClientName, referrerClientEmail, referrerClientWhatsapp, referrerClientPhone, ...rest } = updated;
    res.json({
      ...rest,
      referrerName: referrerClientName ?? rest.referrerName,
      referrerEmail: referrerClientEmail ?? rest.referrerEmail,
      referrerPhone: referrerClientPhone ?? rest.referrerPhone,
      referrerWhatsapp: referrerClientWhatsapp ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Error paying referral bonus");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/referrals/:id/resend-expiry-warning", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const windowParam = req.query.window;
    if (windowParam !== "7" && windowParam !== "1") {
      res.status(400).json({ error: "Parâmetro 'window' inválido — use '7' ou '1'" });
      return;
    }
    const windowNum = parseInt(windowParam, 10) as 7 | 1;

    const [row] = await db.select({
      ...getTableColumns(referralsTable),
    }).from(referralsTable)
      .where(and(eq(referralsTable.id, req.params.id), eq(referralsTable.tenantId, me.tenantId)))
      .limit(1);

    if (!row) { res.status(404).json({ error: "Indicação não encontrada" }); return; }
    if (!row.expiresAt) {
      res.status(422).json({ error: "Esta indicação não tem data de expiração" });
      return;
    }
    if (!row.referrerId) {
      res.status(422).json({ error: "Indicação sem indicador registrado" });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(row.expiresAt);
    if (expiresAt <= now) {
      res.status(422).json({ error: "A indicação já expirou" });
      return;
    }

    const clearUpdate = windowNum === 7
      ? { expiryWarning7SentAt: null, updatedAt: now }
      : { expiryWarning1SentAt: null, updatedAt: now };

    await db.update(referralsTable)
      .set(clearUpdate)
      .where(and(eq(referralsTable.id, req.params.id), eq(referralsTable.tenantId, me.tenantId)));

    await dispatchReferralExpiringSoonEmail(row.referrerId, me.tenantId, row.code, expiresAt, windowNum);

    const sentNow = new Date();
    const sentUpdate = windowNum === 7
      ? { expiryWarning7SentAt: sentNow, updatedAt: sentNow }
      : { expiryWarning1SentAt: sentNow, updatedAt: sentNow };

    await db.update(referralsTable)
      .set(sentUpdate)
      .where(and(eq(referralsTable.id, req.params.id), eq(referralsTable.tenantId, me.tenantId)));

    const [updated] = await db.select({
      ...getTableColumns(referralsTable),
      referrerClientName: clientsTable.name,
      referrerClientEmail: clientsTable.email,
      referrerClientWhatsapp: clientsTable.whatsapp,
      referrerClientPhone: clientsTable.phone,
    }).from(referralsTable)
      .leftJoin(clientsTable, and(
        eq(referralsTable.referrerId, clientsTable.id),
        eq(clientsTable.tenantId, me.tenantId),
      ))
      .where(and(eq(referralsTable.id, req.params.id), eq(referralsTable.tenantId, me.tenantId)))
      .limit(1);

    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    const { referrerClientName, referrerClientEmail, referrerClientWhatsapp, referrerClientPhone, ...rest } = updated;
    res.json({
      ...rest,
      referrerName: referrerClientName ?? rest.referrerName,
      referrerEmail: referrerClientEmail ?? rest.referrerEmail,
      referrerPhone: referrerClientPhone ?? rest.referrerPhone,
      referrerWhatsapp: referrerClientWhatsapp ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Error resending expiry warning email");
    res.status(500).json({ error: "Falha ao reenviar o aviso de expiração" });
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
        tiersConfig: DEFAULT_TIERS_CONFIG,
        whatsappEnabled: false,
        whatsappPhoneNumber: null,
        whatsappConvertedMessage: null,
        whatsappBonusPaidMessage: null,
      };
      await db.insert(referralSettingsTable).values(defaults);
      res.json(defaults);
      return;
    }
    if (!settings.tiersConfig) {
      res.json({ ...settings, tiersConfig: DEFAULT_TIERS_CONFIG });
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
    const TierSchema = z.object({
      level: z.string(),
      label: z.string(),
      minReferrals: z.number().int().nonnegative(),
      bonusMultiplier: z.number().positive(),
    });
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
      tiersConfig: z.array(TierSchema).optional(),
      whatsappEnabled: z.boolean().optional(),
      whatsappPhoneNumber: z.string().optional(),
      whatsappConvertedMessage: z.string().optional(),
      whatsappBonusPaidMessage: z.string().optional(),
      expiryWarning7DaysEnabled: z.boolean().optional(),
      expiryWarning1DayEnabled: z.boolean().optional(),
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
    if (parsed.data.tiersConfig !== undefined) updates.tiersConfig = parsed.data.tiersConfig as ReferralTier[];
    if (parsed.data.whatsappEnabled != null) updates.whatsappEnabled = parsed.data.whatsappEnabled;
    if (parsed.data.whatsappPhoneNumber !== undefined) updates.whatsappPhoneNumber = parsed.data.whatsappPhoneNumber;
    if (parsed.data.whatsappConvertedMessage !== undefined) updates.whatsappConvertedMessage = parsed.data.whatsappConvertedMessage;
    if (parsed.data.whatsappBonusPaidMessage !== undefined) updates.whatsappBonusPaidMessage = parsed.data.whatsappBonusPaidMessage;
    if (parsed.data.expiryWarning7DaysEnabled != null) updates.expiryWarning7DaysEnabled = parsed.data.expiryWarning7DaysEnabled;
    if (parsed.data.expiryWarning1DayEnabled != null) updates.expiryWarning1DayEnabled = parsed.data.expiryWarning1DayEnabled;

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
        tiersConfig: (updates.tiersConfig as ReferralTier[] | undefined) ?? DEFAULT_TIERS_CONFIG,
        whatsappEnabled: (updates.whatsappEnabled as boolean | undefined) ?? false,
        whatsappPhoneNumber: (updates.whatsappPhoneNumber as string | undefined) ?? null,
        whatsappConvertedMessage: (updates.whatsappConvertedMessage as string | undefined) ?? null,
        whatsappBonusPaidMessage: (updates.whatsappBonusPaidMessage as string | undefined) ?? null,
        expiryWarning7DaysEnabled: (updates.expiryWarning7DaysEnabled as boolean | undefined) ?? true,
        expiryWarning1DayEnabled: (updates.expiryWarning1DayEnabled as boolean | undefined) ?? true,
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
