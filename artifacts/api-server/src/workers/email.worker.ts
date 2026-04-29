import { Worker } from "bullmq";
import { db, emailLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendReservationConfirmationEmail } from "@workspace/email";
import { getRedisConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import type { ReservationEmailJobData } from "../queues/index";

let _worker: Worker<ReservationEmailJobData> | null = null;

export function startEmailWorker(): Worker<ReservationEmailJobData> | null {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("[email-worker] No Redis connection — worker not started");
    return null;
  }

  _worker = new Worker<ReservationEmailJobData>(
    "emails",
    async (job) => {
      const { emailLogId, tenantId, reservationId, ...emailProps } = job.data;
      logger.info({ jobId: job.id, emailLogId, reservationId }, "[email-worker] Processing job");

      const result = await sendReservationConfirmationEmail(emailProps);

      await db
        .update(emailLogsTable)
        .set({
          status: result.success ? "sent" : "failed",
          messageId: result.messageId ?? null,
          errorMessage: result.error ?? null,
        })
        .where(eq(emailLogsTable.id, emailLogId));

      if (!result.success) {
        throw new Error(result.error ?? "Unknown email error");
      }

      logger.info({ jobId: job.id, emailLogId, messageId: result.messageId }, "[email-worker] Email sent");
    },
    {
      connection: conn,
      concurrency: 5,
    },
  );

  _worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[email-worker] Job failed");
  });

  _worker.on("error", (err) => {
    logger.error({ err }, "[email-worker] Worker error");
  });

  logger.info("[email-worker] Started");
  return _worker;
}

export async function stopEmailWorker(): Promise<void> {
  if (_worker) {
    await _worker.close().catch(() => {});
    _worker = null;
  }
}
