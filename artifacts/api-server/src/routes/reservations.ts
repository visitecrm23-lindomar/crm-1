import { Router, type NextFunction } from "express";
import { db } from "@workspace/db";
import { reservationsTable, passengersTable, tripsTable, clientsTable, storeCouponsTable, storesTable, loyaltyMembersTable, loyaltyTransactionsTable, loyaltyProgramsTable, referralsTable, referralSettingsTable, dealsTable, pipelineStagesTable, tenantsTable, emailLogsTable, paymentsTable, commissionsTable } from "@workspace/db";
import { eq, and, sql, desc, asc, inArray, or, ilike } from "drizzle-orm";
import { generateId, generateVoucherCode } from "../lib/id";
import { getTenantReservationPrefix, tripTypeToCode, getYearMonth, nextReservationSequence, buildReservationNumber } from "../lib/reservation-number";
import { requireAuth, getTenantUser } from "../lib/tenant";
import { deriveAgeCategory, getAgeYears } from "../lib/passenger";
import { CreateReservationBody, UpdateReservationBody, CreatePassengerBody, UpdatePassengerBody } from "@workspace/api-zod";
import { z } from "zod/v4";
import { CalendarSyncService } from "../lib/google-calendar/sync-service";
import { writeClientActivity } from "../lib/activities";
import { enqueueReservationConfirmationEmail, enqueueReservationCancellationEmail } from "../queues/email-helpers";
import { enqueueCommissionSync } from "../queues/commission-sync-helper";
import { ADMIN_ROLES, MANAGEMENT_ROLES } from '../lib/tenant';
import { broadcastSeatUpdate } from "../lib/realtime";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";
import { applyDiscounts, computeBalance, computeEffectiveLoyaltyPoints } from "../lib/pricing";
import { calculateTier, loyaltyAwardPointsForReservation } from "../lib/loyalty-helpers";
import { ROLES, DEAL_STATUS, RESERVATION_STATUS, REFERRAL_STATUS, COMMISSION_STATUS, STORE_PAYMENT_STATUS, type ReservationStatus } from "@workspace/permissions";
import { parseReservationStatus } from "../lib/status-validators";


const router = Router();

async function syncClientDeal(clientId: string, tenantId: string, tripId: string, totalValue: number, ownerId: string): Promise<void> {
  const [client] = await db.select({ name: clientsTable.name })
    .from(clientsTable).where(and(eq(clientsTable.id, clientId), eq(clientsTable.tenantId, tenantId))).limit(1);
  const [trip] = await db.select({ name: tripsTable.name })
    .from(tripsTable).where(and(eq(tripsTable.id, tripId), eq(tripsTable.tenantId, tenantId))).limit(1);

  const clientName = client?.name ?? "Cliente";
  const tripName = trip?.name ?? "Viagem";
  const title = `${clientName} — ${tripName}`;

  const [existingDeal] = await db.select({ id: dealsTable.id })
    .from(dealsTable)
    .where(and(eq(dealsTable.clientId, clientId), eq(dealsTable.tenantId, tenantId), eq(dealsTable.status, DEAL_STATUS.OPEN)))
    .orderBy(desc(dealsTable.createdAt))
    .limit(1);

  if (existingDeal) {
    await db.update(dealsTable).set({ value: String(totalValue), tripId, title })
      .where(and(eq(dealsTable.id, existingDeal.id), eq(dealsTable.tenantId, tenantId)));
  } else {
    const [firstStage] = await db.select({ id: pipelineStagesTable.id })
      .from(pipelineStagesTable)
      .where(eq(pipelineStagesTable.tenantId, tenantId))
      .orderBy(asc(pipelineStagesTable.order))
      .limit(1);
    if (!firstStage) return;
    await db.insert(dealsTable).values({
      id: generateId(),
      tenantId,
      clientId,
      stageId: firstStage.id,
      tripId,
      title,
      value: String(totalValue),
      status: DEAL_STATUS.OPEN,
      ownerId,
    });
  }
}

async function formatReservation(r: typeof reservationsTable.$inferSelect) {
  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, r.tripId)).limit(1);
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, r.clientId)).limit(1);
  const [autoRetryLog] = await db.select({ id: emailLogsTable.id })
    .from(emailLogsTable)
    .where(and(eq(emailLogsTable.reservationId, r.id), eq(emailLogsTable.isAutoRetry, true)))
    .limit(1);
  return {
    id: r.id,
    tripId: r.tripId,
    clientId: r.clientId,
    seats: r.seats ?? [],
    tripType: r.tripType,
    packageType: r.packageType,
    hasInsurance: r.hasInsurance,
    totalValue: Number(r.totalValue),
    paidValue: Number(r.paidValue),
    balance: Number(r.balance),
    paymentMethod: r.paymentMethod,
    installments: r.installments,
    commissionPercentage: r.commissionPercentage ? Number(r.commissionPercentage) : null,
    commissionAmount: r.commissionAmount ? Number(r.commissionAmount) : null,
    commissionSyncStatus: r.commissionSyncStatus ?? null,
    sellerId: r.sellerId ?? null,
    status: r.status,
    voucherCode: r.voucherCode,
    reservationNumber: r.reservationNumber ?? null,
    qrCode: r.qrCode,
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
    notes: r.notes,
    boardingLocationId: r.boardingLocationId ?? null,
    storeOrderId: r.storeOrderId ?? null,
    discountCouponCode: r.discountCouponCode ?? null,
    discountCouponAmount: r.discountCouponAmount != null ? Number(r.discountCouponAmount) : null,
    discountLoyaltyPoints: r.discountLoyaltyPoints ?? null,
    discountLoyaltyAmount: r.discountLoyaltyAmount != null ? Number(r.discountLoyaltyAmount) : null,
    discountReferralCode: r.discountReferralCode ?? null,
    discountReferralAmount: r.discountReferralAmount != null ? Number(r.discountReferralAmount) : null,
    discountTotal: r.discountTotal != null ? Number(r.discountTotal) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    hasAutoRetry: autoRetryLog !== undefined,
    trip: trip ? {
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      departureDate: trip.departureDate.toISOString(),
      availableSeats: trip.availableSeats,
      totalCapacity: trip.totalCapacity,
      status: trip.status,
      coverImage: trip.coverImage,
    } : { id: r.tripId, name: "Unknown", destination: "", departureDate: new Date().toISOString(), availableSeats: 0, totalCapacity: 0, status: "unknown" },
    client: client ? {
      id: client.id,
      name: client.name,
      email: client.email,
      whatsapp: client.whatsapp,
      cpf: client.cpf ?? null,
      birthDate: client.birthDate?.toISOString() ?? null,
    } : { id: r.clientId, name: "Unknown", email: "", whatsapp: "", cpf: null, birthDate: null },
  };
}

function formatPassenger(p: typeof passengersTable.$inferSelect) {
  return {
    id: p.id, reservationId: p.reservationId, name: p.name, cpf: p.cpf, rg: p.rg,
    birthDate: p.birthDate?.toISOString() ?? null, ageCategory: p.ageCategory,
    seatNumber: p.seatNumber, isChildUnder7: p.isChildUnder7,
    checkedInAt: p.checkedInAt?.toISOString() ?? null,
  };
}

const ValidateCouponBodySchema = z.object({
  code: z.string().min(1),
  subtotal: z.number().positive(),
});

