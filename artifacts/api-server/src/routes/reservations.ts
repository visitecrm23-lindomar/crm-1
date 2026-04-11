import { Router } from "express";
import { db } from "@workspace/db";
import { reservationsTable, passengersTable, tripsTable, clientsTable, storeCouponsTable, storesTable, loyaltyMembersTable, loyaltyTransactionsTable, loyaltyProgramsTable, referralsTable, dealsTable, pipelineStagesTable } from "@workspace/db";
import { eq, and, sql, desc, asc, inArray, or, ilike } from "drizzle-orm";
import { generateId, generateVoucherCode } from "../lib/id";
import { requireAuth, getTenantUser } from "../lib/tenant";
import { deriveAgeCategory, getAgeYears } from "../lib/passenger";
import { CreateReservationBody, UpdateReservationBody, CreatePassengerBody, UpdatePassengerBody } from "@workspace/api-zod";
import { z } from "zod/v4";
import { writeClientActivity } from "../lib/activities";

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
    .where(and(eq(dealsTable.clientId, clientId), eq(dealsTable.tenantId, tenantId), eq(dealsTable.status, "open")))
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
      status: "open",
      ownerId,
    });
  }
}

async function formatReservation(r: typeof reservationsTable.$inferSelect) {
  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, r.tripId)).limit(1);
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, r.clientId)).limit(1);
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
    status: r.status,
    voucherCode: r.voucherCode,
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

