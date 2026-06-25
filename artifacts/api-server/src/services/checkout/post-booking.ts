import { logger } from "../../lib/logger";
import { db } from "@workspace/db";
import { reservationsTable, storesTable, storeOrdersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { ensurePortalAccount } from "./portal-account";
import { generateAndAssignReferralCode } from "../../lib/referral-code";
import { generateReferralCode } from "../../lib/id";
import { applyDeferredOrderCredits } from "./deferred-referral-effects";
import { dispatchReferralConvertedEmail, dispatchReferralTierUpgradeEmail } from "../../queues/email-helpers";
import { dispatchWhatsAppReferralConverted } from "../../queues/whatsapp-helpers";

/**
 * Side effects that must only happen AFTER a store order's payment is confirmed
 * (Stripe/Mercado Pago webhook or manual payment entry) — never at checkout.
 *
 * Running these at checkout let an anonymous, non-paying visitor provision a
 * Clerk portal account (with a welcome email + temporary password) and mint a
 * referral code just by submitting the checkout form. Both are deferred here so
 * they are gated behind a real payment.
 *
 * This function is invoked post-commit (the order/reservation transaction has
 * already committed) because both ensurePortalAccount (external Clerk calls) and
 * generateAndAssignReferralCode (its own serializable transaction) must not run
 * inside another DB transaction. It is best-effort: every step is guarded so a
 * failure never rolls back or blocks the confirmed payment.
 *
 * Idempotent: ensurePortalAccount no-ops when the portal user already exists and
 * generateAndAssignReferralCode no-ops when the client already has a code, so it
 * is safe on webhook/payment retries.
 *
 * Note: the customer reservation-confirmation email is intentionally NOT sent
 * here (it is a pre-existing gap tracked separately) and the agency new-booking
 * notification is dispatched by the webhook handler, so it is not duplicated.
 *
 * @param orderId - The store_orders.id whose payment was just confirmed.
 */
export async function runPostPaymentSideEffects(orderId: string): Promise<void> {
  // Deferred referral conversion + referral-credit consumption. Runs first, in
  // its own transaction, gated behind confirmed payment and idempotent. Wrapped
  // in try/catch so a credit/referral failure never blocks the rest of the
  // post-payment side effects (or the already-confirmed payment).
  try {
    const deferred = await applyDeferredOrderCredits(orderId);
    if (deferred.conversionApplied && deferred.referrerId && deferred.tenantId) {
      dispatchReferralConvertedEmail(
        deferred.referrerId,
        deferred.customerName ?? "",
        deferred.tenantId,
      ).catch((err) =>
        logger.error({ err }, "[checkout/post-payment] Failed to dispatch referral-converted email"),
      );
      if (deferred.conversion?.tierUpgraded) {
        dispatchReferralTierUpgradeEmail(
          deferred.referrerId,
          deferred.tenantId,
          deferred.conversion.newTierLevel,
          deferred.conversion.newTierLabel,
          deferred.conversion.bonusMultiplier,
        ).catch((err) =>
          logger.error({ err }, "[checkout/post-payment] Failed to dispatch referral tier-upgrade email"),
        );
      }
      if (deferred.referralCode) {
        dispatchWhatsAppReferralConverted({
          referrerId: deferred.referrerId,
          referredName: deferred.customerName ?? "",
          referralCode: deferred.referralCode,
          tenantId: deferred.tenantId,
        }).catch((err) =>
          logger.error({ err }, "[checkout/post-payment] Failed to dispatch referral WhatsApp notification"),
        );
      }
    }
  } catch (err) {
    logger.error({ err }, "[checkout/post-payment] Failed to apply deferred referral/credit effects");
  }

  const [order] = await db
    .select({
      id: storeOrdersTable.id,
      orderNumber: storeOrdersTable.orderNumber,
      tenantId: storeOrdersTable.tenantId,
      storeId: storeOrdersTable.storeId,
      clientId: storeOrdersTable.clientId,
      customerName: storeOrdersTable.customerName,
      customerEmail: storeOrdersTable.customerEmail,
    })
    .from(storeOrdersTable)
    .where(eq(storeOrdersTable.id, orderId))
    .limit(1);

  if (!order) return;

  // Auto-generate a referral code for the paying client (generate-if-missing).
  // Gated behind payment so anonymous checkout submissions cannot mint codes.
  if (order.clientId) {
    try {
      const year = new Date().getFullYear();
      const namePart =
        (order.customerName ?? "REF").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4) || "REF";
      const baseCode = generateReferralCode(order.customerName);
      await generateAndAssignReferralCode(order.clientId, order.tenantId, baseCode, namePart, year);
    } catch (err) {
      logger.error({ err }, "[checkout/post-payment] Failed to generate referral code");
    }
  }

  // Provision the customer's portal account only when the paid order produced
  // trip reservations. Product-only orders do not get a portal account (matches
  // the prior trip-linked gating), and provisioning is now gated behind payment.
  const reservationRows = await db
    .select({ id: reservationsTable.id })
    .from(reservationsTable)
    .where(
      and(
        eq(reservationsTable.tenantId, order.tenantId),
        eq(reservationsTable.storeOrderId, order.orderNumber),
      ),
    );

  if (reservationRows.length === 0) return;

  const [store] = await db
    .select({
      tenantId: storesTable.tenantId,
      name: storesTable.name,
      slug: storesTable.slug,
      logo: storesTable.logo,
      customDomain: storesTable.customDomain,
    })
    .from(storesTable)
    .where(and(eq(storesTable.id, order.storeId), eq(storesTable.tenantId, order.tenantId)))
    .limit(1);

  if (!store) return;

  const STORE_PUBLIC_BASE = (process.env["STORE_PUBLIC_URL"] ?? "https://visitecrm.com").replace(/\/$/, "");
  const storeBase = store.customDomain
    ? `https://${store.customDomain}`
    : `${STORE_PUBLIC_BASE}/loja/${store.slug}`;
  const loginUrl = `${storeBase}/entrar`;

  try {
    await ensurePortalAccount({
      email: order.customerEmail,
      name: order.customerName,
      tenantId: order.tenantId,
      storeBase,
      loginUrl,
      agencyName: store.name,
      agencyLogo: store.logo ?? "",
    });
  } catch (err) {
    logger.error({ err }, "[checkout/post-payment] Failed to provision portal account");
  }
}
