import { db } from "@workspace/db";
import {
  storesTable,
  storeOrdersTable,
  storeOrderItemsTable,
  storeProductsTable,
  reservationsTable,
  tripsTable,
  dealsTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { generateId, generateVoucherCode } from "../../lib/id";
import { AppError } from "../../lib/errors";
import { RESERVATION_STATUS } from "@workspace/permissions";
import {
  tripTypeToCode,
  nextReservationSequence,
  buildReservationNumber,
  getYearMonth,
  getTenantReservationPrefix,
} from "../../lib/reservation-number";
import { loadReservationContext } from "./reservation-context";
import type { Tx } from "./tx";

export interface CreateReservationsResult {
  reservationIds: string[];
  reservationClientId: string | null;
}

/**
 * Creates reservations and decrements availableSeats for a paid store order.
 *
 * This is intentionally called AFTER payment confirmation (Stripe webhook or
 * manual payment entry), not at checkout time. This prevents anonymous users
 * from holding trip inventory without paying.
 *
 * Idempotent: if reservations for this order already exist, returns their IDs
 * without creating duplicates.
 *
 * Concurrency safety: each trip row is locked with FOR UPDATE before any
 * capacity check or decrement to prevent oversell under concurrent paid orders.
 * The function always runs inside a transaction — if a tx is not provided it
 * creates its own.
 *
 * @param orderId - The store_orders.id to create reservations for.
 * @param tx - Optional DB transaction/executor; creates one if omitted.
 */
export async function createReservationsForOrder(
  orderId: string,
  tx?: Tx,
): Promise<CreateReservationsResult> {
  // Ensure we always run inside a transaction so the FOR UPDATE locks are meaningful.
  if (!tx) {
    return db.transaction((newTx) =>
      createReservationsForOrder(orderId, newTx as unknown as Tx),
    );
  }

  const exec = tx;

  const [order] = await exec
    .select({
      id: storeOrdersTable.id,
      orderNumber: storeOrdersTable.orderNumber,
      tenantId: storeOrdersTable.tenantId,
      storeId: storeOrdersTable.storeId,
      clientId: storeOrdersTable.clientId,
      customerName: storeOrdersTable.customerName,
      customerNotes: storeOrdersTable.customerNotes,
    })
    .from(storeOrdersTable)
    .where(eq(storeOrdersTable.id, orderId))
    .limit(1);

  if (!order) return { reservationIds: [], reservationClientId: null };

  const [store] = await exec
    .select({
      id: storesTable.id,
      tenantId: storesTable.tenantId,
      slug: storesTable.slug,
    })
    .from(storesTable)
    .where(and(eq(storesTable.id, order.storeId), eq(storesTable.tenantId, order.tenantId)))
    .limit(1);

  if (!store) return { reservationIds: [], reservationClientId: null };

  const items = await exec
    .select({
      productId: storeOrderItemsTable.productId,
      quantity: storeOrderItemsTable.quantity,
      price: storeOrderItemsTable.price,
    })
    .from(storeOrderItemsTable)
    .where(eq(storeOrderItemsTable.orderId, orderId));

  if (items.length === 0) return { reservationIds: [], reservationClientId: null };

  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await exec
    .select()
    .from(storeProductsTable)
    .where(and(
      inArray(storeProductsTable.id, productIds),
      eq(storeProductsTable.tenantId, order.tenantId),
    ));

  const productMap = new Map(products.map((p) => [p.id, p]));

  const tripLinkedProducts = new Map<string, {
    product: typeof storeProductsTable.$inferSelect;
    totalQty: number;
    totalValue: number;
  }>();

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product?.tripId) continue;
    const qty = item.quantity;
    const price = Number(item.price);
    const existing = tripLinkedProducts.get(product.tripId);
    if (existing) {
      existing.totalQty += qty;
      existing.totalValue += price * qty;
    } else {
      tripLinkedProducts.set(product.tripId, { product, totalQty: qty, totalValue: price * qty });
    }
  }

  if (tripLinkedProducts.size === 0) return { reservationIds: [], reservationClientId: null };

  const existingReservations = await exec
    .select({ id: reservationsTable.id })
    .from(reservationsTable)
    .where(and(
      eq(reservationsTable.tenantId, order.tenantId),
      eq(reservationsTable.storeOrderId, order.orderNumber),
    ));

  if (existingReservations.length > 0) {
    return {
      reservationIds: existingReservations.map((r) => r.id),
      reservationClientId: order.clientId ?? null,
    };
  }

  const ctx = await loadReservationContext({
    tenantId: order.tenantId,
    tripIds: [...tripLinkedProducts.keys()],
  });
  if (!ctx.reservationCreatedById) {
    throw new AppError(
      "Não foi possível criar a reserva: nenhum usuário ativo encontrado para esta agência",
      500,
      "RESERVATION_NO_AGENCY_USER",
    );
  }

  const tenantResPrefix = await getTenantReservationPrefix(order.tenantId);
  const resYearMonth = getYearMonth();

  const reservationIds: string[] = [];

  // Lock trips in a deterministic order to prevent deadlocks under concurrency.
  const sortedTripIds = [...tripLinkedProducts.keys()].sort();

  for (const tripId of sortedTripIds) {
    const { product, totalQty, totalValue } = tripLinkedProducts.get(tripId)!;

    // Row-level lock prevents concurrent paid orders from overselling the same trip.
    const lockResult = await exec.execute(
      sql`SELECT id, available_seats, type FROM trips WHERE id = ${tripId} AND tenant_id = ${order.tenantId} FOR UPDATE`,
    );
    const tripRow = (lockResult as unknown as { rows: Array<{ id: string; available_seats: number; type: string }> }).rows[0];

    if (!tripRow) {
      throw new AppError(
        `Viagem vinculada ao produto "${product.name}" não encontrada`,
        404,
        "TRIP_NOT_FOUND",
      );
    }

    const currentSeats = Number(tripRow.available_seats);
    if (currentSeats < totalQty) {
      throw new AppError(
        `Vagas insuficientes para "${product.name}". Disponível: ${currentSeats}, solicitado: ${totalQty}`,
        409,
        "INSUFFICIENT_SEATS",
      );
    }

    const voucherCode = generateVoucherCode();
    const reservationId = generateId();
    reservationIds.push(reservationId);

    // Seat numbers are NOT auto-assigned at payment time because the shopper's
    // seat selection is not persisted to the order (no seats column on store_orders).
    // The agency assigns specific seats in the CRM after the reservation is created.
    // This avoids inserting seat numbers that may not exist in the trip layout.
    const resTypeCode = tripTypeToCode(tripRow.type ?? "");
    const resSeq = await nextReservationSequence(order.tenantId, resYearMonth, resTypeCode, exec as Tx);
    const reservationNumber = buildReservationNumber(tenantResPrefix, resTypeCode, resYearMonth, resSeq);

    await exec.insert(reservationsTable).values({
      id: reservationId,
      tenantId: order.tenantId,
      tripId,
      clientId: order.clientId ?? null,
      seats: [],
      totalValue: totalValue.toFixed(2),
      paidValue: "0",
      balance: totalValue.toFixed(2),
      status: RESERVATION_STATUS.PENDING,
      voucherCode,
      reservationNumber,
      qrCode: `QR-${voucherCode}`,
      storeOrderId: order.orderNumber,
      createdById: ctx.reservationCreatedById,
      ...(order.customerNotes ? { notes: order.customerNotes } : {}),
    });

    // Guarded decrement: only proceeds if available_seats is still >= qty (race-condition safety).
    // The FOR UPDATE lock above already prevents concurrent modifications within a transaction,
    // but this WHERE guard also protects against bugs or edge cases that bypass the lock.
    const updateResult = await exec.execute(
      sql`UPDATE trips
          SET available_seats = available_seats - ${totalQty},
              reserved_seats  = reserved_seats  + ${totalQty},
              updated_at      = NOW()
          WHERE id = ${tripId}
            AND tenant_id = ${order.tenantId}
            AND available_seats >= ${totalQty}`,
    );

    const rowsAffected = (updateResult as unknown as { rowCount: number | null }).rowCount ?? 0;
    if (rowsAffected === 0) {
      // Race-condition guard: another transaction won the lock window or seats dropped to 0.
      throw new AppError(
        `Vagas insuficientes para "${product.name}" no momento da confirmação do pagamento`,
        409,
        "INSUFFICIENT_SEATS",
      );
    }

    if (ctx.vitrineStageId) {
      const tripName = ctx.tripNameMap.get(tripId) ?? product.name;
      await exec.insert(dealsTable).values({
        id: generateId(),
        tenantId: order.tenantId,
        stageId: ctx.vitrineStageId,
        title: `${order.customerName} — ${tripName}`,
        value: totalValue.toFixed(2),
        clientId: order.clientId ?? null,
        tripId,
        ownerId: ctx.reservationCreatedById,
        status: "open",
        source: "website",
        autoCreated: true,
        reservationId,
      });
    }
  }

  return { reservationIds, reservationClientId: order.clientId ?? null };
}
