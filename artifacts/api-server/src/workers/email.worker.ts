import { Worker } from "bullmq";
import { db, emailLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendReservationConfirmationEmail, sendReservationCancellationEmail, sendBirthdayEmail, sendNewBookingNotificationEmail, sendReferralBonusPaidEmail, sendReferralConvertedEmail, sendReferralExpiredEmail } from "@workspace/email";
import { getRedisConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import type { ReservationEmailJobData, CancellationEmailJobData, BirthdayEmailJobData, NewBookingNotificationEmailJobData, ReferralBonusPaidEmailJobData, ReferralConvertedEmailJobData, ReferralExpiredEmailJobData } from "../queues/index";
import type { SendEmailResult } from "@workspace/email";

type EmailJobData = ReservationEmailJobData | CancellationEmailJobData | BirthdayEmailJobData | NewBookingNotificationEmailJobData | ReferralBonusPaidEmailJobData | ReferralConvertedEmailJobData | ReferralExpiredEmailJobData;

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
        if (result.success) {
          await db
            .update(emailLogsTable)
            .set({ status: "sent", messageId: result.messageId ?? null })
            .where(eq(emailLogsTable.id, emailLogId));
        }
      } else if (job.name === "new-booking-notification") {
        const {
          emailLogId: _e,
          tenantId: _t,
          reservationId: _r,
          recipients,
          cc,
          ...notificationProps
        } = job.data as NewBookingNotificationEmailJobData;
        result = await sendNewBookingNotificationEmail(notificationProps, { to: recipients, cc });
        const { emailLogId } = job.data as NewBookingNotificationEmailJobData;
        if (result.success) {
          await db
            .update(emailLogsTable)
            .set({ status: "sent", messageId: result.messageId ?? null })
            .where(eq(emailLogsTable.id, emailLogId));
        }
      } else if (job.name === "birthday-email") {
        const { tenantId: _t, emailSubject, senderName, emailMessage, ...birthdayProps } =
          job.data as BirthdayEmailJobData;
        result = await sendBirthdayEmail(birthdayProps, {
          emailSubject: emailSubject ?? null,
          senderName: senderName ?? null,
          emailMessage: emailMessage ?? null,
        });
      } else if (job.name === "referral-bonus-paid") {
        const { emailLogId: _e, tenantId: _t, ...bonusPaidProps } = job.data as ReferralBonusPaidEmailJobData;
        result = await sendReferralBonusPaidEmail(bonusPaidProps);
        const { emailLogId } = job.data as ReferralBonusPaidEmailJobData;
        if (result.success) {
          await db
            .update(emailLogsTable)
            .set({ status: "sent", messageId: result.messageId ?? null })
            .where(eq(emailLogsTable.id, emailLogId));
        }
      } else if (job.name === "referral-converted") {
        const { emailLogId: _e, tenantId: _t, ...convertedProps } = job.data as ReferralConvertedEmailJobData;
        result = await sendReferralConvertedEmail(convertedProps);
        const { emailLogId } = job.data as ReferralConvertedEmailJobData;
        if (result.success) {
          await db
            .update(emailLogsTable)
            .set({ status: "sent", messageId: result.messageId ?? null })
            .where(eq(emailLogsTable.id, emailLogId));
        }
      } else if (job.name === "referral-expired") {
        const { emailLogId: _e, tenantId: _t, ...expiredProps } = job.data as ReferralExpiredEmailJobData;
        result = await sendReferralExpiredEmail(expiredProps);
        const { emailLogId } = job.data as ReferralExpiredEmailJobData;
        if (result.success) {
          await db
            .update(emailLogsTable)
            .set({ status: "sent", messageId: result.messageId ?? null })
            .where(eq(emailLogsTable.id, emailLogId));
        }
      } else {
        const { emailLogId: _e, tenantId: _t, reservationId: _r, ...emailProps } =
          job.data as ReservationEmailJobData;
        result = await sendReservationConfirmationEmail(emailProps);
        const { emailLogId } = job.data as ReservationEmailJobData;
        if (result.success) {
          await db
            .update(emailLogsTable)
            .set({ status: "sent", messageId: result.messageId ?? null })
            .where(eq(emailLogsTable.id, emailLogId));
        }
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

  _worker.on("failed", async (job, err) => {
    if (!job) return;

    const attemptsUsed = job.attemptsMade;
    const maxAttempts = job.opts?.attempts ?? 1;
    const isExhausted = attemptsUsed >= maxAttempts;

    if (isExhausted) {
      logger.fatal(
        { jobId: job.id, jobName: job.name, attemptsUsed, err },
        "[email-worker] ALERT: job exhausted all retries — email was NOT delivered",
      );

      const data = job.data as Partial<ReservationEmailJobData & CancellationEmailJobData>;
      if (data.emailLogId) {
        try {
          await db
            .update(emailLogsTable)
            .set({
              status: "failed",
              errorMessage: err?.message ?? "Unknown error after all retries",
            })
            .where(eq(emailLogsTable.id, data.emailLogId));
        } catch (dbErr) {
          logger.error({ jobId: job.id, dbErr }, "[email-worker] Failed to update email log after exhausted retries");
        }
      }
    } else {
      logger.error({ jobId: job.id, jobName: job.name, attemptsUsed, maxAttempts, err }, "[email-worker] Job attempt failed — will retry");
    }
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

export function isEmailWorkerRunning(): boolean {
  return _worker !== null;
}
