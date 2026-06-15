import { Router, type NextFunction } from "express";
import { computeReferralTier } from "../lib/referral-tiers";
import { db } from "@workspace/db";
import {
  clientsTable,
  reservationsTable,
  tripsTable,
  usersTable,
  referralsTable,
  referralSettingsTable,
  tenantsTable,
  loyaltyProgramsTable,
  loyaltyMembersTable,
  loyaltyTransactionsTable,
  clientNotificationsTable,
  clientNpsResponsesTable,
  clientFavoritesTable,
  storeProductsTable,
  storesTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql, inArray, gt, count, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../lib/tenant";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";
import { ROLES, REFERRAL_STATUS, RESERVATION_STATUS } from "@workspace/permissions";
import { generateVoucherPdf } from "../lib/voucher-pdf";
import { getPdfQueue } from "../queues/index";
import { generateId, generateReferralCode } from "../lib/id";
import { generateAndAssignReferralCode } from "../lib/referral-code";
import { dispatchReferralWelcomeEmail } from "../queues/email-helpers";
import { addClientSseConnection, removeClientSseConnection } from "../lib/client-sse";
import { getRecentNotifications, getUnreadCount, markAllRead } from "../lib/client-notifications";

const router = Router();

async function findClientRecord(tenantId: string, userId: string, email: string) {
  let [client] = await db
    .select()
    .from(clientsTable)
    .where(and(eq(clientsTable.tenantId, tenantId), eq(clientsTable.userId, userId)))
    .limit(1);

  if (!client) {
    [client] = await db
      .select()
      .from(clientsTable)
      .where(and(eq(clientsTable.tenantId, tenantId), eq(clientsTable.email, email)))
      .limit(1);

    if (client && !client.userId) {
      await db
        .update(clientsTable)
        .set({ userId })
        .where(eq(clientsTable.id, client.id));
      client = { ...client, userId };
    }
  }

  return client ?? null;
}

router.get("/client/me", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (me.role !== ROLES.CLIENT) {
      next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE"));
      return;
    }

    const [user] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        cpf: usersTable.cpf,
        referralCode: usersTable.referralCode,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, me.id))
      .limit(1);

    const [tenant] = await db
      .select({
        id: tenantsTable.id,
        name: tenantsTable.name,
        slug: tenantsTable.slug,
        logoUrl: tenantsTable.logoUrl,
        primaryColor: tenantsTable.primaryColor,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, me.tenantId))
      .limit(1);

    const client = await findClientRecord(me.tenantId, me.id, me.email);

    let reservations: unknown[] = [];
    let referralStats: {
      code: string | null;
      totalReferrals: number;
      completedReferrals: number;
      pendingReferrals: number;
      totalEarnings: string;
      creditBalance: string;
      shareMessage: string | null;
      currentTierLevel: string;
      currentTierLabel: string;
      currentTierMultiplier: number;
      tierProgress: number;
      nextTierMin: number | null;
      nextTierLabel: string | null;
    } = {
      code: client?.referralCode ?? null,
      totalReferrals: 0,
      completedReferrals: 0,
      pendingReferrals: 0,
      totalEarnings: "0.00",
      creditBalance: "0.00",
      shareMessage: null,
      currentTierLevel: "bronze",
      currentTierLabel: "Bronze",
      currentTierMultiplier: 1,
      tierProgress: 0,
      nextTierMin: 5,
      nextTierLabel: "Prata",
    };
    let stats = { totalSpent: 0 };
    let loyalty: unknown = null;

    if (client) {
      // Auto-generate and persist a referral code if the client doesn't have one yet.
      // This ensures the code shared via the landing page is always findable in
      // clientsTable by /public/store/:slug/referral/info and /referral/validate.
      let resolvedReferralCode = client.referralCode;
      if (!resolvedReferralCode) {
        try {
          const year = new Date().getFullYear();
          const namePart = (client.name ?? "REF").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4) || "REF";
          const baseCode = generateReferralCode(client.name ?? "REF", me.tenantId);
          resolvedReferralCode = await generateAndAssignReferralCode(client.id, me.tenantId, baseCode, namePart, year);

          if (resolvedReferralCode) {
            dispatchReferralWelcomeEmail({
              clientId: client.id,
              referralCode: resolvedReferralCode,
              tenantId: me.tenantId,
              tenantSlug: tenant?.slug ?? undefined,
            }).catch((err: unknown) => {
              console.warn("[client-portal] Failed to dispatch referral welcome email:", err instanceof Error ? err.message : String(err));
            });
          }
        } catch {
          // Non-critical — the client portal still loads; the share button will be hidden until next visit resolves
        }
      }

      const rows = await db
        .select({
          id: reservationsTable.id,
          reservationNumber: reservationsTable.reservationNumber,
          status: reservationsTable.status,
          voucherCode: reservationsTable.voucherCode,
          totalValue: reservationsTable.totalValue,
          paidValue: reservationsTable.paidValue,
          paymentMethod: reservationsTable.paymentMethod,
          storeOrderId: reservationsTable.storeOrderId,
          createdAt: reservationsTable.createdAt,
          seats: reservationsTable.seats,
          boardingLocationId: reservationsTable.boardingLocationId,
          tripName: tripsTable.name,
          tripDestination: tripsTable.destination,
          tripDepartureDate: tripsTable.departureDate,
          tripReturnDate: tripsTable.returnDate,
          tripType: tripsTable.type,
          tripBoardingPoints: tripsTable.boardingPoints,
        })
        .from(reservationsTable)
        .innerJoin(tripsTable, eq(reservationsTable.tripId, tripsTable.id))
        .where(
          and(
            eq(reservationsTable.clientId, client.id),
            eq(reservationsTable.tenantId, me.tenantId),
          ),
        )
        .orderBy(asc(tripsTable.departureDate), desc(reservationsTable.createdAt));

      const reservationIds = rows.map((r) => r.id);
      let npsSubmittedSet = new Set<string>();
      if (reservationIds.length > 0) {
        const npsRows = await db
          .select({ reservationId: clientNpsResponsesTable.reservationId })
          .from(clientNpsResponsesTable)
          .where(inArray(clientNpsResponsesTable.reservationId, reservationIds));
        npsSubmittedSet = new Set(npsRows.map((r) => r.reservationId));
      }

      reservations = rows.map((r) => {
        const total = Number(r.totalValue);
        const paid = Number(r.paidValue);
        const boardingPoints = Array.isArray(r.tripBoardingPoints) ? r.tripBoardingPoints : [];
        const boardingPoint = r.boardingLocationId
          ? boardingPoints.find((bp: { id: string; name: string; time: string; address: string }) => bp.id === r.boardingLocationId)
          : null;
        return {
          ...r,
          totalValue: total,
          paidValue: paid,
          balance: Math.max(total - paid, 0),
          seatsCount: Array.isArray(r.seats) ? r.seats.length : 0,
          seats: undefined,
          boardingLocationId: undefined,
          tripBoardingPoints: undefined,
          boardingPointName: boardingPoint?.name ?? null,
          boardingPointTime: boardingPoint?.time ?? null,
          tripDepartureDate: r.tripDepartureDate
            ? (r.tripDepartureDate as unknown as Date).toISOString().slice(0, 10)
            : null,
          tripReturnDate: r.tripReturnDate
            ? (r.tripReturnDate as unknown as Date).toISOString().slice(0, 10)
            : null,
          createdAt: r.createdAt.toISOString(),
          npsSubmitted: npsSubmittedSet.has(r.id),
        };
      });

      const totalSpentRows = await db
        .select({ total: sql<string>`COALESCE(SUM(paid_value), '0')` })
        .from(reservationsTable)
        .where(
          and(
            eq(reservationsTable.clientId, client.id),
            eq(reservationsTable.tenantId, me.tenantId),
            inArray(reservationsTable.status, [
              RESERVATION_STATUS.CONFIRMED,
              RESERVATION_STATUS.COMPLETED,
            ]),
          ),
        );
      stats = { totalSpent: Number(totalSpentRows[0]?.total ?? 0) };

      const refRows = await db
        .select({
          status: referralsTable.status,
          cnt: sql<number>`COUNT(*)`,
          total: sql<string>`COALESCE(SUM(bonus_amount), '0')`,
        })
        .from(referralsTable)
        .where(
          and(
            eq(referralsTable.tenantId, me.tenantId),
            eq(referralsTable.referrerId, client.id),
          ),
        )
        .groupBy(referralsTable.status);

      let totalReferrals = 0;
      let completedReferrals = 0;
      let pendingReferrals = 0;
      let totalEarnings = 0;

      for (const row of refRows) {
        totalReferrals += Number(row.cnt);
        if (row.status === REFERRAL_STATUS.COMPLETED || row.status === REFERRAL_STATUS.CONVERTED) {
          completedReferrals += Number(row.cnt);
          totalEarnings += Number(row.total);
        }
        if (row.status === REFERRAL_STATUS.PENDING) pendingReferrals = Number(row.cnt);
      }

      const [refCreditRow] = await db
        .select({
          balance: sql<string>`COALESCE(SUM(${referralsTable.bonusAmount} - COALESCE(${referralsTable.bonusCreditUsedAmount}, 0)), '0')`,
        })
        .from(referralsTable)
        .where(
          and(
            eq(referralsTable.tenantId, me.tenantId),
            eq(referralsTable.referrerId, client.id),
            inArray(referralsTable.status, [REFERRAL_STATUS.COMPLETED, REFERRAL_STATUS.CONVERTED]),
            eq(referralsTable.bonusPaid, false),
            // Rows that still have remaining credit (not yet fully consumed)
            sql`${referralsTable.bonusAmount} > COALESCE(${referralsTable.bonusCreditUsedAmount}, 0)`,
          ),
        );
      const referralCreditBalance = Math.max(0, Number(refCreditRow?.balance ?? 0));

      const [refSettings] = await db
        .select({
          shareMessage: referralSettingsTable.shareMessage,
          tiersConfig: referralSettingsTable.tiersConfig,
        })
        .from(referralSettingsTable)
        .where(eq(referralSettingsTable.tenantId, me.tenantId))
        .limit(1);

      const { tier: currentTier, nextTier, progress: tierProgress } = computeReferralTier(
        completedReferrals,
        refSettings?.tiersConfig ?? null,
      );

      referralStats = {
        code: resolvedReferralCode ?? null,
        totalReferrals,
        completedReferrals,
        pendingReferrals,
        totalEarnings: totalEarnings.toFixed(2),
        creditBalance: referralCreditBalance.toFixed(2),
        shareMessage: refSettings?.shareMessage ?? null,
        currentTierLevel: currentTier.level,
        currentTierLabel: currentTier.label,
        currentTierMultiplier: currentTier.bonusMultiplier,
        tierProgress,
        nextTierMin: nextTier?.minReferrals ?? null,
        nextTierLabel: nextTier?.label ?? null,
      };

      const [loyaltyProgram] = await db
        .select()
        .from(loyaltyProgramsTable)
        .where(
          and(
            eq(loyaltyProgramsTable.tenantId, me.tenantId),
            eq(loyaltyProgramsTable.isActive, true),
          ),
        )
        .limit(1);

      if (loyaltyProgram) {
        const [member] = await db
          .select()
          .from(loyaltyMembersTable)
          .where(
            and(
              eq(loyaltyMembersTable.tenantId, me.tenantId),
              eq(loyaltyMembersTable.programId, loyaltyProgram.id),
              eq(loyaltyMembersTable.clientId, client.id),
            ),
          )
          .limit(1);

        if (member) {
          const transactions = await db
            .select()
            .from(loyaltyTransactionsTable)
            .where(eq(loyaltyTransactionsTable.memberId, member.id))
            .orderBy(desc(loyaltyTransactionsTable.createdAt))
            .limit(20);

          loyalty = {
            availablePoints: member.availablePoints,
            totalPoints: member.totalPoints,
            tier: member.tier,
            programName: loyaltyProgram.name,
            pointsPerReal: Number(loyaltyProgram.pointsPerReal),
            realPerPoint: Number(loyaltyProgram.realPerPoint),
            minRedeemPoints: loyaltyProgram.minRedeemPoints,
            tierBenefits: loyaltyProgram.tierBenefits ?? null,
            recentTransactions: transactions.map((t) => ({
              id: t.id,
              type: t.type,
              points: t.points,
              description: t.description,
              createdAt: t.createdAt.toISOString(),
            })),
          };
        } else {
          loyalty = {
            availablePoints: 0,
            totalPoints: 0,
            tier: "bronze",
            programName: loyaltyProgram.name,
            pointsPerReal: Number(loyaltyProgram.pointsPerReal),
            realPerPoint: Number(loyaltyProgram.realPerPoint),
            minRedeemPoints: loyaltyProgram.minRedeemPoints,
            tierBenefits: loyaltyProgram.tierBenefits ?? null,
            recentTransactions: [],
          };
        }
      }
    }

    res.json({
      user: user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            cpf: user.cpf,
            referralCode: user.referralCode,
            createdAt: user.createdAt?.toISOString() ?? null,
          }
        : null,
      client: client
        ? {
            id: client.id,
            name: client.name,
            email: client.email,
            phone: client.phone,
            cpf: client.cpf,
            birthDate: client.birthDate
              ? (client.birthDate as unknown as Date).toISOString().slice(0, 10)
              : null,
            addressCity: client.addressCity,
            addressState: client.addressState,
            referralCode: client.referralCode,
            musicalPreferences: client.musicalPreferences ?? null,
            favoriteDrink: client.favoriteDrink ?? null,
            dreamDestinations: client.dreamDestinations ?? [],
            foodPreferences: client.foodPreferences ?? null,
            travelPreference: client.travelPreference ?? null,
            travelInterests: client.travelInterests ?? [],
            likesPhotosVideos: client.likesPhotosVideos ?? null,
            preferredDestinationTypes: client.preferredDestinationTypes ?? [],
          }
        : null,
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            logoUrl: tenant.logoUrl,
            primaryColor: tenant.primaryColor ?? "#3B82F6",
          }
        : null,
      reservations,
      referral: referralStats,
      stats,
      loyalty,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/client/me/preferences", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.CLIENT) {
      next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE"));
      return;
    }
    const body = z.object({
      musicalPreferences: z.string().max(500).nullable().optional(),
      favoriteDrink: z.string().max(200).nullable().optional(),
      dreamDestinations: z.array(z.string().max(200)).max(20).optional(),
      foodPreferences: z.string().max(500).nullable().optional(),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      travelInterests: z.array(z.string().max(100)).max(20).optional(),
      likesPhotosVideos: z.boolean().nullable().optional(),
      preferredDestinationTypes: z.array(z.string().max(100)).max(20).optional(),
      travelPreference: z.string().max(200).nullable().optional(),
    }).safeParse(req.body);
    if (!body.success) {
      next(new ValidationError(String(body.error.message)));
      return;
    }
    const client = await findClientRecord(me.tenantId, me.id, me.email);
    if (!client) {
      next(new NotFoundError("Perfil de cliente não encontrado", "NOT_FOUND"));
      return;
    }
    const updates: Record<string, unknown> = {};
    if (body.data.musicalPreferences !== undefined) updates.musicalPreferences = body.data.musicalPreferences;
    if (body.data.favoriteDrink !== undefined) updates.favoriteDrink = body.data.favoriteDrink;
    if (body.data.dreamDestinations !== undefined) updates.dreamDestinations = body.data.dreamDestinations;
    if (body.data.foodPreferences !== undefined) updates.foodPreferences = body.data.foodPreferences;
    if (body.data.birthDate !== undefined) {
      updates.birthDate = body.data.birthDate ? new Date(body.data.birthDate) : null;
    }
    if (body.data.travelInterests !== undefined) updates.travelInterests = body.data.travelInterests;
    if (body.data.likesPhotosVideos !== undefined) updates.likesPhotosVideos = body.data.likesPhotosVideos;
    if (body.data.preferredDestinationTypes !== undefined) updates.preferredDestinationTypes = body.data.preferredDestinationTypes;
    if (body.data.travelPreference !== undefined) updates.travelPreference = body.data.travelPreference;

    if (Object.keys(updates).length > 0) {
      await db
        .update(clientsTable)
        .set(updates)
        .where(and(eq(clientsTable.id, client.id), eq(clientsTable.tenantId, me.tenantId)));
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const LOYALTY_TIER_THRESHOLDS = [
  { tier: "bronze", min: 0, next: 500, nextLabel: "Prata" },
  { tier: "silver", min: 500, next: 2000, nextLabel: "Ouro" },
  { tier: "gold", min: 2000, next: 5000, nextLabel: "Diamante" },
  { tier: "diamond", min: 5000, next: null, nextLabel: null },
] as const;

router.get("/client/me/loyalty", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.CLIENT) {
      next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE"));
      return;
    }

    const client = await findClientRecord(me.tenantId, me.id, me.email);
    if (!client) { res.json(null); return; }

    const [loyaltyProgram] = await db
      .select()
      .from(loyaltyProgramsTable)
      .where(and(eq(loyaltyProgramsTable.tenantId, me.tenantId), eq(loyaltyProgramsTable.isActive, true)))
      .limit(1);

    if (!loyaltyProgram) { res.json(null); return; }

    const [member] = await db
      .select()
      .from(loyaltyMembersTable)
      .where(and(
        eq(loyaltyMembersTable.tenantId, me.tenantId),
        eq(loyaltyMembersTable.programId, loyaltyProgram.id),
        eq(loyaltyMembersTable.clientId, client.id),
      ))
      .limit(1);

    const totalPoints = member?.totalPoints ?? 0;
    const currentTierKey = member?.tier ?? "bronze";
    const tierInfo = LOYALTY_TIER_THRESHOLDS.find((t) => t.tier === currentTierKey) ?? LOYALTY_TIER_THRESHOLDS[0];
    const pointsToNext = tierInfo.next !== null ? Math.max(tierInfo.next - totalPoints, 0) : 0;

    res.json({
      availablePoints: member?.availablePoints ?? 0,
      totalPoints,
      tier: currentTierKey,
      nextTier: tierInfo.nextLabel,
      pointsToNext,
      programName: loyaltyProgram.name,
      pointsPerReal: Number(loyaltyProgram.pointsPerReal),
      realPerPoint: Number(loyaltyProgram.realPerPoint),
      minRedeemPoints: loyaltyProgram.minRedeemPoints,
      tierBenefits: loyaltyProgram.tierBenefits ?? null,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/client/me/loyalty/transactions", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.CLIENT) {
      next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE"));
      return;
    }
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 50;
    const offset = (page - 1) * limit;

    const client = await findClientRecord(me.tenantId, me.id, me.email);
    if (!client) {
      res.json({ data: [], hasMore: false, total: 0 });
      return;
    }

    const [loyaltyProgram] = await db
      .select({ id: loyaltyProgramsTable.id })
      .from(loyaltyProgramsTable)
      .where(and(eq(loyaltyProgramsTable.tenantId, me.tenantId), eq(loyaltyProgramsTable.isActive, true)))
      .limit(1);

    if (!loyaltyProgram) {
      res.json({ data: [], hasMore: false, total: 0 });
      return;
    }

    const [member] = await db
      .select({ id: loyaltyMembersTable.id, availablePoints: loyaltyMembersTable.availablePoints })
      .from(loyaltyMembersTable)
      .where(and(
        eq(loyaltyMembersTable.tenantId, me.tenantId),
        eq(loyaltyMembersTable.programId, loyaltyProgram.id),
        eq(loyaltyMembersTable.clientId, client.id),
      ))
      .limit(1);

    if (!member) {
      res.json({ data: [], hasMore: false, total: 0 });
      return;
    }

    const [totalRow] = await db
      .select({ cnt: count() })
      .from(loyaltyTransactionsTable)
      .where(eq(loyaltyTransactionsTable.memberId, member.id));
    const total = Number(totalRow?.cnt ?? 0);

    // Fetch with running balance: balance AFTER each transaction.
    // Earn/bonus transactions add to balance (+points), redeem/expire subtract (-points).
    // running_balance(T) = availablePoints - SUM(signed_delta) of all transactions newer than T.
    const rows = await db.execute(
      sql`SELECT
          t.id, t.type, t.points, t.description, t.reference_id, t.reference_type, t.created_at,
          (${member.availablePoints} - COALESCE((
            SELECT SUM(CASE WHEN lt2.type IN ('redeem', 'expire') THEN -lt2.points ELSE lt2.points END)
            FROM loyalty_transactions lt2
            WHERE lt2.member_id = ${member.id} AND lt2.created_at > t.created_at
          ), 0)) AS running_balance
        FROM loyalty_transactions t
        WHERE t.member_id = ${member.id}
        ORDER BY t.created_at DESC
        LIMIT ${limit} OFFSET ${offset}`
    );

    res.json({
      data: (rows.rows as Record<string, unknown>[]).map((t) => ({
        id: t.id as string,
        type: t.type as string,
        points: Number(t.points),
        description: t.description as string,
        referenceId: t.reference_id as string | null,
        referenceType: t.reference_type as string | null,
        runningBalance: Number(t.running_balance),
        createdAt: t.created_at instanceof Date
          ? t.created_at.toISOString()
          : String(t.created_at),
      })),
      hasMore: offset + limit < total,
      total,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/client/me/loyalty/redeem", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.CLIENT) {
      next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE"));
      return;
    }

    const body = z.object({
      reservationId: z.string().min(1),
      pointsToRedeem: z.number().int().positive(),
    }).safeParse(req.body);
    if (!body.success) {
      next(new ValidationError(String(body.error.message)));
      return;
    }

    const client = await findClientRecord(me.tenantId, me.id, me.email);
    if (!client) {
      next(new NotFoundError("Perfil de cliente não encontrado", "NOT_FOUND"));
      return;
    }

    const [reservation] = await db
      .select({
        id: reservationsTable.id,
        reservationNumber: reservationsTable.reservationNumber,
        totalValue: reservationsTable.totalValue,
        paidValue: reservationsTable.paidValue,
        status: reservationsTable.status,
      })
      .from(reservationsTable)
      .where(and(
        eq(reservationsTable.id, body.data.reservationId),
        eq(reservationsTable.clientId, client.id),
        eq(reservationsTable.tenantId, me.tenantId),
      ))
      .limit(1);

    if (!reservation) {
      next(new NotFoundError("Reserva não encontrada", "NOT_FOUND"));
      return;
    }

    const balance = Math.max(Number(reservation.totalValue) - Number(reservation.paidValue), 0);
    if (balance <= 0) {
      next(new ValidationError("Esta reserva não possui saldo pendente"));
      return;
    }

    if (reservation.status === RESERVATION_STATUS.CANCELLED) {
      next(new ValidationError("Não é possível resgatar pontos em reservas canceladas"));
      return;
    }

    const [loyaltyProgram] = await db
      .select()
      .from(loyaltyProgramsTable)
      .where(and(eq(loyaltyProgramsTable.tenantId, me.tenantId), eq(loyaltyProgramsTable.isActive, true)))
      .limit(1);

    if (!loyaltyProgram) {
      next(new NotFoundError("Programa de fidelidade não ativo", "NOT_FOUND"));
      return;
    }

    const [member] = await db
      .select()
      .from(loyaltyMembersTable)
      .where(and(
        eq(loyaltyMembersTable.tenantId, me.tenantId),
        eq(loyaltyMembersTable.programId, loyaltyProgram.id),
        eq(loyaltyMembersTable.clientId, client.id),
      ))
      .limit(1);

    if (!member) {
      next(new NotFoundError("Você não é membro do programa de fidelidade", "NOT_FOUND"));
      return;
    }

    if (member.availablePoints < loyaltyProgram.minRedeemPoints) {
      next(new ValidationError(`São necessários pelo menos ${loyaltyProgram.minRedeemPoints} pontos para resgatar`));
      return;
    }

    if (body.data.pointsToRedeem > member.availablePoints) {
      next(new ValidationError("Pontos insuficientes"));
      return;
    }

    const realPerPoint = Number(loyaltyProgram.realPerPoint);
    const requestedDiscount = body.data.pointsToRedeem * realPerPoint;
    const discountAmount = Math.min(requestedDiscount, balance);
    const actualPointsRedeemed = Math.ceil(discountAmount / realPerPoint);

    // Wrap all mutations in a DB transaction with row-level lock on the member row
    // to prevent double-spend in concurrent requests.
    let newAvailablePoints: number;
    await db.transaction(async (tx) => {
      // Lock member row for the duration of this transaction
      const [lockedMember] = await tx
        .select({ availablePoints: loyaltyMembersTable.availablePoints })
        .from(loyaltyMembersTable)
        .where(eq(loyaltyMembersTable.id, member.id))
        .for("update")
        .limit(1);

      if (!lockedMember || lockedMember.availablePoints < actualPointsRedeemed) {
        throw new ValidationError("Pontos insuficientes (tente novamente)");
      }

      newAvailablePoints = lockedMember.availablePoints - actualPointsRedeemed;

      await tx
        .update(loyaltyMembersTable)
        .set({ availablePoints: newAvailablePoints })
        .where(eq(loyaltyMembersTable.id, member.id));

      const txId = generateId("ltx");
      await tx.insert(loyaltyTransactionsTable).values({
        id: txId,
        tenantId: me.tenantId,
        memberId: member.id,
        programId: loyaltyProgram.id,
        type: "redeem",
        points: actualPointsRedeemed,
        description: `Resgate de pontos — Reserva ${reservation.reservationNumber ?? reservation.id.slice(-6).toUpperCase()}`,
        referenceId: reservation.id,
        referenceType: "reservation",
      });

      await tx
        .update(reservationsTable)
        .set({
          paidValue: sql`${reservationsTable.paidValue} + ${discountAmount}`,
          discountLoyaltyPoints: sql`COALESCE(${reservationsTable.discountLoyaltyPoints}, 0) + ${actualPointsRedeemed}`,
          discountLoyaltyAmount: sql`COALESCE(${reservationsTable.discountLoyaltyAmount}, '0') + ${discountAmount}`,
        })
        .where(eq(reservationsTable.id, reservation.id));
    });

    res.json({
      pointsRedeemed: actualPointsRedeemed,
      discountAmount,
      newAvailablePoints: newAvailablePoints!,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/client/nps", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.CLIENT) {
      next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE"));
      return;
    }
    const body = z.object({
      reservationId: z.string().min(1),
      score: z.number().int().min(0).max(10),
      comment: z.string().max(2000).nullable().optional(),
      scoreTransport: z.number().int().min(1).max(5).nullable().optional(),
      scoreService: z.number().int().min(1).max(5).nullable().optional(),
      scoreOrganization: z.number().int().min(1).max(5).nullable().optional(),
      scoreGuide: z.number().int().min(1).max(5).nullable().optional(),
    }).safeParse(req.body);
    if (!body.success) {
      next(new ValidationError(String(body.error.message)));
      return;
    }
    const client = await findClientRecord(me.tenantId, me.id, me.email);
    if (!client) {
      next(new NotFoundError("Perfil de cliente não encontrado", "NOT_FOUND"));
      return;
    }
    const [reservation] = await db
      .select({ id: reservationsTable.id, tripId: reservationsTable.tripId })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.id, body.data.reservationId),
          eq(reservationsTable.clientId, client.id),
          eq(reservationsTable.tenantId, me.tenantId),
        ),
      )
      .limit(1);
    if (!reservation) {
      next(new NotFoundError("Reserva não encontrada", "NOT_FOUND"));
      return;
    }
    const [existing] = await db
      .select({ id: clientNpsResponsesTable.id })
      .from(clientNpsResponsesTable)
      .where(eq(clientNpsResponsesTable.reservationId, body.data.reservationId))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "Avaliação já enviada para esta reserva", code: "DUPLICATE_NPS" });
      return;
    }
    const id = generateId();
    await db.insert(clientNpsResponsesTable).values({
      id,
      tenantId: me.tenantId,
      clientId: client.id,
      reservationId: body.data.reservationId,
      tripId: reservation.tripId,
      score: body.data.score,
      scoreTransport: body.data.scoreTransport ?? null,
      scoreService: body.data.scoreService ?? null,
      scoreOrganization: body.data.scoreOrganization ?? null,
      scoreGuide: body.data.scoreGuide ?? null,
      comment: body.data.comment ?? null,
    });
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

