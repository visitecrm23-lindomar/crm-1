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
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
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
  discountAmount: number;
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
): Promise<void> {
  const {
    store, data, orderNumber, discountAmount, appliedReferralCode,
    tripLinkedProducts, reservationCreatedById, vitrineStageId, tripNameMap,
    reservationExpiresAt, tenantResPrefix, resYearMonth,
  } = args;
  if (!reservationCreatedById) return;

  for (const [tripId, { product, totalQty, totalValue }] of tripLinkedProducts) {
    const voucherCode = generateVoucherCode();
    const reservationId = generateId();
    const realSeats = (data.seats && data.seats.length >= totalQty)
      ? data.seats.slice(0, totalQty)
      : Array.from({ length: totalQty }, (_, i) => String(i + 1));
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
      discountReferralAmount: appliedReferralCode ? discountAmount.toFixed(2) : undefined,
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

    if (args.tripLinkedProducts.size > 0 && reservationClientId) {
      await writeReservationsAndDeals(tx, args, reservationClientId, lockedTripTypes);
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
      });
    }
    await tx.update(storesTable)
      .set({ totalOrders: sql`total_orders + 1` })
      .where(eq(storesTable.id, args.store.id));
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
