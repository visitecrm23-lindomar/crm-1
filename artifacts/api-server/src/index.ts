import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db";
import cron from "node-cron";
import path from "path";
import { fileURLToPath } from "url";
import { runBirthdayCron } from "./lib/birthday";
import { runExpiredReservationsCron } from "./lib/expired-reservations";
import { getRedisConnection } from "./lib/redis";
import { getReminderQueue, closeQueues } from "./queues/index";
import { startEmailWorker, stopEmailWorker } from "./workers/email.worker";
import { startReminderWorker, stopReminderWorker } from "./workers/reminder.worker";
import { startPdfWorker, stopPdfWorker } from "./workers/pdf.worker";
import { startCommissionSyncWorker, stopCommissionSyncWorker } from "./workers/commission-sync.worker";

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

const __serverDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__serverDir, "../../../lib/db/drizzle");

async function applyMigrations() {
  try {
    await runMigrations(migrationsFolder);
    logger.info("Drizzle migrations complete");
  } catch (err) {
    logger.error({ err }, "Drizzle migration failed");
  }
}

applyMigrations()
  .catch((err) => logger.error({ err }, "applyMigrations threw unexpectedly"))
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
    }

    // ── Graceful shutdown ──
    const shutdown = async (signal: string) => {
      logger.info({ signal }, "Shutdown signal received");
      await Promise.all([stopEmailWorker(), stopReminderWorker(), stopPdfWorker(), stopCommissionSyncWorker(), closeQueues()]);
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
