import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db";
import { backfillEncryptedCredentials } from "./lib/credential-backfill";
import cron from "node-cron";
import path from "path";
import { fileURLToPath } from "url";
import { runBirthdayCron } from "./lib/birthday";
import { runExpiredReservationsCron } from "./lib/expired-reservations";
import { getRedisConnection } from "./lib/redis";
import { getReminderQueue, closeQueues } from "./queues/index";
import { startEmailWorker, stopEmailWorker } from "./workers/email.worker";
import { startReminderWorker, stopReminderWorker, retryFailedBookingEmails } from "./workers/reminder.worker";
import { startPdfWorker, stopPdfWorker } from "./workers/pdf.worker";
import { startCommissionSyncWorker, stopCommissionSyncWorker } from "./workers/commission-sync.worker";
import { startWhatsAppWorker, stopWhatsAppWorker } from "./workers/whatsapp.worker";

process.on("unhandledRejection", (reason: unknown) => {
  logger.error({ err: reason }, "Unhandled promise rejection — process kept alive");
});

process.on("uncaughtException", (err: Error) => {
  logger.fatal({ err }, "Uncaught exception — shutting down");
  process.exit(1);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// CREDENTIAL_ENCRYPTION_KEY is mandatory in every environment because gateway
// credentials are encrypted at rest. Validating its shape here means the
// server will not boot with a missing/malformed key, instead of failing
// later at the first PATCH /store/settings or webhook fetch.
{
  const raw = process.env["CREDENTIAL_ENCRYPTION_KEY"];
  if (!raw) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is required. Generate one with " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"` " +
        "and set it in the environment.",
    );
  }
  // Strip every whitespace character (the value sometimes arrives with stray
  // newlines, surrounding quotes, or copy-paste padding from the secrets UI).
  const cleaned = raw.replace(/\s+/g, "").replace(/^["']|["']$/g, "");
  if (!/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    throw new Error(
      `CREDENTIAL_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes). ` +
        `Got a value of length ${cleaned.length}. ` +
        `Generate a fresh one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  // Re-export the cleaned value so downstream getKey() sees the canonical form.
  process.env["CREDENTIAL_ENCRYPTION_KEY"] = cleaned;
}

// Webhook secret validation. In production both are mandatory; dev/test only warns.
{
  const isProd = process.env["NODE_ENV"] === "production";
  const missing: string[] = [];
  if (!process.env["STRIPE_WEBHOOK_SECRET"]) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!process.env["MP_WEBHOOK_SECRET"]) missing.push("MP_WEBHOOK_SECRET");
  if (missing.length > 0) {
    if (isProd) {
      throw new Error(
        `Required webhook secrets are missing in production: ${missing.join(", ")}. ` +
          `These are needed to validate Stripe / MercadoPago webhook signatures and auto-confirm paid reservations.`,
      );
    }
    logger.warn(
      { missing },
      "⚠️  Webhook secrets are not set; /api/webhooks/* endpoints will reject events with 400 until they are configured.",
    );
  }
}

const __serverDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__serverDir, "../../../lib/db/drizzle");

async function applyMigrations() {
  try {
    await runMigrations(migrationsFolder);
    logger.info("Drizzle migrations complete");
  } catch (err) {
    logger.error({ err }, "Drizzle migration failed");
  }
  // The credential backfill is intentionally OUTSIDE the try/catch above so
  // a failure (bad encryption key, DB error mid-run) is fatal and aborts
  // boot — leaving plaintext credentials half-encrypted is worse than
  // refusing to start.
  await backfillEncryptedCredentials();
  logger.info("Credential backfill complete");
}

