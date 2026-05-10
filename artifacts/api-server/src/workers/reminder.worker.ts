import { Worker } from "bullmq";
import { db, reservationsTable, tripsTable, clientsTable, tenantsTable, paymentsTable, emailLogsTable, storesTable, usersTable, referralsTable, referralSettingsTable } from "@workspace/db";
import { eq, and, gt, sql, gte, lt, lte, isNull, isNotNull, notLike, like, inArray, not, exists } from "drizzle-orm";
import { sendReminderHtmlEmail, sendReservationConfirmationEmail, sendReferralExpiringSoonEmail } from "@workspace/email";
import { dispatchReferralExpiredEmail, dispatchReferralExpiringSoonEmail } from "../queues/email-helpers";
import { getRedisConnection, isTransientRedisError, recordTransientRedisError, resetTransientRedisErrors } from "../lib/redis";
import { logger } from "../lib/logger";
import { runExpiredReservationsCron } from "../lib/expired-reservations";
import type { ReminderJobData } from "../queues/index";
import { RESERVATION_STATUS, PAYMENT_STATUS, ROLES } from "@workspace/permissions";
import { buildEmailPropsFromReservation } from "../queues/email-helpers";
import { generateId } from "../lib/id";
import { MAX_AUTO_RETRY_ATTEMPTS } from "../lib/email-retry-constants";

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
// Staff alert when booking email retries are exhausted
// ────────────────────────────────────────────────────────────

const EXHAUSTED_ALERT_SUBJECT_PREFIX = "Alerta: Falha no e-mail de confirmação";

/**
 * Sends a one-time staff alert email when all auto-retries for a booking
 * confirmation email have been exhausted. Deduplicates by checking whether
 * an alert with the same subject prefix already exists in email_logs for
 * this reservation.
 */
async function notifyStaffOfExhaustedRetries(
  reservationId: string,
  tenantId: string,
): Promise<void> {
  // Dedup: skip only if a successful alert was already sent for this reservation.
  // If a prior attempt failed, we allow another attempt so the alert is not silently lost.
  const existingSuccessful = await db
    .select({ id: emailLogsTable.id })
    .from(emailLogsTable)
    .where(
      and(
        eq(emailLogsTable.tenantId, tenantId),
        eq(emailLogsTable.reservationId, reservationId),
        like(emailLogsTable.subject, `${EXHAUSTED_ALERT_SUBJECT_PREFIX}%`),
        eq(emailLogsTable.status, "sent"),
      ),
    )
    .limit(1);

  if (existingSuccessful.length > 0) {
    logger.debug(
      { reservationId },
      "[email-retry] Staff alert already successfully sent for this reservation — skipping",
    );
    return;
  }

  // Fetch reservation details for the alert body
  const [row] = await db
    .select({
      reservationNumber: reservationsTable.reservationNumber,
      voucherCode: reservationsTable.voucherCode,
      clientName: clientsTable.name,
      clientEmail: clientsTable.email,
      tripName: tripsTable.name,
      tripDestination: tripsTable.destination,
      agencyName: tenantsTable.name,
    })
    .from(reservationsTable)
    .innerJoin(clientsTable, eq(reservationsTable.clientId, clientsTable.id))
    .innerJoin(tripsTable, eq(reservationsTable.tripId, tripsTable.id))
    .innerJoin(tenantsTable, eq(reservationsTable.tenantId, tenantsTable.id))
    .where(and(eq(reservationsTable.id, reservationId), eq(reservationsTable.tenantId, tenantId)))
    .limit(1);

  if (!row) {
    logger.warn({ reservationId }, "[email-retry] Cannot fetch reservation for staff alert — skipping");
    return;
  }

  // Resolve alert recipients: store email + agency admins/managers
  const [store] = await db
    .select({ email: storesTable.email })
    .from(storesTable)
    .where(eq(storesTable.tenantId, tenantId))
    .limit(1);

  const staffUsers = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.tenantId, tenantId),
        eq(usersTable.isActive, true),
        inArray(usersTable.role, [ROLES.AGENCY_ADMIN, ROLES.AGENCY_MANAGER]),
      ),
    );

  const recipientSet = new Set<string>();
  if (store?.email) recipientSet.add(store.email);
  for (const u of staffUsers) {
    if (u.email) recipientSet.add(u.email);
  }

  if (recipientSet.size === 0) {
    logger.warn(
      { reservationId, tenantId },
      "[email-retry] No staff recipients found — cannot send exhausted-retry alert",
    );
    return;
  }

  const reservationRef = row.reservationNumber ?? row.voucherCode ?? reservationId;
  const destination = row.tripDestination ?? row.tripName ?? "N/A";
  const subject = `${EXHAUSTED_ALERT_SUBJECT_PREFIX} — Reserva #${reservationRef}`;

  const frontendBase = (process.env["FRONTEND_URL"] ?? "https://app.visitecrm.com.br").replace(/\/$/, "");
  const reservationUrl = `${frontendBase}/reservations/${reservationId}`;

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2 style="color:#DC2626">⚠️ Falha no Envio de E-mail de Confirmação</h2>
  <p>O e-mail de confirmação de reserva abaixo falhou em todas as ${MAX_AUTO_RETRY_ATTEMPTS} tentativas automáticas e necessita de <strong>intervenção manual</strong>.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr style="background:#fef2f2">
      <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600">Reserva Nº</td>
      <td style="padding:10px;border:1px solid #e5e7eb">${escapeHtml(reservationRef)}</td>
    </tr>
    <tr style="background:#f9fafb">
      <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600">Cliente</td>
      <td style="padding:10px;border:1px solid #e5e7eb">${escapeHtml(row.clientName)}</td>
    </tr>
    <tr>
      <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600">E-mail do Cliente</td>
      <td style="padding:10px;border:1px solid #e5e7eb">${escapeHtml(row.clientEmail)}</td>
    </tr>
    <tr style="background:#f9fafb">
      <td style="padding:10px;border:1px solid #e5e7eb;font-weight:600">Viagem</td>
      <td style="padding:10px;border:1px solid #e5e7eb">${escapeHtml(destination)}</td>
    </tr>
  </table>
  <p>
    <a href="${reservationUrl}" style="display:inline-block;background:#2563EB;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
      Ver Reserva no CRM
    </a>
  </p>
  <p style="font-size:13px;color:#6b7280">Acesse o <strong>Log de E-mails</strong> para reenviar manualmente o e-mail de confirmação ao cliente.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
  <p style="font-size:12px;color:#9ca3af">${escapeHtml(row.agencyName)} — Alerta automático do sistema VisiteCRM</p>
