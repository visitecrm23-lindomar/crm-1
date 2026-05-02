import { db, emailLogsTable, reservationsTable, tripsTable, clientsTable, tenantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id";
import { getEmailQueue, getCancellationEmailQueue } from "./index";
import { sendReservationConfirmationEmail, sendReservationCancellationEmail, sendWelcomeCredentialsEmail } from "@workspace/email";
import { logger } from "../lib/logger";
import type { ReservationConfirmationEmailProps, ReservationCancellationEmailProps, WelcomeCredentialsEmailProps } from "@workspace/email";

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
 * Always inserts an email_log record before returning.
 */
export async function enqueueReservationConfirmationEmail(opts: EnqueueEmailOpts): Promise<void> {
  const { tenantId, reservationId, subject, props } = opts;
  const emailLogId = generateId();

  const queue = getEmailQueue();

  if (queue) {
    await db.insert(emailLogsTable).values({
      id: emailLogId,
      tenantId,
      reservationId: reservationId ?? null,
      recipient: props.clientEmail,
      subject,
      status: "queued",
    });

    try {
      await queue.add("reservation-confirmation", {
        ...props,
        emailLogId,
        tenantId,
        reservationId,
      });
      logger.info({ emailLogId, reservationId }, "[email-queue] Email job enqueued");
    } catch (enqueueErr) {
      logger.error({ emailLogId, err: enqueueErr }, "[email-queue] Failed to enqueue — marking log as failed");
      await db
        .update(emailLogsTable)
        .set({ status: "failed", errorMessage: "Queue enqueue failed" })
        .where(eq(emailLogsTable.id, emailLogId));
    }
  } else {
    // No Redis — send directly and log the outcome immediately
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

// ── Enqueue / send a cancellation email ───────────────────────────────────────

export async function enqueueReservationCancellationEmail(
  reservationId: string,
  tenantId: string,
): Promise<void> {
  const props = await buildCancellationEmailPropsFromReservation(reservationId, tenantId);
  if (!props) {
    logger.warn({ reservationId }, "[email-queue] Could not build cancellation email props — skipping");
    return;
  }

  const emailLogId = generateId();
  const subject = `Reserva Cancelada — ${props.reservationNumber}`;
  const queue = getCancellationEmailQueue();

  if (queue) {
    await db.insert(emailLogsTable).values({
      id: emailLogId,
      tenantId,
      reservationId,
      recipient: props.clientEmail,
      subject,
      status: "queued",
    });

    try {
      await queue.add("reservation-cancellation", {
        ...props,
        emailLogId,
        tenantId,
        reservationId,
      });
      logger.info({ emailLogId, reservationId }, "[email-queue] Cancellation email job enqueued");
    } catch (enqueueErr) {
      logger.error({ emailLogId, err: enqueueErr }, "[email-queue] Failed to enqueue cancellation — marking log as failed");
      await db
        .update(emailLogsTable)
        .set({ status: "failed", errorMessage: "Queue enqueue failed" })
        .where(eq(emailLogsTable.id, emailLogId));
    }
  } else {
    const result = await sendReservationCancellationEmail(props);
    await db.insert(emailLogsTable).values({
      id: emailLogId,
      tenantId,
      reservationId,
      recipient: props.clientEmail,
      subject,
      status: result.success ? "sent" : "failed",
      messageId: result.messageId ?? null,
      errorMessage: result.error ?? null,
    });
    logger.info(
      { emailLogId, reservationId, success: result.success },
      "[email-queue] Cancellation email sent directly (no queue)",
    );
  }
}

async function buildCancellationEmailPropsFromReservation(
  reservationId: string,
  tenantId: string,
): Promise<ReservationCancellationEmailProps | null> {
  const [row] = await db
    .select({
      reservationNumber: reservationsTable.reservationNumber,
      voucherCode: reservationsTable.voucherCode,
      totalValue: reservationsTable.totalValue,
      clientName: clientsTable.name,
      clientEmail: clientsTable.email,
      tripName: tripsTable.name,
      tripDestination: tripsTable.destination,
      departureDate: tripsTable.departureDate,
      agencyName: tenantsTable.name,
      agencyLogo: tenantsTable.logoUrl,
      agencyPhone: tenantsTable.whatsapp,
      agencyPhoneVoice: tenantsTable.phone,
      agencyEmail: tenantsTable.email,
      agencyWebsite: tenantsTable.website,
      tenantSlug: tenantsTable.slug,
    })
    .from(reservationsTable)
    .innerJoin(clientsTable, eq(reservationsTable.clientId, clientsTable.id))
    .innerJoin(tripsTable, eq(reservationsTable.tripId, tripsTable.id))
    .innerJoin(tenantsTable, eq(reservationsTable.tenantId, tenantsTable.id))
    .where(and(eq(reservationsTable.id, reservationId), eq(reservationsTable.tenantId, tenantId)))
    .limit(1);

  if (!row || !row.clientEmail) return null;

  const totalVal = Number(row.totalValue ?? 0);
  const dDate = row.departureDate ? new Date(row.departureDate) : null;
  const departureDate = dDate
    ? dDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";

  const agencyPhone = row.agencyPhone ?? row.agencyPhoneVoice ?? "";
  const agencyWebsite = row.agencyWebsite ?? `https://${row.tenantSlug}.visitecrm.com.br`;
  const whatsappNum = agencyPhone.replace(/\D/g, "");
  const whatsappUrl = whatsappNum ? `https://wa.me/${whatsappNum}` : "";

  return {
    reservationNumber: row.reservationNumber ?? row.voucherCode ?? "",
    voucherCode: row.voucherCode ?? "",
    clientName: row.clientName ?? "",
    clientEmail: row.clientEmail,
    tripTitle: row.tripName,
    destination: row.tripDestination ?? "",
    departureDate,
    totalAmount: totalVal,
    agencyName: row.agencyName,
    agencyLogo: row.agencyLogo ?? "",
    agencyPhone,
    agencyEmail: row.agencyEmail ?? "",
    agencyWebsite,
    whatsappUrl,
  };
}

// ── Build email props from reservation ID ─────────────────────────────────────

async function buildEmailPropsFromReservation(
  reservationId: string,
  tenantId: string,
): Promise<ReservationConfirmationEmailProps | null> {
  const [row] = await db
    .select({
      reservationNumber: reservationsTable.reservationNumber,
      voucherCode: reservationsTable.voucherCode,
      totalValue: reservationsTable.totalValue,
      paidValue: reservationsTable.paidValue,
      balance: reservationsTable.balance,
      paymentMethod: reservationsTable.paymentMethod,
      seats: reservationsTable.seats,
      clientName: clientsTable.name,
      clientEmail: clientsTable.email,
      clientCpf: clientsTable.cpf,
      clientPhone: clientsTable.whatsapp,
      tripName: tripsTable.name,
      tripDestination: tripsTable.destination,
      departureDate: tripsTable.departureDate,
      returnDate: tripsTable.returnDate,
      agencyName: tenantsTable.name,
      agencyLogo: tenantsTable.logoUrl,
      agencyPhone: tenantsTable.whatsapp,
      agencyPhoneVoice: tenantsTable.phone,
      agencyEmail: tenantsTable.email,
      agencyWebsite: tenantsTable.website,
      tenantSlug: tenantsTable.slug,
    })
    .from(reservationsTable)
    .innerJoin(clientsTable, eq(reservationsTable.clientId, clientsTable.id))
    .innerJoin(tripsTable, eq(reservationsTable.tripId, tripsTable.id))
    .innerJoin(tenantsTable, eq(reservationsTable.tenantId, tenantsTable.id))
    .where(and(eq(reservationsTable.id, reservationId), eq(reservationsTable.tenantId, tenantId)))
    .limit(1);

  if (!row || !row.clientEmail) return null;

  const totalVal = Number(row.totalValue ?? 0);
  const paidVal = Number(row.paidValue ?? 0);
  const balanceVal = Number(row.balance ?? 0);
  const paymentStatus: "paid" | "partial" | "pending" =
    paidVal >= totalVal ? "paid" : paidVal > 0 ? "partial" : "pending";

  const dDate = row.departureDate ? new Date(row.departureDate) : null;
  const departureDate = dDate
    ? dDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";

  let duration = "";
  if (dDate && row.returnDate) {
    const retDate = new Date(row.returnDate);
    const diffDays = Math.round((retDate.getTime() - dDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) duration = `${diffDays} dia${diffDays !== 1 ? "s" : ""}`;
  }

  const agencyPhone = row.agencyPhone ?? row.agencyPhoneVoice ?? "";
  const agencyWebsite = row.agencyWebsite ?? `https://${row.tenantSlug}.visitecrm.com.br`;
  const whatsappNum = agencyPhone.replace(/\D/g, "");
  const whatsappUrl = whatsappNum ? `https://wa.me/${whatsappNum}` : "";
  const publicBase = agencyWebsite.replace(/\/$/, "");
  const voucherUrl = `${publicBase}/reserva/${row.voucherCode}`;
  const consultUrl = `${publicBase}/reservas`;

  return {
    reservationNumber: row.reservationNumber ?? row.voucherCode ?? "",
    voucherCode: row.voucherCode ?? "",
    clientName: row.clientName ?? "",
    clientCpf: row.clientCpf ?? "",
    clientEmail: row.clientEmail,
    clientPhone: row.clientPhone ?? "",
    tripTitle: row.tripName,
    destination: row.tripDestination ?? "",
    departureDate,
    duration,
    seats: (row.seats ?? []) as string[],
    totalAmount: totalVal,
    amountPaid: paidVal,
    amountPending: balanceVal,
    paymentMethod: row.paymentMethod ?? "pix",
    paymentStatus,
    agencyName: row.agencyName,
    agencyLogo: row.agencyLogo ?? "",
    agencyPhone,
    agencyPhoneVoice: row.agencyPhoneVoice ?? "",
    agencyEmail: row.agencyEmail,
    agencyWebsite,
    voucherUrl,
    consultUrl,
    whatsappUrl,
  };
}

// ── Send a welcome email for a newly created portal account ───────────────────
// Sends directly (no queue) and logs the outcome to email_logs.

export async function sendWelcomeEmail(
  props: WelcomeCredentialsEmailProps,
  tenantId: string,
): Promise<void> {
  const emailLogId = generateId();
  const subject = `Bem-vindo(a)! Acesse sua Área do Cliente — ${props.agencyName}`;

  const result = await sendWelcomeCredentialsEmail(props);

  await db.insert(emailLogsTable).values({
    id: emailLogId,
    tenantId,
    reservationId: null,
    recipient: props.clientEmail,
    subject,
    status: result.success ? "sent" : "failed",
    messageId: result.messageId ?? null,
    errorMessage: result.error ?? null,
  });

  logger.info(
    { emailLogId, recipient: props.clientEmail, success: result.success },
    "[email-queue] Welcome email sent",
  );
}

// ── Resend a failed email log ──────────────────────────────────────────────────

export async function resendEmailLog(
  emailLogId: string,
  tenantId: string,
): Promise<{ ok: boolean; error?: string }> {
  const [log] = await db
    .select()
    .from(emailLogsTable)
    .where(eq(emailLogsTable.id, emailLogId))
    .limit(1);

  if (!log) return { ok: false, error: "Email log not found" };
  if (log.tenantId !== tenantId) return { ok: false, error: "Not found" };
  if (log.status !== "failed") return { ok: false, error: "Only failed emails can be resent" };

  // Rebuild props from the original reservation (if available)
  let props: ReservationConfirmationEmailProps | null = null;
  if (log.reservationId) {
    props = await buildEmailPropsFromReservation(log.reservationId, tenantId);
  }

  if (!props) {
    return { ok: false, error: "Cannot reconstruct email — reservation data not found" };
  }

  // Create a fresh log entry for the resend attempt and enqueue/send
  await enqueueReservationConfirmationEmail({
    tenantId,
    reservationId: log.reservationId ?? undefined,
    subject: log.subject,
    props,
  });

  // A new email_log row is created per resend attempt so the full send history
  // is preserved and each attempt is independently traceable.
  logger.info({ emailLogId, reservationId: log.reservationId }, "[email-queue] Resend enqueued");
  return { ok: true };
}
