import {
  clientsTable,
  referralsTable,
  referralSettingsTable,
  referralTrackingTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { generateId } from "../../lib/id";
import type { Tx } from "./tx";
import { REFERRAL_STATUS } from "@workspace/permissions";
import { computeReferralTier } from "../../lib/referral-tiers";

export interface RecordReferralArgs {
  tenantId: string;
  referrerId: string;
  referralCode: string;
  referredClientId: string | null;
  customerEmail: string;
  customerName: string;
  discountAmount: number;
  discountValue: number;
  discountType: string;
  referralCookieId?: string;
}

export async function recordReferralConversion(tx: Tx, args: RecordReferralArgs): Promise<void> {
  const {
    tenantId, referrerId, referralCode, referredClientId,
    customerEmail, customerName, discountAmount, discountValue, discountType, referralCookieId,
  } = args;

  const [refSettings] = await tx
    .select({
      bonusValue: referralSettingsTable.bonusValue,
      bonusType: referralSettingsTable.bonusType,
      tiersConfig: referralSettingsTable.tiersConfig,
    })
    .from(referralSettingsTable)
    .where(eq(referralSettingsTable.tenantId, tenantId))
    .limit(1);

  const baseBonusValue = refSettings ? Number(refSettings.bonusValue) : 10;

  const [referrer] = await tx
    .select({ successfulReferrals: clientsTable.successfulReferrals })
    .from(clientsTable)
    .where(eq(clientsTable.id, referrerId))
    .limit(1);

  const currentCompleted = referrer?.successfulReferrals ?? 0;
  const { tier } = computeReferralTier(currentCompleted, refSettings?.tiersConfig ?? null);
  const bonusAmount = Math.round(baseBonusValue * tier.bonusMultiplier * 100) / 100;

  await tx.insert(referralsTable).values({
    id: generateId(),
    tenantId,
    referrerId,
    code: referralCode,
    status: REFERRAL_STATUS.COMPLETED,
    referredId: referredClientId,
    referredEmail: customerEmail,
    referredName: customerName,
    discountApplied: true,
    discountValue: discountValue.toFixed(2),
    discountType,
    discountAmount: discountAmount.toFixed(2),
    bonusAmount: bonusAmount.toFixed(2),
    convertedAt: new Date(),
  });

  await tx.update(clientsTable)
    .set({
      totalReferrals: sql`COALESCE(total_referrals, 0) + 1`,
      successfulReferrals: sql`COALESCE(successful_referrals, 0) + 1`,
      referralEarnings: sql`COALESCE(referral_earnings, 0) + ${bonusAmount.toFixed(2)}`,
    })
    .where(eq(clientsTable.id, referrerId));

  if (referredClientId) {
    await tx.update(clientsTable)
      .set({ referredById: referrerId })
      .where(and(eq(clientsTable.id, referredClientId), sql`referred_by_id IS NULL`));
  }

  if (referralCookieId) {
    await tx.update(referralTrackingTable)
      .set({ converted: true, convertedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(referralTrackingTable.tenantId, tenantId),
        eq(referralTrackingTable.cookieId, referralCookieId),
      ));
  } else {
    await tx.update(referralTrackingTable)
      .set({ converted: true, convertedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(referralTrackingTable.tenantId, tenantId),
        eq(referralTrackingTable.referralCode, referralCode),
      ));
  }
}
