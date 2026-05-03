import { db } from "@workspace/db";
import {
  storesTable,
  storeProductsTable,
  storeOrdersTable,
  storeOrderItemsTable,
  storeCouponsTable,
  reservationsTable,
  tripsTable,
  clientsTable,
  referralsTable,
  referralTrackingTable,
  referralSettingsTable,
  dealsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { generateId, generateVoucherCode } from "../../lib/id";
import {
  tripTypeToCode,
  nextReservationSequence,
  buildReservationNumber,
} from "../../lib/reservation-number";

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

/**
 * Atomic transaction that:
 * - Locks trips (sorted) and re-validates seat availability
 * - Locks tracked products and re-validates stock
 * - Find-or-creates the client
 * - Inserts order + items
 * - Decrements stock and increments salesCount
 * - Creates reservations + Vitrine deals for trip-linked products
 * - Increments coupon usage
 * - Records referral conversion + tracking + referrer/referred client updates
 * - Increments store totalOrders
 *
 * Throws raw `Error("insufficient_stock"|"no_seats"|"trip_not_found")` with
 * `productName`/`available` properties so the caller can map them to AppErrors.
 */
export async function persistCheckoutOrder(args: PersistOrderArgs): Promise<PersistOrderResult> {
  const {
    store, data, orderId, orderNumber, orderPaymentToken,
    subtotal, discountAmount, totalAmount,
    couponId, appliedReferralCode, appliedReferralReferrerId,
    appliedReferralDiscountValue, appliedReferralDiscountType,
    orderItemsData, fetchedProducts, quantityByProductId, tripLinkedProducts,
    reservationCreatedById, vitrineStageId, parsedBirthDate, tripNameMap,
    reservationExpiresAt, tenantResPrefix, resYearMonth,
  } = args;

  let reservationClientId: string | null = null;
  // Map to store locked trip types (populated during trip lock loop, used during reservation creation)
  const lockedTripTypes = new Map<string, string>();

  await db.transaction(async (tx) => {
    // Lock trips FIRST (sorted by tripId) to prevent deadlocks with concurrent checkouts
    // and with the internal reservations route which also locks trips.
    const sortedTripIds = Array.from(tripLinkedProducts.keys()).sort();
    for (const tripId of sortedTripIds) {
      const { product, totalQty } = tripLinkedProducts.get(tripId)!;
      const lockResult = await tx.execute(
        sql`SELECT id, available_seats, type FROM trips WHERE id = ${tripId} AND tenant_id = ${store.tenantId} FOR UPDATE`
      );
      const row = (lockResult as unknown as { rows: Array<{ id: string; available_seats: number; type: string }> }).rows[0];
      if (!row) {
        const tripErr = new Error("trip_not_found");
        (tripErr as Error & Record<string, unknown>).productName = product.name;
        throw tripErr;
      }
      const currentSeats = Number(row.available_seats);
      if (currentSeats < totalQty) {
        const seatErr = new Error("no_seats");
        (seatErr as Error & Record<string, unknown>).productName = product.name;
        (seatErr as Error & Record<string, unknown>).available = currentSeats;
        throw seatErr;
      }
      lockedTripTypes.set(tripId, row.type ?? "");
    }

    // Then lock products (sorted by productId for deadlock prevention)
    // Re-validate stock with row-level locks to prevent race conditions.
    const trackedProductIds = Array.from(fetchedProducts.values())
      .filter((p) => p.trackInventory && !p.allowBackorder)
      .map((p) => p.id)
      .sort();
    for (const productId of trackedProductIds) {
      const product = fetchedProducts.get(productId)!;
      const lockResult = await tx.execute(
        sql`SELECT id, stock_quantity FROM store_products WHERE id = ${product.id} FOR UPDATE`
      );
      const row = (lockResult as unknown as { rows: Array<{ id: string; stock_quantity: number | null }> }).rows[0];
      const currentStock = Number(row?.stock_quantity ?? 0);
      const totalRequested = quantityByProductId.get(product.id) ?? 0;
      if (currentStock < totalRequested) {
        const stockErr = new Error("insufficient_stock");
        (stockErr as Error & Record<string, unknown>).productName = product.name;
        (stockErr as Error & Record<string, unknown>).available = currentStock;
        throw stockErr;
      }
    }

    // Find or create client inside the transaction for full atomicity.
    if (reservationCreatedById) {
      const clientCreatedById: string = reservationCreatedById;
      const [existingClient] = await tx
        .select({ id: clientsTable.id, cpf: clientsTable.cpf, birthDate: clientsTable.birthDate })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, store.tenantId), eq(clientsTable.email, data.customerEmail)))
        .limit(1);
      if (existingClient) {
        reservationClientId = existingClient.id;
        const updateFields: Record<string, unknown> = {};
        if (!existingClient.birthDate && parsedBirthDate) updateFields.birthDate = parsedBirthDate;
        if (!existingClient.cpf && data.customerCpf) {
          const [cpfOwner] = await tx
            .select({ id: clientsTable.id })
            .from(clientsTable)
            .where(and(eq(clientsTable.tenantId, store.tenantId), eq(clientsTable.cpf, data.customerCpf)))
            .limit(1);
          if (!cpfOwner) updateFields.cpf = data.customerCpf;
        }
        if (Object.keys(updateFields).length > 0) {
          await tx.update(clientsTable).set(updateFields).where(eq(clientsTable.id, existingClient.id));
        }
      } else {
        const newClientId = generateId();
        let cpfToInsert: string | undefined;
        if (data.customerCpf) {
          const [cpfOwner] = await tx
            .select({ id: clientsTable.id })
            .from(clientsTable)
            .where(and(eq(clientsTable.tenantId, store.tenantId), eq(clientsTable.cpf, data.customerCpf)))
            .limit(1);
          if (!cpfOwner) cpfToInsert = data.customerCpf;
        }
        await tx.insert(clientsTable).values({
          id: newClientId,
          tenantId: store.tenantId,
          name: data.customerName,
          email: data.customerEmail,
          whatsapp: data.customerPhone ?? "",
          createdById: clientCreatedById,
          ...(cpfToInsert ? { cpf: cpfToInsert } : {}),
          ...(parsedBirthDate ? { birthDate: parsedBirthDate } : {}),
        });
        reservationClientId = newClientId;
      }
    }

    // Insert order
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

    // Insert order items
    for (const itemData of orderItemsData) {
      itemData.orderId = orderId;
      await tx.insert(storeOrderItemsTable).values(itemData);
    }

    // Decrement stock and update salesCount — once per unique product using aggregated quantity
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

    // Create reservations for trip-linked products + decrement available_seats
    if (tripLinkedProducts.size > 0 && reservationClientId && reservationCreatedById) {
      for (const [tripId, { product, totalQty, totalValue }] of tripLinkedProducts) {
        const voucherCode = generateVoucherCode();
        const reservationId = generateId();
        const realSeats = (data.seats && data.seats.length >= totalQty)
          ? data.seats.slice(0, totalQty)
          : Array.from({ length: totalQty }, (_, i) => String(i + 1));
        const tripTypeRaw = lockedTripTypes.get(tripId) ?? "";
        const resTypeCode = tripTypeToCode(tripTypeRaw);
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
          status: "pending",
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
        // Decrement trip available_seats and increment reserved_seats
        await tx.update(tripsTable).set({
          availableSeats: sql`available_seats - ${totalQty}`,
          reservedSeats: sql`reserved_seats + ${totalQty}`,
        }).where(and(eq(tripsTable.id, tripId), eq(tripsTable.tenantId, store.tenantId)));

        // Auto-create deal in "Vitrine" pipeline stage for this reservation
        if (vitrineStageId && reservationCreatedById) {
          const dealId = generateId();
          const tripName = tripNameMap.get(tripId) ?? product.name;
          await tx.insert(dealsTable).values({
            id: dealId,
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

    // Update coupon usage count atomically
    if (couponId) {
      await tx.update(storeCouponsTable)
        .set({ usageCount: sql`usage_count + 1` })
        .where(eq(storeCouponsTable.id, couponId));
    }

    // Record referral conversion: insert a new completed referral record
    if (appliedReferralCode && appliedReferralReferrerId) {
      const discountAmountForReferral = discountAmount;
      const [refSettings] = await tx.select({ bonusValue: referralSettingsTable.bonusValue, bonusType: referralSettingsTable.bonusType })
        .from(referralSettingsTable).where(eq(referralSettingsTable.tenantId, store.tenantId)).limit(1);
      const bonusValue = refSettings ? Number(refSettings.bonusValue) : 10;

      await tx.insert(referralsTable).values({
        id: generateId(),
        tenantId: store.tenantId,
        referrerId: appliedReferralReferrerId,
        code: appliedReferralCode,
        status: "completed",
        referredId: reservationClientId,
        referredEmail: data.customerEmail,
        referredName: data.customerName,
        discountApplied: true,
        discountValue: (appliedReferralDiscountValue).toFixed(2),
        discountType: appliedReferralDiscountType,
        discountAmount: discountAmountForReferral.toFixed(2),
        bonusAmount: bonusValue.toFixed(2),
        convertedAt: new Date(),
      });

      await tx.update(clientsTable)
        .set({
          totalReferrals: sql`COALESCE(total_referrals, 0) + 1`,
          successfulReferrals: sql`COALESCE(successful_referrals, 0) + 1`,
          referralEarnings: sql`COALESCE(referral_earnings, 0) + ${bonusValue.toFixed(2)}`,
        })
        .where(eq(clientsTable.id, appliedReferralReferrerId));

      if (reservationClientId) {
        await tx.update(clientsTable)
          .set({ referredById: appliedReferralReferrerId })
          .where(and(
            eq(clientsTable.id, reservationClientId),
            sql`referred_by_id IS NULL`,
          ));
      }

      // Mark referral_tracking as converted — prefer cookieId for precision, fall back to code+tenant
      if (data.referralCookieId) {
        await tx.update(referralTrackingTable)
          .set({ converted: true, convertedAt: new Date(), updatedAt: new Date() })
          .where(and(
            eq(referralTrackingTable.tenantId, store.tenantId),
            eq(referralTrackingTable.cookieId, data.referralCookieId),
          ));
      } else {
        await tx.update(referralTrackingTable)
          .set({ converted: true, convertedAt: new Date(), updatedAt: new Date() })
          .where(and(
            eq(referralTrackingTable.tenantId, store.tenantId),
            eq(referralTrackingTable.referralCode, appliedReferralCode),
          ));
      }
    }

    // Update store order count atomically
    await tx.update(storesTable)
      .set({ totalOrders: sql`total_orders + 1` })
      .where(eq(storesTable.id, store.id));
  });

  return { reservationClientId };
}