</body>
</html>`;

  const emailLogId = generateId();

  // Log the alert email before sending so we can update the status after
  await db.insert(emailLogsTable).values({
    id: emailLogId,
    tenantId,
    reservationId,
    recipient: [...recipientSet][0],
    subject,
    status: "queued",
    isAutoRetry: false,
  });

  const recipients = [...recipientSet];

  // Send to all recipients and track aggregate outcome:
  // - overallSuccess=true as soon as at least one recipient receives the alert.
  // - firstMessageId: captured from the first successful send for logging.
  // - lastError: error from the last failed send, used only if all sends fail.
  let overallSuccess = false;
  let firstMessageId: string | undefined;
  let lastError: string | undefined;

  for (const recipient of recipients) {
    const result = await sendReminderHtmlEmail({
      to: recipient,
      subject,
      html,
      fromName: row.agencyName,
    });
    if (result.success) {
      overallSuccess = true;
      if (!firstMessageId) firstMessageId = result.messageId;
      logger.info(
        { reservationId, recipient },
        "[email-retry] Exhausted-retry staff alert delivered to recipient",
      );
    } else {
      lastError = result.error;
      logger.error(
        { reservationId, recipient, error: result.error },
        "[email-retry] Failed to deliver exhausted-retry staff alert to recipient",
      );
    }
  }

  // Mark the log row as "sent" if at least one recipient received it.
  await db
    .update(emailLogsTable)
    .set({
      status: overallSuccess ? "sent" : "failed",
      messageId: firstMessageId ?? null,
      errorMessage: overallSuccess ? null : (lastError ?? null),
    })
    .where(eq(emailLogsTable.id, emailLogId));

  if (overallSuccess) {
    logger.info(
      { reservationId, recipients, reservationRef },
      "[email-retry] Exhausted-retry staff alert sent",
    );
  } else {
    logger.error(
      { reservationId, recipients, reservationRef },
      "[email-retry] Exhausted-retry staff alert failed for all recipients",
    );
  }
}

// ────────────────────────────────────────────────────────────
// Auto-retry failed booking confirmation emails
// ────────────────────────────────────────────────────────────

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

    // Fetch email_log entries for this reservation in the 2-hour window.
    // We select both `status` and `isAutoRetry` to check two things:
    //   1. Whether a successful send already exists (abort if so — delivery done).
    //   2. How many automatic retries have already been attempted.
    //
    // Counting strategy: we count only rows where isAutoRetry=true (i.e. rows
    // written by this worker). This intentionally excludes:
    //   - The original failure (isAutoRetry=false, written by the email queue).
    //   - Any manual resends triggered by staff (isAutoRetry=false).
    // Using the flag rather than "total window rows minus 1" prevents manual
    // resends from eating into the auto-retry budget and avoids inflating the
    // counter when old successful sends exist outside the window.
    const windowLogs = await db
      .select({ status: emailLogsTable.status, isAutoRetry: emailLogsTable.isAutoRetry })
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

    // Count only auto-retry entries (isAutoRetry=true) to get an accurate
    // picture of how many automatic delivery attempts have been made for
    // this failure event, unaffected by manual resends or prior history.
    const autoRetriesDone = windowLogs.filter((l) => l.isAutoRetry).length;
    const attemptsInWindow = windowLogs.length;

    if (autoRetriesDone >= MAX_AUTO_RETRY_ATTEMPTS) {
      logger.warn(
        { reservationId, attemptsInWindow, autoRetriesDone, limit: MAX_AUTO_RETRY_ATTEMPTS },
        "[email-retry] Skipping — max auto-retry limit reached for this reservation",
      );
      // Stamp retriesExhaustedAt on all rows for this reservation that don't
      // already have it, so the staff alert persists beyond the 24-hour window.
      await db
        .update(emailLogsTable)
        .set({ retriesExhaustedAt: new Date() })
        .where(
          and(
            eq(emailLogsTable.tenantId, log.tenantId),
            eq(emailLogsTable.reservationId, reservationId),
            isNull(emailLogsTable.retriesExhaustedAt),
          ),
        );
      // Notify agency staff that manual intervention is needed. The helper
      // deduplicates internally so it only sends one alert per reservation.
      await notifyStaffOfExhaustedRetries(reservationId, log.tenantId);
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
// Auto-retry failed referral expiry-warning emails
// ────────────────────────────────────────────────────────────

export async function retryFailedExpiryWarningEmails(): Promise<void> {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  // Find failed expiry-warning logs that have a referralId and were created
  // in the last 2 hours. We use referralId (not reservationId) to group retries.
  const failedLogs = await db
    .select({
      id: emailLogsTable.id,
      tenantId: emailLogsTable.tenantId,
      referralId: emailLogsTable.referralId,
      subject: emailLogsTable.subject,
      recipient: emailLogsTable.recipient,
    })
    .from(emailLogsTable)
    .where(
      and(
        eq(emailLogsTable.status, "failed"),
        isNotNull(emailLogsTable.referralId),
        gte(emailLogsTable.createdAt, twoHoursAgo),
        like(emailLogsTable.subject, "⏰%"),
      ),
    );

  if (failedLogs.length === 0) {
    logger.debug("[expiry-warning-retry] No failed expiry-warning emails in the last 2 hours");
    return;
  }

  // Deduplicate by referralId — only one retry attempt per referral per run.
  const seenReferrals = new Set<string>();
  const toRetry = failedLogs.filter((log) => {
    if (!log.referralId || seenReferrals.has(log.referralId)) return false;
    seenReferrals.add(log.referralId);
    return true;
  });

  logger.info({ count: toRetry.length }, "[expiry-warning-retry] Failed expiry-warning emails found — evaluating retries");

  let retried = 0;
  let skipped = 0;
  let errors = 0;

  for (const log of toRetry) {
    const referralId = log.referralId!;

    // Fetch all email_log entries for this referral in the 2-hour window.
    const windowLogs = await db
      .select({ status: emailLogsTable.status, isAutoRetry: emailLogsTable.isAutoRetry })
      .from(emailLogsTable)
      .where(
        and(
          eq(emailLogsTable.referralId, referralId),
          gte(emailLogsTable.createdAt, twoHoursAgo),
          like(emailLogsTable.subject, "⏰%"),
        ),
      );

    // Skip if any log for this referral was already delivered successfully.
    const alreadyDelivered = windowLogs.some((l) => l.status === "sent");
    if (alreadyDelivered) {
      logger.info(
        { referralId },
        "[expiry-warning-retry] Skipping — a successful send already exists for this referral in the window",
      );
      skipped++;
      continue;
    }

    // Count only auto-retry entries to avoid counting the original failure or
    // any manual resends against the budget.
    const autoRetriesDone = windowLogs.filter((l) => l.isAutoRetry).length;

    if (autoRetriesDone >= MAX_AUTO_RETRY_ATTEMPTS) {
      logger.warn(
        { referralId, autoRetriesDone, limit: MAX_AUTO_RETRY_ATTEMPTS },
        "[expiry-warning-retry] Skipping — max auto-retry limit reached for this referral",
      );
      // Stamp retriesExhaustedAt so staff can see the exhausted state in email logs.
      await db
        .update(emailLogsTable)
        .set({ retriesExhaustedAt: new Date() })
        .where(
          and(
            eq(emailLogsTable.tenantId, log.tenantId),
            eq(emailLogsTable.referralId, referralId),
            isNull(emailLogsTable.retriesExhaustedAt),
          ),
        );
      skipped++;
      continue;
    }

    // Rebuild the email props from the referral record.
    const [referral] = await db
      .select({
        referrerId: referralsTable.referrerId,
        code: referralsTable.code,
        expiresAt: referralsTable.expiresAt,
        tenantId: referralsTable.tenantId,
      })
      .from(referralsTable)
      .where(and(eq(referralsTable.id, referralId), eq(referralsTable.tenantId, log.tenantId)))
      .limit(1);

    if (!referral || !referral.expiresAt) {
      logger.warn(
        { referralId },
        "[expiry-warning-retry] Cannot fetch referral record — skipping",
      );
      skipped++;
      continue;
    }

    // Recalculate daysLeft from the referral's expiresAt so the body stays accurate.
    const diffMs = referral.expiresAt.getTime() - now.getTime();
    const daysLeft = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

    // Rebuild the full email props needed by sendReferralExpiringSoonEmail.
    const [referrer] = await db
      .select({ name: clientsTable.name, email: clientsTable.email })
      .from(clientsTable)
      .where(and(eq(clientsTable.id, referral.referrerId), eq(clientsTable.tenantId, log.tenantId)))
      .limit(1);

    if (!referrer?.email) {
      logger.warn({ referralId }, "[expiry-warning-retry] Referrer has no email — skipping");
      skipped++;
      continue;
    }

    const [tenant] = await db
      .select({ name: tenantsTable.name, logoUrl: tenantsTable.logoUrl })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, log.tenantId))
      .limit(1);

    const [settings] = await db
      .select({ shareMessage: referralSettingsTable.shareMessage })
      .from(referralSettingsTable)
      .where(eq(referralSettingsTable.tenantId, log.tenantId))
      .limit(1);

    const agencyName = tenant?.name ?? "Agência";
    const formattedDate = (referral.expiresAt as unknown as Date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });
    const defaultShareMessage = settings?.shareMessage
      ?? `Olá! Use meu código ${referral.code} na ${agencyName} e ganhe desconto especial na sua próxima viagem! 🌴✈️`;
    const shareUrl = `https://wa.me/?text=${encodeURIComponent(defaultShareMessage)}`;

    const newLogId = generateId();
    await db.insert(emailLogsTable).values({
      id: newLogId,
      tenantId: log.tenantId,
      referralId,
      recipient: referrer.email,
      subject: log.subject,
      status: "queued",
      isAutoRetry: true,
    });

    const result = await sendReferralExpiringSoonEmail({
      referrerName: referrer.name ?? referrer.email,
      referrerEmail: referrer.email,
      referralCode: referral.code,
      expiresAt: formattedDate,
      daysLeft,
      agencyName,
      agencyLogo: tenant?.logoUrl ?? null,
      shareUrl,
    });

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
        { newLogId, referralId, attempt: windowLogs.length + 1 },
        "[expiry-warning-retry] Auto-retry sent successfully",
      );
    } else {
      errors++;
      logger.error(
        { newLogId, referralId, attempt: windowLogs.length + 1, error: result.error },
        "[expiry-warning-retry] Auto-retry send failed",
      );
    }
  }

  logger.info({ retried, skipped, errors, total: toRetry.length }, "[expiry-warning-retry] Auto-retry run complete");
}

