import { referralCampaignsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@workspace/db";

type Db = NodePgDatabase<typeof schema>;

export interface ActiveCampaignBonus {
  adjustedBonus: number;
}

/**
 * Looks up any active campaign for the tenant and returns the effective
 * bonus amount (always >= baseBonusValue — campaigns can only increase bonus).
 */
export async function applyActiveCampaignBonus(
  db: Db | Parameters<Parameters<Db["transaction"]>[0]>[0],
  tenantId: string,
  baseBonusValue: number,
): Promise<number> {
  const now = new Date();
  const [activeCampaign] = await (db as Db)
    .select({
      bonusType: referralCampaignsTable.bonusType,
      bonusValue: referralCampaignsTable.bonusValue,
    })
    .from(referralCampaignsTable)
    .where(and(
      eq(referralCampaignsTable.tenantId, tenantId),
      sql`${referralCampaignsTable.startsAt} <= ${now}`,
      sql`${referralCampaignsTable.endsAt} >= ${now}`,
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
