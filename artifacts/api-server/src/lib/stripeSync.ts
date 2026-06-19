import { StripeSync } from "stripe-replit-sync";
import type Stripe from "stripe";
import { logger } from "./logger";

let _stripeSyncInstance: StripeSync | null = null;

export function getStripeSync(): StripeSync | null {
  return _stripeSyncInstance;
}

const MANAGED_WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
];

/**
 * Initialize the Stripe sync engine: instantiate StripeSync, register/find the
 * managed webhook, and run an initial backfill of recent subscriptions.
 * Called once at server startup, after DB migrations. Non-fatal — warns on failure.
 *
 * Initialization sequence (as required by task spec):
 *   getStripeSync() → findOrCreateManagedWebhook() → syncBackfill()
 */
export async function initStripeSync(): Promise<void> {
  const stripeSecretKey = process.env["STRIPE_SECRET_KEY"];
  const databaseUrl = process.env["DATABASE_URL"];

  if (!stripeSecretKey) {
    logger.warn("[stripe-sync] STRIPE_SECRET_KEY not set — skipping StripeSync initialization");
    return;
  }

  if (!databaseUrl) {
    logger.warn("[stripe-sync] DATABASE_URL not set — skipping StripeSync initialization");
    return;
  }

  try {
    // Step 1: getStripeSync() — create the StripeSync instance
    _stripeSyncInstance = new StripeSync({
      stripeSecretKey,
      poolConfig: {
        connectionString: databaseUrl,
        ssl: process.env["NODE_ENV"] === "production" ? true : undefined,
      },
      logger,
    });

    logger.info("[stripe-sync] StripeSync instance created");

    // Step 2: findOrCreateManagedWebhook() — register this server's endpoint in Stripe
    const appUrl = process.env["FRONTEND_URL"]
      ?? (process.env["REPLIT_DEV_DOMAIN"] ? `https://${process.env["REPLIT_DEV_DOMAIN"]}` : null);

    if (appUrl) {
      const webhookUrl = `${appUrl}/api/stripe/webhook`;
      try {
        const webhook = await _stripeSyncInstance.findOrCreateManagedWebhook(webhookUrl, {
          enabled_events: MANAGED_WEBHOOK_EVENTS,
        });
        logger.info({ webhookId: webhook.id, url: webhookUrl }, "[stripe-sync] Managed webhook registered");
      } catch (err) {
        logger.warn({ err }, "[stripe-sync] Could not register managed webhook — configure manually in Stripe Dashboard");
      }
    } else {
      logger.warn("[stripe-sync] No app URL available — skipping managed webhook registration");
    }

    // Step 3: syncBackfill() — backfill recent subscriptions into the sync tables
    try {
      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
      const result = await _stripeSyncInstance.syncBackfill({
        created: { gte: thirtyDaysAgo },
        object: "subscription",
      });
      logger.info({ result }, "[stripe-sync] syncBackfill complete");
    } catch (err) {
      logger.warn({ err }, "[stripe-sync] syncBackfill failed — will retry on next startup");
    }
  } catch (err) {
    logger.warn({ err }, "[stripe-sync] Failed to initialize StripeSync — billing sync disabled");
    _stripeSyncInstance = null;
  }
}
