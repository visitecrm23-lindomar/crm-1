import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, tripsTable, dealsTable, clientsTable, emailLogsTable, reservationsTable } from "@workspace/db";
import { eq, and, lt, lte, gte, gt, sql, isNotNull, notLike, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/tenant";
import { AGENCY_STAFF_ROLES } from '../lib/tenant';
import { PAYMENT_STATUS, PAYMENT_TYPE, DEAL_STATUS, TRIP_STATUS } from "@workspace/permissions";

const router = Router();

interface Alert {
  id: string;
  type: "critical" | "warning" | "info";
  category: string;
  title: string;
  description: string;
  actionHref: string;
  count: number;
}

router.get("/alerts", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (!(AGENCY_STAFF_ROLES as readonly string[]).includes(me.role)) {
      res.status(403).json({ error: "Sem permissão" });
      return;
    }

    const tenantId = me.tenantId;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const endOfDay3 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4); // exclusive upper bound to include all of day+3
    const in7Days = new Date(startOfToday.getTime() + 7 * 86400000);
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const todayMonth = now.getMonth() + 1;
    const todayDay = now.getDate();

    const [
      receivableDueTodayRows,
      overdueReceivableRows,
      payableDueNext3DaysRows,
      tripsNoReservationsRows,
      lowOccupancyTripsRows,
      staleLeadsRows,
      birthdaysRows,
      exhaustedEmailLogs,
    ] = await Promise.all([
      // 1. Contas a receber vencendo hoje
      db.select({
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(cast(${paymentsTable.amount} as numeric)), 0)`,
      }).from(paymentsTable).where(and(
        eq(paymentsTable.tenantId, tenantId),
        eq(paymentsTable.type, PAYMENT_TYPE.RECEIVABLE),
        eq(paymentsTable.status, PAYMENT_STATUS.PENDING),
        gte(paymentsTable.dueDate, startOfToday),
        lt(paymentsTable.dueDate, endOfToday),
      )),

      // 2. Contas a receber vencidas
      db.select({
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(cast(${paymentsTable.amount} as numeric)), 0)`,
      }).from(paymentsTable).where(and(
        eq(paymentsTable.tenantId, tenantId),
        eq(paymentsTable.type, PAYMENT_TYPE.RECEIVABLE),
        eq(paymentsTable.status, PAYMENT_STATUS.PENDING),
        lt(paymentsTable.dueDate, startOfToday),
      )),

      // 3. Contas a pagar nos próximos 3 dias (inclusive all of day 3)
      db.select({
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(cast(${paymentsTable.amount} as numeric)), 0)`,
      }).from(paymentsTable).where(and(
        eq(paymentsTable.tenantId, tenantId),
        eq(paymentsTable.type, PAYMENT_TYPE.PAYABLE),
        eq(paymentsTable.status, PAYMENT_STATUS.PENDING),
        gte(paymentsTable.dueDate, startOfToday),
        lt(paymentsTable.dueDate, endOfDay3),
      )),

      // 4. Viagens sem reservas saindo em até 24h
      db.select({
        id: tripsTable.id,
        name: tripsTable.name,
        reservedSeats: tripsTable.reservedSeats,
      }).from(tripsTable).where(and(
        eq(tripsTable.tenantId, tenantId),
        eq(tripsTable.status, TRIP_STATUS.ACTIVE),
        gte(tripsTable.departureDate, now),
        lte(tripsTable.departureDate, in24Hours),
        sql`${tripsTable.reservedSeats} = 0`,
      )),

      // 5. Viagens com baixa ocupação (<50%) nos próximos 7 dias
      db.select({
        id: tripsTable.id,
        name: tripsTable.name,
        totalCapacity: tripsTable.totalCapacity,
        reservedSeats: tripsTable.reservedSeats,
      }).from(tripsTable).where(and(
        eq(tripsTable.tenantId, tenantId),
        eq(tripsTable.status, TRIP_STATUS.ACTIVE),
        gte(tripsTable.departureDate, now),
        lte(tripsTable.departureDate, in7Days),
        gt(tripsTable.totalCapacity, 0),
        sql`${tripsTable.reservedSeats}::numeric / nullif(${tripsTable.totalCapacity}, 0) < 0.5`,
      )),

      // 6. Leads sem movimentação há 7+ dias (inclusive exactly 7 days)
      db.select({
        count: sql<number>`count(*)::int`,
      }).from(dealsTable).where(and(
        eq(dealsTable.tenantId, tenantId),
        eq(dealsTable.status, DEAL_STATUS.OPEN),
        lte(dealsTable.updatedAt, sevenDaysAgo),
      )),

      // 7. Aniversariantes do dia
      db.select({
        count: sql<number>`count(*)::int`,
      }).from(clientsTable).where(and(
        eq(clientsTable.tenantId, tenantId),
        eq(clientsTable.status, "active"),
        sql`extract(month from ${clientsTable.birthDate}) = ${todayMonth}`,
        sql`extract(day from ${clientsTable.birthDate}) = ${todayDay}`,
      )),

      // 8. E-mails com tentativas esgotadas — query via retriesExhaustedAt flag (persists beyond 24h)
      // Fetches all rows that have been stamped as exhausted so we can check resolution state.
      db.select({
        reservationId: emailLogsTable.reservationId,
        retriesExhaustedAt: emailLogsTable.retriesExhaustedAt,
        status: emailLogsTable.status,
        isAutoRetry: emailLogsTable.isAutoRetry,
        createdAt: emailLogsTable.createdAt,
      }).from(emailLogsTable).where(and(
        eq(emailLogsTable.tenantId, tenantId),
        isNotNull(emailLogsTable.reservationId),
        isNotNull(emailLogsTable.retriesExhaustedAt),
        notLike(emailLogsTable.subject, "Reserva Cancelada%"),
        notLike(emailLogsTable.subject, "Nova reserva%"),
        notLike(emailLogsTable.subject, "Alerta: Falha no e-mail de confirmação%"),
      )),
    ]);

    const alerts: Alert[] = [];
    const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const receivableTodayCount = Number(receivableDueTodayRows[0]?.count ?? 0);
    const receivableTodayTotal = Number(receivableDueTodayRows[0]?.total ?? 0);
    if (receivableTodayCount > 0) {
      alerts.push({
        id: "receivable-due-today",
        type: "warning",
        category: "Financeiro",
        title: `${receivableTodayCount} conta(s) a receber vence(m) hoje`,
        description: `Total: ${fmt(receivableTodayTotal)}`,
        actionHref: "/financeiro?tab=receivable",
        count: receivableTodayCount,
      });
    }

    const overdueCount = Number(overdueReceivableRows[0]?.count ?? 0);
    const overdueTotal = Number(overdueReceivableRows[0]?.total ?? 0);
    if (overdueCount > 0) {
      alerts.push({
        id: "receivable-overdue",
        type: "critical",
        category: "Financeiro",
        title: `${overdueCount} conta(s) a receber vencida(s)`,
        description: `Total em aberto: ${fmt(overdueTotal)}`,
        actionHref: "/financeiro?tab=receivable",
        count: overdueCount,
      });
    }

    const payableCount = Number(payableDueNext3DaysRows[0]?.count ?? 0);
    const payableTotal = Number(payableDueNext3DaysRows[0]?.total ?? 0);
    if (payableCount > 0) {
      alerts.push({
        id: "payable-due-3days",
        type: "warning",
        category: "Financeiro",
        title: `${payableCount} conta(s) a pagar nos próximos 3 dias`,
        description: `Total: ${fmt(payableTotal)}`,
        actionHref: "/financeiro?tab=payable",
        count: payableCount,
      });
    }

    const tripsNoRes = tripsNoReservationsRows.length;
    if (tripsNoRes > 0) {
      const names = tripsNoReservationsRows.slice(0, 2).map(t => t.name).join(", ");
      alerts.push({
        id: "trips-no-reservations-24h",
        type: "critical",
        category: "Viagens",
        title: `${tripsNoRes} viagem(ns) sem reservas saindo em 24h`,
        description: tripsNoRes <= 2 ? names : `${names} e mais ${tripsNoRes - 2}`,
        actionHref: "/trips",
        count: tripsNoRes,
      });
    }

    if (lowOccupancyTripsRows.length > 0) {
      const names = lowOccupancyTripsRows.slice(0, 2).map(t => t.name).join(", ");
      alerts.push({
        id: "trips-low-occupancy-7d",
        type: "warning",
        category: "Viagens",
        title: `${lowOccupancyTripsRows.length} viagem(ns) com baixa ocupação (<50%)`,
        description: lowOccupancyTripsRows.length <= 2 ? names : `${names} e mais ${lowOccupancyTripsRows.length - 2}`,
        actionHref: "/trips",
        count: lowOccupancyTripsRows.length,
      });
    }

    const staleLeadCount = Number(staleLeadsRows[0]?.count ?? 0);
    if (staleLeadCount > 0) {
      alerts.push({
        id: "leads-stale-7d",
        type: "info",
        category: "Pipeline",
        title: `${staleLeadCount} lead(s) sem movimentação há 7+ dias`,
        description: "Considere entrar em contato para reativar",
        actionHref: "/pipeline",
        count: staleLeadCount,
      });
    }

    const birthdayCount = Number(birthdaysRows[0]?.count ?? 0);
    if (birthdayCount > 0) {
      alerts.push({
        id: "birthdays-today",
        type: "info",
        category: "Clientes",
        title: `${birthdayCount} aniversariante(s) hoje`,
        description: "Aproveite para enviar uma mensagem de parabéns",
        actionHref: "/clients?filter=birthday",
        count: birthdayCount,
      });
    }

    // 8. E-mails com tentativas esgotadas — usar flag retriesExhaustedAt (sem janela de 24h)
    {
      // Step 1: Collect the latest retriesExhaustedAt per reservationId.
      // Using the latest (max) timestamp handles cases where a reservation
      // somehow accumulates more than one exhaustion cycle correctly.
      const exhaustionByReservation = new Map<string, Date>();
      for (const log of exhaustedEmailLogs) {
        const rid = log.reservationId!;
        const exhaustedAt = log.retriesExhaustedAt!;
        const existing = exhaustionByReservation.get(rid);
        if (!existing || exhaustedAt > existing) {
          exhaustionByReservation.set(rid, exhaustedAt);
        }
      }

      // Step 2: For the exhausted reservationIds, check ALL email_logs (not just
      // exhausted ones) for a successful non-auto-retry send after the exhaustion
      // timestamp. Manual resend rows have retriesExhaustedAt = null, so they
      // would have been excluded from the initial query — this second query
      // captures them correctly.
      const resolvedIds = new Set<string>();
      if (exhaustionByReservation.size > 0) {
        const allExhaustedIds = [...exhaustionByReservation.keys()];
        // Only count rows that look like customer-facing booking confirmations.
        // Staff-alert rows (subject "Alerta: Falha no e-mail de confirmação…")
        // share the same reservationId and isAutoRetry=false, but must NOT be
        // treated as a successful customer resend — exclude them along with
        // cancellation and agency-notification emails.
        const manualResends = await db
          .select({
            reservationId: emailLogsTable.reservationId,
            createdAt: emailLogsTable.createdAt,
          })
          .from(emailLogsTable)
          .where(
            and(
              eq(emailLogsTable.tenantId, tenantId),
              inArray(emailLogsTable.reservationId, allExhaustedIds),
              eq(emailLogsTable.status, "sent"),
              eq(emailLogsTable.isAutoRetry, false),
              notLike(emailLogsTable.subject, "Alerta: Falha no e-mail de confirmação%"),
              notLike(emailLogsTable.subject, "Reserva Cancelada%"),
              notLike(emailLogsTable.subject, "Nova reserva%"),
            ),
          );

        for (const resend of manualResends) {
          const rid = resend.reservationId!;
          const sentAt = resend.createdAt;
          const exhaustedAt = exhaustionByReservation.get(rid)!;
          if (sentAt >= exhaustedAt) {
            resolvedIds.add(rid);
          }
        }
      }

      const exhaustedReservationIds = [...exhaustionByReservation.keys()].filter(
        (rid) => !resolvedIds.has(rid),
      );
      const exhaustedCount = exhaustedReservationIds.length;

      if (exhaustedCount > 0) {
        // Fetch reservation details to include in the alert description
        let description = "Intervenção manual necessária — acesse o Log de E-mails";
        try {
          const details = await db
            .select({
              reservationId: reservationsTable.id,
              reservationNumber: reservationsTable.reservationNumber,
              voucherCode: reservationsTable.voucherCode,
              clientEmail: clientsTable.email,
            })
            .from(reservationsTable)
            .innerJoin(clientsTable, eq(reservationsTable.clientId, clientsTable.id))
            .where(inArray(reservationsTable.id, exhaustedReservationIds));

          if (details.length > 0) {
            const MAX_SHOWN = 3;
            const shown = details.slice(0, MAX_SHOWN).map((d) => {
              const ref = d.reservationNumber ?? d.voucherCode ?? d.reservationId;
              return `#${ref} (${d.clientEmail ?? "sem e-mail"})`;
            });
            const remainder = details.length - shown.length;
            description = shown.join(", ") + (remainder > 0 ? ` e mais ${remainder}` : "");
          }
        } catch {
          // Non-fatal — fall back to generic description
        }

        alerts.push({
          id: "email-retry-exhausted",
          type: "critical",
          category: "E-mails",
          title: `${exhaustedCount} e-mail(s) de confirmação com tentativas esgotadas`,
          description,
          actionHref: "/communication?tab=email-logs",
          count: exhaustedCount,
        });
      }
    }

    res.json({ alerts, count: alerts.length });
  } catch (err) {
    req.log.error({ err }, "Error fetching alerts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/alerts/email-retry-exhausted/resolve", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (!(AGENCY_STAFF_ROLES as readonly string[]).includes(me.role)) {
      res.status(403).json({ error: "Sem permissão" });
      return;
    }

    await db
      .update(emailLogsTable)
      .set({ retriesExhaustedAt: null })
      .where(
        and(
          eq(emailLogsTable.tenantId, me.tenantId),
          isNotNull(emailLogsTable.retriesExhaustedAt),
        ),
      );

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error resolving exhausted email alerts");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
