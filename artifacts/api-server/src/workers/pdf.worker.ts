import { Worker } from "bullmq";
import { getRedisConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import type { PdfJobData } from "../queues/index";

let _worker: Worker<PdfJobData> | null = null;

/**
 * PDF Worker — processes async PDF generation jobs.
 *
 * Currently supports:
 *   - "manifest": Generate and email the ANTT manifest PDF for a trip.
 *     (Full implementation delegated to the manifest generation route;
 *      this worker handles async scheduling and retry logic.)
 */
export function startPdfWorker(): Worker<PdfJobData> | null {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("[pdf-worker] No Redis connection — worker not started");
    return null;
  }

  _worker = new Worker<PdfJobData>(
    "pdfs",
    async (job) => {
      logger.info({ jobId: job.id, type: job.data.type, tripId: job.data.tripId }, "[pdf-worker] Processing job");

      if (job.data.type === "manifest") {
        // Manifest generation is currently handled synchronously in the manifests route.
        // When async manifest generation is enabled, implement the logic here:
        // 1. Generate the ANTT manifest PDF for job.data.tripId
        // 2. Email it to job.data.recipientEmail via sendManifestEmail()
        logger.info({ tripId: job.data.tripId, recipient: job.data.recipientEmail }, "[pdf-worker] Manifest job received (sync path still active)");
      } else {
        logger.warn({ type: job.data.type }, "[pdf-worker] Unknown PDF job type");
      }
    },
    { connection: conn, concurrency: 2 },
  );

  _worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[pdf-worker] Job failed");
  });

  _worker.on("error", (err) => {
    logger.error({ err }, "[pdf-worker] Worker error");
  });

  logger.info("[pdf-worker] Started");
  return _worker;
}

export async function stopPdfWorker(): Promise<void> {
  if (_worker) {
    await _worker.close().catch(() => {});
    _worker = null;
  }
}