router.post("/reservations/validate-coupon", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = ValidateCouponBodySchema.safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }

    const { code, subtotal } = parsed.data;
    const now = new Date();

    const stores = await db.select({ id: storesTable.id })
      .from(storesTable)
      .where(eq(storesTable.tenantId, me.tenantId));

    if (!stores.length) {
      res.json({ valid: false, discountAmount: 0, couponCode: code, message: "Nenhuma loja encontrada para este tenant" });
      return;
    }

    const storeIds = stores.map(s => s.id);
    const [coupon] = await db.select().from(storeCouponsTable)
      .where(and(
        inArray(storeCouponsTable.storeId, storeIds),
        eq(storeCouponsTable.code, code),
        eq(storeCouponsTable.isActive, true),
      )).limit(1);

    if (!coupon) {
      res.json({ valid: false, discountAmount: 0, couponCode: code, message: "Cupom inválido ou não encontrado" });
      return;
    }
    if (coupon.startsAt > now) {
      res.json({ valid: false, discountAmount: 0, couponCode: code, message: "Cupom ainda não está ativo" });
      return;
    }
    if (coupon.expiresAt < now) {
      res.json({ valid: false, discountAmount: 0, couponCode: code, message: "Cupom expirado" });
      return;
    }
    if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
      res.json({ valid: false, discountAmount: 0, couponCode: code, message: "Limite de uso do cupom atingido" });
      return;
    }
    if (coupon.minPurchaseAmount != null && subtotal < Number(coupon.minPurchaseAmount)) {
      res.json({ valid: false, discountAmount: 0, couponCode: code, message: `Valor mínimo de compra: R$ ${Number(coupon.minPurchaseAmount).toFixed(2)}` });
      return;
    }

    let discountAmount = 0;
    if (coupon.type === "percentage") {
      discountAmount = subtotal * (Number(coupon.value) / 100);
    } else {
      discountAmount = Number(coupon.value);
    }
    if (coupon.maxDiscountAmount != null) {
      discountAmount = Math.min(discountAmount, Number(coupon.maxDiscountAmount));
    }
    discountAmount = Math.min(discountAmount, subtotal);

    res.json({ valid: true, discountAmount: Math.round(discountAmount * 100) / 100, couponCode: code, message: null });
  } catch (err) {
    next(err);
  }
});

