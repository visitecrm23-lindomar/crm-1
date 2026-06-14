import { db } from "@workspace/db";
import { dispatchReferralConvertedEmail } from "../../queues/email-helpers";
import { dispatchWhatsAppReferralConverted } from "../../queues/whatsapp-helpers";
import {
  storesTable,
  storeProductsTable,
  storeOrdersTable,
  storeOrderItemsTable,
  storeCouponsTable,
  reservationsTable,
  tripsTable,
  dealsTable,
  referralsTable,
} from "@workspace/db";
import { and, eq, sql, inArray } from "drizzle-orm";
import { generateId, generateVoucherCode } from "../../lib/id";
import {
  tripTypeToCode,
  nextReservationSequence,
  buildReservationNumber,
} from "../../lib/reservation-number";
import { upsertCheckoutClient } from "./checkout-user";
import { lockTripsForCheckout, lockProductsForCheckout } from "./order-locks";
import { recordReferralConversion } from "./referral-conversion";
import type { Tx } from "./tx";
import { RESERVATION_STATUS } from "@workspace/permissions";

export interface PersistedOrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productType: string;
  productImage: string | null;
  variant: Record<string, unknown> | null;
  price: string;
  quantity: number;
  subtotal: string;
  discount: string;
  total: string;
  metadata: Record<string, unknown> | null;
}

export interface PersistOrderArgs {
  store: typeof storesTable.$inferSelect;
  data: {
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    customerCpf?: string;
    customerAddress?: Record<string, unknown>;
    items: Array<{ productId: string; quantity: number }>;
    couponCode?: string;
    referralCookieId?: string;
    paymentMethod?: string;
    paymentProvider?: string;
    notes?: string;
    customerNotes?: string;
    ipAddress?: string;
    userAgent?: string;
    seats?: string[];
  };
  orderId: string;
  orderNumber: string;
  orderPaymentToken: string;
  subtotal: number;
  /** Combined discount (promo coupon/referral code + referral-credit spend) — stored on order record */
  discountAmount: number;
  /** Promo-only discount (coupon or referral-code) — used for reservation.discountReferralAmount analytics */
  promoDiscountAmount: number;
  totalAmount: number;
  couponId?: string;
  appliedReferralCode?: string;
  appliedReferralReferrerId?: string;
  appliedReferralDiscountValue: number;
  appliedReferralDiscountType: string;
  orderItemsData: PersistedOrderItem[];
  fetchedProducts: Map<string, typeof storeProductsTable.$inferSelect>;
  quantityByProductId: Map<string, number>;
  tripLinkedProducts: Map<string, { product: typeof storeProductsTable.$inferSelect; totalQty: number; totalValue: number }>;
  reservationCreatedById: string | null;
  vitrineStageId: string | null;
  parsedBirthDate: Date | null;
  tripNameMap: Map<string, string>;
  reservationExpiresAt: Date;
  tenantResPrefix: string;
  resYearMonth: string;
  /** Referral rows to mark as (partially) consumed for credit spend — processed inside the transaction */
  creditSpend?: Array<{ id: string; consumedAmount: number }>;
}

export interface PersistOrderResult {
  reservationClientId: string | null;
}

async function writeOrderAndItems(tx: Tx, args: PersistOrderArgs, reservationClientId: string | null): Promise<void> {
  const {
    store, data, orderId, orderNumber, orderPaymentToken,
    subtotal, discountAmount, totalAmount, couponId, orderItemsData,
  } = args;

  await tx.insert(storeOrdersTable).values({
    id: orderId,
    storeId: store.id,
    tenantId: store.tenantId,
    orderNumber,
    paymentToken: orderPaymentToken,
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone ?? "",
    ...(reservationClientId && { clientId: reservationClientId }),
    ...(data.customerCpf && { customerCpf: data.customerCpf }),
    ...(data.customerAddress && { customerAddress: data.customerAddress }),
    subtotal: subtotal.toFixed(2),
    discountAmount: discountAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    ...(couponId && { couponId }),
    ...(data.couponCode && { couponCode: data.couponCode }),
    paymentMethod: data.paymentMethod ?? "pending",
    paymentProvider: data.paymentProvider ?? "manual",
    ...(data.customerNotes && { customerNotes: data.customerNotes }),
    ...((data.notes && !data.customerNotes) && { customerNotes: data.notes }),
    ...(data.ipAddress && { ipAddress: data.ipAddress }),
    ...(data.userAgent && { userAgent: data.userAgent }),
  });

  for (const itemData of orderItemsData) {
    itemData.orderId = orderId;
    await tx.insert(storeOrderItemsTable).values(itemData);
  }
}

