import { db } from "@workspace/db";
import { reservationsTable, tripsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  enqueueReservationConfirmationEmail,
  enqueueNewBookingNotificationEmail,
} from "../../queues/email-helpers";
import { ensurePortalAccount } from "./portal-account";

export interface PostBookingArgs {
  customerEmail: string;
  customerName: string;
  customerCpf?: string;
  customerPhone?: string;
  paymentMethod?: string;
  tenantId: string;
  agencyName: string;
  agencyLogo: string;
  agencyPhone: string;
  agencyEmail: string;
  storeBase: string;
  loginUrl: string;
  consultUrl: string;
  orderNumber: string;
}

/**
 * Fire-and-forget post-booking side effects:
 * 1. Ensure Clerk portal account exists for the customer (sends welcome email if new).
 * 2. Enqueue reservation confirmation email (with credentials when account was just created).
 * 3. Notify the agency for every reservation in this order.
 *
 * Mirrors the original IIFE in `routes/store-public.ts` POST /orders. Errors are
 * swallowed/logged — never thrown — so the HTTP response is unaffected.
 */
export async function runPostBookingSideEffects(args: PostBookingArgs): Promise<void> {
  const {
    customerEmail, customerName, customerCpf, customerPhone, paymentMethod,
    tenantId, agencyName, agencyLogo, agencyPhone, agencyEmail,
    storeBase, loginUrl, consultUrl, orderNumber,
  } = args;

  try {
    // Step 1: Ensure portal account (Clerk + welcome email if new)
    const { credentials } = await ensurePortalAccount({
      email: customerEmail,
      name: customerName,
      tenantId,
      storeBase,
      loginUrl,
      agencyName,
      agencyLogo,
    });

    // Step 2: Fetch the first reservation linked to this order (with trip data)
    const [reservation] = await db
      .select({
        reservationId: reservationsTable.id,
        reservationNumber: reservationsTable.reservationNumber,
        voucherCode: reservationsTable.voucherCode,
        seats: reservationsTable.seats,
        totalValue: reservationsTable.totalValue,
        tripName: tripsTable.name,
        tripDestination: tripsTable.destination,
        tripDepartureDate: tripsTable.departureDate,
        tripReturnDate: tripsTable.returnDate,
      })
      .from(reservationsTable)
      .innerJoin(tripsTable, eq(reservationsTable.tripId, tripsTable.id))
      .where(eq(reservationsTable.storeOrderId, orderNumber))
      .limit(1);

    if (reservation) {
      const depDate = reservation.tripDepartureDate as unknown as Date | null;
      const retDate = reservation.tripReturnDate as unknown as Date | null;

      const departureDateStr = depDate
        ? depDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "A confirmar";

      let duration = "A confirmar";
      if (depDate && retDate) {
        const diffDays = Math.round((retDate.getTime() - depDate.getTime()) / (1000 * 60 * 60 * 24));
        const nights = diffDays > 0 ? diffDays : 0;
        const days = nights + 1;
        duration = `${days} dia${days !== 1 ? "s" : ""}${nights > 0 ? ` / ${nights} noite${nights !== 1 ? "s" : ""}` : ""}`;
      }

      const totalAmount = Number(reservation.totalValue ?? 0);
      const whatsappNumber = agencyPhone.replace(/\D/g, "");
      const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : storeBase;
      const voucherUrl = `${consultUrl}?code=${reservation.voucherCode ?? ""}`;

      // Step 3: Enqueue combined reservation confirmation email
      const subject = `Reserva Confirmada — ${reservation.reservationNumber ?? orderNumber}`;
      await enqueueReservationConfirmationEmail({
        tenantId,
        reservationId: reservation.reservationId,
        subject,
        props: {
          reservationNumber: reservation.reservationNumber ?? orderNumber,
          voucherCode: reservation.voucherCode ?? "",
          clientName: customerName,
          clientCpf: customerCpf ?? "",
          clientEmail: customerEmail,
          clientPhone: customerPhone ?? "",
          tripTitle: reservation.tripName,
          destination: reservation.tripDestination,
          departureDate: departureDateStr,
          duration,
          seats: reservation.seats ?? [],
          totalAmount,
          amountPaid: 0,
          amountPending: totalAmount,
          paymentMethod: paymentMethod ?? "pix",
          paymentStatus: "pending",
          agencyName,
          agencyLogo,
          agencyPhone,
          agencyEmail,
          agencyWebsite: storeBase,
          voucherUrl,
          consultUrl,
          whatsappUrl,
          ...(credentials ? { credentials } : {}),
        },
      });
    }
  } catch (err) {
    console.error("[checkout/post-booking] Error sending post-booking email:", err);
  }

  // Step 4: notify the agency for every reservation in this order,
  // independently of the customer-facing e-mail flow.
  try {
    const reservationRows = await db
      .select({ id: reservationsTable.id })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.storeOrderId, orderNumber),
          eq(reservationsTable.tenantId, tenantId),
        ),
      );

    const settled = await Promise.allSettled(
      reservationRows.map((r) =>
        enqueueNewBookingNotificationEmail(r.id, tenantId),
      ),
    );
    for (const result of settled) {
      if (result.status === "rejected") {
        console.error(
          "[checkout/post-booking] Failed to enqueue agency new-booking notification:",
          result.reason,
        );
      }
    }
  } catch (notifyErr) {
    console.error(
      "[checkout/post-booking] Failed to load reservations for agency notification:",
      notifyErr,
    );
  }
}
