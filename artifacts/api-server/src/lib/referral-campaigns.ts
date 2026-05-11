import { referralCampaignsTable, db } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";

type QueryRunner = Pick<typeof db, "select">;

/**
 * Looks up any active campaign for the tenant and returns the effective
 * bonus amount (always >= baseBonusValue — campaigns can only increase bonus).
 * Uses half-open interval `[startsAt, endsAt)` consistent with DB exclusion constraint.
 */
export async function applyActiveCampaignBonus(
  qr: QueryRunner,
  tenantId: string,
  baseBonusValue: number,
): Promise<number> {
  const now = new Date();
  const [activeCampaign] = await qr
    .select({
      bonusType: referralCampaignsTable.bonusType,
      bonusValue: referralCampaignsTable.bonusValue,
    })
    .from(referralCampaignsTable)
    .where(and(
      eq(referralCampaignsTable.tenantId, tenantId),
      sql`${referralCampaignsTable.startsAt} <= ${now}`,
      sql`${referralCampaignsTable.endsAt} > ${now}`,
    ))
    .orderBy(desc(referralCampaignsTable.startsAt))
    .limit(1);

  if (!activeCampaign) return baseBonusValue;

  const campaignVal = Number(activeCampaign.bonusValue);
  const campaignAdjusted = activeCampaign.bonusType === "multiplier"
    ? baseBonusValue * campaignVal
    : baseBonusValue + campaignVal;

  return Math.max(baseBonusValue, campaignAdjusted);
}