router.get("/reservations/stats", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const tenantCond = eq(reservationsTable.tenantId, me.tenantId);

    const [statsRow] = await db
      .select({
        total: sql<number>`count(*)`,
        confirmed: sql<number>`count(*) filter (where status = ${RESERVATION_STATUS.CONFIRMED})`,
        pending: sql<number>`count(*) filter (where status = ${RESERVATION_STATUS.PENDING})`,
        cancelled: sql<number>`count(*) filter (where status = ${RESERVATION_STATUS.CANCELLED})`,
        totalOutstanding: sql<number>`coalesce(sum(balance) filter (where status not in (${RESERVATION_STATUS.CANCELLED}, ${RESERVATION_STATUS.COMPLETED})), 0)`,
      })
      .from(reservationsTable)
      .where(tenantCond);

    res.json({
      total: Number(statsRow?.total ?? 0),
      confirmed: Number(statsRow?.confirmed ?? 0),
      pending: Number(statsRow?.pending ?? 0),
      cancelled: Number(statsRow?.cancelled ?? 0),
      totalOutstanding: Number(statsRow?.totalOutstanding ?? 0),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/reservations", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const { tripId, clientId, status, search, createdById, dateFrom, dateTo, commissionSyncStatus, hasAutoRetry, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (dateFrom && !ISO_DATE.test(dateFrom)) { next(new ValidationError("dateFrom must be a valid ISO date (YYYY-MM-DD)", "VALIDATION_ERROR")); return; }
    if (dateTo && !ISO_DATE.test(dateTo)) { next(new ValidationError("dateTo must be a valid ISO date (YYYY-MM-DD)", "VALIDATION_ERROR")); return; }

    const conditions: ReturnType<typeof eq>[] = [eq(reservationsTable.tenantId, me.tenantId)];
    if (tripId) conditions.push(eq(reservationsTable.tripId, tripId));
    if (status) conditions.push(eq(reservationsTable.status, parseReservationStatus(status)));
    if (commissionSyncStatus) conditions.push(eq(reservationsTable.commissionSyncStatus, commissionSyncStatus));
    if (createdById) conditions.push(eq(reservationsTable.createdById, createdById));
    if (hasAutoRetry === "true") {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${emailLogsTable} WHERE ${emailLogsTable.reservationId} = ${reservationsTable.id} AND ${emailLogsTable.isAutoRetry} = true)` as ReturnType<typeof eq>,
      );
    }
    if (dateFrom) conditions.push(sql`${reservationsTable.createdAt} >= ${dateFrom}::timestamptz` as ReturnType<typeof eq>);
    if (dateTo) conditions.push(sql`${reservationsTable.createdAt} <= (${dateTo}::date + interval '1 day - 1 millisecond')` as ReturnType<typeof eq>);
    if (search) {
      const term = `%${search}%`;
      const matchingClients = await db
        .select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(
          eq(clientsTable.tenantId, me.tenantId),
          or(
            ilike(clientsTable.name, term),
            ilike(clientsTable.email, term),
            ilike(clientsTable.whatsapp, term),
            ilike(clientsTable.cpf, term),
          ),
        ));
      const matchingClientIds = matchingClients.map(c => c.id);
      const voucherCondition = or(
        ilike(reservationsTable.voucherCode, term),
        ilike(reservationsTable.reservationNumber, term),
      ) as ReturnType<typeof eq>;
      if (matchingClientIds.length > 0) {
        conditions.push(or(voucherCondition, inArray(reservationsTable.clientId, matchingClientIds)) as ReturnType<typeof eq>);
      } else {
        conditions.push(voucherCondition);
      }
    }

    if (me.role === ROLES.CLIENT) {
      const [clientRecord] = await db.select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, me.tenantId), eq(clientsTable.userId, me.id)))
        .limit(1);
      if (!clientRecord) {
        res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
        return;
      }
      conditions.push(eq(reservationsTable.clientId, clientRecord.id));
    } else if (me.role === ROLES.SALES) {
      const sellerClients = await db.select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, me.tenantId), eq(clientsTable.createdById, me.id)));
      if (!sellerClients.length && !clientId) {
        res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
        return;
      }
      const sellerClientIds = sellerClients.map(c => c.id);
      if (clientId) {
        if (!sellerClientIds.includes(clientId)) {
          res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
          return;
        }
        conditions.push(eq(reservationsTable.clientId, clientId));
      } else {
        conditions.push(inArray(reservationsTable.clientId, sellerClientIds));
      }
    } else if (clientId) {
      conditions.push(eq(reservationsTable.clientId, clientId));
    }

    const reservations = await db.select().from(reservationsTable)
      .where(and(...conditions))
      .orderBy(desc(reservationsTable.createdAt))
      .limit(limitNum).offset(offset);

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(reservationsTable).where(and(...conditions));

    const data = await Promise.all(reservations.map(formatReservation));
    res.json({ data, total: Number(countResult?.count ?? 0), page: pageNum, limit: limitNum });
  } catch (err) {
    next(err);
  }
});

router.post("/reservations", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateReservationBody.safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }

    const [client] = await db.select().from(clientsTable)
      .where(and(eq(clientsTable.id, parsed.data.clientId), eq(clientsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!client) { next(new ValidationError("Client not found or not in tenant", "VALIDATION_ERROR")); return; }

    const baseValue = parsed.data.totalValue;
    const now = new Date();

    let serverCouponId: string | null = null;
    let serverCouponCode: string | null = null;
    let serverCouponAmount = 0;

    if (parsed.data.discountCouponCode) {
      const stores = await db.select({ id: storesTable.id })
        .from(storesTable).where(eq(storesTable.tenantId, me.tenantId));
      const storeIds = stores.map(s => s.id);
      const [coupon] = storeIds.length
        ? await db.select().from(storeCouponsTable).where(and(
            inArray(storeCouponsTable.storeId, storeIds),
            eq(storeCouponsTable.code, parsed.data.discountCouponCode),
            eq(storeCouponsTable.isActive, true),
          )).limit(1)
        : [];
      if (!coupon || coupon.startsAt > now || coupon.expiresAt < now ||
          (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) ||
          (coupon.minPurchaseAmount != null && baseValue < Number(coupon.minPurchaseAmount))) {
        next(new ValidationError("Cupom inválido ou expirado", "VALIDATION_ERROR")); return;
      }
      serverCouponId = coupon.id;
      serverCouponCode = coupon.code;
      if (coupon.type === "percentage") {
        serverCouponAmount = baseValue * (Number(coupon.value) / 100);
      } else {
        serverCouponAmount = Number(coupon.value);
      }
      if (coupon.maxDiscountAmount != null) serverCouponAmount = Math.min(serverCouponAmount, Number(coupon.maxDiscountAmount));
      serverCouponAmount = Math.round(Math.min(serverCouponAmount, baseValue) * 100) / 100;
    }

    let serverLoyaltyMemberId: string | null = null;
    let serverLoyaltyPoints = 0;
    let serverLoyaltyAmount = 0;
    let serverRealPerPoint = 0;

    if (parsed.data.discountLoyaltyPoints && parsed.data.discountLoyaltyPoints > 0) {
      const [member] = await db.select().from(loyaltyMembersTable)
        .where(and(eq(loyaltyMembersTable.tenantId, me.tenantId), eq(loyaltyMembersTable.clientId, parsed.data.clientId)))
        .limit(1);
      if (!member) {
        next(new ValidationError("Cliente não é membro do programa de fidelidade", "VALIDATION_ERROR")); return;
      }
      const [program] = await db.select().from(loyaltyProgramsTable).where(eq(loyaltyProgramsTable.id, member.programId)).limit(1);
      if (!program) {
        next(new ValidationError("Programa de fidelidade não encontrado", "VALIDATION_ERROR")); return;
      }
      const requestedPoints = parsed.data.discountLoyaltyPoints;
      const minRedeemPoints = program.minRedeemPoints ?? 1;
      if (requestedPoints < minRedeemPoints) {
        next(new ValidationError(`Mínimo de ${minRedeemPoints} pontos para resgate`, "VALIDATION_ERROR")); return;
      }
      if ((member.availablePoints ?? 0) < requestedPoints) {
        next(new ValidationError("Pontos de fidelidade insuficientes", "VALIDATION_ERROR")); return;
      }
      serverLoyaltyMemberId = member.id;
      serverLoyaltyPoints = requestedPoints;
      serverRealPerPoint = Number(program.realPerPoint ?? "0");
      serverLoyaltyAmount = Math.round(requestedPoints * serverRealPerPoint * 100) / 100;
    }

    let serverReferralCode: string | null = null;
    let serverReferralAmount = 0;
    let serverReferralBonusValue = 0;
    let serverReferralDiscountPct = 5;
    let serverReferralReferrerId: string | null = null;

    if (parsed.data.discountReferralCode) {
      const upperCode = parsed.data.discountReferralCode.toUpperCase();
      // Look up referrer by permanent client referral code
      const [referrer] = await db.select({ id: clientsTable.id, name: clientsTable.name })
        .from(clientsTable)
        .where(and(
          eq(clientsTable.tenantId, me.tenantId),
          eq(clientsTable.referralCode, upperCode),
        )).limit(1);
      if (!referrer) {
        next(new ValidationError("Código de indicação inválido", "VALIDATION_ERROR")); return;
      }
      // Get discount/bonus from referral settings
      const [refSettings] = await db.select({
        discountValue: referralSettingsTable.discountValue,
        discountType: referralSettingsTable.discountType,
        bonusValue: referralSettingsTable.bonusValue,
        isActive: referralSettingsTable.isEnabled,
      }).from(referralSettingsTable)
        .where(eq(referralSettingsTable.tenantId, me.tenantId)).limit(1);
      if (refSettings && refSettings.isActive === false) {
        next(new ValidationError("Programa de indicação inativo", "VALIDATION_ERROR")); return;
      }
      serverReferralCode = upperCode;
      serverReferralReferrerId = referrer.id;
      // Discount for the referred customer (percentage of base value)
      serverReferralDiscountPct = Number(refSettings?.discountValue ?? "5");
      serverReferralAmount = Math.round((baseValue * (serverReferralDiscountPct / 100)) * 100) / 100;
      // Bonus earned by the referrer
      serverReferralBonusValue = Number(refSettings?.bonusValue ?? "10");
    }

    // Apply discounts in priority order: coupon → loyalty → referral
    const {
      appliedCoupon: appliedCouponAmount,
      appliedLoyalty: appliedLoyaltyAmount,
      appliedReferral: appliedReferralAmount,
      discountTotal: serverDiscountTotal,
      finalTotal: serverFinalTotal,
    } = applyDiscounts(baseValue, serverCouponAmount, serverLoyaltyAmount, serverReferralAmount);

    const effectiveLoyaltyPoints = computeEffectiveLoyaltyPoints(
      serverLoyaltyPoints,
      appliedLoyaltyAmount,
      serverRealPerPoint,
    );

    const id = generateId();
    const voucherCode = generateVoucherCode();
    const seatsCount = parsed.data.seats.length;

    const tenantPrefix = await getTenantReservationPrefix(me.tenantId);
    const yearMonth = getYearMonth();

    type TxResult = { error: string; status: number; code?: string } | { ok: true };

    const txResult: TxResult = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(
        sql`SELECT id, available_seats, type FROM trips WHERE id = ${parsed.data.tripId} AND tenant_id = ${me.tenantId} FOR UPDATE`
      );
      // Drizzle's tx.execute() returns the raw node-postgres QueryResult; cast to access .rows
      const tripRow = (lockResult as unknown as { rows: Array<{ id: string; available_seats: number; type: string }> }).rows[0];
      if (!tripRow) return { error: "Trip not found or not in tenant", status: 400 };

      const availableSeats = Number(tripRow.available_seats);
      if (availableSeats < seatsCount) {
        return { error: "Não há vagas suficientes nesta viagem", status: 409, code: "RESERVATION_CONFLICT" };
      }

      if (serverCouponId) {
        const couponLock = await tx.execute(
          sql`SELECT id, usage_count, usage_limit FROM store_coupons WHERE id = ${serverCouponId} FOR UPDATE`
        );
        const couponRow = (couponLock as unknown as { rows: Array<{ id: string; usage_count: number; usage_limit: number | null }> }).rows[0];
        if (!couponRow) return { error: "Cupom não encontrado", status: 400 };
        if (couponRow.usage_limit != null && couponRow.usage_count >= couponRow.usage_limit) {
          return { error: "Limite de uso do cupom atingido", status: 400 };
        }
        await tx.update(storeCouponsTable).set({ usageCount: sql`usage_count + 1` })
          .where(eq(storeCouponsTable.id, serverCouponId));
      }

      const typeCode = tripTypeToCode(parsed.data.tripType ?? tripRow.type);
      const seq = await nextReservationSequence(me.tenantId, yearMonth, typeCode, tx);
      const reservationNumber = buildReservationNumber(tenantPrefix, typeCode, yearMonth, seq);

      await tx.insert(reservationsTable).values({
        id,
        tenantId: me.tenantId,
        tripId: parsed.data.tripId,
        clientId: parsed.data.clientId,
        seats: parsed.data.seats,
        tripType: parsed.data.tripType ?? null,
        packageType: parsed.data.packageType ?? null,
        hasInsurance: parsed.data.hasInsurance ?? false,
        totalValue: String(serverFinalTotal),
        paidValue: String(parsed.data.paidValue ?? 0),
        balance: String(computeBalance(serverFinalTotal, parsed.data.paidValue ?? 0)),
        paymentMethod: parsed.data.paymentMethod ?? null,
        installments: parsed.data.installments ?? 1,
        commissionPercentage: parsed.data.commissionPercentage ? String(parsed.data.commissionPercentage) : null,
        commissionAmount: parsed.data.commissionAmount ? String(parsed.data.commissionAmount) : null,
        sellerId: parsed.data.sellerId ?? null,
        status: RESERVATION_STATUS.PENDING,
        voucherCode,
        reservationNumber,
        qrCode: `QR-${voucherCode}`,
        notes: parsed.data.notes ?? null,
        createdById: me.id,
        discountCouponCode: appliedCouponAmount > 0 ? serverCouponCode : null,
        discountCouponAmount: appliedCouponAmount > 0 ? String(appliedCouponAmount) : null,
        discountLoyaltyPoints: effectiveLoyaltyPoints > 0 ? effectiveLoyaltyPoints : null,
        discountLoyaltyAmount: appliedLoyaltyAmount > 0 ? String(appliedLoyaltyAmount) : null,
        discountReferralCode: appliedReferralAmount > 0 ? serverReferralCode : null,
        discountReferralAmount: appliedReferralAmount > 0 ? String(appliedReferralAmount) : null,
        discountTotal: serverDiscountTotal > 0 ? String(serverDiscountTotal) : null,
      });

      await tx.insert(passengersTable).values({
        id: generateId(),
        reservationId: id,
        name: client.name,
        cpf: client.cpf ?? null,
        rg: client.rg ?? null,
        birthDate: client.birthDate ?? null,
        ageCategory: deriveAgeCategory(client.birthDate ?? null),
        seatNumber: parsed.data.seats[0] ?? null,
        isChildUnder7: getAgeYears(client.birthDate ?? null) < 7,
        isPrimary: true,
      });

      // Create placeholder passengers for additional seats (seats 1..N-1)
      for (let i = 1; i < seatsCount; i++) {
        await tx.insert(passengersTable).values({
          id: generateId(),
          reservationId: id,
          name: "A preencher",
          cpf: null,
          rg: null,
          birthDate: null,
          ageCategory: "adult",
          seatNumber: parsed.data.seats[i] ?? null,
          isChildUnder7: false,
          isPrimary: false,
        });
      }

      await tx.update(tripsTable).set({
        reservedSeats: sql`reserved_seats + ${seatsCount}`,
        availableSeats: sql`available_seats - ${seatsCount}`,
      }).where(and(eq(tripsTable.id, parsed.data.tripId), eq(tripsTable.tenantId, me.tenantId)));

      if (serverLoyaltyMemberId && effectiveLoyaltyPoints > 0) {
        const memberLock = await tx.execute(
          sql`SELECT id, available_points FROM loyalty_members WHERE id = ${serverLoyaltyMemberId} FOR UPDATE`
        );
        const memberRow = (memberLock as unknown as { rows: Array<{ id: string; available_points: number }> }).rows[0];
        if (!memberRow || memberRow.available_points < effectiveLoyaltyPoints) {
          return { error: "Pontos de fidelidade insuficientes (corrida detectada)", status: 400 };
        }
        const loyaltyResult = await tx.execute(
          sql`UPDATE loyalty_members SET available_points = available_points - ${effectiveLoyaltyPoints} WHERE id = ${serverLoyaltyMemberId} AND available_points >= ${effectiveLoyaltyPoints}`
        );
        const loyaltyAffected = (loyaltyResult as unknown as { rowCount: number }).rowCount ?? 0;
        if (loyaltyAffected === 0) {
          return { error: "Pontos de fidelidade insuficientes", status: 400 };
        }
        await tx.insert(loyaltyTransactionsTable).values({
          id: generateId(),
          tenantId: me.tenantId,
          memberId: serverLoyaltyMemberId,
          type: "redeem",
          points: -effectiveLoyaltyPoints,
          description: `Resgate de pontos na reserva ${voucherCode}`,
          referenceId: id,
          referenceType: "reservation",
        });
      }

      if (serverReferralCode && serverReferralReferrerId && appliedReferralAmount > 0) {
        // Insert a new completed referral record for this CRM reservation conversion
        // reservationId is stored so that cancellation can reverse exactly this record
        await tx.insert(referralsTable).values({
          id: generateId(),
          tenantId: me.tenantId,
          referrerId: serverReferralReferrerId,
          code: serverReferralCode,
          status: REFERRAL_STATUS.COMPLETED,
          referredId: parsed.data.clientId,
          reservationId: id,
          discountApplied: true,
          discountType: "percentage",
          discountValue: serverReferralDiscountPct.toFixed(2),
          discountAmount: appliedReferralAmount.toFixed(2),
          bonusAmount: serverReferralBonusValue.toFixed(2),
          convertedAt: new Date(),
        });
        // Update referrer client stats (earnings += referrer bonus)
        await tx.update(clientsTable)
          .set({
            totalReferrals: sql`COALESCE(total_referrals, 0) + 1`,
            successfulReferrals: sql`COALESCE(successful_referrals, 0) + 1`,
            referralEarnings: sql`COALESCE(referral_earnings, 0) + ${serverReferralBonusValue.toFixed(2)}`,
          })
          .where(eq(clientsTable.id, serverReferralReferrerId));
        // Update referred client: set referredById if not already set
        await tx.update(clientsTable)
          .set({ referredById: serverReferralReferrerId })
          .where(and(
            eq(clientsTable.id, parsed.data.clientId),
            sql`referred_by_id IS NULL`,
          ));
      }

      return { ok: true };
    });

    if ("error" in txResult) {
      next(new AppError(txResult.error, txResult.status, txResult.code ?? "RESERVATION_ERROR"));
      return;
    }

    const [reservation] = await db.select().from(reservationsTable)
      .where(and(eq(reservationsTable.id, id), eq(reservationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!reservation) { next(new AppError("Failed to create reservation", 500, "RESERVATION_CREATE_FAILED")); return; }
    const formatted = await formatReservation(reservation);
    res.status(201).json(formatted);
    broadcastSeatUpdate(reservation.tripId, me.tenantId).catch(() => {});
    CalendarSyncService.syncTrip(reservation.tripId)
      .catch((err) => req.log.warn({ err, context: "reservation.create", tripId: reservation.tripId, reservationId: id }, "Calendar sync falhou — continuando"));
    enqueueCommissionSync(id, me.tenantId)
      .catch((err) => req.log.error({ err }, "Error enqueuing commission sync after reservation creation"));
    if (reservation.clientId) {
      syncClientDeal(reservation.clientId, me.tenantId, reservation.tripId, Number(reservation.totalValue), me.id)
        .catch((err) => req.log.error({ err }, "Error syncing deal after reservation creation"));
      const totalFormatted = Number(reservation.totalValue).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      writeClientActivity(reservation.clientId, "reservation_created", `Reserva ${voucherCode} criada — ${totalFormatted}`, me.id, { voucherCode, totalValue: Number(reservation.totalValue) })
        .catch((err) => req.log.error({ err }, "Error writing reservation creation activity"));
    }
    // Fire-and-forget: enqueue confirmation email (never blocks reservation creation)
    ;(async () => {
      try {
        const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, me.tenantId)).limit(1);
        if (!tenant) return;
        const clientEmail = client?.email;
        if (!clientEmail) return;
        const totalVal = Number(reservation.totalValue);
        const paidVal = Number(reservation.paidValue);
        const balanceVal = Number(reservation.balance);
        const paymentStatus: typeof STORE_PAYMENT_STATUS.PAID | "partial" | typeof STORE_PAYMENT_STATUS.PENDING =
          paidVal >= totalVal ? STORE_PAYMENT_STATUS.PAID : paidVal > 0 ? "partial" : STORE_PAYMENT_STATUS.PENDING;
        const [tripRecord] = await db.select().from(tripsTable).where(eq(tripsTable.id, reservation.tripId)).limit(1);
        const dDate = formatted.trip.departureDate ? new Date(formatted.trip.departureDate) : null;
        const departureDate = dDate
          ? dDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
          : "";
        let duration = "";
        if (dDate && tripRecord?.returnDate) {
          const diffMs = tripRecord.returnDate.getTime() - dDate.getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
          if (diffDays > 0) duration = `${diffDays} dia${diffDays !== 1 ? "s" : ""}`;
        }
        const agencyPhone = tenant.whatsapp ?? tenant.phone ?? "";
        const agencyWebsite = tenant.website ?? `https://${tenant.slug}.visitecrm.com.br`;
        const whatsappNum = agencyPhone.replace(/\D/g, "");
        const whatsappUrl = whatsappNum ? `https://wa.me/${whatsappNum}` : "";
        const publicBase = agencyWebsite.replace(/\/$/, "");
        const voucherUrl = `${publicBase}/reserva/${reservation.voucherCode}`;
        const consultUrl = `${publicBase}/reservas`;
        const subject = `Reserva Confirmada — ${reservation.reservationNumber ?? reservation.voucherCode}`;
        await enqueueReservationConfirmationEmail({
          tenantId: me.tenantId,
          reservationId: reservation.id,
          subject,
          props: {
            reservationNumber: reservation.reservationNumber ?? reservation.voucherCode,
            voucherCode: reservation.voucherCode,
            clientName: client?.name ?? "",
            clientCpf: client?.cpf ?? "",
            clientEmail,
            clientPhone: client?.whatsapp ?? "",
            tripTitle: formatted.trip.name,
            destination: formatted.trip.destination,
            departureDate,
            duration,
            seats: (reservation.seats ?? []) as string[],
            totalAmount: totalVal,
            amountPaid: paidVal,
            amountPending: balanceVal,
            paymentMethod: reservation.paymentMethod ?? "pix",
            paymentStatus,
            agencyName: tenant.name,
            agencyLogo: tenant.logoUrl ?? "",
            agencyPhone,
            agencyPhoneVoice: tenant.phone ?? "",
            agencyEmail: tenant.email,
            agencyWebsite,
            voucherUrl,
            consultUrl,
            whatsappUrl,
          },
        });
        req.log.info({ reservationId: reservation.id }, "Reservation confirmation email enqueued");
      } catch (err) {
        req.log.error({ err }, "Error enqueuing reservation confirmation email");
      }
    })();
  } catch (err) {
    next(err);
  }
});