// ────────────────────────────────────────────────────────────
// Expired referral notifications
// ────────────────────────────────────────────────────────────

async function processExpiredReferralNotifications(): Promise<void> {
  const now = new Date();

  // Only pending referrals whose expiry time has passed — status="pending" is
  // the one-time gate: once transitioned to "expired" they won't match again.
  // NOTE: do NOT filter by referrerEmail here — the status transition applies
  // to all overdue pending referrals. dispatchReferralExpiredEmail() already
  // skips gracefully when the referrer client has no email address.
  const pendingExpired = await db
    .select({
      id: referralsTable.id,
      referrerId: referralsTable.referrerId,
      tenantId: referralsTable.tenantId,
    })
    .from(referralsTable)
    .where(
      and(
        eq(referralsTable.isActive, true),
        eq(referralsTable.status, "pending"),
        lte(referralsTable.expiresAt, now),
      ),
    );

  let transitioned = 0, notified = 0, errors = 0;

  for (const referral of pendingExpired) {
    try {
      // Persist the status transition first and check it actually affected a row.
      // The WHERE status='pending' guard means a concurrent convert/expire wins:
      // if the row was already converted (or expired) since our SELECT, the
      // UPDATE returns no rows and we skip the email — preventing false "expired"
      // notifications on converted referrals.
      const updated = await db
        .update(referralsTable)
        .set({ status: "expired", updatedAt: now })
        .where(
          and(
            eq(referralsTable.id, referral.id),
            eq(referralsTable.status, "pending"),
          ),
        )
        .returning({ id: referralsTable.id });

      if (updated.length === 0) {
        // Row was concurrently converted or already expired — skip notification.
        logger.info({ referralId: referral.id }, "[expiry-referral] Skipping — concurrent status change detected");
        continue;
      }
      transitioned++;

      await dispatchReferralExpiredEmail(referral.referrerId, referral.tenantId);
      notified++;
    } catch (err) {
      errors++;
      logger.error(
        { err, referralId: referral.id, referrerId: referral.referrerId, tenantId: referral.tenantId },
        "[expiry-referral] Failed to transition/notify expired referral",
      );
    }
  }

  logger.info({ transitioned, notified, errors, total: pendingExpired.length }, "[expiry-referral] Expired referral notification run complete");
}

