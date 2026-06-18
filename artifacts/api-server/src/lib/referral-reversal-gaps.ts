import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { REFERRAL_STATUS, RESERVATION_STATUS } from "@workspace/permissions";

/**
 * One surfaced referral-reversal gap: a CANCELLED reservation that carried a
 * referral discount code, where the matching COMPLETED referral was never
 * relinked/reversed against that reservation's id.
 */
export interface ReferralReversalGap {
  reservation_id: string;
  reservation_number: string | null;
  referral_code: string;
  referrer_name: string | null;
}

/**
 * Detects referral-reversal gaps for a tenant. Mirrors the exact Reversal 3
 * warn-path in reservations.ts:
 *   byReservation lookup (status=COMPLETED AND reservation_id = r.id) → no row
 *   byCode lookup        (status=COMPLETED AND code = discountReferralCode) → row
 *
 * The gap fires for any CANCELLED reservation (CRM or store checkout) whose
 * `discount_referral_code` still maps to a COMPLETED referral that was not
 * reversed/relinked by reservation id, and whose reversal warning has not yet
 * been acknowledged. DISTINCT ON prevents fanout when multiple COMPLETED
 * referral rows share the same code.
 */
export async function findReferralReversalGaps(
  tenantId: string,
): Promise<ReferralReversalGap[]> {
  if (!tenantId) return [];

  const result = await db.execute<ReferralReversalGap>(sql`
    SELECT DISTINCT ON (r.id)
      r.id               AS reservation_id,
      r.reservation_number,
      ref.code           AS referral_code,
      ref.referrer_name
    FROM reservations r
    INNER JOIN referrals ref ON (
      ref.tenant_id = ${tenantId}
      AND ref.code = r.discount_referral_code
      AND ref.status = ${REFERRAL_STATUS.COMPLETED}
      AND ref.reversal_warning_acknowledged_at IS NULL
    )
    WHERE r.tenant_id = ${tenantId}
      AND r.status = ${RESERVATION_STATUS.CANCELLED}
      AND r.discount_referral_code IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM referrals r2
        WHERE r2.tenant_id = ${tenantId}
          AND r2.reservation_id = r.id
          AND r2.status = ${REFERRAL_STATUS.COMPLETED}
      )
    ORDER BY r.id, ref.created_at ASC
    LIMIT 20
  `);

  return result.rows;
}