async function requireReservationAccess(
  me: { id: string; tenantId: string; role: string },
  reservationId: string,
): Promise<typeof reservationsTable.$inferSelect> {
  const [reservation] = await db.select().from(reservationsTable)
    .where(and(eq(reservationsTable.id, reservationId), eq(reservationsTable.tenantId, me.tenantId)))
    .limit(1);
  if (!reservation) throw new NotFoundError("Reservation not found", "RESERVATION_NOT_FOUND");
  if (me.role === ROLES.CLIENT) {
    const [clientRecord] = await db.select({ id: clientsTable.id }).from(clientsTable)
      .where(and(eq(clientsTable.tenantId, me.tenantId), eq(clientsTable.userId, me.id))).limit(1);
    if (!clientRecord || reservation.clientId !== clientRecord.id) {
      throw new NotFoundError("Reservation not found", "RESERVATION_NOT_FOUND");
    }
  } else if (me.role === ROLES.SALES) {
    const [clientRecord] = await db.select({ createdById: clientsTable.createdById }).from(clientsTable)
      .where(and(eq(clientsTable.id, reservation.clientId), eq(clientsTable.tenantId, me.tenantId))).limit(1);
    if (!clientRecord || clientRecord.createdById !== me.id) {
      throw new NotFoundError("Reservation not found", "RESERVATION_NOT_FOUND");
    }
  }
  return reservation;
}