// ────────────────────────────────────────────────────────────
// Pre-expiry referral notifications (7 days and 1 day before)
// ────────────────────────────────────────────────────────────

async function processExpiringSoonReferralNotifications(): Promise<void> {
  // Use the same timezone as the reminder cron (America/Sao_Paulo by default).
  // PostgreSQL's AT TIME ZONE handles DST automatically.
  const tz = process.env["REMINDER_TZ"] ?? "America/Sao_Paulo";

  // Fetch all tenants that have referrals enabled, along with their per-window toggle flags.
  const enabledTenants = await db
    .select({
      tenantId: referralSettingsTable.tenantId,
      warning7: referralSettingsTable.expiryWarning7DaysEnabled,
      warning1: referralSettingsTable.expiryWarning1DayEnabled,
    })
    .from(referralSettingsTable)
    .where(eq(referralSettingsTable.isEnabled, true));

  if (enabledTenants.length === 0) {
    logger.info("[expiry-warning] No tenants with referrals enabled — skipping");
    return;
  }

  const enabledTenantIds = enabledTenants.map((r) => r.tenantId);

  // Map for O(1) per-window toggle lookup in the processing loop.
  const tenantWarnings = new Map(
    enabledTenants.map((r) => [r.tenantId, { w7: r.warning7, w1: r.warning1 }]),
  );

  // Query pending referrals expiring EXACTLY today+7 days OR today+1 day in the
  // configured timezone. PostgreSQL's AT TIME ZONE + ::date casting handles
  // DST-safe calendar-day comparison — no rolling ±hour windows.
  // Also select the per-referral sent-at columns for structured dedup (task #151).
  const expiringSoon = await db
    .select({
      id: referralsTable.id,
      referrerId: referralsTable.referrerId,
      tenantId: referralsTable.tenantId,
      code: referralsTable.code,
      expiresAt: referralsTable.expiresAt,
      expiryWarning7SentAt: referralsTable.expiryWarning7SentAt,
      expiryWarning1SentAt: referralsTable.expiryWarning1SentAt,
      windowLabel: sql<number>`CASE
        WHEN (${referralsTable.expiresAt} AT TIME ZONE ${tz})::date = (NOW() AT TIME ZONE ${tz})::date + INTERVAL '7 days' THEN 7
        ELSE 1
      END`,
    })
    .from(referralsTable)
    .where(
      and(
        eq(referralsTable.isActive, true),
        eq(referralsTable.status, "pending"),
        inArray(referralsTable.tenantId, enabledTenantIds),
        isNotNull(referralsTable.expiresAt),
        sql`(
          (${referralsTable.expiresAt} AT TIME ZONE ${tz})::date = (NOW() AT TIME ZONE ${tz})::date + INTERVAL '7 days'
          OR
          (${referralsTable.expiresAt} AT TIME ZONE ${tz})::date = (NOW() AT TIME ZONE ${tz})::date + INTERVAL '1 day'
        )`,
      ),
    );

  let notified = 0, skippedNoEmail = 0, skippedAlreadySent = 0, skippedDisabled = 0, errors = 0;

  for (const referral of expiringSoon) {
    try {
      if (!referral.expiresAt) continue;

      const windowLabel = referral.windowLabel as 1 | 7;

      // Task #149: respect per-tenant per-window toggle flags.
      const tenantConf = tenantWarnings.get(referral.tenantId);
      if (!tenantConf) continue;
      if (windowLabel === 7 && !tenantConf.w7) {
        skippedDisabled++;
        logger.info({ referralId: referral.id }, "[expiry-warning] Skipping — 7-day warning disabled for tenant");
        continue;
      }
      if (windowLabel === 1 && !tenantConf.w1) {
        skippedDisabled++;
        logger.info({ referralId: referral.id }, "[expiry-warning] Skipping — 1-day warning disabled for tenant");
        continue;
      }

      // Task #151: structured dedup via DB column instead of email_logs LIKE.
      const alreadySent = windowLabel === 7
        ? referral.expiryWarning7SentAt != null
        : referral.expiryWarning1SentAt != null;

      if (alreadySent) {
        skippedAlreadySent++;
        logger.info({ referralId: referral.id, code: referral.code, windowLabel }, "[expiry-warning] Skipping — already sent (column)");
        continue;
      }

      // Fetch referrer email (needed by dispatchReferralExpiringSoonEmail).
      const [referrer] = await db
        .select({ email: clientsTable.email })
        .from(clientsTable)
        .where(and(eq(clientsTable.id, referral.referrerId), eq(clientsTable.tenantId, referral.tenantId)))
        .limit(1);

      if (!referrer?.email) {
        skippedNoEmail++;
        logger.info({ referralId: referral.id }, "[expiry-warning] Skipping — referrer has no email");
        continue;
      }

      await dispatchReferralExpiringSoonEmail(
        referral.referrerId,
        referral.tenantId,
        referral.code,
        referral.expiresAt,
        windowLabel,
        referral.id,
      );

      // Task #151: mark the warning as sent on the referral row.
      await db
        .update(referralsTable)
        .set(
          windowLabel === 7
            ? { expiryWarning7SentAt: new Date() }
            : { expiryWarning1SentAt: new Date() },
        )
        .where(eq(referralsTable.id, referral.id));

      notified++;
    } catch (err) {
      errors++;
      logger.error(
        { err, referralId: referral.id, referrerId: referral.referrerId, tenantId: referral.tenantId },
        "[expiry-warning] Failed to dispatch pre-expiry notification",
      );
    }
  }

  logger.info(
    { notified, skippedNoEmail, skippedAlreadySent, skippedDisabled, errors, total: expiringSoon.length },
    "[expiry-warning] Pre-expiry referral notification run complete",
  );
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
      } else if (job.data.type === "referral_expiry_notification") {
        await processExpiredReferralNotifications();
      } else if (job.data.type === "referral_expiry_warning") {
        await processExpiringSoonReferralNotifications();
      } else if (job.data.type === "expiry_warning_email_retry") {
        await retryFailedExpiryWarningEmails();
      } else {
        logger.warn({ type: job.data.type }, "[reminder-worker] Unknown reminder type");
      }
    },
    process.env.NODE_ENV !== "production"
      ? { connection: conn, concurrency: 1, stalledInterval: 60_000, drainDelay: 30 }
      : { connection: conn, concurrency: 1, stalledInterval: 15_000 },
  );

  _worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[reminder-worker] Job failed");
  });

  _worker.on("error", (err) => {
    if (isTransientRedisError(err)) {
      recordTransientRedisError();
      logger.warn({ err }, "[reminder-worker] Transient worker error (will recover automatically)");
    } else {
      logger.error({ err }, "[reminder-worker] Worker error");
    }
  });

  _worker.on("ready", () => {
    resetTransientRedisErrors();
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
