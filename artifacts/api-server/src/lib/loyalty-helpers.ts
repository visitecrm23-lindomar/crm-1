import { db, loyaltyProgramsTable, loyaltyMembersTable, loyaltyTransactionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "./id";

export function calculateTier(totalPoints: number): string {
  if (totalPoints >= 5000) return "diamond";
  if (totalPoints >= 1500) return "gold";
  if (totalPoints >= 500) return "silver";
  return "bronze";
}

export interface LoyaltyAwardResult {
  credited: boolean;
  points: number;
}

/**
 * Awards loyalty points for a reservation (confirmation or payment trigger).
 * Idempotent: uses referenceType="reservation" + referenceId=reservationId
 * so only one earn transaction is ever created per reservation regardless of
 * how many times this is called (confirmed then paid, or paid directly).
 * Silently skips if the tenant has no active program or the client is not a member.
 */
export async function loyaltyAwardPointsForReservation(opts: {
  clientId: string;
  reservationId: string;
  amount: string | number;
  tenantId: string;
}): Promise<LoyaltyAwardResult> {
  const { clientId, reservationId, amount, tenantId } = opts;

  const [member] = await db
    .select()
    .from(loyaltyMembersTable)
    .where(and(eq(loyaltyMembersTable.tenantId, tenantId), eq(loyaltyMembersTable.clientId, clientId)))
    .limit(1);

  if (!member) return { credited: false, points: 0 };

  const [program] = await db
    .select()
    .from(loyaltyProgramsTable)
    .where(eq(loyaltyProgramsTable.id, member.programId))
    .limit(1);

  if (!program || !program.isActive) return { credited: false, points: 0 };

  const existing = await db
    .select({ id: loyaltyTransactionsTable.id })
    .from(loyaltyTransactionsTable)
    .where(
      and(
        eq(loyaltyTransactionsTable.tenantId, tenantId),
        eq(loyaltyTransactionsTable.memberId, member.id),
        eq(loyaltyTransactionsTable.type, "earn"),
        eq(loyaltyTransactionsTable.referenceId, reservationId),
        eq(loyaltyTransactionsTable.referenceType, "reservation")
      )
    )
    .limit(1);

  if (existing.length > 0) return { credited: false, points: 0 };

  const points = Math.floor(Number(amount) * Number(program.pointsPerReal));
  if (points <= 0) return { credited: false, points: 0 };

  await db.insert(loyaltyTransactionsTable).values({
    id: generateId(),
    tenantId,
    memberId: member.id,
    type: "earn",
    points,
    description: `Reserva confirmada`,
    referenceId: reservationId,
    referenceType: "reservation",
  });

  const newTotal = member.totalPoints + points;
  const newAvailable = member.availablePoints + points;
  const newTier = calculateTier(newTotal);

  await db
    .update(loyaltyMembersTable)
    .set({ totalPoints: newTotal, availablePoints: newAvailable, tier: newTier, lastActivityAt: new Date() })
    .where(eq(loyaltyMembersTable.id, member.id));

  return { credited: true, points };
}

/**
 * Awards loyalty points for a standalone (non-reservation) payment.
 * Idempotent per paymentId. Also checks program.isActive.
 */
export async function loyaltyAwardPoints(opts: {
  clientId: string;
  paymentId: string;
  amount: string | number;
  tenantId: string;
}): Promise<LoyaltyAwardResult> {
  const { clientId, paymentId, amount, tenantId } = opts;

  const [member] = await db
    .select()
    .from(loyaltyMembersTable)
    .where(
      and(
        eq(loyaltyMembersTable.tenantId, tenantId),
        eq(loyaltyMembersTable.clientId, clientId)
      )
    )
    .limit(1);

  if (!member) return { credited: false, points: 0 };

  const [program] = await db
    .select()
    .from(loyaltyProgramsTable)
    .where(eq(loyaltyProgramsTable.id, member.programId))
    .limit(1);

  if (!program || !program.isActive) return { credited: false, points: 0 };

  const existing = await db
    .select({ id: loyaltyTransactionsTable.id })
    .from(loyaltyTransactionsTable)
    .where(
      and(
        eq(loyaltyTransactionsTable.tenantId, tenantId),
        eq(loyaltyTransactionsTable.memberId, member.id),
        eq(loyaltyTransactionsTable.referenceId, paymentId),
        eq(loyaltyTransactionsTable.referenceType, "payment")
      )
    )
    .limit(1);

  if (existing.length > 0) return { credited: false, points: 0 };

  const points = Math.floor(Number(amount) * Number(program.pointsPerReal));
  if (points <= 0) return { credited: false, points: 0 };

  await db.insert(loyaltyTransactionsTable).values({
    id: generateId(),
    tenantId,
    memberId: member.id,
    type: "earn",
    points,
    description: `Pagamento creditado`,
    referenceId: paymentId,
    referenceType: "payment",
  });

  const newTotal = member.totalPoints + points;
  const newAvailable = member.availablePoints + points;
  const newTier = calculateTier(newTotal);

  await db
    .update(loyaltyMembersTable)
    .set({
      totalPoints: newTotal,
      availablePoints: newAvailable,
      tier: newTier,
      lastActivityAt: new Date(),
    })
    .where(eq(loyaltyMembersTable.id, member.id));

  return { credited: true, points };
}