router.get("/reservations/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const reservation = await requireReservationAccess(me, req.params.id);
    const formatted = await formatReservation(reservation);
    res.json(formatted);
  } catch (err) {
    next(err);
  }
});

const CANCELLING_STATUSES: readonly ReservationStatus[] = [RESERVATION_STATUS.CANCELLED, RESERVATION_STATUS.REFUNDED] as const;
const ACTIVE_STATUSES: readonly ReservationStatus[] = [RESERVATION_STATUS.PENDING, RESERVATION_STATUS.CONFIRMED] as const;

router.patch("/reservations/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === ROLES.CLIENT) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }
    const existing = await requireReservationAccess(me, req.params.id);

    const parsed = UpdateReservationBody.safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }

    const updates: Partial<typeof reservationsTable.$inferInsert> = {};
    if (parsed.data.status != null) updates.status = parseReservationStatus(parsed.data.status);
    if (parsed.data.paymentMethod != null) updates.paymentMethod = parsed.data.paymentMethod;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;
    if (parsed.data.seats != null) updates.seats = parsed.data.seats;
    if (parsed.data.installments != null) updates.installments = parsed.data.installments;
    if (parsed.data.boardingLocationId !== undefined) updates.boardingLocationId = parsed.data.boardingLocationId ?? null;
    if (parsed.data.totalValue != null) {
      const newTotal = String(parsed.data.totalValue);
      const paidValue = Number(existing.paidValue);
      updates.totalValue = newTotal;
      updates.balance = String(computeBalance(parsed.data.totalValue, paidValue));
    }
    if (parsed.data.commissionAmount !== undefined) updates.commissionAmount = parsed.data.commissionAmount != null ? String(parsed.data.commissionAmount) : null;
    if (parsed.data.sellerId !== undefined) updates.sellerId = parsed.data.sellerId ?? null;

    const isBeingCancelled = parsed.data.status != null && CANCELLING_STATUSES.includes(parsed.data.status);
    const wasActive = ACTIVE_STATUSES.includes(existing.status);
    const wasConfirmed = existing.status === RESERVATION_STATUS.CONFIRMED;
    const isBeingConfirmed = parsed.data.status === RESERVATION_STATUS.CONFIRMED && existing.status === RESERVATION_STATUS.PENDING;
    const isBeingDemoted = parsed.data.status === RESERVATION_STATUS.PENDING && wasConfirmed;

    const reservation = await db.transaction(async (tx) => {
      if (isBeingCancelled && wasActive) {
        const seatsCount = existing.seats.length;
        if (seatsCount > 0) {
          await tx.update(tripsTable).set({
            availableSeats: sql`LEAST(total_capacity, GREATEST(0, available_seats + ${seatsCount}))`,
            ...(wasConfirmed
              ? { confirmedSeats: sql`GREATEST(0, confirmed_seats - ${seatsCount})` }
              : { reservedSeats: sql`GREATEST(0, reserved_seats - ${seatsCount})` }),
          }).where(and(eq(tripsTable.id, existing.tripId), eq(tripsTable.tenantId, me.tenantId)));
        }

        // --- Reversal 1: coupon usage_count ---
        // Two-step lookup mirrors creation: find exact coupon ID by code+store,
        // then decrement by ID — symmetric with creation's WHERE id = serverCouponId.
        if (existing.discountCouponCode) {
          const [store] = await tx.select({ id: storesTable.id })
            .from(storesTable)
            .where(eq(storesTable.tenantId, me.tenantId))
            .limit(1);
          if (store) {
            const [coupon] = await tx.select({ id: storeCouponsTable.id })
              .from(storeCouponsTable)
              .where(and(
                eq(storeCouponsTable.storeId, store.id),
                eq(storeCouponsTable.code, existing.discountCouponCode),
              ))
              .limit(1);
            if (coupon) {
              await tx.update(storeCouponsTable)
                .set({ usageCount: sql`GREATEST(0, usage_count - 1)` })
                .where(eq(storeCouponsTable.id, coupon.id));
            }
          }
        }

        // --- Reversal 2: loyalty points used as discount ---
        const loyaltyPointsToRestore = existing.discountLoyaltyPoints ?? 0;
        if (loyaltyPointsToRestore > 0 && existing.clientId) {
          const [loyaltyMember] = await tx
            .select({ id: loyaltyMembersTable.id, availablePoints: loyaltyMembersTable.availablePoints })
            .from(loyaltyMembersTable)
            .where(and(
              eq(loyaltyMembersTable.tenantId, me.tenantId),
              eq(loyaltyMembersTable.clientId, existing.clientId),
            ))
            .limit(1);
          if (loyaltyMember) {
            // Idempotency: skip if a "refund" transaction for this reservation already exists
            // (prevents double-reversal on reopen → re-cancel flows)
            const [existingRefund] = await tx
              .select({ id: loyaltyTransactionsTable.id })
              .from(loyaltyTransactionsTable)
              .where(and(
                eq(loyaltyTransactionsTable.memberId, loyaltyMember.id),
                eq(loyaltyTransactionsTable.type, "refund"),
                eq(loyaltyTransactionsTable.referenceId, req.params.id),
              ))
              .limit(1);
            if (!existingRefund) {
              await tx.update(loyaltyMembersTable)
                .set({
                  availablePoints: loyaltyMember.availablePoints + loyaltyPointsToRestore,
                  lastActivityAt: new Date(),
                })
                .where(eq(loyaltyMembersTable.id, loyaltyMember.id));
              await tx.insert(loyaltyTransactionsTable).values({
                id: generateId(),
                tenantId: me.tenantId,
                memberId: loyaltyMember.id,
                type: "refund",
                points: loyaltyPointsToRestore,
                description: `Estorno de pontos — cancelamento da reserva ${existing.voucherCode}`,
                referenceId: req.params.id,
                referenceType: "reservation",
              });
            }
          }
        }

        // --- Reversal 3: referral bonus credited to referrer ---
        // Uses reservationId for exact scoping — avoids matching the wrong completed
        // referral when the same client has multiple bookings with the same code.
        if (existing.discountReferralCode) {
          const [referralRecord] = await tx
            .select({ id: referralsTable.id, referrerId: referralsTable.referrerId, bonusAmount: referralsTable.bonusAmount })
            .from(referralsTable)
            .where(and(
              eq(referralsTable.tenantId, me.tenantId),
              eq(referralsTable.reservationId, req.params.id),
              eq(referralsTable.status, REFERRAL_STATUS.COMPLETED),
            ))
            .limit(1);
          if (referralRecord) {
            const bonusToReverse = Number(referralRecord.bonusAmount);
            await tx.update(clientsTable)
              .set({
                successfulReferrals: sql`GREATEST(0, COALESCE(successful_referrals, 0) - 1)`,
                referralEarnings: sql`GREATEST(0, COALESCE(referral_earnings, 0) - ${bonusToReverse.toFixed(2)})`,
              })
              .where(and(
                eq(clientsTable.id, referralRecord.referrerId),
                eq(clientsTable.tenantId, me.tenantId),
              ));
            await tx.update(referralsTable)
              .set({ status: "reversed" })
              .where(eq(referralsTable.id, referralRecord.id));
          }
        }

        // --- Reversal 4: loyalty points earned from payments or reservation confirmation ---
        if (existing.clientId) {
          const [loyaltyMember] = await tx
            .select({
              id: loyaltyMembersTable.id,
              availablePoints: loyaltyMembersTable.availablePoints,
              totalPoints: loyaltyMembersTable.totalPoints,
            })
            .from(loyaltyMembersTable)
            .where(and(
              eq(loyaltyMembersTable.tenantId, me.tenantId),
              eq(loyaltyMembersTable.clientId, existing.clientId),
            ))
            .limit(1);
          if (loyaltyMember) {
            // Idempotency: skip if a "cancellation" transaction for this reservation already exists
            // (prevents double-clawback on reopen → re-cancel flows)
            const [existingClawback] = await tx
              .select({ id: loyaltyTransactionsTable.id })
              .from(loyaltyTransactionsTable)
              .where(and(
                eq(loyaltyTransactionsTable.memberId, loyaltyMember.id),
                eq(loyaltyTransactionsTable.type, "cancellation"),
                eq(loyaltyTransactionsTable.referenceId, req.params.id),
              ))
              .limit(1);
            if (!existingClawback) {
              // Collect payment-based earn transactions (when loyalty was awarded per payment)
              const reservationPayments = await tx
                .select({ id: paymentsTable.id })
                .from(paymentsTable)
                .where(and(
                  eq(paymentsTable.tenantId, me.tenantId),
                  eq(paymentsTable.reservationId, req.params.id),
                ));
              let paymentEarnTx: { points: number }[] = [];
              if (reservationPayments.length > 0) {
                const paymentIds = reservationPayments.map(p => p.id);
                paymentEarnTx = await tx
                  .select({ points: loyaltyTransactionsTable.points })
                  .from(loyaltyTransactionsTable)
                  .where(and(
                    eq(loyaltyTransactionsTable.tenantId, me.tenantId),
                    eq(loyaltyTransactionsTable.memberId, loyaltyMember.id),
                    eq(loyaltyTransactionsTable.referenceType, "payment"),
                    eq(loyaltyTransactionsTable.type, "earn"),
                    inArray(loyaltyTransactionsTable.referenceId, paymentIds),
                  ));
              }
              // Collect reservation-based earn transactions (confirmation or payment trigger)
              const reservationEarnTx = await tx
                .select({ points: loyaltyTransactionsTable.points })
                .from(loyaltyTransactionsTable)
                .where(and(
                  eq(loyaltyTransactionsTable.tenantId, me.tenantId),
                  eq(loyaltyTransactionsTable.memberId, loyaltyMember.id),
                  eq(loyaltyTransactionsTable.referenceType, "reservation"),
                  eq(loyaltyTransactionsTable.type, "earn"),
                  eq(loyaltyTransactionsTable.referenceId, req.params.id),
                ));
              const earnTransactions = [...paymentEarnTx, ...reservationEarnTx];
              const totalEarnedPoints = earnTransactions.reduce((sum, t) => sum + t.points, 0);
              if (totalEarnedPoints > 0) {
                const newAvailable = Math.max(0, loyaltyMember.availablePoints - totalEarnedPoints);
                const newTotal = Math.max(0, loyaltyMember.totalPoints - totalEarnedPoints);
                await tx.update(loyaltyMembersTable)
                  .set({
                    availablePoints: newAvailable,
                    totalPoints: newTotal,
                    tier: calculateTier(newTotal),
                    lastActivityAt: new Date(),
                  })
                  .where(eq(loyaltyMembersTable.id, loyaltyMember.id));
                await tx.insert(loyaltyTransactionsTable).values({
                  id: generateId(),
                  tenantId: me.tenantId,
                  memberId: loyaltyMember.id,
                  type: "cancellation",
                  points: -totalEarnedPoints,
                  description: `Estorno de pontos — cancelamento da reserva ${existing.voucherCode}`,
                  referenceId: req.params.id,
                  referenceType: "reservation",
                });
              }
            }
          }
        }

        // --- Cancel orphan commissions (pending/approved) tied to this reservation ---
        await tx.update(commissionsTable)
          .set({ status: COMMISSION_STATUS.CANCELLED })
          .where(and(
            eq(commissionsTable.reservationId, req.params.id),
            eq(commissionsTable.tenantId, me.tenantId),
            inArray(commissionsTable.status, [COMMISSION_STATUS.PENDING, COMMISSION_STATUS.APPROVED]),
          ));
      }

      // --- Seat counter sync for manual status transitions ---
      // pending → confirmed: move seats from reserved to confirmed bucket
      if (isBeingConfirmed && existing.seats.length > 0) {
        const seatsCount = existing.seats.length;
        await tx.update(tripsTable).set({
          confirmedSeats: sql`confirmed_seats + ${seatsCount}`,
          reservedSeats: sql`GREATEST(0, reserved_seats - ${seatsCount})`,
        }).where(and(eq(tripsTable.id, existing.tripId), eq(tripsTable.tenantId, me.tenantId)));
      }

      // confirmed → pending: revert seats from confirmed back to reserved bucket
      if (isBeingDemoted && existing.seats.length > 0) {
        const seatsCount = existing.seats.length;
        await tx.update(tripsTable).set({
          confirmedSeats: sql`GREATEST(0, confirmed_seats - ${seatsCount})`,
          reservedSeats: sql`reserved_seats + ${seatsCount}`,
        }).where(and(eq(tripsTable.id, existing.tripId), eq(tripsTable.tenantId, me.tenantId)));
      }

      await tx.update(reservationsTable).set(updates)
        .where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)));
      const [updated] = await tx.select().from(reservationsTable)
        .where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!updated) return null;

      if (parsed.data.seats != null) {
        const newSeats = parsed.data.seats;
        const newCount = newSeats.length;
        const priorSeats: string[] = existing.seats ?? [];

        // Order passengers by their position in the prior seats array (primary always first).
        const currentPassengers = await tx.select()
          .from(passengersTable)
          .where(eq(passengersTable.reservationId, req.params.id))
          .orderBy(desc(passengersTable.isPrimary), asc(passengersTable.id));

        // Re-sort in JS to use prior seats index for stable positional mapping.
        currentPassengers.sort((a, b) => {
          if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
          const ai = priorSeats.indexOf(a.seatNumber ?? "");
          const bi = priorSeats.indexOf(b.seatNumber ?? "");
          return (ai === -1 ? priorSeats.length : ai) - (bi === -1 ? priorSeats.length : bi);
        });

        const currentCount = currentPassengers.length;

        if (newCount === 0) {
          // seats cleared: delete all passenger rows to keep count aligned with seats.length.
          if (currentCount > 0) {
            const filledOnClear = currentPassengers.filter(p =>
              (p.name && p.name !== "A preencher") || p.cpf
            );
            if (filledOnClear.length > 0) {
              throw new AppError(
                "Cannot reduce seats: some passengers being removed already have their details filled in. Please clear or reassign them first.",
                409,
                "PASSENGERS_FILLED",
                { affectedPassengers: filledOnClear.map(p => ({ id: p.id, name: p.name, cpf: p.cpf })) },
              );
            }
            await tx.delete(passengersTable)
              .where(eq(passengersTable.reservationId, req.params.id));
          }
        } else if (currentCount === 0) {
          // No passengers exist yet — bootstrap primary from client data then add placeholders.
          if (existing.clientId) {
            const [clientData] = await tx.select().from(clientsTable)
              .where(and(eq(clientsTable.id, existing.clientId), eq(clientsTable.tenantId, me.tenantId)))
              .limit(1);
            if (clientData) {
              await tx.insert(passengersTable).values({
                id: generateId(),
                reservationId: req.params.id,
                name: clientData.name,
                cpf: clientData.cpf ?? null,
                rg: clientData.rg ?? null,
                birthDate: clientData.birthDate ?? null,
                ageCategory: deriveAgeCategory(clientData.birthDate ?? null),
                seatNumber: newSeats[0] ?? null,
                isChildUnder7: getAgeYears(clientData.birthDate ?? null) < 7,
                isPrimary: true,
              }).onConflictDoNothing();
            }
          }
          for (let i = 1; i < newCount; i++) {
            await tx.insert(passengersTable).values({
              id: generateId(),
              reservationId: req.params.id,
              name: "A preencher",
              cpf: null,
              rg: null,
              birthDate: null,
              ageCategory: "adult",
              seatNumber: newSeats[i] ?? null,
              isChildUnder7: false,
              isPrimary: false,
            });
          }
        } else if (newCount >= currentCount) {
          // Same count or more: add placeholders for extra seats, remap existing ones.
          for (let i = currentCount; i < newCount; i++) {
            await tx.insert(passengersTable).values({
              id: generateId(),
              reservationId: req.params.id,
              name: "A preencher",
              cpf: null,
              rg: null,
              birthDate: null,
              ageCategory: "adult",
              seatNumber: newSeats[i] ?? null,
              isChildUnder7: false,
              isPrimary: false,
            });
          }
          for (let i = 0; i < currentCount; i++) {
            await tx.update(passengersTable)
              .set({ seatNumber: newSeats[i] ?? null })
              .where(eq(passengersTable.id, currentPassengers[i].id));
          }
        } else {
          // Fewer seats: choose removal candidates globally.
          // Priority: blank non-primary first (no cpf / placeholder name), then non-primary
          // with data; primary is always the last to be removed.
          const primaryPassenger = currentPassengers.find(p => p.isPrimary);
          const nonPrimary = currentPassengers.filter(p => !p.isPrimary);

          const sortedNonPrimary = [...nonPrimary].sort((a, b) => {
            const aBlank = (!a.cpf && (!a.name || a.name === "A preencher")) ? 0 : 1;
            const bBlank = (!b.cpf && (!b.name || b.name === "A preencher")) ? 0 : 1;
            return aBlank - bBlank;
          });

          const keepNonPrimaryCount = primaryPassenger ? newCount - 1 : newCount;
          const keepNonPrimary = sortedNonPrimary.slice(sortedNonPrimary.length - Math.max(0, keepNonPrimaryCount));
          const removeNonPrimary = sortedNonPrimary.slice(0, sortedNonPrimary.length - Math.max(0, keepNonPrimaryCount));
          const passengersToKeep = primaryPassenger ? [primaryPassenger, ...keepNonPrimary] : keepNonPrimary;

          const filledPassengers = removeNonPrimary.filter(p =>
            (p.name && p.name !== "A preencher") || p.cpf
          );
          if (filledPassengers.length > 0) {
            throw new AppError(
              "Cannot reduce seats: some passengers being removed already have their details filled in. Please clear or reassign them first.",
              409,
              "PASSENGERS_FILLED",
              { affectedPassengers: filledPassengers.map(p => ({ id: p.id, name: p.name, cpf: p.cpf })) },
            );
          }

          if (removeNonPrimary.length > 0) {
            await tx.delete(passengersTable)
              .where(inArray(passengersTable.id, removeNonPrimary.map(p => p.id)));
          }

          const orderedKept = [
            ...passengersToKeep.filter(p => p.isPrimary),
            ...passengersToKeep.filter(p => !p.isPrimary),
          ];
          for (let i = 0; i < orderedKept.length; i++) {
            await tx.update(passengersTable)
              .set({ seatNumber: newSeats[i] ?? null })
              .where(eq(passengersTable.id, orderedKept[i].id));
          }
        }
      }

      return updated;
    });

    if (!reservation) { next(new NotFoundError("Reservation not found", "NOT_FOUND")); return; }
    if (parsed.data.totalValue != null && existing.clientId) {
      syncClientDeal(existing.clientId, me.tenantId, existing.tripId, parsed.data.totalValue, me.id)
        .catch((err) => req.log.error({ err }, "Error syncing deal after reservation update"));
    }
    if (isBeingConfirmed && existing.clientId) {
      loyaltyAwardPointsForReservation({
        clientId: existing.clientId,
        reservationId: req.params.id,
        amount: reservation.totalValue,
        tenantId: me.tenantId,
      }).catch((err) => req.log.error({ err }, "Error awarding loyalty points on reservation confirmation"));
    }
    if (isBeingCancelled && existing.clientId) {
      const code = existing.voucherCode ?? req.params.id.slice(-8).toUpperCase();
      writeClientActivity(existing.clientId, "reservation_cancelled", `Reserva ${code} cancelada`, me.id, { voucherCode: code })
        .catch((err) => req.log.error({ err }, "Error writing cancellation activity"));
    }
    if (!isBeingCancelled) {
      enqueueCommissionSync(req.params.id, me.tenantId)
        .catch((err) => req.log.error({ err }, "Error enqueuing commission sync after reservation update"));
    }
    const formatted = await formatReservation(reservation);
    res.json(formatted);
    // Send cancellation email only on a true active → cancelled transition
    // (not for "refunded", not for repeated patches on already-cancelled reservations)
    if (parsed.data.status === RESERVATION_STATUS.CANCELLED && wasActive && existing.clientId) {
      enqueueReservationCancellationEmail(req.params.id, me.tenantId)
        .catch((err) => req.log.error({ err }, "Error enqueueing cancellation email"));
    }
    broadcastSeatUpdate(existing.tripId, me.tenantId).catch(() => {});
    // Sync Google Calendar events after every reservation PATCH.
    // Use the dedicated cancellation path for active→cancelled/refunded transitions
    // (ensures stale seller events and reduced passenger count are reflected explicitly);
    // fall back to the general syncTrip for all other updates (sellerId, totalValue, etc.)
    if (isBeingCancelled && wasActive) {
      CalendarSyncService.syncTripOnReservationCancellation(existing.tripId)
        .catch((err) => req.log.error({ err }, "Error syncing Google Calendar after reservation cancellation"));
    } else {
      CalendarSyncService.syncTrip(existing.tripId)
        .catch((err) => req.log.error({ err }, "Error syncing Google Calendar after reservation update"));
    }
  } catch (err) {
    next(err);
  }
});

