import { db } from "@workspace/db";
import { reservationsTable, paymentsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { roundMoney } from "./pricing";

/**
 * Recomputes the paid/balance totals for a reservation from its payments
 * (only those with status='paid') and promotes/demotes the reservation
 * status accordingly:
 *   - paidValue >= totalValue → 'confirmed' (sets confirmedAt if missing)
 *   - confirmed reservation that lost paid coverage → demoted to 'pending'
 * Reservations already in terminal states ('cancelled', 'completed') are
 * left untouched.
 */
export async function syncReservationPaymentStatus(
  reservationId: string,
  tenantId: string,
): Promise<void> {
  const [reservation] = await db
    .select()
    .from(reservationsTable)
    .where(and(eq(reservationsTable.id, reservationId), eq(reservationsTable.tenantId, tenantId)))
    .limit(1);
  if (!reservation) return;
  if (reservation.status === "cancelled" || reservation.status === "completed") return;

  const result = await db.execute(sql`
    SELECT COALESCE(SUM(amount::numeric), 0) AS total_paid
    FROM payments
    WHERE reservation_id = ${reservationId} AND tenant_id = ${tenantId} AND status = 'paid'
  `);
  const row = (result as unknown as { rows: Array<{ total_paid: string }> }).rows[0];
  const paidValue = roundMoney(Number(row?.total_paid ?? "0"));
  const totalValue = roundMoney(Number(reservation.totalValue));
  const balance = roundMoney(Math.max(totalValue - paidValue, 0));

  const updates: Partial<typeof reservationsTable.$inferInsert> = {
    paidValue: String(paidValue),
    balance: String(balance),
  };

  if (paidValue >= totalValue) {
    updates.status = "confirmed";
    if (!reservation.confirmedAt) updates.confirmedAt = new Date();
    updates.expiresAt = null;
  } else if (reservation.status === "confirmed") {
    updates.status = "pending";
  }

  await db
    .update(reservationsTable)
    .set(updates)
    .where(and(eq(reservationsTable.id, reservationId), eq(reservationsTable.tenantId, tenantId)));
}

/**
 * Returns true if any payment row with this (tenant, gateway, transactionId)
 * tuple already exists. Webhook handlers use this as the canonical
 * idempotency guard to short-circuit replayed events. The DB also enforces
 * uniqueness via the partial index
 * `payments_tenant_gateway_tx_reservation_uidx`
 * (which includes reservation_id so multi-reservation splits of a single
 * gateway transaction remain valid while same-reservation replays are
 * rejected even if this app-level check races).
 */
export async function paymentExistsForGatewayTx(
  tenantId: string,
  gateway: string,
  transactionId: string,
): Promise<boolean> {
  const [existing] = await db
    .select({ id: paymentsTable.id })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.tenantId, tenantId),
        eq(paymentsTable.gateway, gateway),
        eq(paymentsTable.transactionId, transactionId),
      ),
    )
    .limit(1);
  return !!existing;
}