router.post("/reservations/validate-coupon", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = ValidateCouponBodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

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
    req.log.error({ err }, "Error validating coupon");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reservations/stats", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const tenantCond = eq(reservationsTable.tenantId, me.tenantId);

    const [statsRow] = await db
      .select({
        total: sql<number>`count(*)`,
        confirmed: sql<number>`count(*) filter (where status = 'confirmed')`,
        pending: sql<number>`count(*) filter (where status = 'pending')`,
        cancelled: sql<number>`count(*) filter (where status = 'cancelled')`,
        totalOutstanding: sql<number>`coalesce(sum(balance) filter (where status not in ('cancelled', 'completed')), 0)`,
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
    req.log.error({ err }, "Error fetching reservation stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reservations", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const { tripId, clientId, status, search, createdById, dateFrom, dateTo, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (dateFrom && !ISO_DATE.test(dateFrom)) { res.status(400).json({ error: "dateFrom must be a valid ISO date (YYYY-MM-DD)" }); return; }
    if (dateTo && !ISO_DATE.test(dateTo)) { res.status(400).json({ error: "dateTo must be a valid ISO date (YYYY-MM-DD)" }); return; }

    const conditions: ReturnType<typeof eq>[] = [eq(reservationsTable.tenantId, me.tenantId)];
    if (tripId) conditions.push(eq(reservationsTable.tripId, tripId));
    if (status) conditions.push(eq(reservationsTable.status, status));
    if (createdById) conditions.push(eq(reservationsTable.createdById, createdById));
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
      const voucherCondition = ilike(reservationsTable.voucherCode, term) as ReturnType<typeof eq>;
      if (matchingClientIds.length > 0) {
        conditions.push(or(voucherCondition, inArray(reservationsTable.clientId, matchingClientIds)) as ReturnType<typeof eq>);
      } else {
        conditions.push(voucherCondition);
      }
    }

    if (me.role === "cliente") {
      const [clientRecord] = await db.select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, me.tenantId), eq(clientsTable.userId, me.id)))
        .limit(1);
      if (!clientRecord) {
        res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
        return;
      }
      conditions.push(eq(reservationsTable.clientId, clientRecord.id));
    } else if (me.role === "vendedor") {
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
    req.log.error({ err }, "Error listing reservations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reservations", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const parsed = CreateReservationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [client] = await db.select().from(clientsTable)
      .where(and(eq(clientsTable.id, parsed.data.clientId), eq(clientsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!client) { res.status(400).json({ error: "Client not found or not in tenant" }); return; }

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
        res.status(400).json({ error: "Cupom inválido ou expirado" }); return;
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
        res.status(400).json({ error: "Cliente não é membro do programa de fidelidade" }); return;
      }
      const [program] = await db.select().from(loyaltyProgramsTable).where(eq(loyaltyProgramsTable.id, member.programId)).limit(1);
      if (!program) {
        res.status(400).json({ error: "Programa de fidelidade não encontrado" }); return;
      }
      const requestedPoints = parsed.data.discountLoyaltyPoints;
      const minRedeemPoints = program.minRedeemPoints ?? 1;
      if (requestedPoints < minRedeemPoints) {
        res.status(400).json({ error: `Mínimo de ${minRedeemPoints} pontos para resgate` }); return;
      }
      if ((member.availablePoints ?? 0) < requestedPoints) {
        res.status(400).json({ error: "Pontos de fidelidade insuficientes" }); return;
      }
      serverLoyaltyMemberId = member.id;
      serverLoyaltyPoints = requestedPoints;
      serverRealPerPoint = Number(program.realPerPoint ?? "0");
      serverLoyaltyAmount = Math.round(requestedPoints * serverRealPerPoint * 100) / 100;
    }

    let serverReferralCode: string | null = null;
    let serverReferralAmount = 0;

    if (parsed.data.discountReferralCode) {
      const [referral] = await db.select().from(referralsTable)
        .where(and(
          eq(referralsTable.tenantId, me.tenantId),
          eq(referralsTable.code, parsed.data.discountReferralCode),
          eq(referralsTable.status, "pending"),
        )).limit(1);
      if (!referral) {
        res.status(400).json({ error: "Código de indicação inválido ou já utilizado" }); return;
      }
      serverReferralCode = referral.code;
      serverReferralAmount = Number(referral.bonusAmount ?? "0");
    }

    // Apply discounts in priority order against running remaining balance
    // Priority: coupon → loyalty → referral
    let remaining = baseValue;
    const appliedCouponAmount = Math.round(Math.min(serverCouponAmount, remaining) * 100) / 100;
    remaining = Math.round((remaining - appliedCouponAmount) * 100) / 100;

    const appliedLoyaltyAmount = Math.round(Math.min(serverLoyaltyAmount, remaining) * 100) / 100;
    const effectiveLoyaltyPoints = serverRealPerPoint > 0
      ? Math.min(serverLoyaltyPoints, Math.ceil(appliedLoyaltyAmount / serverRealPerPoint))
      : 0;
    remaining = Math.round((remaining - appliedLoyaltyAmount) * 100) / 100;

    const appliedReferralAmount = Math.round(Math.min(serverReferralAmount, remaining) * 100) / 100;
    remaining = Math.round((remaining - appliedReferralAmount) * 100) / 100;

    const serverDiscountTotal = Math.round((appliedCouponAmount + appliedLoyaltyAmount + appliedReferralAmount) * 100) / 100;
    const serverFinalTotal = Math.max(0, Math.round((baseValue - serverDiscountTotal) * 100) / 100);

    const id = generateId();
    const voucherCode = generateVoucherCode();
    const seatsCount = parsed.data.seats.length;

    type TxResult = { error: string; status: number } | { ok: true };

    const txResult: TxResult = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(
        sql`SELECT id, available_seats FROM trips WHERE id = ${parsed.data.tripId} AND tenant_id = ${me.tenantId} FOR UPDATE`
      );
      // Drizzle's tx.execute() returns the raw node-postgres QueryResult; cast to access .rows
      const tripRow = (lockResult as unknown as { rows: Array<{ id: string; available_seats: number }> }).rows[0];
      if (!tripRow) return { error: "Trip not found or not in tenant", status: 400 };

      const availableSeats = Number(tripRow.available_seats);
      if (availableSeats < seatsCount) {
        return { error: "Não há vagas suficientes nesta viagem", status: 400 };
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
        balance: String(Math.max(0, serverFinalTotal - (parsed.data.paidValue ?? 0))),
        paymentMethod: parsed.data.paymentMethod ?? null,
        installments: parsed.data.installments ?? 1,
        commissionPercentage: parsed.data.commissionPercentage ? String(parsed.data.commissionPercentage) : null,
        status: "pending",
        voucherCode,
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

      if (serverReferralCode && appliedReferralAmount > 0) {
        const referralLock = await tx.execute(
          sql`SELECT id, status FROM referrals WHERE tenant_id = ${me.tenantId} AND code = ${serverReferralCode} AND status = 'pending' FOR UPDATE`
        );
        const referralRow = (referralLock as unknown as { rows: Array<{ id: string; status: string }> }).rows[0];
        if (!referralRow) {
          return { error: "Código de indicação já foi utilizado por outro processo", status: 400 };
        }
        const referralResult = await tx.execute(
          sql`UPDATE referrals SET status = 'converted', converted_at = NOW() WHERE tenant_id = ${me.tenantId} AND code = ${serverReferralCode} AND status = 'pending'`
        );
        const referralAffected = (referralResult as unknown as { rowCount: number }).rowCount ?? 0;
        if (referralAffected === 0) {
          return { error: "Código de indicação já foi utilizado", status: 400 };
        }
      }

      return { ok: true };
    });

    if ("error" in txResult) {
      res.status(txResult.status).json({ error: txResult.error });
      return;
    }

    const [reservation] = await db.select().from(reservationsTable)
      .where(and(eq(reservationsTable.id, id), eq(reservationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!reservation) { res.status(500).json({ error: "Failed to create reservation" }); return; }
    const formatted = await formatReservation(reservation);
    res.status(201).json(formatted);
    if (reservation.clientId) {
      syncClientDeal(reservation.clientId, me.tenantId, reservation.tripId, Number(reservation.totalValue), me.id)
        .catch((err) => req.log.error({ err }, "Error syncing deal after reservation creation"));
      const totalFormatted = Number(reservation.totalValue).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      writeClientActivity(reservation.clientId, "auto", `Reserva ${voucherCode} criada — ${totalFormatted}`, me.id)
        .catch((err) => req.log.error({ err }, "Error writing reservation creation activity"));
    }
  } catch (err) {
    req.log.error({ err }, "Error creating reservation");
    res.status(500).json({ error: "Internal server error" });
  }
});

async function requireReservationAccess(
  me: { id: string; tenantId: string; role: string },
  reservationId: string,
  res: import("express").Response,
): Promise<typeof reservationsTable.$inferSelect | null> {
  const [reservation] = await db.select().from(reservationsTable)
    .where(and(eq(reservationsTable.id, reservationId), eq(reservationsTable.tenantId, me.tenantId)))
    .limit(1);
  if (!reservation) { res.status(404).json({ error: "Not found" }); return null; }
  if (me.role === "cliente") {
    const [clientRecord] = await db.select({ id: clientsTable.id }).from(clientsTable)
      .where(and(eq(clientsTable.tenantId, me.tenantId), eq(clientsTable.userId, me.id))).limit(1);
    if (!clientRecord || reservation.clientId !== clientRecord.id) {
      res.status(404).json({ error: "Not found" }); return null;
    }
  } else if (me.role === "vendedor") {
    const [clientRecord] = await db.select({ createdById: clientsTable.createdById }).from(clientsTable)
      .where(and(eq(clientsTable.id, reservation.clientId), eq(clientsTable.tenantId, me.tenantId))).limit(1);
    if (!clientRecord || clientRecord.createdById !== me.id) {
      res.status(404).json({ error: "Not found" }); return null;
    }
  }
  return reservation;
}

router.get("/reservations/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const reservation = await requireReservationAccess(me, req.params.id, res);
    if (!reservation) return;
    const formatted = await formatReservation(reservation);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Error fetching reservation");
    res.status(500).json({ error: "Internal server error" });
  }
});