router.delete("/reservations/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!MANAGEMENT_ROLES.includes(me.role)) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }
    const existing = await requireReservationAccess(me, req.params.id);

    await db.transaction(async (tx) => {
      if (!CANCELLING_STATUSES.includes(existing.status)) {
        const seatsCount = existing.seats.length;
        if (seatsCount > 0) {
          const wasConfirmedOnDelete = existing.status === RESERVATION_STATUS.CONFIRMED;
          await tx.update(tripsTable).set({
            availableSeats: sql`LEAST(total_capacity, GREATEST(0, available_seats + ${seatsCount}))`,
            ...(wasConfirmedOnDelete
              ? { confirmedSeats: sql`GREATEST(0, confirmed_seats - ${seatsCount})` }
              : { reservedSeats: sql`GREATEST(0, reserved_seats - ${seatsCount})` }),
          }).where(and(eq(tripsTable.id, existing.tripId), eq(tripsTable.tenantId, me.tenantId)));
        }
      }
      await tx.delete(reservationsTable)
        .where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)));
    });
    res.json({ success: true });
    broadcastSeatUpdate(existing.tripId, me.tenantId).catch(() => {});
    CalendarSyncService.syncTrip(existing.tripId)
      .catch((err) => req.log.warn({ err, context: "reservation.delete", tripId: existing.tripId, reservationId: req.params.id }, "Calendar sync falhou — continuando"));
  } catch (err) {
    next(err);
  }
});

