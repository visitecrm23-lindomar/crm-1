import { Worker } from "bullmq";
import { sendWhatsAppMessage } from "../lib/whatsapp";
import { getRedisConnection, isTransientRedisError, recordTransientRedisError, resetTransientRedisErrors } from "../lib/redis";
import { logger } from "../lib/logger";
import type { WhatsAppNotificationJobData } from "../queues/index";

let _worker: Worker<WhatsAppNotificationJobData> | null = null;

export function startWhatsAppWorker(): Worker<WhatsAppNotificationJobData> | null {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("[whatsapp-worker] No Redis connection — worker not started");
    return null;
  }

  const isDev = process.env.NODE_ENV !== "production";

  _worker = new Worker<WhatsAppNotificationJobData>(
    "whatsapp-notifications",
    async (job) => {
      logger.info({ jobId: job.id, phone: job.data.phone }, "[whatsapp-worker] Processing job");
      const result = await sendWhatsAppMessage(job.data.phone, job.data.message);
      if (!result.success && result.error !== "credentials_not_configured") {
        throw new Error(result.error ?? "send_failed");
      }
    },
    isDev
      ? { connection: conn, concurrency: 1, stalledInterval: 60_000, drainDelay: 30 }
      : { connection: conn, concurrency: 5, stalledInterval: 15_000 },
  );

  _worker.on("failed", (job, err) => {
    logger.warn({ jobId: job?.id, err: err.message }, "[whatsapp-worker] Job failed");
  });

  _worker.on("error", (err) => {
    if (isTransientRedisError(err)) {
      recordTransientRedisError();
      logger.warn({ err }, "[whatsapp-worker] Transient worker error (will recover automatically)");
    } else {
      logger.error({ err }, "[whatsapp-worker] Worker error");
    }
  });

  _worker.on("ready", () => {
    resetTransientRedisErrors();
  });

  return _worker;
}

export async function stopWhatsAppWorker(): Promise<void> {
  await _worker?.close().catch(() => {});
  _worker = null;
}
