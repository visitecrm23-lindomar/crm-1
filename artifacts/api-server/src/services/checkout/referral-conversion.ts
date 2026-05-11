import {
  clientsTable,
  referralsTable,
  referralSettingsTable,
  referralTrackingTable,
  storeOrdersTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { applyActiveCampaignBonus } from "../../lib/referral-campaigns";
import { generateId } from "../../lib/id";
import type { Tx } from "./tx";
import { REFERRAL_STATUS } from "@workspace/permissions";
import { computeReferralTier } from "../../lib/referral-tiers";
import { detectReferralFraud } from "../../lib/referral-fraud";

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
  conversionIp?: string | null;
}

export async function recordReferralConversion(tx: Tx, args: RecordReferralArgs): Promise<void> {
  const {
    tenantId, referrerId, referralCode, referredClientId,
    customerEmail, customerName, discountAmount, discountValue, discountType,
    referralCookieId, conversionIp,
  } = args;

  const [refSettings] = await tx
    .select({
      bonusValue: referralSettingsTable.bonusValue,
      bonusType: referralSettingsTable.bonusType,
      tiersConfig: referralSettingsTable.tiersConfig,
      expirationDays: referralSettingsTable.expirationDays,
    })
    .from(referralSettingsTable)
    .where(eq(referralSettingsTable.tenantId, tenantId))
    .limit(1);

  const baseBonusValue = refSettings ? Number(refSettings.bonusValue) : 10;

  // Apply active campaign bonus adjustment if any
  const effectiveBonusValue = await applyActiveCampaignBonus(tx as never, tenantId, baseBonusValue);

  const [referrer] = await tx
    .select({
      successfulReferrals: clientsTable.successfulReferrals,
      email: clientsTable.email,
    })
    .from(clientsTable)
    .where(eq(clientsTable.id, referrerId))
    .limit(1);

  const currentCompleted = referrer?.successfulReferrals ?? 0;
  const { tier } = computeReferralTier(currentCompleted, refSettings?.tiersConfig ?? null);
  const bonusAmount = Math.round(effectiveBonusValue * tier.bonusMultiplier * 100) / 100;

  const referralId = generateId();
  const conversionAt = new Date();

  const expirationDays = refSettings?.expirationDays ?? 30;
  const expiresAt = new Date(conversionAt);
  expiresAt.setDate(expiresAt.getDate() + expirationDays);

  await tx.insert(referralsTable).values({
    id: referralId,
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
    convertedAt: conversionAt,
    expiresAt,
    ipAddress: conversionIp ?? null,
  });

  const trackingWhere = referralCookieId
    ? and(eq(referralTrackingTable.tenantId, tenantId), eq(referralTrackingTable.cookieId, referralCookieId))
    : and(eq(referralTrackingTable.tenantId, tenantId), eq(referralTrackingTable.referralCode, referralCode));

  const [trackingRow] = await tx
    .select({ firstVisit: referralTrackingTable.firstVisit })
    .from(referralTrackingTable)
    .where(trackingWhere!)
    .limit(1);

  const [lastReferrerOrder] = await tx
    .select({ ipAddress: storeOrdersTable.ipAddress })
    .from(storeOrdersTable)
    .where(and(
      eq(storeOrdersTable.tenantId, tenantId),
      eq(storeOrdersTable.clientId, referrerId),
    ))
    .orderBy(desc(storeOrdersTable.createdAt))
    .limit(1);

  const fraud = detectReferralFraud({
    conversionIp: conversionIp ?? null,
    referrerIp: lastReferrerOrder?.ipAddress ?? null,
    firstVisit: trackingRow?.firstVisit ?? null,
    conversionAt,
    referredEmail: customerEmail,
    referrerEmail: referrer?.email ?? null,
  });

  if (fraud.flagged) {
    await tx.update(referralsTable)
      .set({ fraudFlag: true, fraudReason: fraud.reason, updatedAt: new Date() })
      .where(eq(referralsTable.id, referralId));
  }

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

  const conversionUpdate = {
    converted: true,
    convertedAt: conversionAt,
    updatedAt: new Date(),
    ...(conversionIp ? { ipAddress: conversionIp } : {}),
  };

  if (referralCookieId) {
    await tx.update(referralTrackingTable)
      .set(conversionUpdate)
      .where(and(
        eq(referralTrackingTable.tenantId, tenantId),
        eq(referralTrackingTable.cookieId, referralCookieId),
      ));
  } else {
    await tx.update(referralTrackingTable)
      .set(conversionUpdate)
      .where(and(
        eq(referralTrackingTable.tenantId, tenantId),
        eq(referralTrackingTable.referralCode, referralCode),
      ));
  }
}