router.get("/client/reservations/:id/voucher", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (me.role !== ROLES.CLIENT) {
      next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE"));
      return;
    }

    const client = await findClientRecord(me.tenantId, me.id, me.email);
    if (!client) {
      next(new NotFoundError("Perfil de cliente não encontrado", "NOT_FOUND"));
      return;
    }

    const [row] = await db
      .select({
        id: reservationsTable.id,
        reservationNumber: reservationsTable.reservationNumber,
        status: reservationsTable.status,
        voucherCode: reservationsTable.voucherCode,
        totalValue: reservationsTable.totalValue,
        paidValue: reservationsTable.paidValue,
        paymentMethod: reservationsTable.paymentMethod,
        createdAt: reservationsTable.createdAt,
        seats: reservationsTable.seats,
        boardingLocationId: reservationsTable.boardingLocationId,
        tripName: tripsTable.name,
        tripDestination: tripsTable.destination,
        tripDepartureDate: tripsTable.departureDate,
        tripReturnDate: tripsTable.returnDate,
        tripBoardingPoints: tripsTable.boardingPoints,
      })
      .from(reservationsTable)
      .innerJoin(tripsTable, eq(reservationsTable.tripId, tripsTable.id))
      .where(
        and(
          eq(reservationsTable.id, req.params.id),
          eq(reservationsTable.clientId, client.id),
          eq(reservationsTable.tenantId, me.tenantId),
        ),
      )
      .limit(1);

    if (!row) {
      next(new NotFoundError("Reserva não encontrada", "NOT_FOUND"));
      return;
    }

    const [[tenant], [user]] = await Promise.all([
      db
        .select({ name: tenantsTable.name, primaryColor: tenantsTable.primaryColor })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, me.tenantId))
        .limit(1),
      db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, me.id))
        .limit(1),
    ]);

    const passengerName = client.name ?? user?.name ?? "Passageiro";
    const agencyName = tenant?.name ?? "Agência";
    const primaryColor = tenant?.primaryColor ?? "#3B82F6";
    const totalValue = Number(row.totalValue);
    const paidValue = Number(row.paidValue);
    const balance = Math.max(totalValue - paidValue, 0);
    const seatsCount = Array.isArray(row.seats) ? row.seats.length : 0;
    const tripDepartureDate = row.tripDepartureDate
      ? (row.tripDepartureDate as unknown as Date).toISOString().slice(0, 10)
      : null;
    const tripReturnDate = row.tripReturnDate
      ? (row.tripReturnDate as unknown as Date).toISOString().slice(0, 10)
      : null;
    const boardingPoints = Array.isArray(row.tripBoardingPoints) ? row.tripBoardingPoints : [];
    const boardingPoint = row.boardingLocationId
      ? boardingPoints.find((bp: { id: string; name: string; time: string; address: string }) => bp.id === row.boardingLocationId)
      : null;
    const boardingPointName = boardingPoint?.name ?? null;
    const boardingPointTime = boardingPoint?.time ?? null;

    const voucherData = {
      passengerName,
      agencyName,
      primaryColor,
      reservationId: row.id,
      reservationNumber: row.reservationNumber,
      status: row.status,
      voucherCode: row.voucherCode,
      reservationDate: row.createdAt,
      paymentMethod: row.paymentMethod,
      totalValue,
      paidValue,
      balance,
      seatsCount,
      tripName: row.tripName,
      tripDestination: row.tripDestination,
      tripDepartureDate,
      tripReturnDate,
      boardingPointName,
      boardingPointTime,
    };

    const pdfBuffer = generateVoucherPdf(voucherData);

    const pdfQueue = getPdfQueue();
    if (pdfQueue) {
      pdfQueue
        .add(`voucher-${generateId()}`, {
          type: "voucher",
          tenantId: me.tenantId,
          reservationId: row.id,
          passengerName,
          agencyName,
          primaryColor,
          reservationNumber: row.reservationNumber,
          status: row.status,
          voucherCode: row.voucherCode,
          reservationDate: row.createdAt.toISOString(),
          paymentMethod: row.paymentMethod,
          totalValue,
          paidValue,
          balance,
          seatsCount,
          tripName: row.tripName,
          tripDestination: row.tripDestination,
          tripDepartureDate,
          tripReturnDate,
          userId: me.id,
          ipAddress: req.ip ?? null,
          userAgent: req.headers["user-agent"] ?? null,
        })
        .catch((err) => req.log.warn({ err }, "[voucher] Failed to enqueue audit job"));
    }

    const safeTrip = row.tripName.replace(/[^a-z0-9]/gi, "_").slice(0, 30);
    const filename = `comprovante_${safeTrip}_${row.voucherCode ?? row.id}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

const UpdateClientMeBody = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional().nullable(),
  cpf: z.string().max(20).optional().nullable(),
  birthDate: z.string().optional().nullable(),
});

router.patch("/client/me", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (me.role !== ROLES.CLIENT) {
      next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE"));
      return;
    }

    const parsed = UpdateClientMeBody.safeParse(req.body);
    if (!parsed.success) {
      next(new ValidationError("Dados inválidos", "VALIDATION_ERROR"));
      return;
    }

    const data = parsed.data;
    const client = await findClientRecord(me.tenantId, me.id, me.email);

    if (!client) {
      next(new NotFoundError("Perfil de cliente não encontrado", "NOT_FOUND"));
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updates.name = data.name;
    if (data.phone !== undefined) updates.phone = data.phone;
    if (data.cpf !== undefined) updates.cpf = data.cpf;
    if (data.birthDate !== undefined) {
      updates.birthDate = data.birthDate ? new Date(data.birthDate) : null;
    }

    await db
      .update(clientsTable)
      .set(updates)
      .where(and(eq(clientsTable.id, client.id), eq(clientsTable.tenantId, me.tenantId)));

    if (data.name) {
      await db.update(usersTable).set({ name: data.name }).where(eq(usersTable.id, me.id));
    }

    const [updated] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, client.id))
      .limit(1);

    res.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      cpf: updated.cpf,
      birthDate: updated.birthDate
        ? (updated.birthDate as unknown as Date).toISOString().slice(0, 10)
        : null,
      addressCity: updated.addressCity,
      addressState: updated.addressState,
      referralCode: updated.referralCode ?? null,
    });
  } catch (err) {
    next(err);
  }
});

function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx <= 0) return email;
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx);
  if (local.length <= 2) return `${local[0]}***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}

