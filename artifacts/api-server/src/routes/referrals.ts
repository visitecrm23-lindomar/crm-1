import { Router } from "express";
import { db, referralsTable, clientsTable, referralSettingsTable, referralTrackingTable, tenantsTable, emailLogsTable, reservationsTable, referralCampaignsTable } from "@workspace/db";
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

    const BONUS_LOCK_DAYS = 30;
    const referrals = rows.map(({ referrerClientName, referrerClientEmail, referrerClientWhatsapp, referrerClientPhone, ...r }) => {
      const tracking = trackingMap.get(r.code);
      const bonusReleasesAt = r.convertedAt
        ? new Date(new Date(r.convertedAt).getTime() + BONUS_LOCK_DAYS * 24 * 60 * 60 * 1000)
        : null;
      const bonusBlocked =
        r.status === REFERRAL_STATUS.REVERSED ||
        (bonusReleasesAt !== null && new Date() < bonusReleasesAt);
      return {
        ...r,
        referrerName: referrerClientName ?? r.referrerName,
        referrerEmail: referrerClientEmail ?? r.referrerEmail,
        referrerPhone: referrerClientPhone ?? r.referrerPhone,
        referrerWhatsapp: referrerClientWhatsapp ?? null,
        lastVisit: r.lastVisit ?? tracking?.lastVisit ?? null,
        visitsCount: Math.max(r.visitsCount ?? 0, tracking?.visitsCount ?? 0),
        bonusReleasesAt: bonusReleasesAt?.toISOString() ?? null,
        bonusBlocked,
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
      expiresAt: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [existing] = await db.select({ expiresAt: referralsTable.expiresAt })
      .from(referralsTable)
      .where(and(eq(referralsTable.id, req.params.id), eq(referralsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.bonusPaid != null) updates.bonusPaid = parsed.data.bonusPaid;
    if (parsed.data.convertedAt) updates.convertedAt = new Date(parsed.data.convertedAt);
    if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    if (parsed.data.expiresAt !== undefined) {
      const newExpiresAt = new Date(parsed.data.expiresAt);
      updates.expiresAt = newExpiresAt;
      const oldTime = existing.expiresAt ? new Date(existing.expiresAt).getTime() : null;
      if (oldTime !== newExpiresAt.getTime()) {
        updates.expiryWarning7SentAt = null;
        updates.expiryWarning1SentAt = null;
      }
    }

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
    if (row.status === REFERRAL_STATUS.REVERSED) {
      res.status(422).json({ error: "Bônus revertido por cancelamento da reserva" });
      return;
    }
    if (row.status !== REFERRAL_STATUS.COMPLETED) {
      res.status(422).json({ error: "Bônus só pode ser pago em indicações convertidas" });
      return;
    }
    if (row.bonusPaid) {
      res.status(422).json({ error: "Bônus já foi pago anteriormente" });
      return;
    }
    if (row.convertedAt) {
      const lockUntil = new Date(row.convertedAt);
      lockUntil.setDate(lockUntil.getDate() + 30);
      if (new Date() < lockUntil) {
        const releaseDate = lockUntil.toLocaleDateString("pt-BR");
        res.status(422).json({ error: `Bônus disponível somente 30 dias após a reserva. Liberação em ${releaseDate}` });
        return;
      }
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
      referrerName: referrerName,
      referralCode: row.code ?? null,
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
      referrerClientEmail: clientsTable.email,
    }).from(referralsTable)
      .leftJoin(clientsTable, and(
        eq(referralsTable.referrerId, clientsTable.id),
        eq(clientsTable.tenantId, me.tenantId),
      ))
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

    if (!row.referrerClientEmail) {
      res.status(422).json({ error: "O indicador não tem e-mail cadastrado — aviso não pode ser enviado" });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(row.expiresAt);
    if (expiresAt <= now) {
      res.status(422).json({ error: "A indicação já expirou" });
      return;
    }

    const msLeft = expiresAt.getTime() - now.getTime();
    const windowMs = windowNum * 24 * 60 * 60 * 1000;
    if (msLeft < windowMs) {
      res.status(422).json({
        error: `A janela D-${windowNum} já passou — restam menos de ${windowNum} dia(s) para a expiração`,
      });
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

router.get("/referrals/:id/expiry-email-status", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const [row] = await db.select({
      code: referralsTable.code,
      referrerClientEmail: clientsTable.email,
    }).from(referralsTable)
      .leftJoin(clientsTable, and(
        eq(referralsTable.referrerId, clientsTable.id),
        eq(clientsTable.tenantId, me.tenantId),
      ))
      .where(and(eq(referralsTable.id, req.params.id), eq(referralsTable.tenantId, me.tenantId)))
      .limit(1);

    if (!row) { res.status(404).json({ error: "Indicação não encontrada" }); return; }

    const referrerEmail = row.referrerClientEmail;
    if (!referrerEmail) {
      res.json({ d7: null, d1: null });
      return;
    }

    const logs = await db.select({
      id: emailLogsTable.id,
      subject: emailLogsTable.subject,
      status: emailLogsTable.status,
      errorMessage: emailLogsTable.errorMessage,
      createdAt: emailLogsTable.createdAt,
    }).from(emailLogsTable)
      .where(and(
        eq(emailLogsTable.tenantId, me.tenantId),
        eq(emailLogsTable.recipient, referrerEmail),
        ilike(emailLogsTable.subject, `%${row.code}%`),
      ))
      .orderBy(desc(emailLogsTable.createdAt))
      .limit(50);

    const d7Logs = logs.filter((l) => l.subject.includes("7 dias"));
    const d1Logs = logs.filter((l) => l.subject.includes("1 dia"));

    const toEntry = (log: typeof logs[0] | undefined) =>
      log ? { status: log.status, errorMessage: log.errorMessage ?? null, sentAt: log.createdAt } : null;

    res.json({ d7: toEntry(d7Logs[0]), d1: toEntry(d1Logs[0]) });
  } catch (err) {
    req.log.error({ err }, "Error fetching referral expiry email status");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/referrals/:id/share", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const [row] = await db
      .select({
        code: referralsTable.code,
        tenantSlug: tenantsTable.slug,
      })
      .from(referralsTable)
      .leftJoin(tenantsTable, eq(referralsTable.tenantId, tenantsTable.id))
      .where(and(eq(referralsTable.id, req.params.id), eq(referralsTable.tenantId, me.tenantId)))
      .limit(1);

    if (!row) { res.status(404).json({ error: "Indicação não encontrada" }); return; }

    const frontendBase = (process.env["FRONTEND_URL"] ?? `https://${process.env["REPLIT_DEV_DOMAIN"] ?? "localhost"}`).replace(/\/$/, "");
    const slug = row.tenantSlug ?? me.tenantId;
    const link = `${frontendBase}/loja/${slug}/indicacao?code=${row.code}`;

    const QRCode = await import("qrcode");
    const qrCodeDataUrl = await QRCode.default.toDataURL(link, { margin: 2, width: 256 });

    res.json({ link, qrCodeDataUrl });
  } catch (err) {
    req.log.error({ err }, "Error generating referral share link");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/referrals/analytics", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const period = parseInt((req.query.period as string) || "90", 10);
    if (![30, 90, 180].includes(period)) {
      res.status(400).json({ error: "period must be 30, 90, or 180" });
      return;
    }

    const now = new Date();
    const since = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
    const prevSince = new Date(since.getTime() - period * 24 * 60 * 60 * 1000);
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    // Current and previous calendar month boundaries
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      seriesRows,
      funnelRow_,
      prevRow_,
      discountRow_,
      monthlyRows,
      channelRows,
      roiBonusRow_,
      roiRevenueRow_,
      currentMonthRow_,
      prevMonthRow_,
    ] = await Promise.all([
      // Weekly series for selected period (existing behaviour)
      db.select({
        week: sql<string>`date_trunc('week', ${referralsTable.createdAt})::date::text`,
        created: count(),
        converted: sql<number>`COUNT(*) FILTER (WHERE ${referralsTable.status} = ${REFERRAL_STATUS.COMPLETED})`,
      }).from(referralsTable)
        .where(and(eq(referralsTable.tenantId, me.tenantId), sql`${referralsTable.createdAt} >= ${since}`))
        .groupBy(sql`date_trunc('week', ${referralsTable.createdAt})`)
        .orderBy(sql`date_trunc('week', ${referralsTable.createdAt})`),

      // Funnel for period
      db.select({
        created: count(),
        visited: sql<number>`COUNT(*) FILTER (WHERE ${referralsTable.visitsCount} > 0)`,
        converted: sql<number>`COUNT(*) FILTER (WHERE ${referralsTable.status} = ${REFERRAL_STATUS.COMPLETED})`,
        bonusPaid: sql<number>`COUNT(*) FILTER (WHERE ${referralsTable.bonusPaid} = true)`,
      }).from(referralsTable)
        .where(and(eq(referralsTable.tenantId, me.tenantId), sql`${referralsTable.createdAt} >= ${since}`)),

      // Previous period comparison
      db.select({
        created: count(),
        converted: sql<number>`COUNT(*) FILTER (WHERE ${referralsTable.status} = ${REFERRAL_STATUS.COMPLETED})`,
      }).from(referralsTable)
        .where(and(
          eq(referralsTable.tenantId, me.tenantId),
          sql`${referralsTable.createdAt} >= ${prevSince}`,
          sql`${referralsTable.createdAt} < ${since}`,
        )),

      // Discount given in period
      db.select({ total: sql<number>`COALESCE(SUM(${referralsTable.discountAmount}), 0)` })
        .from(referralsTable)
        .where(and(
          eq(referralsTable.tenantId, me.tenantId),
          eq(referralsTable.status, REFERRAL_STATUS.COMPLETED),
          sql`${referralsTable.createdAt} >= ${since}`,
        )),

      // Monthly time series — last 12 months
      db.select({
        month: sql<string>`date_trunc('month', ${referralsTable.createdAt})::date::text`,
        created: count(),
        converted: sql<number>`COUNT(*) FILTER (WHERE ${referralsTable.status} = ${REFERRAL_STATUS.COMPLETED})`,
        bonusPaid: sql<number>`COUNT(*) FILTER (WHERE ${referralsTable.bonusPaid} = true)`,
      }).from(referralsTable)
        .where(and(eq(referralsTable.tenantId, me.tenantId), sql`${referralsTable.createdAt} >= ${twelveMonthsAgo}`))
        .groupBy(sql`date_trunc('month', ${referralsTable.createdAt})`)
        .orderBy(sql`date_trunc('month', ${referralsTable.createdAt})`),

      // Channel breakdown from referral_tracking.utmSource for the period
      db.select({
        source: sql<string>`COALESCE(NULLIF(${referralTrackingTable.utmSource}, ''), 'direto')`,
        visitors: sql<number>`COUNT(DISTINCT ${referralTrackingTable.cookieId})`,
        converted: sql<number>`COUNT(DISTINCT CASE WHEN ${referralTrackingTable.converted} = true THEN ${referralTrackingTable.cookieId} END)`,
      }).from(referralTrackingTable)
        .where(and(
          eq(referralTrackingTable.tenantId, me.tenantId),
          sql`${referralTrackingTable.createdAt} >= ${since}`,
        ))
        .groupBy(sql`COALESCE(NULLIF(${referralTrackingTable.utmSource}, ''), 'direto')`)
        .orderBy(sql`COUNT(DISTINCT ${referralTrackingTable.cookieId}) DESC`)
        .limit(8),

      // ROI — total bonus paid out (all time for tenant)
      db.select({ total: sql<number>`COALESCE(SUM(${referralsTable.bonusAmount}), 0)` })
        .from(referralsTable)
        .where(and(eq(referralsTable.tenantId, me.tenantId), eq(referralsTable.bonusPaid, true))),

      // ROI — revenue from referred reservations (discountReferralCode present, not cancelled)
      db.select({ total: sql<number>`COALESCE(SUM(${reservationsTable.totalValue}), 0)` })
        .from(reservationsTable)
        .where(and(
          eq(reservationsTable.tenantId, me.tenantId),
          sql`${reservationsTable.discountReferralCode} IS NOT NULL`,
          sql`${reservationsTable.status} != 'cancelled'`,
        )),

      // Current calendar month
      db.select({
        referrals: count(),
        conversions: sql<number>`COUNT(*) FILTER (WHERE ${referralsTable.status} = ${REFERRAL_STATUS.COMPLETED})`,
        bonusPaid: sql<number>`COUNT(*) FILTER (WHERE ${referralsTable.bonusPaid} = true)`,
        bonusPaidAmount: sql<number>`COALESCE(SUM(${referralsTable.bonusAmount}) FILTER (WHERE ${referralsTable.bonusPaid} = true), 0)`,
      }).from(referralsTable)
        .where(and(
          eq(referralsTable.tenantId, me.tenantId),
          sql`${referralsTable.createdAt} >= ${currentMonthStart}`,
        )),

      // Previous calendar month
      db.select({
        referrals: count(),
        conversions: sql<number>`COUNT(*) FILTER (WHERE ${referralsTable.status} = ${REFERRAL_STATUS.COMPLETED})`,
        bonusPaid: sql<number>`COUNT(*) FILTER (WHERE ${referralsTable.bonusPaid} = true)`,
        bonusPaidAmount: sql<number>`COALESCE(SUM(${referralsTable.bonusAmount}) FILTER (WHERE ${referralsTable.bonusPaid} = true), 0)`,
      }).from(referralsTable)
        .where(and(
          eq(referralsTable.tenantId, me.tenantId),
          sql`${referralsTable.createdAt} >= ${prevMonthStart}`,
          sql`${referralsTable.createdAt} < ${currentMonthStart}`,
        )),
    ]);

    const [funnelRow] = funnelRow_;
    const [prevRow] = prevRow_;
    const [discountRow] = discountRow_;
    const [roiBonusRow] = roiBonusRow_;
    const [roiRevenueRow] = roiRevenueRow_;
    const [currentMonthRow] = currentMonthRow_;
    const [prevMonthRow] = prevMonthRow_;

    const created = Number(funnelRow?.created ?? 0);
    const converted = Number(funnelRow?.converted ?? 0);
    const conversionRate = created > 0 ? Math.round((converted / created) * 100) : 0;
    const prevCreated = Number(prevRow?.created ?? 0);
    const prevConverted = Number(prevRow?.converted ?? 0);
    const prevConversionRate = prevCreated > 0 ? Math.round((prevConverted / prevCreated) * 100) : 0;

    res.json({
      series: seriesRows.map(r => ({ week: r.week, created: Number(r.created), converted: Number(r.converted) })),
      monthly: monthlyRows.map(r => ({
        month: r.month.slice(0, 7),
        created: Number(r.created),
        converted: Number(r.converted),
        bonusPaid: Number(r.bonusPaid),
      })),
      funnel: {
        created,
        visited: Number(funnelRow?.visited ?? 0),
        converted,
        bonusPaid: Number(funnelRow?.bonusPaid ?? 0),
      },
      channels: channelRows.map(r => ({
        source: r.source,
        visitors: Number(r.visitors),
        converted: Number(r.converted),
      })),
      roi: {
        totalBonusPaid: Number(roiBonusRow?.total ?? 0),
        totalReferredRevenue: Number(roiRevenueRow?.total ?? 0),
      },
      currentMonth: {
        referrals: Number(currentMonthRow?.referrals ?? 0),
        conversions: Number(currentMonthRow?.conversions ?? 0),
        bonusPaid: Number(currentMonthRow?.bonusPaid ?? 0),
        bonusPaidAmount: Number(currentMonthRow?.bonusPaidAmount ?? 0),
      },
      prevMonth: {
        referrals: Number(prevMonthRow?.referrals ?? 0),
        conversions: Number(prevMonthRow?.conversions ?? 0),
        bonusPaid: Number(prevMonthRow?.bonusPaid ?? 0),
        bonusPaidAmount: Number(prevMonthRow?.bonusPaidAmount ?? 0),
      },
      conversionRate,
      prevConversionRate,
      discountGiven: Number(discountRow?.total ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching referral analytics");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/referrals/analytics/export", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const now = new Date();
    let since: Date;

    // Support either explicit startDate/endDate OR the period shortcut
    const startDateParam = req.query.startDate as string | undefined;
    const endDateParam = req.query.endDate as string | undefined;
    if (startDateParam) {
      const parsed = new Date(startDateParam);
      if (isNaN(parsed.getTime())) {
        res.status(400).json({ error: "startDate must be a valid ISO date" });
        return;
      }
      since = parsed;
    } else {
      const period = parseInt((req.query.period as string) || "90", 10);
      if (![30, 90, 180].includes(period)) {
        res.status(400).json({ error: "period must be 30, 90, or 180; or provide startDate/endDate" });
        return;
      }
      since = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
    }
    let until: Date = now;
    if (endDateParam) {
      const parsedEnd = new Date(endDateParam);
      if (isNaN(parsedEnd.getTime())) {
        res.status(400).json({ error: "endDate must be a valid ISO date" });
        return;
      }
      if (parsedEnd < since) {
        res.status(400).json({ error: "endDate must be on or after startDate" });
        return;
      }
      until = parsedEnd;
    }
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [monthlyRows, channelRows, roiBonusRow_, roiRevenueRow_] = await Promise.all([
      // Monthly series for the selected date window (or last 12 months from window end)
      db.select({
        month: sql<string>`date_trunc('month', ${referralsTable.createdAt})::date::text`,
        created: count(),
        converted: sql<number>`COUNT(*) FILTER (WHERE ${referralsTable.status} = ${REFERRAL_STATUS.COMPLETED})`,
        bonusPaid: sql<number>`COUNT(*) FILTER (WHERE ${referralsTable.bonusPaid} = true)`,
        bonusTotal: sql<number>`COALESCE(SUM(${referralsTable.bonusAmount}) FILTER (WHERE ${referralsTable.bonusPaid} = true), 0)`,
      }).from(referralsTable)
        .where(and(
          eq(referralsTable.tenantId, me.tenantId),
          sql`${referralsTable.createdAt} >= ${since}`,
          sql`${referralsTable.createdAt} <= ${until}`,
        ))
        .groupBy(sql`date_trunc('month', ${referralsTable.createdAt})`)
        .orderBy(sql`date_trunc('month', ${referralsTable.createdAt})`),

      // Channel breakdown for the same window
      db.select({
        source: sql<string>`COALESCE(NULLIF(${referralTrackingTable.utmSource}, ''), 'direto')`,
        visitors: sql<number>`COUNT(DISTINCT ${referralTrackingTable.cookieId})`,
        converted: sql<number>`COUNT(DISTINCT CASE WHEN ${referralTrackingTable.converted} = true THEN ${referralTrackingTable.cookieId} END)`,
      }).from(referralTrackingTable)
        .where(and(
          eq(referralTrackingTable.tenantId, me.tenantId),
          sql`${referralTrackingTable.createdAt} >= ${since}`,
          sql`${referralTrackingTable.createdAt} <= ${until}`,
        ))
        .groupBy(sql`COALESCE(NULLIF(${referralTrackingTable.utmSource}, ''), 'direto')`)
        .orderBy(sql`COUNT(DISTINCT ${referralTrackingTable.cookieId}) DESC`),

      // ROI — bonus paid in the window
      db.select({ total: sql<number>`COALESCE(SUM(${referralsTable.bonusAmount}), 0)` })
        .from(referralsTable)
        .where(and(
          eq(referralsTable.tenantId, me.tenantId),
          eq(referralsTable.bonusPaid, true),
          sql`${referralsTable.bonusPaidAt} >= ${since}`,
          sql`${referralsTable.bonusPaidAt} <= ${until}`,
        )),

      // ROI — revenue from referred reservations in the window
      db.select({ total: sql<number>`COALESCE(SUM(${reservationsTable.totalValue}), 0)` })
        .from(reservationsTable)
        .where(and(
          eq(reservationsTable.tenantId, me.tenantId),
          sql`${reservationsTable.discountReferralCode} IS NOT NULL`,
          sql`${reservationsTable.status} != 'cancelled'`,
          sql`${reservationsTable.createdAt} >= ${since}`,
          sql`${reservationsTable.createdAt} <= ${until}`,
        )),
    ]);

    const [roiBonusRow] = roiBonusRow_;
    const [roiRevenueRow] = roiRevenueRow_;

    const CHANNEL_LABEL_MAP: Record<string, string> = {
      whatsapp: "WhatsApp", qr_code: "QR Code", qrcode: "QR Code",
      direct: "Link direto", direto: "Link direto", instagram: "Instagram",
      facebook: "Facebook", email: "E-mail", sms: "SMS",
    };
    const channelLabelFn = (s: string) => CHANNEL_LABEL_MAP[s.toLowerCase()] ?? s;

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "VisiteCRM";

    // Sheet 1: Monthly series
    const wsMonthly = wb.addWorksheet("Série Mensal");
    const monthlyHeaders = ["Mês", "Indicações criadas", "Convertidas", "Bônus pagos", "Total bônus (R$)", "Taxa de conversão (%)"];
    const hRowM = wsMonthly.addRow(monthlyHeaders);
    hRowM.font = { bold: true };
    for (const r of monthlyRows) {
      const monthLabel = r.month.slice(0, 7);
      const cr = Number(r.created);
      const cv = Number(r.converted);
      wsMonthly.addRow([
        monthLabel,
        cr,
        cv,
        Number(r.bonusPaid),
        Number(r.bonusTotal).toFixed(2),
        cr > 0 ? Math.round((cv / cr) * 100) : 0,
      ]);
    }
    monthlyHeaders.forEach((_, i) => { wsMonthly.getColumn(i + 1).width = Math.max(monthlyHeaders[i].length, 16) + 2; });

    // Sheet 2: Channel breakdown
    const wsChannels = wb.addWorksheet("Canais");
    const channelHeaders = ["Canal", "Visitantes únicos", "Conversões", "Taxa de conversão (%)"];
    const hRowC = wsChannels.addRow(channelHeaders);
    hRowC.font = { bold: true };
    for (const r of channelRows) {
      const v = Number(r.visitors);
      const cv = Number(r.converted);
      wsChannels.addRow([channelLabelFn(r.source), v, cv, v > 0 ? Math.round((cv / v) * 100) : 0]);
    }
    channelHeaders.forEach((_, i) => { wsChannels.getColumn(i + 1).width = Math.max(channelHeaders[i].length, 16) + 2; });

    // Sheet 3: ROI summary
    const wsRoi = wb.addWorksheet("ROI");
    wsRoi.addRow(["Métrica", "Valor"]).font = { bold: true };
    wsRoi.addRow(["Bônus total pago (R$)", Number(roiBonusRow?.total ?? 0).toFixed(2)]);
    wsRoi.addRow(["Receita gerada por indicações (R$)", Number(roiRevenueRow?.total ?? 0).toFixed(2)]);
    const roiRatio = Number(roiBonusRow?.total ?? 0) > 0
      ? (Number(roiRevenueRow?.total ?? 0) / Number(roiBonusRow?.total ?? 0)).toFixed(2)
      : "—";
    wsRoi.addRow(["ROI (receita / bônus)", roiRatio]);
    wsRoi.getColumn(1).width = 36;
    wsRoi.getColumn(2).width = 20;

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `analytics-indicacoes-${dateStr}.xlsx`;
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(buf));
  } catch (err) {
    req.log.error({ err }, "Error exporting referral analytics");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/referrals/export", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const format = (req.query.format as string | undefined) ?? "csv";
    if (!["csv", "xlsx", "json"].includes(format)) {
      res.status(400).json({ error: "format must be csv, xlsx, or json" });
      return;
    }

    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const bonusPaidParam = req.query.bonusPaid as string | undefined;
    const fraudFlagParam = req.query.fraudFlag as string | undefined;
    const expiringSoonParam = req.query.expiringSoon as string | undefined;

    const conditions = [eq(referralsTable.tenantId, me.tenantId)];
    if (status && status !== "all") conditions.push(eq(referralsTable.status, status));
    if (bonusPaidParam === "false") conditions.push(eq(referralsTable.bonusPaid, false));
    if (fraudFlagParam === "true") conditions.push(eq(referralsTable.fraudFlag, true));
    if (expiringSoonParam === "true") {
      const nowDate = new Date();
      const sevenDays = new Date(nowDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      conditions.push(
        and(
          eq(referralsTable.status, REFERRAL_STATUS.PENDING),
          sql`${referralsTable.expiresAt} > NOW()`,
          sql`${referralsTable.expiresAt} <= ${sevenDays}`,
        )!,
      );
    }
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

    const rows = await db.select({
      ...getTableColumns(referralsTable),
      referrerClientName: clientsTable.name,
      referrerClientEmail: clientsTable.email,
    }).from(referralsTable)
      .leftJoin(clientsTable, and(
        eq(referralsTable.referrerId, clientsTable.id),
        eq(clientsTable.tenantId, me.tenantId),
      ))
      .where(and(...conditions))
      .orderBy(desc(referralsTable.createdAt));

    const STATUS_MAP: Record<string, string> = {
      pending: "Pendente",
      completed: "Convertida",
      expired: "Expirada",
      converted: "Convertida",
      reversed: "Revertida",
    };

    const headers = [
      "Código", "Indicador", "E-mail Indicador", "Indicado", "E-mail Indicado",
      "Status", "Bônus (R$)", "Desconto (R$)", "Bônus Pago", "Visitas", "Última visita",
      "Criado em", "Convertido em", "Expira em", "Motivo (suspeita)",
    ];

    const dataRows = rows.map(r => [
      r.code,
      r.referrerClientName ?? r.referrerName ?? "",
      r.referrerClientEmail ?? r.referrerEmail ?? "",
      r.referredName ?? "",
      r.referredEmail ?? "",
      STATUS_MAP[r.status] ?? r.status,
      r.bonusAmount ? parseFloat(String(r.bonusAmount)).toFixed(2) : "0.00",
      r.discountAmount ? parseFloat(String(r.discountAmount)).toFixed(2) : "0.00",
      r.bonusPaid ? "Sim" : "Não",
      String(r.visitsCount ?? 0),
      r.lastVisit ? new Date(r.lastVisit).toLocaleDateString("pt-BR") : "",
      r.createdAt ? new Date(r.createdAt).toLocaleDateString("pt-BR") : "",
      r.convertedAt ? new Date(r.convertedAt).toLocaleDateString("pt-BR") : "",
      r.expiresAt ? new Date(r.expiresAt).toLocaleDateString("pt-BR") : "",
      r.fraudReason ?? "",
    ]);

    const dateStr = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      const jsonData = rows.map(r => ({
        code: r.code,
        referrerName: r.referrerClientName ?? r.referrerName ?? "",
        referrerEmail: r.referrerClientEmail ?? r.referrerEmail ?? "",
        referredName: r.referredName ?? "",
        referredEmail: r.referredEmail ?? "",
        status: STATUS_MAP[r.status] ?? r.status,
        bonusAmount: r.bonusAmount ? parseFloat(String(r.bonusAmount)).toFixed(2) : "0.00",
        discountAmount: r.discountAmount ? parseFloat(String(r.discountAmount)).toFixed(2) : "0.00",
        bonusPaid: r.bonusPaid ? "Sim" : "Não",
        visitsCount: r.visitsCount ?? 0,
        lastVisit: r.lastVisit ? new Date(r.lastVisit).toLocaleDateString("pt-BR") : "",
        createdAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString("pt-BR") : "",
        convertedAt: r.convertedAt ? new Date(r.convertedAt).toLocaleDateString("pt-BR") : "",
        expiresAt: r.expiresAt ? new Date(r.expiresAt).toLocaleDateString("pt-BR") : "",
        fraudReason: r.fraudReason ?? "",
      }));
      res.json({ headers, rows: jsonData });
      return;
    }

    if (format === "xlsx") {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "VisiteCRM";
      const ws = wb.addWorksheet("Indicações");
      const headerRow = ws.addRow(headers);
      headerRow.font = { bold: true };
      for (const row of dataRows) ws.addRow(row);
      headers.forEach((h, i) => {
        ws.getColumn(i + 1).width = Math.max(h.length, ...dataRows.map(r => String(r[i] ?? "").length)) + 2;
      });
      const buf = await wb.xlsx.writeBuffer();
      const filename = `indicacoes-${dateStr}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(buf));
      return;
    }

    const csv = [headers, ...dataRows]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const filename = `indicacoes-${dateStr}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  } catch (err) {
    req.log.error({ err }, "Error exporting referrals");
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
        tiersConfig: DEFAULT_TIERS_CONFIG,
        whatsappEnabled: false,
        whatsappPhoneNumber: null,
        whatsappConvertedMessage: null,
        whatsappBonusPaidMessage: null,
        expiryWarning7DaysEnabled: true,
        expiryWarning1DayEnabled: true,
        bonusReleaseEmailEnabled: true,
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
      bonusReleaseEmailEnabled: z.boolean().optional(),
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
    if (parsed.data.bonusReleaseEmailEnabled != null) updates.bonusReleaseEmailEnabled = parsed.data.bonusReleaseEmailEnabled;

    const [existing] = await db.select({
      id: referralSettingsTable.id,
      expirationDays: referralSettingsTable.expirationDays,
    }).from(referralSettingsTable).where(eq(referralSettingsTable.tenantId, me.tenantId)).limit(1);

    const expirationDaysChanged = parsed.data.expirationDays != null && (
      !existing || parsed.data.expirationDays !== existing.expirationDays
    );

    const savedSettings = await db.transaction(async (tx) => {
      let result: typeof referralSettingsTable.$inferSelect | undefined;
      if (!existing) {
        const id = generateId();
        await tx.insert(referralSettingsTable).values({
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
          bonusReleaseEmailEnabled: (updates.bonusReleaseEmailEnabled as boolean | undefined) ?? true,
        });
        [result] = await tx.select().from(referralSettingsTable)
          .where(eq(referralSettingsTable.id, id)).limit(1);
      } else {
        await tx.update(referralSettingsTable).set(updates as Partial<typeof referralSettingsTable.$inferInsert>)
          .where(eq(referralSettingsTable.tenantId, me.tenantId));
        [result] = await tx.select().from(referralSettingsTable)
          .where(eq(referralSettingsTable.tenantId, me.tenantId)).limit(1);
      }

      if (expirationDaysChanged) {
        const newDays = parsed.data.expirationDays!;
        await tx.update(referralsTable)
          .set({
            expiresAt: sql`${referralsTable.createdAt} + (${newDays}::integer * interval '1 day')`,
            expiryWarning7SentAt: null,
            expiryWarning1SentAt: null,
            updatedAt: new Date(),
          })
          .where(and(
            eq(referralsTable.tenantId, me.tenantId),
            eq(referralsTable.status, REFERRAL_STATUS.PENDING),
          ));
      }

      return result;
    });

    res.json(savedSettings);
  } catch (err) {
    req.log.error({ err }, "Error updating referral settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/referrals/campaigns", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const campaigns = await db.select().from(referralCampaignsTable)
      .where(eq(referralCampaignsTable.tenantId, me.tenantId))
      .orderBy(desc(referralCampaignsTable.startsAt));

    if (campaigns.length === 0) { res.json([]); return; }

    // Single grouped query for all campaign stats to avoid N+1
    const statsRows = await db.select({
      campaignId: sql<string>`
        (SELECT c2.id FROM referral_campaigns c2
         WHERE c2.tenant_id = ${me.tenantId}
           AND ${referralsTable.convertedAt} >= c2.starts_at
           AND ${referralsTable.convertedAt} < c2.ends_at
         LIMIT 1)
      `,
      referralsCount: count(),
      bonusPaidAmount: sql<number>`COALESCE(SUM(${referralsTable.bonusAmount}) FILTER (WHERE ${referralsTable.bonusPaid} = true), 0)`,
    })
    .from(referralsTable)
    .where(and(
      eq(referralsTable.tenantId, me.tenantId),
      eq(referralsTable.status, REFERRAL_STATUS.COMPLETED),
      sql`EXISTS (
        SELECT 1 FROM referral_campaigns c2
        WHERE c2.tenant_id = ${me.tenantId}
          AND ${referralsTable.convertedAt} >= c2.starts_at
          AND ${referralsTable.convertedAt} < c2.ends_at
      )`,
    ))
    .groupBy(sql`
      (SELECT c2.id FROM referral_campaigns c2
       WHERE c2.tenant_id = ${me.tenantId}
         AND ${referralsTable.convertedAt} >= c2.starts_at
         AND ${referralsTable.convertedAt} < c2.ends_at
       LIMIT 1)
    `);

    const statsMap = new Map(statsRows.map((r) => [r.campaignId, r]));

    const result = campaigns.map((c) => {
      const stats = statsMap.get(c.id);
      return {
        ...c,
        bonusValue: Number(c.bonusValue),
        referralsCount: Number(stats?.referralsCount ?? 0),
        bonusPaidAmount: Number(stats?.bonusPaidAmount ?? 0),
      };
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing referral campaigns");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/referrals/campaigns", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const parsed = z.object({
      name: z.string().min(1).max(120),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      bonusType: z.enum(["multiplier", "fixed_extra"]),
      bonusValue: z.number().positive(),
      bannerText: z.string().max(500).optional(),
    }).refine(
      (d) => d.bonusType !== "multiplier" || d.bonusValue >= 1,
      { message: "Multiplicador deve ser ≥ 1 para não reduzir o bônus base", path: ["bonusValue"] },
    ).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const starts = new Date(parsed.data.startsAt);
    const ends = new Date(parsed.data.endsAt);
    if (ends <= starts) {
      res.status(400).json({ error: "endsAt deve ser após startsAt" }); return;
    }

    const [overlap] = await db.select({ id: referralCampaignsTable.id })
      .from(referralCampaignsTable)
      .where(and(
        eq(referralCampaignsTable.tenantId, me.tenantId),
        sql`${referralCampaignsTable.startsAt} < ${ends}`,
        sql`${referralCampaignsTable.endsAt} > ${starts}`,
      ))
      .limit(1);
    if (overlap) {
      res.status(409).json({ error: "Já existe uma campanha nesse período. Apenas uma campanha pode estar ativa por vez." });
      return;
    }

    const id = generateId();
    await db.insert(referralCampaignsTable).values({
      id,
      tenantId: me.tenantId,
      name: parsed.data.name,
      startsAt: starts,
      endsAt: ends,
      bonusType: parsed.data.bonusType,
      bonusValue: parsed.data.bonusValue.toFixed(4),
      bannerText: parsed.data.bannerText ?? null,
    });

    const [campaign] = await db.select().from(referralCampaignsTable)
      .where(eq(referralCampaignsTable.id, id)).limit(1);
    res.status(201).json({ ...campaign!, bonusValue: Number(campaign!.bonusValue) });
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23P01") {
      res.status(409).json({ error: "Já existe uma campanha nesse período. Apenas uma campanha pode estar ativa por vez." });
      return;
    }
    req.log.error({ err }, "Error creating referral campaign");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/referrals/campaigns/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const [existing] = await db.select({ id: referralCampaignsTable.id })
      .from(referralCampaignsTable)
      .where(and(
        eq(referralCampaignsTable.id, req.params.id),
        eq(referralCampaignsTable.tenantId, me.tenantId),
      ))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Campanha não encontrada" }); return; }

    await db.delete(referralCampaignsTable)
      .where(and(
        eq(referralCampaignsTable.id, req.params.id),
        eq(referralCampaignsTable.tenantId, me.tenantId),
      ));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting referral campaign");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/referrals/campaigns/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }

    const [existing] = await db.select().from(referralCampaignsTable)
      .where(and(
        eq(referralCampaignsTable.id, req.params.id),
        eq(referralCampaignsTable.tenantId, me.tenantId),
      ))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Campanha não encontrada" }); return; }

    const parsed = z.object({
      name: z.string().min(1).max(120).optional(),
      startsAt: z.string().datetime().optional(),
      endsAt: z.string().datetime().optional(),
      bonusType: z.enum(["multiplier", "fixed_extra"]).optional(),
      bonusValue: z.number().positive().optional(),
      bannerText: z.string().max(500).nullable().optional(),
    }).refine(
      (d) => {
        const effectiveType = d.bonusType ?? existing.bonusType;
        const effectiveVal = d.bonusValue ?? Number(existing.bonusValue);
        return effectiveType !== "multiplier" || effectiveVal >= 1;
      },
      { message: "Multiplicador deve ser ≥ 1 para não reduzir o bônus base", path: ["bonusValue"] },
    ).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const starts = parsed.data.startsAt ? new Date(parsed.data.startsAt) : new Date(existing.startsAt);
    const ends = parsed.data.endsAt ? new Date(parsed.data.endsAt) : new Date(existing.endsAt);
    if (ends <= starts) { res.status(400).json({ error: "endsAt deve ser após startsAt" }); return; }

    const [overlap] = await db.select({ id: referralCampaignsTable.id })
      .from(referralCampaignsTable)
      .where(and(
        eq(referralCampaignsTable.tenantId, me.tenantId),
        sql`${referralCampaignsTable.id} != ${req.params.id}`,
        sql`${referralCampaignsTable.startsAt} < ${ends}`,
        sql`${referralCampaignsTable.endsAt} > ${starts}`,
      ))
      .limit(1);
    if (overlap) {
      res.status(409).json({ error: "Já existe uma campanha nesse período. Apenas uma campanha pode estar ativa por vez." });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.startsAt !== undefined) updates.startsAt = starts;
    if (parsed.data.endsAt !== undefined) updates.endsAt = ends;
    if (parsed.data.bonusType !== undefined) updates.bonusType = parsed.data.bonusType;
    if (parsed.data.bonusValue !== undefined) updates.bonusValue = parsed.data.bonusValue.toFixed(4);
    if (parsed.data.bannerText !== undefined) updates.bannerText = parsed.data.bannerText;

    await db.update(referralCampaignsTable)
      .set(updates)
      .where(and(
        eq(referralCampaignsTable.id, req.params.id),
        eq(referralCampaignsTable.tenantId, me.tenantId),
      ));

    const [updated] = await db.select().from(referralCampaignsTable)
      .where(eq(referralCampaignsTable.id, req.params.id)).limit(1);
    res.json({ ...updated!, bonusValue: Number(updated!.bonusValue) });
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23P01") {
      res.status(409).json({ error: "Já existe uma campanha nesse período. Apenas uma campanha pode estar ativa por vez." });
      return;
    }
    req.log.error({ err }, "Error updating referral campaign");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/referrals/active-campaign", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const now = new Date();
    const [campaign] = await db.select().from(referralCampaignsTable)
      .where(and(
        eq(referralCampaignsTable.tenantId, me.tenantId),
        sql`${referralCampaignsTable.startsAt} <= ${now}`,
        sql`${referralCampaignsTable.endsAt} > ${now}`,
      ))
      .orderBy(desc(referralCampaignsTable.startsAt))
      .limit(1);

    if (!campaign) { res.json(null); return; }
    res.json({ ...campaign, bonusValue: Number(campaign.bonusValue) });
  } catch (err) {
    req.log.error({ err }, "Error fetching active referral campaign");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