applyMigrations()
  .catch((err) => {
    // applyMigrations only throws when the credential backfill fails (drizzle
    // errors are caught + logged inside it). Half-encrypted credentials would
    // be worse than no boot at all, so abort the process.
    logger.error({ err }, "Credential backfill failed — aborting boot");
    process.exit(1);
  })
  .then(async () => {
    // ── Birthday cron (node-cron, runs in-process, no Redis required) ──
    cron.schedule("0 0 * * *", () => {
      logger.info("[birthday] Daily cron triggered");
      runBirthdayCron().catch((err) => logger.error({ err }, "[birthday] Cron failed"));
    }, { timezone: "America/Sao_Paulo" });

    // ── BullMQ: start workers if Redis is available ──
    const redisConn = getRedisConnection();
    if (redisConn) {
      startEmailWorker();
      startReminderWorker();
      startPdfWorker();
      startCommissionSyncWorker();
      startWhatsAppWorker();
      logger.info("[queue] BullMQ workers started");

      // Register repeatable reminder jobs (idempotent — BullMQ de-dups by key)
      const reminderQueue = getReminderQueue();
      if (reminderQueue) {
        // Reminders run at 08:00 daily in the America/Sao_Paulo timezone (BRT/BRST).
        // BullMQ repeat.tz is used to make this explicit and environment-independent.
        const REMINDER_TZ = process.env["REMINDER_TZ"] ?? "America/Sao_Paulo";
        const REMINDER_CRON = process.env["REMINDER_CRON"] ?? "0 8 * * *";

        // D-1 boarding reminder
        await reminderQueue.upsertJobScheduler(
          "boarding-reminder-daily",
          { pattern: REMINDER_CRON, tz: REMINDER_TZ },
          { name: "boarding_reminder", data: { type: "boarding_reminder" } },
        ).catch((err) => logger.error({ err }, "[reminders] Failed to schedule boarding reminder"));

        // D-3 payment reminder
        await reminderQueue.upsertJobScheduler(
          "payment-reminder-daily",
          { pattern: REMINDER_CRON, tz: REMINDER_TZ },
          { name: "payment_reminder", data: { type: "payment_reminder" } },
        ).catch((err) => logger.error({ err }, "[reminders] Failed to schedule payment reminder"));

        // Expired reservations cleanup — every 5 minutes
        await reminderQueue.upsertJobScheduler(
          "expired-reservations-cleanup",
          { pattern: "*/5 * * * *" },
          { name: "expired_reservations_cleanup", data: { type: "expired_reservations_cleanup" } },
        ).catch((err) => logger.error({ err }, "[reminders] Failed to schedule expired reservations cleanup"));

        // Failed booking email auto-retry — every 15 minutes
        await reminderQueue.upsertJobScheduler(
          "failed-email-retry",
          { pattern: "*/15 * * * *" },
          { name: "failed_email_retry", data: { type: "failed_email_retry" } },
        ).catch((err) => logger.error({ err }, "[reminders] Failed to schedule failed-email retry"));

        // Expired referral notifications — daily at 09:00 BRT
        await reminderQueue.upsertJobScheduler(
          "referral-expiry-notification-daily",
          { pattern: "0 9 * * *", tz: process.env["REMINDER_TZ"] ?? "America/Sao_Paulo" },
          { name: "referral_expiry_notification", data: { type: "referral_expiry_notification" } },
        ).catch((err) => logger.error({ err }, "[reminders] Failed to schedule referral expiry notification"));

        logger.info("[reminders] Repeatable reminder jobs registered");
      }
    } else {
      logger.warn("[queue] REDIS_URL not set — BullMQ workers not started, emails sent synchronously");

      // ── Fallback: node-cron for expired reservations cleanup (no Redis required) ──
      cron.schedule("*/5 * * * *", () => {
        runExpiredReservationsCron().catch((err) =>
          logger.error({ err }, "[expired-reservations] Cron failed"),
        );
      });
      logger.info("[expired-reservations] node-cron fallback registered (every 5 minutes)");

      // ── Fallback: node-cron for failed-email auto-retry (no Redis required) ──
      cron.schedule("*/15 * * * *", () => {
        retryFailedBookingEmails().catch((err) =>
          logger.error({ err }, "[email-retry] node-cron fallback failed"),
        );
      });
      logger.info("[email-retry] node-cron fallback registered (every 15 minutes)");
    }

    // ── Graceful shutdown ──
    const shutdown = async (signal: string) => {
      logger.info({ signal }, "Shutdown signal received");
      await Promise.all([stopEmailWorker(), stopReminderWorker(), stopPdfWorker(), stopCommissionSyncWorker(), stopWhatsAppWorker(), closeQueues()]);
      process.exit(0);
    };
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));

    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  });
