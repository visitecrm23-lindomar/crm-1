import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { REFERRAL_STATUS, RESERVATION_STATUS } from "@workspace/permissions";

/**
 * One surfaced referral-reversal gap: a CANCELLED reservation that carried a
 * referral discount code, where the matching COMPLETED referral was never
 * relinked/reversed against that reservation's id.
 */
export interface ReferralReversalGap {
  [key: string]: unknown;
  reservation_id: string;
  reservation_number: string | null;
  referral_code: string;
  referrer_name: string | null;
}

export interface FindReferralReversalGapsOptions {
  /** Max rows to return. Clamped to 1..100. Defaults to 20. */
  limit?: number;
  /** Rows to skip for pagination. Clamped to >= 0. Defaults to 0. */
  offset?: number;
}

const DEFAULT_GAP_LIMIT = 20;
const MAX_GAP_LIMIT = 100;

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
 *
 * Results are paginated via {@link FindReferralReversalGapsOptions}. Ordering is
 * by `r.id` (required leading expression for `DISTINCT ON`), which is stable, so
 * `limit`/`offset` give deterministic pages. Use {@link countReferralReversalGaps}
 * to get the full total for paging/badge counts.
 */
export async function findReferralReversalGaps(
  tenantId: string,
  options: FindReferralReversalGapsOptions = {},
): Promise<ReferralReversalGap[]> {
  if (!tenantId) return [];

  // Guard against non-finite inputs (NaN/Infinity) from direct callers before
  // clamping; route handlers already sanitize, but the lib stays robust on its own.
  const rawLimit = Number.isFinite(options.limit) ? Math.trunc(options.limit as number) : DEFAULT_GAP_LIMIT;
  const limit = Math.min(Math.max(rawLimit, 1), MAX_GAP_LIMIT);
  const rawOffset = Number.isFinite(options.offset) ? Math.trunc(options.offset as number) : 0;
  const offset = Math.max(rawOffset, 0);

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
    LIMIT ${limit} OFFSET ${offset}
  `);

  return result.rows;
}

/**
 * Counts every referral-reversal gap for a tenant (the true total, unbounded by
 * the page limit in {@link findReferralReversalGaps}). Each CANCELLED reservation
 * that qualifies is counted once — the `EXISTS`/`NOT EXISTS` shape mirrors the
 * `DISTINCT ON (r.id)` semantics of the list query, so the count always equals
 * the number of distinct rows the unpaginated list would produce.
 */
export async function countReferralReversalGaps(tenantId: string): Promise<number> {
  if (!tenantId) return 0;

  const result = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM reservations r
    WHERE r.tenant_id = ${tenantId}
      AND r.status = ${RESERVATION_STATUS.CANCELLED}
      AND r.discount_referral_code IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM referrals ref
        WHERE ref.tenant_id = ${tenantId}
          AND ref.code = r.discount_referral_code
          AND ref.status = ${REFERRAL_STATUS.COMPLETED}
          AND ref.reversal_warning_acknowledged_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM referrals r2
        WHERE r2.tenant_id = ${tenantId}
          AND r2.reservation_id = r.id
          AND r2.status = ${REFERRAL_STATUS.COMPLETED}
      )
  `);

  return Number(result.rows[0]?.count ?? 0);
}
