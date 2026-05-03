import { db } from "@workspace/db";
import { reservationsTable, tripsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

type CancelledRow = {
  id: string;
  trip_id: string;
  seats: string[] | null;
};

export async function runExpiredReservationsCron(): Promise<void> {
  const now = new Date();

  // Wrap the entire operation in a single transaction so that if any trip
  // seat update fails the reservation cancellations are also rolled back,
  // keeping the database consistent and allowing the next cron run to retry.
  await db.transaction(async (tx) => {
    // Cancel all expired pending reservations atomically and get the affected rows.
    const result = await tx.execute(
      sql`
        UPDATE reservations
        SET
          status       = 'cancelled',
          cancelled_at = now(),
          updated_at   = now()
        WHERE
          status     = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at < ${now}
        RETURNING id, trip_id, seats
      `,
    );

    const rows = (result as unknown as { rows: CancelledRow[] }).rows;

    if (rows.length === 0) {
      logger.debug("[expired-reservations] No expired reservations found");
      return;
    }

    logger.info({ count: rows.length }, "[expired-reservations] Cancelling expired reservations");

    // Aggregate seats to restore per trip within the same transaction
    const seatsByTrip = new Map<string, number>();
    for (const row of rows) {
      const seatsCount = Array.isArray(row.seats) ? row.seats.length : 0;
      if (seatsCount > 0) {
        seatsByTrip.set(row.trip_id, (seatsByTrip.get(row.trip_id) ?? 0) + seatsCount);
      }
    }

    for (const [tripId, seatsCount] of seatsByTrip) {
      // Mirror the cap used by existing cancellation paths in reservations.ts:
      // available_seats cannot exceed total_capacity.
      await tx
        .update(tripsTable)
        .set({
          availableSeats: sql`LEAST(total_capacity, GREATEST(0, available_seats + ${seatsCount}))`,
          reservedSeats: sql`GREATEST(0, reserved_seats - ${seatsCount})`,
        })
        .where(eq(tripsTable.id, tripId));

      logger.info({ tripId, seatsReturned: seatsCount }, "[expired-reservations] Restored seats to trip");
    }

    logger.info(
      { totalCancelled: rows.length, tripsUpdated: seatsByTrip.size },
      "[expired-reservations] Run complete",
    );
  });
}
