import { db } from "@workspace/db";
import {
  usersTable,
  clientsTable,
  tripsTable,
  reservationsTable,
  paymentsTable,
  calendarEventsTable,
} from "@workspace/db";
import { eq, and, type SQL } from "drizzle-orm";
import { format, addHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { GoogleCalendarService, refreshTokenIfNeeded } from "./calendar-service";
import { generateId } from "../id";

async function getCalendarService(userId: string): Promise<GoogleCalendarService | null> {
  const token = await refreshTokenIfNeeded(userId);
  if (!token) return null;
  return new GoogleCalendarService(token);
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "Não informado";
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function fmtCurrency(v: number | string | null | undefined): string {
  return `R$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;
}

async function upsertCalendarEvent(
  service: GoogleCalendarService,
  filter: SQL[],
  eventData: { summary: string; description?: string; location?: string; startDateTime: Date; endDateTime?: Date; attendees?: string[] },
  record: {
    tenantId: string;
    userId?: string;
    clientId?: string;
    tripId?: string;
    paymentId?: string;
    eventType: string;
  }
): Promise<void> {
  const [existing] = await db.select().from(calendarEventsTable)
    .where(and(...filter)).limit(1);

  if (existing) {
    await service.updateEvent(existing.googleEventId, eventData);
    await db.update(calendarEventsTable).set({
      title: eventData.summary,
      description: eventData.description,
      startDate: eventData.startDateTime,
      endDate: eventData.endDateTime,
      location: eventData.location,
      syncedAt: new Date(),
    }).where(eq(calendarEventsTable.id, existing.id));
  } else {
    const googleEvent = await service.createEvent(eventData);
    if (!googleEvent) return;
    await db.insert(calendarEventsTable).values({
      id: generateId(),
      tenantId: record.tenantId,
      userId: record.userId,
      clientId: record.clientId,
      tripId: record.tripId,
      paymentId: record.paymentId,
      googleEventId: googleEvent.id,
      calendarId: "primary",
      eventType: record.eventType,
      title: eventData.summary,
      description: eventData.description,
      startDate: eventData.startDateTime,
      endDate: eventData.endDateTime,
      location: eventData.location,
      syncedAt: new Date(),
    });
  }
}

export class CalendarSyncService {
  /**
   * syncTrip — syncs a single trip to all eligible connected users.
   * Called from background hooks (trips/reservations mutations) so fan-out is appropriate.
   */
  static async syncTrip(tripId: string): Promise<void> {
    try {
      const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, tripId)).limit(1);
      if (!trip) return;

      const reservations = await db.select({
        clientId: reservationsTable.clientId,
        sellerId: reservationsTable.sellerId,
        totalValue: reservationsTable.totalValue,
      }).from(reservationsTable)
        .where(and(eq(reservationsTable.tripId, tripId), eq(reservationsTable.status, "confirmed")));

      const clientIds = reservations.map((r) => r.clientId);
      let clients: { id: string; name: string; email: string }[] = [];
      if (clientIds.length > 0) {
        clients = await db.select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email })
          .from(clientsTable)
          .where(eq(clientsTable.tenantId, trip.tenantId));
        clients = clients.filter((c) => clientIds.includes(c.id));
      }

      const totalValue = reservations.reduce((s, r) => s + Number(r.totalValue), 0);

      const baseEvent = {
        summary: `🚌 ${trip.name}`,
        location: trip.originCity ? `${trip.originCity} → ${trip.destination}` : trip.destination,
        startDateTime: trip.departureDate,
        endDateTime: trip.returnDate ?? addHours(trip.departureDate, 12),
      };

      const adminUsers = await db.select({
        id: usersTable.id,
        googleCalendarEnabled: usersTable.googleCalendarEnabled,
      }).from(usersTable)
        .where(and(
          eq(usersTable.tenantId, trip.tenantId),
          eq(usersTable.googleCalendarEnabled, true),
          eq(usersTable.role, "agencia"),
        ));

      for (const admin of adminUsers) {
        const svc = await getCalendarService(admin.id);
        if (!svc) continue;
        const description = [
          `🚌 VIAGEM: ${trip.name}`,
          ``,
          `📍 ${trip.originCity ?? ""} → ${trip.destination}`,
          `📅 Saída: ${fmtDate(trip.departureDate)}`,
          trip.returnDate ? `🔙 Retorno: ${fmtDate(trip.returnDate)}` : null,
          ``,
          `👥 Passageiros confirmados: ${reservations.length}`,
          `💰 Receita Total: ${fmtCurrency(totalValue)}`,
          trip.description ?? null,
        ].filter(Boolean).join("\n");

        await upsertCalendarEvent(
          svc,
          [
            eq(calendarEventsTable.tripId, tripId),
            eq(calendarEventsTable.userId, admin.id),
            eq(calendarEventsTable.eventType, "trip"),
          ],
          { ...baseEvent, description, attendees: clients.map((c) => c.email).filter(Boolean) },
          { tenantId: trip.tenantId, userId: admin.id, tripId, eventType: "trip" }
        );
      }

      const sellerIds = [...new Set(reservations.map((r) => r.sellerId).filter(Boolean))] as string[];
      if (sellerIds.length > 0) {
        const sellers = await db.select({
          id: usersTable.id,
          name: usersTable.name,
          googleCalendarEnabled: usersTable.googleCalendarEnabled,
        }).from(usersTable)
          .where(and(
            eq(usersTable.tenantId, trip.tenantId),
            eq(usersTable.googleCalendarEnabled, true),
            eq(usersTable.role, "vendedor"),
          ));

        for (const seller of sellers) {
          if (!sellerIds.includes(seller.id)) continue;
          const svc = await getCalendarService(seller.id);
          if (!svc) continue;

          const sellerReservations = reservations.filter((r) => r.sellerId === seller.id);
          const sellerClientIds = sellerReservations.map((r) => r.clientId);
          const sellerClients = clients.filter((c) => sellerClientIds.includes(c.id));
          const sellerTotal = sellerReservations.reduce((s, r) => s + Number(r.totalValue), 0);

          const description = [
            `🚌 VIAGEM: ${trip.name}`,
            ``,
            `📍 ${trip.originCity ?? ""} → ${trip.destination}`,
            `📅 ${fmtDate(trip.departureDate)}`,
            ``,
            `👥 SEUS CLIENTES (${sellerClients.length}):`,
            ...sellerClients.map((c) => `• ${c.name}`),
            ``,
            `💰 Total: ${fmtCurrency(sellerTotal)}`,
          ].join("\n");

          await upsertCalendarEvent(
            svc,
            [
              eq(calendarEventsTable.tripId, tripId),
              eq(calendarEventsTable.userId, seller.id),
              eq(calendarEventsTable.eventType, "trip"),
            ],
            { ...baseEvent, description, attendees: sellerClients.map((c) => c.email).filter(Boolean) },
            { tenantId: trip.tenantId, userId: seller.id, tripId, eventType: "trip" }
          );
        }
      }
    } catch (err) {
      console.error("[CalendarSyncService] syncTrip error:", err);
    }
  }

  /**
   * syncTripForUser — syncs a single trip to one specific user's calendar.
   * Used by user-initiated operations (manual sync, post-connect).
   */
  static async syncTripForUser(tripId: string, actorUserId: string): Promise<void> {
    try {
      const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, tripId)).limit(1);
      if (!trip) return;

      const [actor] = await db.select({ role: usersTable.role })
        .from(usersTable)
        .where(and(eq(usersTable.id, actorUserId), eq(usersTable.tenantId, trip.tenantId)))
        .limit(1);
      if (!actor) return;

      const svc = await getCalendarService(actorUserId);
      if (!svc) return;

      const reservations = await db.select({
        clientId: reservationsTable.clientId,
        sellerId: reservationsTable.sellerId,
        totalValue: reservationsTable.totalValue,
      }).from(reservationsTable)
        .where(and(eq(reservationsTable.tripId, tripId), eq(reservationsTable.status, "confirmed")));

      let visibleReservations = reservations;
      if (actor.role === "vendedor") {
        visibleReservations = reservations.filter((r) => r.sellerId === actorUserId);
      }

      const clientIds = visibleReservations.map((r) => r.clientId);
      let clients: { id: string; name: string; email: string }[] = [];
      if (clientIds.length > 0) {
        clients = await db.select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email })
          .from(clientsTable)
          .where(eq(clientsTable.tenantId, trip.tenantId));
        clients = clients.filter((c) => clientIds.includes(c.id));
      }

      const totalValue = visibleReservations.reduce((s, r) => s + Number(r.totalValue), 0);

      const description = [
        `🚌 VIAGEM: ${trip.name}`,
        ``,
        `📍 ${trip.originCity ?? ""} → ${trip.destination}`,
        `📅 Saída: ${fmtDate(trip.departureDate)}`,
        trip.returnDate ? `🔙 Retorno: ${fmtDate(trip.returnDate)}` : null,
        ``,
        `👥 Passageiros: ${visibleReservations.length}`,
        `💰 Total: ${fmtCurrency(totalValue)}`,
      ].filter(Boolean).join("\n");

      await upsertCalendarEvent(
        svc,
        [
          eq(calendarEventsTable.tripId, tripId),
          eq(calendarEventsTable.userId, actorUserId),
          eq(calendarEventsTable.eventType, "trip"),
        ],
        {
          summary: `🚌 ${trip.name}`,
          location: trip.originCity ? `${trip.originCity} → ${trip.destination}` : trip.destination,
          startDateTime: trip.departureDate,
          endDateTime: trip.returnDate ?? addHours(trip.departureDate, 12),
          description,
          attendees: clients.map((c) => c.email).filter(Boolean),
        },
        { tenantId: trip.tenantId, userId: actorUserId, tripId, eventType: "trip" }
      );
    } catch (err) {
      console.error("[CalendarSyncService] syncTripForUser error:", err);
    }
  }

  static async deleteEventsForTrip(tripId: string): Promise<void> {
    try {
      const events = await db.select({
        id: calendarEventsTable.id,
        userId: calendarEventsTable.userId,
        googleEventId: calendarEventsTable.googleEventId,
      }).from(calendarEventsTable).where(eq(calendarEventsTable.tripId, tripId));

      for (const ev of events) {
        if (ev.userId) {
          const svc = await getCalendarService(ev.userId);
          if (svc) await svc.deleteEvent(ev.googleEventId);
        }
        await db.delete(calendarEventsTable).where(eq(calendarEventsTable.id, ev.id));
      }
    } catch (err) {
      console.error("[CalendarSyncService] deleteEventsForTrip error:", err);
    }
  }

  static async deleteEventsForPayment(paymentId: string): Promise<void> {
    try {
      const events = await db.select({
        id: calendarEventsTable.id,
        userId: calendarEventsTable.userId,
        googleEventId: calendarEventsTable.googleEventId,
      }).from(calendarEventsTable).where(eq(calendarEventsTable.paymentId, paymentId));

      for (const ev of events) {
        if (ev.userId) {
          const svc = await getCalendarService(ev.userId);
          if (svc) await svc.deleteEvent(ev.googleEventId);
        }
        await db.delete(calendarEventsTable).where(eq(calendarEventsTable.id, ev.id));
      }
    } catch (err) {
      console.error("[CalendarSyncService] deleteEventsForPayment error:", err);
    }
  }

  /**
   * syncPayment — syncs a payment to all eligible connected users (fan-out).
   * Called from background hooks (payment mutations).
   */
  static async syncPayment(paymentId: string): Promise<void> {
    try {
      const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId)).limit(1);
      if (!payment || !payment.dueDate) return;

      if (payment.status === "paid" || payment.status === "cancelled") {
        await CalendarSyncService.deleteEventsForPayment(paymentId);
        return;
      }

      let clientName = "Cliente";
      let clientEmail: string | null = null;
      let sellerId: string | null = null;

      if (payment.clientId) {
        const [client] = await db.select({
          name: clientsTable.name,
          email: clientsTable.email,
          createdById: clientsTable.createdById,
        }).from(clientsTable).where(eq(clientsTable.id, payment.clientId)).limit(1);
        if (client) {
          clientName = client.name;
          clientEmail = client.email;
          sellerId = client.createdById;
        }
      }

      const baseEvent = {
        summary: `💰 Pagamento: ${clientName}`,
        description: [
          `💰 PAGAMENTO PENDENTE`,
          ``,
          `Cliente: ${clientName}`,
          `Valor: ${fmtCurrency(payment.amount)}`,
          `Vencimento: ${format(payment.dueDate, "dd/MM/yyyy", { locale: ptBR })}`,
          `Parcela: ${payment.installmentNumber}/${payment.totalInstallments}`,
          payment.description ? `Descrição: ${payment.description}` : null,
          ``,
          `⚠️ Confirmar recebimento após pagamento`,
        ].filter(Boolean).join("\n"),
        startDateTime: payment.dueDate,
        endDateTime: payment.dueDate,
      };

      const adminUsers = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(and(
          eq(usersTable.tenantId, payment.tenantId),
          eq(usersTable.googleCalendarEnabled, true),
          eq(usersTable.role, "agencia"),
        ));

      for (const admin of adminUsers) {
        const svc = await getCalendarService(admin.id);
        if (!svc) continue;
        await upsertCalendarEvent(
          svc,
          [
            eq(calendarEventsTable.paymentId, paymentId),
            eq(calendarEventsTable.userId, admin.id),
            eq(calendarEventsTable.eventType, "payment"),
          ],
          { ...baseEvent, attendees: clientEmail ? [clientEmail] : [] },
          { tenantId: payment.tenantId, userId: admin.id, paymentId, eventType: "payment" }
        );
      }

      if (sellerId) {
        const [seller] = await db.select({ id: usersTable.id, googleCalendarEnabled: usersTable.googleCalendarEnabled, role: usersTable.role })
          .from(usersTable)
          .where(and(eq(usersTable.id, sellerId), eq(usersTable.tenantId, payment.tenantId))).limit(1);
        if (seller?.googleCalendarEnabled && seller.role === "vendedor") {
          const svc = await getCalendarService(seller.id);
          if (svc) {
            await upsertCalendarEvent(
              svc,
              [
                eq(calendarEventsTable.paymentId, paymentId),
                eq(calendarEventsTable.userId, seller.id),
                eq(calendarEventsTable.eventType, "payment"),
              ],
              { ...baseEvent, attendees: clientEmail ? [clientEmail] : [] },
              { tenantId: payment.tenantId, userId: seller.id, paymentId, eventType: "payment" }
            );
          }
        }
      }
    } catch (err) {
      console.error("[CalendarSyncService] syncPayment error:", err);
    }
  }

  /**
   * syncPaymentForUser — syncs a payment to one specific user's calendar.
   * Used by user-initiated operations (manual sync, post-connect).
   */
  static async syncPaymentForUser(paymentId: string, actorUserId: string): Promise<void> {
    try {
      const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId)).limit(1);
      if (!payment || !payment.dueDate) return;

      if (payment.status === "paid" || payment.status === "cancelled") return;

      const [actor] = await db.select({ role: usersTable.role, tenantId: usersTable.tenantId })
        .from(usersTable)
        .where(and(eq(usersTable.id, actorUserId), eq(usersTable.tenantId, payment.tenantId)))
        .limit(1);
      if (!actor) return;

      let clientName = "Cliente";
      let clientEmail: string | null = null;
      let sellerId: string | null = null;

      if (payment.clientId) {
        const [client] = await db.select({ name: clientsTable.name, email: clientsTable.email, createdById: clientsTable.createdById })
          .from(clientsTable).where(eq(clientsTable.id, payment.clientId)).limit(1);
        if (client) {
          clientName = client.name;
          clientEmail = client.email;
          sellerId = client.createdById;
        }
      }

      if (actor.role === "vendedor" && sellerId !== actorUserId) return;

      const svc = await getCalendarService(actorUserId);
      if (!svc) return;

      await upsertCalendarEvent(
        svc,
        [
          eq(calendarEventsTable.paymentId, paymentId),
          eq(calendarEventsTable.userId, actorUserId),
          eq(calendarEventsTable.eventType, "payment"),
        ],
        {
          summary: `💰 Pagamento: ${clientName}`,
          description: [
            `💰 PAGAMENTO PENDENTE`,
            ``,
            `Cliente: ${clientName}`,
            `Valor: ${fmtCurrency(payment.amount)}`,
            `Vencimento: ${format(payment.dueDate, "dd/MM/yyyy", { locale: ptBR })}`,
            payment.description ? `Descrição: ${payment.description}` : null,
          ].filter(Boolean).join("\n"),
          startDateTime: payment.dueDate,
          endDateTime: payment.dueDate,
          attendees: clientEmail ? [clientEmail] : [],
        },
        { tenantId: payment.tenantId, userId: actorUserId, paymentId, eventType: "payment" }
      );
    } catch (err) {
      console.error("[CalendarSyncService] syncPaymentForUser error:", err);
    }
  }

  /**
   * syncBirthday — syncs a client birthday to all eligible connected users (fan-out).
   * Called from background hooks (client create/update).
   */
  static async syncBirthday(clientId: string): Promise<void> {
    try {
      const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1);
      if (!client?.birthDate) return;

      const birthDate = new Date(client.birthDate);
      const now = new Date();
      const currentYear = now.getFullYear();
      let nextBirthday = new Date(currentYear, birthDate.getMonth(), birthDate.getDate());
      if (nextBirthday < now) nextBirthday = new Date(currentYear + 1, birthDate.getMonth(), birthDate.getDate());

      const eventData = {
        summary: `🎂 Aniversário: ${client.name}`,
        description: `Aniversário de ${client.name}\n\nEnviar mensagem de felicitações!`,
        startDateTime: nextBirthday,
        endDateTime: nextBirthday,
      };

      const tenantId = client.tenantId;

      const adminUsers = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.googleCalendarEnabled, true), eq(usersTable.role, "agencia")));

      for (const admin of adminUsers) {
        const svc = await getCalendarService(admin.id);
        if (!svc) continue;
        await upsertCalendarEvent(
          svc,
          [
            eq(calendarEventsTable.clientId, clientId),
            eq(calendarEventsTable.userId, admin.id),
            eq(calendarEventsTable.eventType, "birthday"),
          ],
          eventData,
          { tenantId, userId: admin.id, clientId, eventType: "birthday" }
        );
      }

      const sellerId = client.createdById;
      if (sellerId) {
        const [seller] = await db.select({ id: usersTable.id, googleCalendarEnabled: usersTable.googleCalendarEnabled, role: usersTable.role })
          .from(usersTable)
          .where(and(eq(usersTable.id, sellerId), eq(usersTable.tenantId, tenantId))).limit(1);
        if (seller?.googleCalendarEnabled && seller.role === "vendedor") {
          const svc = await getCalendarService(seller.id);
          if (svc) {
            await upsertCalendarEvent(
              svc,
              [
                eq(calendarEventsTable.clientId, clientId),
                eq(calendarEventsTable.userId, seller.id),
                eq(calendarEventsTable.eventType, "birthday"),
              ],
              { ...eventData, description: `Aniversário de ${client.name}\n\nLembre-se de enviar felicitações!` },
              { tenantId, userId: seller.id, clientId, eventType: "birthday" }
            );
          }
        }
      }
    } catch (err) {
      console.error("[CalendarSyncService] syncBirthday error:", err);
    }
  }

  /**
   * syncBirthdayForUser — syncs a client birthday to one specific user's calendar.
   */
  static async syncBirthdayForUser(clientId: string, actorUserId: string): Promise<void> {
    try {
      const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1);
      if (!client?.birthDate) return;

      const [actor] = await db.select({ role: usersTable.role })
        .from(usersTable)
        .where(and(eq(usersTable.id, actorUserId), eq(usersTable.tenantId, client.tenantId)))
        .limit(1);
      if (!actor) return;

      if (actor.role === "vendedor" && client.createdById !== actorUserId) return;

      const svc = await getCalendarService(actorUserId);
      if (!svc) return;

      const birthDate = new Date(client.birthDate);
      const now = new Date();
      const currentYear = now.getFullYear();
      let nextBirthday = new Date(currentYear, birthDate.getMonth(), birthDate.getDate());
      if (nextBirthday < now) nextBirthday = new Date(currentYear + 1, birthDate.getMonth(), birthDate.getDate());

      await upsertCalendarEvent(
        svc,
        [
          eq(calendarEventsTable.clientId, clientId),
          eq(calendarEventsTable.userId, actorUserId),
          eq(calendarEventsTable.eventType, "birthday"),
        ],
        {
          summary: `🎂 Aniversário: ${client.name}`,
          description: `Aniversário de ${client.name}\n\nEnviar mensagem de felicitações!`,
          startDateTime: nextBirthday,
          endDateTime: nextBirthday,
        },
        { tenantId: client.tenantId, userId: actorUserId, clientId, eventType: "birthday" }
      );
    } catch (err) {
      console.error("[CalendarSyncService] syncBirthdayForUser error:", err);
    }
  }

  /**
   * syncAllForUser — syncs all relevant data for a single user's calendar.
   * Used by manual sync and post-OAuth-connect (user-scoped, no fan-out).
   */
  static async syncAllForUser(actorUserId: string): Promise<number> {
    let synced = 0;

    const [actor] = await db.select({ role: usersTable.role, tenantId: usersTable.tenantId })
      .from(usersTable)
      .where(eq(usersTable.id, actorUserId))
      .limit(1);
    if (!actor) return 0;

    const tenantId = actor.tenantId;

    const trips = await db.select({ id: tripsTable.id })
      .from(tripsTable)
      .where(and(eq(tripsTable.tenantId, tenantId), eq(tripsTable.status, "published")));

    for (const t of trips) {
      await CalendarSyncService.syncTripForUser(t.id, actorUserId);
      synced++;
    }

    const payments = await db.select({ id: paymentsTable.id })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.tenantId, tenantId), eq(paymentsTable.status, "pending")));

    for (const p of payments) {
      await CalendarSyncService.syncPaymentForUser(p.id, actorUserId);
      synced++;
    }

    const clients = await db.select({ id: clientsTable.id })
      .from(clientsTable)
      .where(eq(clientsTable.tenantId, tenantId));

    for (const c of clients) {
      await CalendarSyncService.syncBirthdayForUser(c.id, actorUserId);
      synced++;
    }

    return synced;
  }

  /**
   * syncAll — tenant-wide fan-out sync for all connected users.
   * @deprecated For user-initiated requests, use syncAllForUser instead.
   */
  static async syncAll(tenantId: string): Promise<number> {
    let synced = 0;

    const trips = await db.select({ id: tripsTable.id })
      .from(tripsTable)
      .where(and(eq(tripsTable.tenantId, tenantId), eq(tripsTable.status, "published")));
    for (const t of trips) {
      await CalendarSyncService.syncTrip(t.id);
      synced++;
    }

    const payments = await db.select({ id: paymentsTable.id })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.tenantId, tenantId), eq(paymentsTable.status, "pending")));
    for (const p of payments) {
      await CalendarSyncService.syncPayment(p.id);
      synced++;
    }

    const clients = await db.select({ id: clientsTable.id })
      .from(clientsTable)
      .where(and(eq(clientsTable.tenantId, tenantId)));
    for (const c of clients) {
      await CalendarSyncService.syncBirthday(c.id);
      synced++;
    }

    return synced;
  }
}
