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
} from "@workspace/db";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../lib/tenant";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";
import { ROLES, REFERRAL_STATUS, RESERVATION_STATUS } from "@workspace/permissions";
import { generateVoucherPdf } from "../lib/voucher-pdf";
import { getPdfQueue } from "../queues/index";
import { generateId, generateReferralCode } from "../lib/id";
import { generateAndAssignReferralCode } from "../lib/referral-code";
import { dispatchReferralWelcomeEmail } from "../queues/email-helpers";

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
              // Fire-and-forget — welcome email is non-critical
              const msg = err instanceof Error ? err.message : String(err);
              void msg;
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

export default router;
