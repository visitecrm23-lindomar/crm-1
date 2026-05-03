import { Router, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  clientsTable,
  reservationsTable,
  tripsTable,
  usersTable,
  referralsTable,
  tenantsTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../lib/tenant";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";
import { ROLES } from "@workspace/permissions";

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
    let referralStats = {
      code: client?.referralCode ?? user?.referralCode ?? null,
      totalReferrals: 0,
      completedReferrals: 0,
      pendingReferrals: 0,
      totalEarnings: "0.00",
    };

    if (client) {
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
          tripName: tripsTable.name,
          tripDestination: tripsTable.destination,
          tripDepartureDate: tripsTable.departureDate,
          tripReturnDate: tripsTable.returnDate,
          tripType: tripsTable.type,
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

      reservations = rows.map((r) => ({
        ...r,
        totalValue: Number(r.totalValue),
        paidValue: Number(r.paidValue),
        tripDepartureDate: r.tripDepartureDate
          ? (r.tripDepartureDate as unknown as Date).toISOString().slice(0, 10)
          : null,
        tripReturnDate: r.tripReturnDate
          ? (r.tripReturnDate as unknown as Date).toISOString().slice(0, 10)
          : null,
        createdAt: r.createdAt.toISOString(),
      }));

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
        if (row.status === "completed") {
          completedReferrals = Number(row.cnt);
          totalEarnings = Number(row.total);
        }
        if (row.status === "pending") pendingReferrals = Number(row.cnt);
      }

      referralStats = {
        code: client.referralCode ?? user?.referralCode ?? null,
        totalReferrals,
        completedReferrals,
        pendingReferrals,
        totalEarnings: totalEarnings.toFixed(2),
      };
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
    });
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

export default router;