router.post("/reservations/:id/check-in", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!MANAGEMENT_ROLES.includes(me.role)) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }
    const existing = await requireReservationAccess(me, req.params.id);
    await db.update(reservationsTable).set({
      checkedInAt: new Date(),
      status: RESERVATION_STATUS.COMPLETED,
    }).where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)));
    const [reservation] = await db.select().from(reservationsTable)
      .where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!reservation) { next(new NotFoundError("Reservation not found", "NOT_FOUND")); return; }
    const formatted = await formatReservation(reservation);
    res.json(formatted);
    if (existing.clientId) {
      const [trip] = await db.select({ name: tripsTable.name }).from(tripsTable)
        .where(eq(tripsTable.id, existing.tripId)).limit(1);
      const tripName = trip?.name ?? "viagem";
      writeClientActivity(existing.clientId, "checkin", `Check-in realizado na viagem ${tripName}`, me.id, { tripName })
        .catch((err) => req.log.error({ err }, "Error writing check-in activity"));
    }
  } catch (err) {
    next(err);
  }
});

router.get("/reservations/:reservationId/passengers", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const reservation = await requireReservationAccess(me, req.params.reservationId);
    const passengers = await db.select().from(passengersTable)
      .where(eq(passengersTable.reservationId, req.params.reservationId));
    res.json(passengers.map(formatPassenger));
  } catch (err) {
    next(err);
  }
});

