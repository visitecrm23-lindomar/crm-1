import { db } from "@workspace/db";
import { reservationsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { emitSeatUpdate } from "./seat-sse";
import { RESERVATION_STATUS } from "@workspace/permissions";

export async function broadcastSeatUpdate(tripId: string, tenantId: string): Promise<void> {
  const reservations = await db
    .select({ seats: reservationsTable.seats, status: reservationsTable.status })
    .from(reservationsTable)
    .where(
      and(
        eq(reservationsTable.tripId, tripId),
        eq(reservationsTable.tenantId, tenantId),
        inArray(reservationsTable.status, [RESERVATION_STATUS.PENDING, RESERVATION_STATUS.CONFIRMED]),
      ),
    );
  const occupiedMap: Record<string, string> = {};
  for (const r of reservations) {
    const s = r.status === RESERVATION_STATUS.CONFIRMED ? "confirmed" : "reserved";
    for (const seat of r.seats) occupiedMap[seat] = s;
  }
  emitSeatUpdate({
    tripId,
    seats: Object.entries(occupiedMap).map(([number, status]) => ({ number, status })),
  });
}