async function decrementStockAndSales(tx: Tx, args: PersistOrderArgs): Promise<void> {
  const { data, fetchedProducts, quantityByProductId } = args;
  const updatedProductIds = new Set<string>();
  for (const item of data.items) {
    const product = fetchedProducts.get(item.productId)!;
    if (updatedProductIds.has(product.id)) continue;
    updatedProductIds.add(product.id);
    const totalQty = quantityByProductId.get(product.id) ?? 0;
    if (product.trackInventory) {
      await tx.update(storeProductsTable).set({
        stockQuantity: sql`GREATEST(0, COALESCE(stock_quantity, 0) - ${totalQty})`,
        salesCount: sql`sales_count + ${totalQty}`,
      }).where(eq(storeProductsTable.id, product.id));
    } else {
      await tx.update(storeProductsTable).set({
        salesCount: sql`sales_count + ${totalQty}`,
      }).where(eq(storeProductsTable.id, product.id));
    }
  }
}

async function writeReservationsAndDeals(
  tx: Tx,
  args: PersistOrderArgs,
  reservationClientId: string,
  lockedTripTypes: Map<string, string>,
): Promise<string | null> {
  const {
    store, data, orderNumber, promoDiscountAmount, appliedReferralCode,
    tripLinkedProducts, reservationCreatedById, vitrineStageId, tripNameMap,
    reservationExpiresAt, tenantResPrefix, resYearMonth,
  } = args;
  if (!reservationCreatedById) return null;

  let firstReservationId: string | null = null;

  for (const [tripId, { product, totalQty, totalValue }] of tripLinkedProducts) {
    const voucherCode = generateVoucherCode();
    const reservationId = generateId();
    if (!firstReservationId) firstReservationId = reservationId;
    let realSeats: string[];
    if (data.seats && data.seats.length >= totalQty) {
      realSeats = data.seats.slice(0, totalQty);
    } else {
      const activeReservations = await tx.select({ seats: reservationsTable.seats })
        .from(reservationsTable)
        .where(and(
          eq(reservationsTable.tripId, tripId),
          eq(reservationsTable.tenantId, store.tenantId),
          inArray(reservationsTable.status, [RESERVATION_STATUS.PENDING, RESERVATION_STATUS.CONFIRMED]),
        ));
      const occupied = new Set(activeReservations.flatMap(r => r.seats));
      const assigned: string[] = [];
      let candidate = 1;
      while (assigned.length < totalQty && candidate <= 999) {
        if (!occupied.has(String(candidate))) assigned.push(String(candidate));
        candidate++;
      }
      realSeats = assigned;
    }
    const resTypeCode = tripTypeToCode(lockedTripTypes.get(tripId) ?? "");
    const resSeq = await nextReservationSequence(store.tenantId, resYearMonth, resTypeCode, tx);
    const reservationNumber = buildReservationNumber(tenantResPrefix, resTypeCode, resYearMonth, resSeq);
    const reservationNotes = (data.customerNotes || data.notes) ?? undefined;

    await tx.insert(reservationsTable).values({
      id: reservationId,
      tenantId: store.tenantId,
      tripId,
      clientId: reservationClientId,
      seats: realSeats,
      totalValue: totalValue.toFixed(2),
      paidValue: "0",
      balance: totalValue.toFixed(2),
      status: RESERVATION_STATUS.PENDING,
      voucherCode,
      reservationNumber,
      qrCode: `QR-${voucherCode}`,
      storeOrderId: orderNumber,
      createdById: reservationCreatedById,
      discountReferralCode: appliedReferralCode ?? undefined,
      // Use promo-only discount — credit spend is tracked separately on referral rows
      discountReferralAmount: appliedReferralCode ? promoDiscountAmount.toFixed(2) : undefined,
      expiresAt: reservationExpiresAt,
      ...(reservationNotes ? { notes: reservationNotes } : {}),
    });

    await tx.update(tripsTable).set({
      availableSeats: sql`available_seats - ${totalQty}`,
      reservedSeats: sql`reserved_seats + ${totalQty}`,
    }).where(and(eq(tripsTable.id, tripId), eq(tripsTable.tenantId, store.tenantId)));

    if (vitrineStageId) {
      const tripName = tripNameMap.get(tripId) ?? product.name;
      await tx.insert(dealsTable).values({
        id: generateId(),
        tenantId: store.tenantId,
        stageId: vitrineStageId,
        title: `${data.customerName} — ${tripName}`,
        value: totalValue.toFixed(2),
        clientId: reservationClientId,
        tripId,
        ownerId: reservationCreatedById,
        status: "open",
        source: "website",
        autoCreated: true,
        reservationId,
      });
    }
  }

  return firstReservationId;
}

