import { db, emailLogsTable, reservationsTable, tripsTable, clientsTable, tenantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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

    await queue.add("reservation-confirmation", {
      ...props,
      emailLogId,
      tenantId,
      reservationId,
    });

    logger.info({ emailLogId, reservationId }, "[email-queue] Email job enqueued");
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

  logger.info({ emailLogId, reservationId: log.reservationId }, "[email-queue] Resend enqueued");
  return { ok: true };
}
