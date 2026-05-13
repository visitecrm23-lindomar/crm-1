import { db } from "@workspace/db";
import { reservationsTable, storesTable, tripsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  enqueueReservationConfirmationEmail,
  enqueueNewBookingNotificationEmail,
} from "../../queues/email-helpers";
import { ensurePortalAccount } from "./portal-account";
import { STORE_PAYMENT_STATUS } from "@workspace/permissions";

export interface PostBookingArgs {
  store: typeof storesTable.$inferSelect;
  customerEmail: string;
  customerName: string;
  customerCpf?: string;
  customerPhone?: string;
  paymentMethod?: string;
  orderNumber: string;
}

export async function runPostBookingSideEffects(args: PostBookingArgs): Promise<void> {
  const {
    store, customerEmail, customerName, customerCpf, customerPhone, paymentMethod, orderNumber,
  } = args;

  const tenantId = store.tenantId;
  const agencyName = store.name;
  const agencyLogo = store.logo ?? "";
  const agencyPhone = store.whatsapp ?? store.phone ?? "";
  const agencyEmail = store.email ?? "";
  const STORE_PUBLIC_BASE = (process.env["STORE_PUBLIC_URL"] ?? "https://visitecrm.com").replace(/\/$/, "");
  const storeBase = store.customDomain
    ? `https://${store.customDomain}`
    : `${STORE_PUBLIC_BASE}/loja/${store.slug}`;
  const loginUrl = `${storeBase}/entrar`;
  const consultUrl = `${storeBase}/consultar-pedido`;

  try {
    const { credentials } = await ensurePortalAccount({
      email: customerEmail,
      name: customerName,
      tenantId,
      storeBase,
      loginUrl,
      agencyName,
      agencyLogo,
    });

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
          paymentStatus: STORE_PAYMENT_STATUS.PENDING,
          agencyName,
          agencyLogo,
          agencyPhone,
          agencyEmail,
          agencyWebsite: storeBase,
          voucherUrl,
          consultUrl,
          whatsappUrl,
          ...(credentials ? {
            credentials: {
              email: credentials.email,
              setupUrl: credentials.setupUrl,
              loginUrl: credentials.loginUrl,
              ...(credentials.plainTextPassword ? { plainTextPassword: credentials.plainTextPassword } : {}),
            },
          } : {}),
        },
      });
    }
  } catch (err) {
    console.error("[checkout/post-booking] Error sending post-booking email:", err);
  }

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
