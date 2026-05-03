import { Worker } from "bullmq";
import { db, emailLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendReservationConfirmationEmail, sendReservationCancellationEmail, sendBirthdayEmail } from "@workspace/email";
import { getRedisConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import type { ReservationEmailJobData, CancellationEmailJobData, BirthdayEmailJobData } from "../queues/index";
import type { SendEmailResult } from "@workspace/email";

type EmailJobData = ReservationEmailJobData | CancellationEmailJobData | BirthdayEmailJobData;

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
      logger.info({ jobId: job.id, jobName: job.name }, "[email-worker] Processing job");

      let result: SendEmailResult;

      if (job.name === "reservation-cancellation") {
        const { emailLogId: _e, tenantId: _t, reservationId: _r, ...cancellationProps } =
          job.data as CancellationEmailJobData;
        result = await sendReservationCancellationEmail(cancellationProps);
        const { emailLogId } = job.data as CancellationEmailJobData;
        await db
          .update(emailLogsTable)
          .set({
            status: result.success ? "sent" : "failed",
            messageId: result.messageId ?? null,
            errorMessage: result.error ?? null,
          })
          .where(eq(emailLogsTable.id, emailLogId));
      } else if (job.name === "birthday-email") {
        const { tenantId: _t, emailSubject, senderName, emailMessage, ...birthdayProps } =
          job.data as BirthdayEmailJobData;
        result = await sendBirthdayEmail(birthdayProps, {
          emailSubject: emailSubject ?? null,
          senderName: senderName ?? null,
          emailMessage: emailMessage ?? null,
        });
      } else {
        const { emailLogId: _e, tenantId: _t, reservationId: _r, ...emailProps } =
          job.data as ReservationEmailJobData;
        result = await sendReservationConfirmationEmail(emailProps);
        const { emailLogId } = job.data as ReservationEmailJobData;
        await db
          .update(emailLogsTable)
          .set({
            status: result.success ? "sent" : "failed",
            messageId: result.messageId ?? null,
            errorMessage: result.error ?? null,
          })
          .where(eq(emailLogsTable.id, emailLogId));
      }

      if (!result.success) {
        throw new Error(result.error ?? "Unknown email error");
      }

      logger.info({ jobId: job.id, messageId: result.messageId }, "[email-worker] Email sent");
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
