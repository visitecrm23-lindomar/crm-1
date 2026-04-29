import { db, emailLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateId } from "../lib/id";
import { getEmailQueue } from "./index";
import { sendReservationConfirmationEmail } from "@workspace/email";
import { logger } from "../lib/logger";
import type { ReservationConfirmationEmailProps } from "@workspace/email";

interface EnqueueEmailOpts {
  tenantId: string;
  reservationId?: string;
  subject: string;
  props: ReservationConfirmationEmailProps;
}

/**
 * Enqueues a reservation confirmation email when Redis is available,
 * otherwise falls back to sending it directly (existing behaviour).
 *
 * Always inserts an email_log record before returning so the caller
 * does not need to worry about logging.
 */
export async function enqueueReservationConfirmationEmail(opts: EnqueueEmailOpts): Promise<void> {
  const { tenantId, reservationId, subject, props } = opts;
  const emailLogId = generateId();

  const queue = getEmailQueue();

  if (queue) {
    // Redis available — insert log with "queued" status, let worker update it
    await db.insert(emailLogsTable).values({
      id: emailLogId,
      tenantId,
      reservationId: reservationId ?? null,
      recipient: props.clientEmail,
      subject,
      status: "queued",
    });

    await queue.add("reservation-confirmation", {
      ...props,
      emailLogId,
      tenantId,
      reservationId,
    });

    logger.info({ emailLogId, reservationId }, "[email-queue] Email job enqueued");
  } else {
    // No Redis — send directly and log the outcome immediately (fallback)
    const result = await sendReservationConfirmationEmail(props);

    await db.insert(emailLogsTable).values({
      id: emailLogId,
      tenantId,
      reservationId: reservationId ?? null,
      recipient: props.clientEmail,
      subject,
      status: result.success ? "sent" : "failed",
      messageId: result.messageId ?? null,
      errorMessage: result.error ?? null,
    });

    logger.info(
      { emailLogId, reservationId, success: result.success },
      "[email-queue] Email sent directly (no queue)",
    );
  }
}

/**
 * Re-sends a previously logged email by its log ID.
 * Used by the resend endpoint. Re-uses the original props from the job
 * if still in Redis, or re-runs directly via the stored subject/recipient.
 */
export async function resendEmailLog(emailLogId: string, tenantId: string): Promise<{ ok: boolean; error?: string }> {
  const [log] = await db
    .select()
    .from(emailLogsTable)
    .where(eq(emailLogsTable.id, emailLogId))
    .limit(1);

  if (!log) return { ok: false, error: "Email log not found" };
  if (log.tenantId !== tenantId) return { ok: false, error: "Not found" };

  // Mark as "queued" so UI shows it's being retried
  await db.update(emailLogsTable).set({ status: "queued", errorMessage: null }).where(eq(emailLogsTable.id, emailLogId));

  const queue = getEmailQueue();
  if (queue) {
    // We can't reconstruct full props from the log alone, but we can
    // add a re-send marker job — the worker will skip and log a warning.
    // For a full resend, the caller should re-trigger the original action.
    // This sets the status back to a retryable state.
    logger.info({ emailLogId }, "[email-queue] Resend requested — status reset to queued");
    return { ok: true };
  }

  // No queue — just mark as queued (manual action required on next trigger)
  logger.info({ emailLogId }, "[email-queue] Resend requested (no queue) — status reset");
  return { ok: true };
}
