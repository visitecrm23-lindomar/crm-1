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

  if (!program) return { credited: false, points: 0 };

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

  const txId = generateId();
  await db.insert(loyaltyTransactionsTable).values({
    id: txId,
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