router.post("/reservations/:reservationId/passengers", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === ROLES.CLIENT) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }
    const reservation = await requireReservationAccess(me, req.params.reservationId);
    const parsed = CreatePassengerBody.safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }
    const id = generateId();
    await db.insert(passengersTable).values({
      id,
      reservationId: req.params.reservationId,
      name: parsed.data.name,
      cpf: parsed.data.cpf ?? null,
      rg: parsed.data.rg ?? null,
      birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
      ageCategory: parsed.data.ageCategory,
      seatNumber: parsed.data.seatNumber ?? null,
      isChildUnder7: parsed.data.isChildUnder7 ?? false,
    });
    const [passenger] = await db.select().from(passengersTable)
      .where(and(eq(passengersTable.id, id), eq(passengersTable.reservationId, req.params.reservationId)))
      .limit(1);
    if (!passenger) { next(new AppError("Failed to create passenger", 500, "PASSENGER_CREATE_FAILED")); return; }
    res.status(201).json(formatPassenger(passenger));
  } catch (err) {
    next(err);
  }
});

router.patch("/reservations/:reservationId/passengers/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === ROLES.CLIENT) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }
    const reservation = await requireReservationAccess(me, req.params.reservationId);
    const parsed = UpdatePassengerBody.safeParse(req.body);
    if (!parsed.success) { next(new ValidationError(String(parsed.error.message), "VALIDATION_ERROR")); return; }
    const updates: Partial<typeof passengersTable.$inferInsert> = {};
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.cpf !== undefined) updates.cpf = parsed.data.cpf ?? null;
    if (parsed.data.seatNumber !== undefined) updates.seatNumber = parsed.data.seatNumber ?? null;
    if (parsed.data.ageCategory != null) updates.ageCategory = parsed.data.ageCategory;
    await db.update(passengersTable).set(updates)
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)));
    const [passenger] = await db.select().from(passengersTable)
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)))
      .limit(1);
    if (!passenger) { next(new NotFoundError("Reservation not found", "NOT_FOUND")); return; }
    res.json(formatPassenger(passenger));
  } catch (err) {
    next(err);
  }
});

router.delete("/reservations/:reservationId/passengers/:id", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === ROLES.CLIENT) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }
    const reservation = await requireReservationAccess(me, req.params.reservationId);
    await db.delete(passengersTable)
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/reservations/:reservationId/passengers/:id/check-in", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!MANAGEMENT_ROLES.includes(me.role)) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }
    const reservation = await requireReservationAccess(me, req.params.reservationId);
    await db.update(passengersTable)
      .set({ checkedInAt: new Date() })
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)));
    const [passenger] = await db.select().from(passengersTable)
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)))
      .limit(1);
    if (!passenger) { next(new NotFoundError("Reservation not found", "NOT_FOUND")); return; }
    res.json(formatPassenger(passenger));
  } catch (err) {
    next(err);
  }
});

router.delete("/reservations/:reservationId/passengers/:id/check-in", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!MANAGEMENT_ROLES.includes(me.role)) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }
    const reservation = await requireReservationAccess(me, req.params.reservationId);
    await db.update(passengersTable)
      .set({ checkedInAt: null })
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)));
    const [passenger] = await db.select().from(passengersTable)
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)))
      .limit(1);
    if (!passenger) { next(new NotFoundError("Reservation not found", "NOT_FOUND")); return; }
    res.json(formatPassenger(passenger));
  } catch (err) {
    next(err);
  }
});

router.post("/reservations/:id/retry-commission-sync", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!ADMIN_ROLES.includes(me.role)) { next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE")); return; }

    const [reservation] = await db.select()
      .from(reservationsTable)
      .where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!reservation) { next(new NotFoundError("Reservation not found", "NOT_FOUND")); return; }

    await enqueueCommissionSync(reservation.id, me.tenantId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