router.get("/client/me/referrals", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (me.role !== ROLES.CLIENT) {
      next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE"));
      return;
    }

    const client = await findClientRecord(me.tenantId, me.id, me.email);
    if (!client) {
      res.json({ data: [] });
      return;
    }

    const rows = await db
      .select({
        id: referralsTable.id,
        referredName: referralsTable.referredName,
        referredEmail: referralsTable.referredEmail,
        status: referralsTable.status,
        convertedAt: referralsTable.convertedAt,
        bonusAmount: referralsTable.bonusAmount,
        bonusPaid: referralsTable.bonusPaid,
        bonusPaidAt: referralsTable.bonusPaidAt,
        bonusCreditUsedAt: referralsTable.bonusCreditUsedAt,
        bonusCreditOrderId: referralsTable.bonusCreditOrderId,
        bonusCreditUsedAmount: referralsTable.bonusCreditUsedAmount,
        createdAt: referralsTable.createdAt,
        expiresAt: referralsTable.expiresAt,
      })
      .from(referralsTable)
      .where(
        and(
          eq(referralsTable.tenantId, me.tenantId),
          eq(referralsTable.referrerId, client.id),
        ),
      )
      .orderBy(desc(referralsTable.createdAt));

    const completedCount = rows.filter(
      (r) => r.status === REFERRAL_STATUS.COMPLETED || r.status === REFERRAL_STATUS.CONVERTED,
    ).length;

    const [refSettings] = await db
      .select({ tiersConfig: referralSettingsTable.tiersConfig })
      .from(referralSettingsTable)
      .where(eq(referralSettingsTable.tenantId, me.tenantId))
      .limit(1);

    const { tier: currentTier, nextTier, progress: tierProgress } = computeReferralTier(
      completedCount,
      refSettings?.tiersConfig ?? null,
    );

    res.json({
      data: rows.map((r) => ({
        id: r.id,
        referredName: r.referredName ?? null,
        referredEmail: r.referredEmail ? maskEmail(r.referredEmail) : null,
        status: r.status,
        convertedAt: r.convertedAt ? (r.convertedAt as unknown as Date).toISOString() : null,
        bonusAmount: r.bonusAmount,
        bonusPaid: r.bonusPaid,
        bonusPaidAt: r.bonusPaidAt ? (r.bonusPaidAt as unknown as Date).toISOString() : null,
        bonusCreditUsedAt: r.bonusCreditUsedAt ? (r.bonusCreditUsedAt as unknown as Date).toISOString() : null,
        bonusCreditOrderId: r.bonusCreditOrderId ?? null,
        bonusCreditUsedAmount: r.bonusCreditUsedAmount ?? null,
        createdAt: (r.createdAt as unknown as Date).toISOString(),
        expiresAt: r.expiresAt ? (r.expiresAt as unknown as Date).toISOString() : null,
      })),
      tier: {
        currentTierLevel: currentTier.level,
        currentTierLabel: currentTier.label,
        currentTierMultiplier: currentTier.bonusMultiplier,
        tierProgress,
        nextTierMin: nextTier?.minReferrals ?? null,
        nextTierLabel: nextTier?.label ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /client/notifications ─────────────────────────────────────────────────

router.get("/client/notifications", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (me.role !== ROLES.CLIENT) {
      next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE"));
      return;
    }

    const client = await findClientRecord(me.tenantId, me.id, me.email);
    if (!client) {
      res.json({ data: [], unreadCount: 0 });
      return;
    }

    const [notifications, unreadCount] = await Promise.all([
      getRecentNotifications(client.id, me.tenantId, 20),
      getUnreadCount(client.id, me.tenantId),
    ]);

    res.json({
      data: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        payload: n.payload ?? {},
        readAt: n.readAt ? (n.readAt as unknown as Date).toISOString() : null,
        createdAt: (n.createdAt as unknown as Date).toISOString(),
      })),
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /client/notifications/read-all ──────────────────────────────────────

router.post("/client/notifications/read-all", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (me.role !== ROLES.CLIENT) {
      next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE"));
      return;
    }

    const client = await findClientRecord(me.tenantId, me.id, me.email);
    if (!client) {
      res.status(204).end();
      return;
    }

    await markAllRead(client.id, me.tenantId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ── GET /client/notifications/stream (SSE) ────────────────────────────────────

router.get("/client/notifications/stream", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (me.role !== ROLES.CLIENT) {
      next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE"));
      return;
    }

    const client = await findClientRecord(me.tenantId, me.id, me.email);
    if (!client) {
      res.status(404).json({ error: "Client record not found" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Capture watermark BEFORE init query so no notification can fall through the gap.
    const streamStartAt = new Date();

    addClientSseConnection(client.id, res);

    const [notifications, unreadCount] = await Promise.all([
      getRecentNotifications(client.id, me.tenantId, 20),
      getUnreadCount(client.id, me.tenantId),
    ]);

    // Track IDs already delivered (via init frame or in-process emitToClient)
    // so the poll loop can skip them and avoid duplicate delivery.
    const sentIds = new Set<string>(notifications.map((n) => n.id));

    const initPayload = JSON.stringify({
      type: "init",
      data: {
        notifications: notifications.map((n) => ({
          id: n.id,
          type: n.type,
          payload: n.payload ?? {},
          readAt: n.readAt ? (n.readAt as unknown as Date).toISOString() : null,
          createdAt: (n.createdAt as unknown as Date).toISOString(),
        })),
        unreadCount,
      },
    });
    res.write(`data: ${initPayload}\n\n`);

    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    // Poll cursor starts at stream-open time (before init query), so we never
    // skip a row inserted between init query start and completion.
    let lastPolledAt = streamStartAt;

    const pollInterval = setInterval(async () => {
      // Snapshot the next high-water mark BEFORE querying to avoid losing
      // rows inserted during query execution on the next cycle.
      const queryTime = new Date();
      try {
        const newRows = await db
          .select()
          .from(clientNotificationsTable)
          .where(
            and(
              eq(clientNotificationsTable.clientId, client.id),
              gt(clientNotificationsTable.createdAt, lastPolledAt),
            ),
          )
          .orderBy(asc(clientNotificationsTable.createdAt));

        // Advance cursor only after a successful query.
        lastPolledAt = queryTime;

        // Filter out rows already delivered via init frame or in-process emitToClient.
        const undelivered = newRows.filter((n) => !sentIds.has(n.id));
        if (undelivered.length > 0) {
          const [unreadRow] = await db
            .select({ cnt: count() })
            .from(clientNotificationsTable)
            .where(and(eq(clientNotificationsTable.clientId, client.id), isNull(clientNotificationsTable.readAt)));

          for (const n of undelivered) {
            sentIds.add(n.id);
            const frame = JSON.stringify({
              type: "notification",
              data: {
                id: n.id,
                type: n.type,
                payload: n.payload ?? {},
                readAt: null,
                createdAt: (n.createdAt as unknown as Date).toISOString(),
                unreadCount: Number(unreadRow?.cnt ?? 0),
              },
            });
            res.write(`data: ${frame}\n\n`);
          }
        }
      } catch (pollErr) {
        // Do NOT advance cursor on error — retry with same watermark next tick.
        console.warn("[sse-poll] poll error for client", client.id, (pollErr as Error).message);
      }
    }, 15_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      clearInterval(pollInterval);
      removeClientSseConnection(client.id, res);
    });
  } catch (err) {
    next(err);
  }
});

router.get("/client/me/favorites", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.CLIENT) { next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE")); return; }

    const client = await findClientRecord(me.tenantId, me.id, me.email);
    if (!client) { next(new NotFoundError("Perfil de cliente não encontrado", "NOT_FOUND")); return; }

    const [tripFavs, productFavs] = await Promise.all([
      db
        .select({
          favoriteId: clientFavoritesTable.id,
          tripId: clientFavoritesTable.itemId,
          productSlug: storeProductsTable.slug,
          name: storeProductsTable.name,
          images: storeProductsTable.images,
          destination: storeProductsTable.destination,
          price: storeProductsTable.price,
          salePrice: storeProductsTable.salePrice,
        })
        .from(clientFavoritesTable)
        .innerJoin(storeProductsTable, eq(storeProductsTable.tripId, clientFavoritesTable.itemId))
        .innerJoin(storesTable, and(eq(storesTable.id, storeProductsTable.storeId), eq(storesTable.tenantId, me.tenantId)))
        .where(and(
          eq(clientFavoritesTable.clientId, client.id),
          eq(clientFavoritesTable.tenantId, me.tenantId),
          eq(clientFavoritesTable.itemType, "trip"),
        ))
        .orderBy(desc(clientFavoritesTable.createdAt)),
      db
        .select({
          favoriteId: clientFavoritesTable.id,
          productId: clientFavoritesTable.itemId,
          productSlug: storeProductsTable.slug,
          name: storeProductsTable.name,
          images: storeProductsTable.images,
          price: storeProductsTable.price,
          salePrice: storeProductsTable.salePrice,
        })
        .from(clientFavoritesTable)
        .innerJoin(storeProductsTable, eq(storeProductsTable.id, clientFavoritesTable.itemId))
        .innerJoin(storesTable, and(eq(storesTable.id, storeProductsTable.storeId), eq(storesTable.tenantId, me.tenantId)))
        .where(and(
          eq(clientFavoritesTable.clientId, client.id),
          eq(clientFavoritesTable.tenantId, me.tenantId),
          eq(clientFavoritesTable.itemType, "product"),
        ))
        .orderBy(desc(clientFavoritesTable.createdAt)),
    ]);

    res.json({
      trips: tripFavs.map((r) => ({
        favoriteId: r.favoriteId,
        tripId: r.tripId,
        productSlug: r.productSlug,
        name: r.name,
        imageUrl: (r.images as string[])?.[0] ?? null,
        destination: r.destination ?? null,
        price: r.price,
        salePrice: r.salePrice ?? null,
      })),
      products: productFavs.map((r) => ({
        favoriteId: r.favoriteId,
        productId: r.productId,
        productSlug: r.productSlug,
        name: r.name,
        imageUrl: (r.images as string[])?.[0] ?? null,
        price: r.price,
        salePrice: r.salePrice ?? null,
      })),
    });
  } catch (err) { next(err); }
});

const AddFavoriteBody = z.object({
  itemType: z.enum(["trip", "product"]),
  itemId: z.string().min(1),
});

router.post("/client/me/favorites", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.CLIENT) { next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE")); return; }

    const parsed = AddFavoriteBody.safeParse(req.body);
    if (!parsed.success) { next(new ValidationError("Dados inválidos", "VALIDATION_ERROR")); return; }

    const client = await findClientRecord(me.tenantId, me.id, me.email);
    if (!client) { next(new NotFoundError("Perfil de cliente não encontrado", "NOT_FOUND")); return; }

    const { itemType, itemId } = parsed.data;
    const id = generateId();

    await db.insert(clientFavoritesTable).values({
      id,
      tenantId: me.tenantId,
      clientId: client.id,
      itemType,
      itemId,
    }).onConflictDoNothing();

    res.status(201).json({ id, itemType, itemId });
  } catch (err) { next(err); }
});

router.delete("/client/me/favorites/:itemType/:itemId", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role !== ROLES.CLIENT) { next(new ForbiddenError("Acesso restrito a clientes", "FORBIDDEN_ROLE")); return; }

    const client = await findClientRecord(me.tenantId, me.id, me.email);
    if (!client) { next(new NotFoundError("Perfil de cliente não encontrado", "NOT_FOUND")); return; }

    const { itemType, itemId } = req.params;
    if (!itemType || !itemId) { next(new ValidationError("Parâmetros inválidos", "VALIDATION_ERROR")); return; }

    await db.delete(clientFavoritesTable).where(and(
      eq(clientFavoritesTable.clientId, client.id),
      eq(clientFavoritesTable.tenantId, me.tenantId),
      eq(clientFavoritesTable.itemType, itemType),
      eq(clientFavoritesTable.itemId, itemId),
    ));

    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