const CANCELLING_STATUSES = ["cancelled", "refunded"];
const ACTIVE_STATUSES = ["pending", "confirmed"];

router.patch("/reservations/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === "cliente") { res.status(403).json({ error: "Forbidden" }); return; }
    const existing = await requireReservationAccess(me, req.params.id, res);
    if (!existing) return;

    const parsed = UpdateReservationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updates: Partial<typeof reservationsTable.$inferInsert> = {};
    if (parsed.data.status != null) updates.status = parsed.data.status;
    if (parsed.data.paymentMethod != null) updates.paymentMethod = parsed.data.paymentMethod;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;
    if (parsed.data.seats != null) updates.seats = parsed.data.seats;
    if (parsed.data.installments != null) updates.installments = parsed.data.installments;
    if (parsed.data.boardingLocationId !== undefined) updates.boardingLocationId = parsed.data.boardingLocationId ?? null;
    if (parsed.data.totalValue != null) {
      const newTotal = String(parsed.data.totalValue);
      const paidValue = Number(existing.paidValue);
      const newBalance = Math.max(0, parsed.data.totalValue - paidValue);
      updates.totalValue = newTotal;
      updates.balance = String(newBalance);
    }

    const isBeingCancelled = parsed.data.status != null && CANCELLING_STATUSES.includes(parsed.data.status);
    const wasActive = ACTIVE_STATUSES.includes(existing.status);

    const reservation = await db.transaction(async (tx) => {
      if (isBeingCancelled && wasActive) {
        const seatsCount = existing.seats.length;
        if (seatsCount > 0) {
          await tx.update(tripsTable).set({
            availableSeats: sql`LEAST(total_capacity, GREATEST(0, available_seats + ${seatsCount}))`,
            reservedSeats: sql`GREATEST(0, reserved_seats - ${seatsCount})`,
          }).where(and(eq(tripsTable.id, existing.tripId), eq(tripsTable.tenantId, me.tenantId)));
        }
      }

      await tx.update(reservationsTable).set(updates)
        .where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)));
      const [updated] = await tx.select().from(reservationsTable)
        .where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)))
        .limit(1);
      if (!updated) return null;

      if (parsed.data.seats != null) {
        const newSeat = parsed.data.seats[0] ?? null;
        const [principalPassenger] = await tx.select().from(passengersTable)
          .where(and(
            eq(passengersTable.reservationId, req.params.id),
            eq(passengersTable.isPrimary, true),
          ))
          .limit(1);
        if (principalPassenger) {
          await tx.update(passengersTable).set({ seatNumber: newSeat })
            .where(eq(passengersTable.id, principalPassenger.id));
        } else {
          const [anyPassenger] = await tx.select()
            .from(passengersTable)
            .where(eq(passengersTable.reservationId, req.params.id))
            .orderBy(asc(passengersTable.id))
            .limit(1);
          if (anyPassenger) {
            await tx.update(passengersTable)
              .set({ seatNumber: newSeat, isPrimary: true })
              .where(eq(passengersTable.id, anyPassenger.id));
          } else if (existing.clientId) {
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
                seatNumber: newSeat,
                isChildUnder7: getAgeYears(clientData.birthDate ?? null) < 7,
                isPrimary: true,
              }).onConflictDoNothing();
            }
          }
        }
      }

      return updated;
    });

    if (!reservation) { res.status(404).json({ error: "Not found" }); return; }
    if (parsed.data.totalValue != null && existing.clientId) {
      syncClientDeal(existing.clientId, me.tenantId, existing.tripId, parsed.data.totalValue, me.id)
        .catch((err) => req.log.error({ err }, "Error syncing deal after reservation update"));
    }
    if (isBeingCancelled && existing.clientId) {
      const code = existing.voucherCode ?? req.params.id.slice(-8).toUpperCase();
      writeClientActivity(existing.clientId, "auto", `Reserva ${code} cancelada`, me.id)
        .catch((err) => req.log.error({ err }, "Error writing cancellation activity"));
    }
    const formatted = await formatReservation(reservation);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Error updating reservation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/reservations/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const existing = await requireReservationAccess(me, req.params.id, res);
    if (!existing) return;

    await db.transaction(async (tx) => {
      if (!CANCELLING_STATUSES.includes(existing.status)) {
        const seatsCount = existing.seats.length;
        if (seatsCount > 0) {
          await tx.update(tripsTable).set({
            availableSeats: sql`LEAST(total_capacity, GREATEST(0, available_seats + ${seatsCount}))`,
            reservedSeats: sql`GREATEST(0, reserved_seats - ${seatsCount})`,
          }).where(and(eq(tripsTable.id, existing.tripId), eq(tripsTable.tenantId, me.tenantId)));
        }
      }
      await tx.delete(reservationsTable)
        .where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)));
    });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting reservation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reservations/:id/check-in", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const existing = await requireReservationAccess(me, req.params.id, res);
    if (!existing) return;
    await db.update(reservationsTable).set({
      checkedInAt: new Date(),
      status: "completed",
    }).where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)));
    const [reservation] = await db.select().from(reservationsTable)
      .where(and(eq(reservationsTable.id, req.params.id), eq(reservationsTable.tenantId, me.tenantId)))
      .limit(1);
    if (!reservation) { res.status(404).json({ error: "Not found" }); return; }
    const formatted = await formatReservation(reservation);
    res.json(formatted);
    if (existing.clientId) {
      const [trip] = await db.select({ name: tripsTable.name }).from(tripsTable)
        .where(eq(tripsTable.id, existing.tripId)).limit(1);
      const tripName = trip?.name ?? "viagem";
      writeClientActivity(existing.clientId, "auto", `Check-in realizado na viagem ${tripName}`, me.id)
        .catch((err) => req.log.error({ err }, "Error writing check-in activity"));
    }
  } catch (err) {
    req.log.error({ err }, "Error checking in reservation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reservations/:reservationId/passengers", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const reservation = await requireReservationAccess(me, req.params.reservationId, res);
    if (!reservation) return;
    const passengers = await db.select().from(passengersTable)
      .where(eq(passengersTable.reservationId, req.params.reservationId));
    res.json(passengers.map(formatPassenger));
  } catch (err) {
    req.log.error({ err }, "Error listing passengers");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reservations/:reservationId/passengers", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === "cliente") { res.status(403).json({ error: "Forbidden" }); return; }
    const reservation = await requireReservationAccess(me, req.params.reservationId, res);
    if (!reservation) return;
    const parsed = CreatePassengerBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
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
    if (!passenger) { res.status(500).json({ error: "Failed to create passenger" }); return; }
    res.status(201).json(formatPassenger(passenger));
  } catch (err) {
    req.log.error({ err }, "Error creating passenger");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/reservations/:reservationId/passengers/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === "cliente") { res.status(403).json({ error: "Forbidden" }); return; }
    const reservation = await requireReservationAccess(me, req.params.reservationId, res);
    if (!reservation) return;
    const parsed = UpdatePassengerBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
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
    if (!passenger) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatPassenger(passenger));
  } catch (err) {
    req.log.error({ err }, "Error updating passenger");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/reservations/:reservationId/passengers/:id", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === "cliente") { res.status(403).json({ error: "Forbidden" }); return; }
    const reservation = await requireReservationAccess(me, req.params.reservationId, res);
    if (!reservation) return;
    await db.delete(passengersTable)
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting passenger");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reservations/:reservationId/passengers/:id/check-in", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const reservation = await requireReservationAccess(me, req.params.reservationId, res);
    if (!reservation) return;
    await db.update(passengersTable)
      .set({ checkedInAt: new Date() })
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)));
    const [passenger] = await db.select().from(passengersTable)
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)))
      .limit(1);
    if (!passenger) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatPassenger(passenger));
  } catch (err) {
    req.log.error({ err }, "Error checking in passenger");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/reservations/:reservationId/passengers/:id/check-in", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (!["agencia", "superadmin"].includes(me.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    const reservation = await requireReservationAccess(me, req.params.reservationId, res);
    if (!reservation) return;
    await db.update(passengersTable)
      .set({ checkedInAt: null })
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)));
    const [passenger] = await db.select().from(passengersTable)
      .where(and(eq(passengersTable.id, req.params.id), eq(passengersTable.reservationId, req.params.reservationId)))
      .limit(1);
    if (!passenger) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatPassenger(passenger));
  } catch (err) {
    req.log.error({ err }, "Error undoing passenger check-in");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
