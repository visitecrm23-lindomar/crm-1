import { Worker } from "bullmq";
import { db, emailLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendReservationConfirmationEmail, sendReservationCancellationEmail } from "@workspace/email";
import { getRedisConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import type { ReservationEmailJobData, CancellationEmailJobData } from "../queues/index";
import type { SendEmailResult } from "@workspace/email";

type EmailJobData = ReservationEmailJobData | CancellationEmailJobData;

let _worker: Worker<EmailJobData> | null = null;

export function startEmailWorker(): Worker<EmailJobData> | null {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("[email-worker] No Redis connection — worker not started");
    return null;
  }

  _worker = new Worker<EmailJobData>(
    "emails",
    async (job) => {
      const { emailLogId, tenantId: _tenantId, reservationId } = job.data;
      logger.info({ jobId: job.id, emailLogId, reservationId }, "[email-worker] Processing job");

      let result: SendEmailResult;

      if (job.name === "reservation-cancellation") {
        const { emailLogId: _e, tenantId: _t, reservationId: _r, ...cancellationProps } =
          job.data as CancellationEmailJobData;
        result = await sendReservationCancellationEmail(cancellationProps);
      } else {
        const { emailLogId: _e, tenantId: _t, reservationId: _r, ...emailProps } =
          job.data as ReservationEmailJobData;
        result = await sendReservationConfirmationEmail(emailProps);
      }

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
