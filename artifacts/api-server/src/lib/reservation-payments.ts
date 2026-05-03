import { db } from "@workspace/db";
import { reservationsTable, paymentsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { roundMoney } from "./pricing";
import { RESERVATION_STATUS, PAYMENT_STATUS, type ReservationStatus } from "@workspace/permissions";

export type DbExecutor = typeof db;

type ReservationUpdate = Partial<typeof reservationsTable.$inferInsert> & {
  status?: ReservationStatus;
};

async function sumPaidPayments(
  executor: DbExecutor,
  reservationId: string,
  tenantId: string,
): Promise<number> {
  const result = await executor.execute(sql`
    SELECT COALESCE(SUM(amount::numeric), 0) AS total_paid
    FROM payments
    WHERE reservation_id = ${reservationId}
      AND tenant_id = ${tenantId}
      AND status = ${PAYMENT_STATUS.PAID}
  `);
  const row = (result as unknown as { rows: Array<{ total_paid: string }> }).rows[0];
  return roundMoney(Number(row?.total_paid ?? "0"));
}

export async function syncReservationPaymentStatus(
  reservationId: string,
  tenantId: string,
  executor: DbExecutor = db,
): Promise<void> {
  const [reservation] = await executor
    .select()
    .from(reservationsTable)
    .where(and(eq(reservationsTable.id, reservationId), eq(reservationsTable.tenantId, tenantId)))
    .limit(1);
  if (!reservation) return;

  const totalValue = roundMoney(Number(reservation.totalValue));
  const paidValue = await sumPaidPayments(executor, reservationId, tenantId);
  const balance = roundMoney(Math.max(totalValue - paidValue, 0));

  if (
    reservation.status === RESERVATION_STATUS.CANCELLED ||
    reservation.status === RESERVATION_STATUS.COMPLETED
  ) {
    await executor
      .update(reservationsTable)
      .set({ paidValue: String(paidValue), balance: String(balance) })
      .where(and(eq(reservationsTable.id, reservationId), eq(reservationsTable.tenantId, tenantId)));
    return;
  }

  const updates: ReservationUpdate = {
    paidValue: String(paidValue),
    balance: String(balance),
  };

  if (paidValue >= totalValue) {
    updates.status = RESERVATION_STATUS.CONFIRMED;
    if (!reservation.confirmedAt) updates.confirmedAt = new Date();
    updates.expiresAt = null;
  } else if (reservation.status === RESERVATION_STATUS.CONFIRMED) {
    updates.status = RESERVATION_STATUS.PENDING;
  }

  await executor
    .update(reservationsTable)
    .set(updates)
    .where(and(eq(reservationsTable.id, reservationId), eq(reservationsTable.tenantId, tenantId)));
}

export async function paymentExistsForGatewayTx(
  tenantId: string,
  gateway: string,
  transactionId: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  const [existing] = await executor
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
