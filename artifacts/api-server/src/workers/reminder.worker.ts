import { Worker } from "bullmq";
import { db, reservationsTable, tripsTable, clientsTable, tenantsTable, paymentsTable, emailLogsTable } from "@workspace/db";
import { eq, and, gt, sql, gte, lt, isNull, isNotNull, notLike } from "drizzle-orm";
import { sendReminderHtmlEmail, sendReservationConfirmationEmail } from "@workspace/email";
import { getRedisConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import { runExpiredReservationsCron } from "../lib/expired-reservations";
import type { ReminderJobData } from "../queues/index";
import { RESERVATION_STATUS, PAYMENT_STATUS } from "@workspace/permissions";
import { buildEmailPropsFromReservation } from "../queues/email-helpers";
import { generateId } from "../lib/id";

function escapeHtml(str: string | null | undefined): string {
  return (str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ────────────────────────────────────────────────────────────
// D-1 Boarding reminder
// ────────────────────────────────────────────────────────────

async function processBoardingReminders(): Promise<void> {
  const now = new Date();
  const tomorrowStart = new Date(now);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const rows = await db
    .select({
      reservationId: reservationsTable.id,
      reservationNumber: reservationsTable.reservationNumber,
      voucherCode: reservationsTable.voucherCode,
      seats: reservationsTable.seats,
      tenantId: reservationsTable.tenantId,
      clientId: reservationsTable.clientId,
      tripId: reservationsTable.tripId,
      tripName: tripsTable.name,
      tripDestination: tripsTable.destination,
      departureDate: tripsTable.departureDate,
      boardingPoints: tripsTable.boardingPoints,
      clientName: clientsTable.name,
      clientEmail: clientsTable.email,
      agencyName: tenantsTable.name,
    })
    .from(reservationsTable)
    .innerJoin(tripsTable, eq(reservationsTable.tripId, tripsTable.id))
    .innerJoin(clientsTable, eq(reservationsTable.clientId, clientsTable.id))
    .innerJoin(tenantsTable, eq(reservationsTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(reservationsTable.status, RESERVATION_STATUS.CONFIRMED),
        gte(tripsTable.departureDate, tomorrowStart),
        lt(tripsTable.departureDate, tomorrowEnd),
      ),
    );

  logger.info({ count: rows.length }, "[reminder:boarding] Found reservations for D-1 reminder");

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.clientEmail) continue;

    const depDate = row.departureDate
      ? (row.departureDate as unknown as Date).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "Amanhã";

    const points = (row.boardingPoints ?? []) as { name: string; time?: string; address?: string }[];
    const boardingHtml =
      points.length > 0
        ? points
            .map(
              (p) =>
                `<li><strong>${escapeHtml(p.name)}</strong>${p.time ? ` — ${escapeHtml(p.time)}` : ""}${p.address ? `<br><small>${escapeHtml(p.address)}</small>` : ""}</li>`,
            )
            .join("")
        : "<li>Consulte a agência para informações de embarque</li>";

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2 style="color:#2563EB">🚌 Lembrete de Embarque — Amanhã!</h2>
  <p>Olá, <strong>${escapeHtml(row.clientName)}</strong>!</p>
  <p>Sua viagem para <strong>${escapeHtml(row.tripDestination ?? row.tripName)}</strong> está marcada para <strong>amanhã, ${depDate}</strong>.</p>
  <h3 style="color:#374151">Pontos de Embarque:</h3>
  <ul style="line-height:1.8">${boardingHtml}</ul>
  <p>Não esqueça de levar seu documento de identidade e o voucher de reserva.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
  <p style="font-size:13px;color:#6b7280">
    <strong>${escapeHtml(row.agencyName)}</strong><br>
    Reserva Nº ${escapeHtml(row.reservationNumber ?? row.voucherCode)}
  </p>
</body>
</html>`;

    const boardingResult = await sendReminderHtmlEmail({
      to: row.clientEmail,
      subject: `🚌 Lembrete: Sua viagem para ${row.tripDestination ?? row.tripName} é amanhã!`,
      html,
      fromName: row.agencyName,
    });
    if (boardingResult.success) {
      sent++;
      logger.info(
        { reservationId: row.reservationId, email: row.clientEmail },
        "[reminder:boarding] Sent D-1 boarding reminder",
      );
    } else {
      failed++;
      logger.error(
        { error: boardingResult.error, reservationId: row.reservationId, email: row.clientEmail },
        "[reminder:boarding] Failed to send D-1 reminder",
      );
    }
  }

  logger.info({ total: rows.length, sent, failed }, "[reminder:boarding] D-1 run complete");
  if (failed > 0) {
    // Do NOT throw here to avoid BullMQ retrying the whole batch and re-sending to recipients
    // that already received their reminder. Individual failures are logged above for investigation.
    logger.warn({ failed }, "[reminder:boarding] Some D-1 reminders failed — check logs above for details");
  }
}

// ────────────────────────────────────────────────────────────
// D-3 Payment reminder
// ────────────────────────────────────────────────────────────

// D-3 Payment reminder — based on pending payment installment due dates in paymentsTable

async function processPaymentReminders(): Promise<void> {
  const now = new Date();
  const d3Start = new Date(now);
  d3Start.setDate(d3Start.getDate() + 3);
  d3Start.setHours(0, 0, 0, 0);

  const d3End = new Date(d3Start);
  d3End.setHours(23, 59, 59, 999);

  // Find pending/overdue payment installments due in exactly 3 days
  const rows = await db
    .select({
      paymentId: paymentsTable.id,
      paymentAmount: paymentsTable.amount,
      dueDate: paymentsTable.dueDate,
      reservationId: reservationsTable.id,
      reservationNumber: reservationsTable.reservationNumber,
      voucherCode: reservationsTable.voucherCode,
      balance: reservationsTable.balance,
      totalValue: reservationsTable.totalValue,
      paidValue: reservationsTable.paidValue,
      tenantId: reservationsTable.tenantId,
      tripName: tripsTable.name,
      tripDestination: tripsTable.destination,
      departureDate: tripsTable.departureDate,
      clientName: clientsTable.name,
      clientEmail: clientsTable.email,
      agencyName: tenantsTable.name,
      agencyPhone: tenantsTable.whatsapp,
    })
    .from(paymentsTable)
    .innerJoin(reservationsTable, eq(paymentsTable.reservationId, reservationsTable.id))
    .innerJoin(tripsTable, eq(reservationsTable.tripId, tripsTable.id))
    .innerJoin(clientsTable, eq(reservationsTable.clientId, clientsTable.id))
    .innerJoin(tenantsTable, eq(reservationsTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(paymentsTable.status, PAYMENT_STATUS.PENDING),
        isNull(paymentsTable.paidAt),
        eq(paymentsTable.type, "receivable"),
        gte(paymentsTable.dueDate, d3Start),
        lt(paymentsTable.dueDate, d3End),
      ),
    );

  logger.info({ count: rows.length }, "[reminder:payment] Found payments for D-3 due-date reminder");

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.clientEmail) continue;

    const balance = Number(row.balance ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const total = Number(row.totalValue ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const paid = Number(row.paidValue ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const paymentAmount = Number(row.paymentAmount ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const dueStr = row.dueDate
      ? (row.dueDate as unknown as Date).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "Em 3 dias";
    const depDate = row.departureDate
      ? (row.departureDate as unknown as Date).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "";

    const whatsappNum = (row.agencyPhone ?? "").replace(/\D/g, "");
    const contactLink = whatsappNum
      ? `<a href="https://wa.me/${whatsappNum}">WhatsApp</a>`
      : "a agência";

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2 style="color:#DC2626">💰 Pagamento Vencendo em 3 Dias</h2>
  <p>Olá, <strong>${escapeHtml(row.clientName)}</strong>!</p>
  <p>Você tem uma parcela da reserva da viagem para <strong>${escapeHtml(row.tripDestination ?? row.tripName)}</strong>${depDate ? ` (partindo em ${depDate})` : ""} com vencimento em <strong>${dueStr}</strong>.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr style="background:#fef2f2">
      <td style="padding:10px;border:1px solid #e5e7eb">Valor desta Parcela</td>
      <td style="padding:10px;border:1px solid #e5e7eb;text-align:right;color:#dc2626"><strong>${paymentAmount}</strong></td>
    </tr>
    <tr style="background:#f9fafb">
      <td style="padding:10px;border:1px solid #e5e7eb">Total da Reserva</td>
      <td style="padding:10px;border:1px solid #e5e7eb;text-align:right"><strong>${total}</strong></td>
    </tr>
    <tr>
      <td style="padding:10px;border:1px solid #e5e7eb">Valor Pago</td>
      <td style="padding:10px;border:1px solid #e5e7eb;text-align:right;color:#16a34a"><strong>${paid}</strong></td>
    </tr>
    <tr style="background:#fff7ed">
      <td style="padding:10px;border:1px solid #e5e7eb">Saldo Restante</td>
      <td style="padding:10px;border:1px solid #e5e7eb;text-align:right;color:#ea580c"><strong>${balance}</strong></td>
    </tr>
  </table>
  <p>Entre em contato com ${contactLink} para efetuar o pagamento antes do vencimento e garantir sua vaga.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
  <p style="font-size:13px;color:#6b7280">
    <strong>${escapeHtml(row.agencyName)}</strong><br>
    Reserva Nº ${escapeHtml(row.reservationNumber ?? row.voucherCode)}
  </p>
</body>
</html>`;

    const paymentResult = await sendReminderHtmlEmail({
      to: row.clientEmail,
      subject: `💰 Pagamento vencendo em ${dueStr} — ${row.tripDestination ?? row.tripName}`,
      html,
      fromName: row.agencyName,
    });
    if (paymentResult.success) {
      sent++;
      logger.info(
        { reservationId: row.reservationId, email: row.clientEmail },
        "[reminder:payment] Sent D-3 payment reminder",
      );
    } else {
      failed++;
      logger.error(
        { error: paymentResult.error, reservationId: row.reservationId, email: row.clientEmail },
        "[reminder:payment] Failed to send D-3 reminder",
      );
    }
  }

  logger.info({ total: rows.length, sent, failed }, "[reminder:payment] D-3 run complete");
  if (failed > 0) {
    // Do NOT throw here to avoid BullMQ retrying the whole batch and re-sending to recipients
    // that already received their reminder. Individual failures are logged above for investigation.
    logger.warn({ failed }, "[reminder:payment] Some D-3 reminders failed — check logs above for details");
  }
}

// ────────────────────────────────────────────────────────────
// Auto-retry failed booking confirmation emails
// ────────────────────────────────────────────────────────────

const MAX_AUTO_RETRY_ATTEMPTS = 3;

export async function retryFailedBookingEmails(): Promise<void> {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  // Only pick up reservation confirmation emails — cancellation and agency
  // notification emails also carry a reservationId but must not be retried
  // as confirmation emails. We exclude them by their known subject prefixes.
  const failedLogs = await db
    .select({
      id: emailLogsTable.id,
      tenantId: emailLogsTable.tenantId,
      reservationId: emailLogsTable.reservationId,
      subject: emailLogsTable.subject,
    })
    .from(emailLogsTable)
    .where(
      and(
        eq(emailLogsTable.status, "failed"),
        isNotNull(emailLogsTable.reservationId),
        gte(emailLogsTable.createdAt, twoHoursAgo),
        notLike(emailLogsTable.subject, "Reserva Cancelada%"),
        notLike(emailLogsTable.subject, "Nova reserva%"),
      ),
    );

  if (failedLogs.length === 0) {
    logger.debug("[email-retry] No failed booking confirmation emails in the last 2 hours");
    return;
  }

  const seenReservations = new Set<string>();
  const toRetry = failedLogs.filter((log) => {
    if (!log.reservationId || seenReservations.has(log.reservationId)) return false;
    seenReservations.add(log.reservationId);
    return true;
  });

  logger.info({ count: toRetry.length }, "[email-retry] Failed booking confirmation emails found — evaluating retries");

  let retried = 0;
  let skipped = 0;
  let errors = 0;

  for (const log of toRetry) {
    const reservationId = log.reservationId!;

    // Fetch all email_log entries for this reservation in the 2-hour window.
    // We use one query to check two things:
    //   1. Whether a successful send already exists (abort if so — delivery done).
    //   2. How many auto-retries have already been attempted.
    const windowLogs = await db
      .select({ status: emailLogsTable.status })
      .from(emailLogsTable)
      .where(
        and(
          eq(emailLogsTable.reservationId, reservationId),
          gte(emailLogsTable.createdAt, twoHoursAgo),
          notLike(emailLogsTable.subject, "Reserva Cancelada%"),
          notLike(emailLogsTable.subject, "Nova reserva%"),
        ),
      );

    // If any log in the window already has status="sent", the email was
    // successfully delivered (by a previous auto-retry or by the queue
    // recovering). Stop retrying to avoid duplicates.
    const alreadyDelivered = windowLogs.some((l) => l.status === "sent");
    if (alreadyDelivered) {
      logger.info(
        { reservationId },
        "[email-retry] Skipping — a successful send already exists for this reservation in the window",
      );
      skipped++;
      continue;
    }

    // attemptsInWindow = 1 means only the original failure; each auto-retry
    // that produced a new log (sent or failed) adds 1.
    // autoRetriesDone = attemptsInWindow - 1 (excluding original failure).
    const attemptsInWindow = windowLogs.length;
    const autoRetriesDone = attemptsInWindow - 1;

    if (autoRetriesDone >= MAX_AUTO_RETRY_ATTEMPTS) {
      logger.warn(
        { reservationId, attemptsInWindow, autoRetriesDone, limit: MAX_AUTO_RETRY_ATTEMPTS },
        "[email-retry] Skipping — max auto-retry limit reached for this reservation",
      );
      skipped++;
      continue;
    }

    const props = await buildEmailPropsFromReservation(reservationId, log.tenantId);
    if (!props) {
      logger.warn(
        { emailLogId: log.id, reservationId },
        "[email-retry] Cannot rebuild email props — skipping",
      );
      skipped++;
      continue;
    }

    const newLogId = generateId();
    await db.insert(emailLogsTable).values({
      id: newLogId,
      tenantId: log.tenantId,
      reservationId,
      recipient: props.clientEmail,
      subject: log.subject,
      status: "queued",
      isAutoRetry: true,
    });

    const result = await sendReservationConfirmationEmail(props);

    await db
      .update(emailLogsTable)
      .set({
        status: result.success ? "sent" : "failed",
        messageId: result.messageId ?? null,
        errorMessage: result.error ?? null,
      })
      .where(eq(emailLogsTable.id, newLogId));

    if (result.success) {
      retried++;
      logger.info(
        { newLogId, reservationId, attempt: attemptsInWindow + 1 },
        "[email-retry] Auto-retry sent successfully",
      );
    } else {
      errors++;
      logger.error(
        { newLogId, reservationId, attempt: attemptsInWindow + 1, error: result.error },
        "[email-retry] Auto-retry send failed",
      );
    }
  }

  logger.info({ retried, skipped, errors, total: toRetry.length }, "[email-retry] Auto-retry run complete");
}

// ────────────────────────────────────────────────────────────
// Worker bootstrap
// ────────────────────────────────────────────────────────────

let _worker: Worker<ReminderJobData> | null = null;

export function startReminderWorker(): Worker<ReminderJobData> | null {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("[reminder-worker] No Redis connection — worker not started");
    return null;
  }

  _worker = new Worker<ReminderJobData>(
    "reminders",
    async (job) => {
      logger.info({ jobId: job.id, type: job.data.type }, "[reminder-worker] Processing job");

      if (job.data.type === "boarding_reminder") {
        await processBoardingReminders();
      } else if (job.data.type === "payment_reminder") {
        await processPaymentReminders();
      } else if (job.data.type === "expired_reservations_cleanup") {
        await runExpiredReservationsCron();
      } else if (job.data.type === "failed_email_retry") {
        await retryFailedBookingEmails();
      } else {
        logger.warn({ type: job.data.type }, "[reminder-worker] Unknown reminder type");
      }
    },
    { connection: conn, concurrency: 1 },
  );

  _worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[reminder-worker] Job failed");
  });

  _worker.on("error", (err) => {
    logger.error({ err }, "[reminder-worker] Worker error");
  });

  logger.info("[reminder-worker] Started");
  return _worker;
}

export async function stopReminderWorker(): Promise<void> {
  if (_worker) {
    await _worker.close().catch(() => {});
    _worker = null;
  }
}

export function isReminderWorkerRunning(): boolean {
  return _worker !== null;
}