export async function persistCheckoutOrder(args: PersistOrderArgs): Promise<PersistOrderResult> {
  let reservationClientId: string | null = null;

  await db.transaction(async (tx) => {
    const lockedTripTypes = await lockTripsForCheckout(tx, {
      tenantId: args.store.tenantId,
      tripLinkedProducts: args.tripLinkedProducts,
    });

    await lockProductsForCheckout(tx, {
      fetchedProducts: args.fetchedProducts,
      quantityByProductId: args.quantityByProductId,
    });

    if (args.reservationCreatedById) {
      reservationClientId = await upsertCheckoutClient(tx, {
        tenantId: args.store.tenantId,
        email: args.data.customerEmail,
        name: args.data.customerName,
        phone: args.data.customerPhone,
        cpf: args.data.customerCpf,
        birthDate: args.parsedBirthDate,
        createdById: args.reservationCreatedById,
      });
    }

    await writeOrderAndItems(tx, args, reservationClientId);
    await decrementStockAndSales(tx, args);

    let firstReservationId: string | null = null;
    if (args.tripLinkedProducts.size > 0 && reservationClientId) {
      firstReservationId = await writeReservationsAndDeals(tx, args, reservationClientId, lockedTripTypes);
    }

    if (args.couponId) {
      await tx.update(storeCouponsTable)
        .set({ usageCount: sql`usage_count + 1` })
        .where(eq(storeCouponsTable.id, args.couponId));
    }

    if (args.appliedReferralCode && args.appliedReferralReferrerId) {
      await recordReferralConversion(tx, {
        tenantId: args.store.tenantId,
        referrerId: args.appliedReferralReferrerId,
        referralCode: args.appliedReferralCode,
        referredClientId: reservationClientId,
        customerEmail: args.data.customerEmail,
        customerName: args.data.customerName,
        discountAmount: args.discountAmount,
        discountValue: args.appliedReferralDiscountValue,
        discountType: args.appliedReferralDiscountType,
        referralCookieId: args.data.referralCookieId,
        conversionIp: args.data.ipAddress ?? null,
        reservationId: firstReservationId,
      });
    }
    await tx.update(storesTable)
      .set({ totalOrders: sql`total_orders + 1` })
      .where(eq(storesTable.id, args.store.id));

    if (args.creditSpend && args.creditSpend.length > 0) {
      // Lock rows for update to prevent concurrent double-spend
      const ids = args.creditSpend.map((r) => r.id);
      // Re-read current balances under row lock to catch concurrent modifications
      const lockedRows = await tx.execute(
        sql`SELECT id, bonus_amount, COALESCE(bonus_credit_used_amount, 0) AS already_used FROM referrals WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) FOR UPDATE`,
      );
      const lockedMap = new Map(
        (lockedRows.rows as Array<{ id: string; bonus_amount: string; already_used: string }>).map(
          (r) => [r.id, { bonusAmount: Number(r.bonus_amount), alreadyUsed: Number(r.already_used) }],
        ),
      );
      // Validate that each planned spend is still feasible under lock
      for (const { id, consumedAmount } of args.creditSpend) {
        const locked = lockedMap.get(id);
        if (!locked) throw new Error("insufficient_credit");
        const stillAvailable = locked.bonusAmount - locked.alreadyUsed;
        if (stillAvailable < consumedAmount - 0.005) throw new Error("insufficient_credit");
      }
      const now = new Date();
      for (const { id, consumedAmount } of args.creditSpend) {
        // Accumulate spend (not overwrite) to support partial and sequential consumption
        await tx
          .update(referralsTable)
          .set({
            bonusCreditUsedAt: now,
            bonusCreditOrderId: args.orderId,
            bonusCreditUsedAmount: sql`COALESCE(${referralsTable.bonusCreditUsedAmount}, 0) + ${consumedAmount.toFixed(2)}`,
            updatedAt: now,
          })
          .where(eq(referralsTable.id, id));
      }
    }
  });

  if (args.appliedReferralCode && args.appliedReferralReferrerId) {
    dispatchReferralConvertedEmail(
      args.appliedReferralReferrerId,
      args.data.customerName,
      args.store.tenantId,
    ).catch((err) => {
      console.error("[checkout/persist-order] Failed to dispatch referral-converted email:", err);
    });

    dispatchWhatsAppReferralConverted({
      referrerId: args.appliedReferralReferrerId,
      referredName: args.data.customerName,
      referralCode: args.appliedReferralCode,
      tenantId: args.store.tenantId,
    }).catch((err) => {
      console.error("[checkout/persist-order] Failed to dispatch referral WhatsApp:", err);
    });
  }

  return { reservationClientId };
}
