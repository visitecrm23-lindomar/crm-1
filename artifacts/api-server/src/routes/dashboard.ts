import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable, tripsTable, reservationsTable, paymentsTable, dealsTable, npsResponsesTable, expensesTable, passengersTable } from "@workspace/db";
import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/tenant";

const router = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const tenantId = me.tenantId;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const next3Days = new Date(startOfToday.getTime() + 3 * 86400000);

    if (me.role === "cliente") {
      const [clientRecord] = await db.select({ id: clientsTable.id, totalSpent: clientsTable.totalSpent, outstandingBalance: clientsTable.outstandingBalance, npsScore: clientsTable.npsScore })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, tenantId), eq(clientsTable.userId, me.id)))
        .limit(1);

      const clientId = clientRecord?.id;
      let totalReservations = 0, confirmedReservations = 0;
      if (clientId) {
        const [rc] = await db.select({ count: sql<number>`count(*)` })
          .from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), eq(reservationsTable.clientId, clientId)));
        const [cc] = await db.select({ count: sql<number>`count(*)` })
          .from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), eq(reservationsTable.clientId, clientId), eq(reservationsTable.status, "confirmed")));
        totalReservations = Number(rc?.count ?? 0);
        confirmedReservations = Number(cc?.count ?? 0);
      }

      res.json({
        totalClients: 1, newClientsThisMonth: 0, totalTrips: 0, activeTrips: 0,
        totalRevenue: Number(clientRecord?.totalSpent ?? 0),
        revenueThisMonth: 0,
        pendingPayments: Number(clientRecord?.outstandingBalance ?? 0),
        totalReservations, confirmedReservations, occupancyRate: 0,
        averageNps: clientRecord?.npsScore ?? null,
        openDeals: 0, dealsPipelineValue: 0,
        receivedToday: 0, toReceiveNext3Days: 0, reservationsToday: 0,
        avgTicket: 0, activeClientsCount: 0, totalExpenses: 0, cancelledReservations: 0,
        receivedFromActiveTrips: 0, pendingFromActiveTrips: 0,
      });
      return;
    }

    if (me.role === "vendedor") {
      const [clientCount] = await db.select({ count: sql<number>`count(*)` })
        .from(clientsTable).where(and(eq(clientsTable.tenantId, tenantId), eq(clientsTable.createdById, me.id)));
      const [newClientCount] = await db.select({ count: sql<number>`count(*)` })
        .from(clientsTable).where(and(eq(clientsTable.tenantId, tenantId), eq(clientsTable.createdById, me.id), gte(clientsTable.createdAt, startOfMonth)));

      const myClients = await db.select({ id: clientsTable.id }).from(clientsTable)
        .where(and(eq(clientsTable.tenantId, tenantId), eq(clientsTable.createdById, me.id)));
      const myClientIds = myClients.map(c => c.id);

      let totalRevenue = 0, revenueThisMonth = 0, pendingAmount = 0, receivedToday = 0;
      if (myClientIds.length > 0) {
        const payments = await db.select().from(paymentsTable)
          .where(and(eq(paymentsTable.tenantId, tenantId), inArray(paymentsTable.clientId, myClientIds)));
        for (const p of payments) {
          if (p.type === "receivable" && p.status === "paid") {
            totalRevenue += Number(p.amount);
            if (p.paidAt && p.paidAt >= startOfMonth) revenueThisMonth += Number(p.amount);
            if (p.paidAt && p.paidAt >= startOfToday) receivedToday += Number(p.amount);
          }
          if (p.status === "pending") pendingAmount += Number(p.amount);
        }
      }

      let totalReservations = 0, confirmedReservations = 0, cancelledReservations = 0, reservationsToday = 0;
      let avgTicket = 0, activeClientsCount = 0;
      if (myClientIds.length > 0) {
        const [rc] = await db.select({ count: sql<number>`count(*)` })
          .from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), inArray(reservationsTable.clientId, myClientIds)));
        const [cc] = await db.select({ count: sql<number>`count(*)` })
          .from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), inArray(reservationsTable.clientId, myClientIds), eq(reservationsTable.status, "confirmed")));
        totalReservations = Number(rc?.count ?? 0);
        confirmedReservations = Number(cc?.count ?? 0);
      }

      const [dealCount] = await db.select({ count: sql<number>`count(*)` })
        .from(dealsTable).where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.status, "open"), eq(dealsTable.ownerId, me.id)));
      const [dealValue] = await db.select({ total: sql<number>`sum(cast(value as numeric))` })
        .from(dealsTable).where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.status, "open"), eq(dealsTable.ownerId, me.id)));

      res.json({
        totalClients: Number(clientCount?.count ?? 0),
        newClientsThisMonth: Number(newClientCount?.count ?? 0),
        totalTrips: 0, activeTrips: 0,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
        pendingPayments: Math.round(pendingAmount * 100) / 100,
        totalReservations, confirmedReservations, occupancyRate: 0,
        averageNps: null,
        openDeals: Number(dealCount?.count ?? 0),
        dealsPipelineValue: Number(dealValue?.total ?? 0),
        receivedToday, toReceiveNext3Days: 0, reservationsToday, avgTicket,
        activeClientsCount, totalExpenses: 0, cancelledReservations,
        receivedFromActiveTrips: 0, pendingFromActiveTrips: 0,
      });
      return;
    }

    // Admin / owner role
    const [clientCount] = await db.select({ count: sql<number>`count(*)` })
      .from(clientsTable).where(eq(clientsTable.tenantId, tenantId));
    const [newClientCount] = await db.select({ count: sql<number>`count(*)` })
      .from(clientsTable).where(and(eq(clientsTable.tenantId, tenantId), gte(clientsTable.createdAt, startOfMonth)));

    const [tripCount] = await db.select({ count: sql<number>`count(*)` })
      .from(tripsTable).where(eq(tripsTable.tenantId, tenantId));
    const [activeTripCount] = await db.select({ count: sql<number>`count(*)` })
      .from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), eq(tripsTable.status, "active")));

    const [reservationCount] = await db.select({ count: sql<number>`count(*)` })
      .from(reservationsTable).where(eq(reservationsTable.tenantId, tenantId));
    const [confirmedReservationCount] = await db.select({ count: sql<number>`count(*)` })
      .from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), eq(reservationsTable.status, "confirmed")));
    const [cancelledReservationCount] = await db.select({ count: sql<number>`count(*)` })
      .from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), eq(reservationsTable.status, "cancelled")));
    const [todayReservationCount] = await db.select({ count: sql<number>`count(*)` })
      .from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), gte(reservationsTable.createdAt, startOfToday)));

    const [avgTicketRow] = await db.select({ avg: sql<number>`avg(cast(total_value as numeric))` })
      .from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), eq(reservationsTable.status, "confirmed")));
    const [activeClientsRow] = await db.select({ count: sql<number>`count(distinct client_id)` })
      .from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), eq(reservationsTable.status, "confirmed")));

    const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.tenantId, tenantId));
    let totalRevenue = 0, revenueThisMonth = 0, pendingPaymentsAmt = 0, receivedToday = 0, toReceiveNext3Days = 0;
    for (const p of payments) {
      if (p.type === "receivable" && p.status === "paid") {
        totalRevenue += Number(p.amount);
        if (p.paidAt && p.paidAt >= startOfMonth) revenueThisMonth += Number(p.amount);
        if (p.paidAt && p.paidAt >= startOfToday) receivedToday += Number(p.amount);
      }
      if (p.type === "receivable" && p.status === "pending" && p.dueDate <= next3Days) {
        toReceiveNext3Days += Number(p.amount);
      }
      if (p.status === "pending") pendingPaymentsAmt += Number(p.amount);
    }

    const [totalExpensesRow] = await db.select({ total: sql<number>`sum(cast(amount as numeric))` })
      .from(expensesTable).where(eq(expensesTable.tenantId, tenantId));

    // receivedFromActiveTrips and pendingFromActiveTrips
    const activeTrips = await db.select({ id: tripsTable.id })
      .from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), eq(tripsTable.status, "active")));
    const activeTripIds = activeTrips.map(t => t.id);
    let receivedFromActiveTrips = 0, pendingFromActiveTrips = 0;
    if (activeTripIds.length > 0) {
      const activeResIds = (await db.select({ id: reservationsTable.id })
        .from(reservationsTable)
        .where(and(eq(reservationsTable.tenantId, tenantId), inArray(reservationsTable.tripId, activeTripIds))))
        .map(r => r.id);
      if (activeResIds.length > 0) {
        const activePayments = await db.select({ amount: paymentsTable.amount, type: paymentsTable.type, status: paymentsTable.status })
          .from(paymentsTable)
          .where(and(eq(paymentsTable.tenantId, tenantId), inArray(paymentsTable.reservationId, activeResIds)));
        for (const p of activePayments) {
          if (p.type === "receivable" && p.status === "paid") receivedFromActiveTrips += Number(p.amount);
          if (p.type === "receivable" && p.status === "pending") pendingFromActiveTrips += Number(p.amount);
        }
      }
    }

    const trips = await db.select({ totalCapacity: tripsTable.totalCapacity, reservedSeats: tripsTable.reservedSeats })
      .from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), eq(tripsTable.status, "active")));
    const totalCapacity = trips.reduce((a, t) => a + t.totalCapacity, 0);
    const totalReserved = trips.reduce((a, t) => a + t.reservedSeats, 0);
    const occupancyRate = totalCapacity > 0 ? (totalReserved / totalCapacity) * 100 : 0;

    const npsResponses = await db.select({ score: npsResponsesTable.score })
      .from(npsResponsesTable).where(eq(npsResponsesTable.tenantId, tenantId));
    const averageNps = npsResponses.length > 0 ? npsResponses.reduce((a, r) => a + r.score, 0) / npsResponses.length : null;

    const [dealCount] = await db.select({ count: sql<number>`count(*)` })
      .from(dealsTable).where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.status, "open")));
    const [dealValue] = await db.select({ total: sql<number>`sum(cast(value as numeric))` })
      .from(dealsTable).where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.status, "open")));

    res.json({
      totalClients: Number(clientCount?.count ?? 0),
      newClientsThisMonth: Number(newClientCount?.count ?? 0),
      totalTrips: Number(tripCount?.count ?? 0),
      activeTrips: Number(activeTripCount?.count ?? 0),
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
      pendingPayments: Math.round(pendingPaymentsAmt * 100) / 100,
      totalReservations: Number(reservationCount?.count ?? 0),
      confirmedReservations: Number(confirmedReservationCount?.count ?? 0),
      occupancyRate: Math.round(occupancyRate * 10) / 10,
      averageNps: averageNps !== null ? Math.round(averageNps * 10) / 10 : null,
      openDeals: Number(dealCount?.count ?? 0),
      dealsPipelineValue: Number(dealValue?.total ?? 0),
      receivedToday: Math.round(receivedToday * 100) / 100,
      toReceiveNext3Days: Math.round(toReceiveNext3Days * 100) / 100,
      reservationsToday: Number(todayReservationCount?.count ?? 0),
      avgTicket: Math.round(Number(avgTicketRow?.avg ?? 0) * 100) / 100,
      activeClientsCount: Number(activeClientsRow?.count ?? 0),
      totalExpenses: Math.round(Number(totalExpensesRow?.total ?? 0) * 100) / 100,
      cancelledReservations: Number(cancelledReservationCount?.count ?? 0),
      receivedFromActiveTrips: Math.round(receivedFromActiveTrips * 100) / 100,
      pendingFromActiveTrips: Math.round(pendingFromActiveTrips * 100) / 100,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching dashboard summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/revenue-chart", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (me.role === "cliente") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const { period = "30d" } = req.query as Record<string, string>;
    const now = new Date();
    const points: Array<{ label: string; revenue: number; expenses: number; reservations: number }> = [];

    let daysBack = 30;
    if (period === "7d") daysBack = 7;
    else if (period === "90d") daysBack = 90;
    else if (period === "12m") daysBack = 365;

    const since = new Date(now.getTime() - daysBack * 86400000);

    let paymentConditions = and(eq(paymentsTable.tenantId, me.tenantId), gte(paymentsTable.createdAt, since))!;
    let reservationConditions = and(eq(reservationsTable.tenantId, me.tenantId), gte(reservationsTable.createdAt, since))!;

    if (me.role === "vendedor") {
      const sellerClients = await db.select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, me.tenantId), eq(clientsTable.createdById, me.id)));
      if (!sellerClients.length) {
        res.json([]);
        return;
      }
      const sellerClientIds = sellerClients.map(c => c.id);
      paymentConditions = and(eq(paymentsTable.tenantId, me.tenantId), gte(paymentsTable.createdAt, since), inArray(paymentsTable.clientId, sellerClientIds))!;
      reservationConditions = and(eq(reservationsTable.tenantId, me.tenantId), gte(reservationsTable.createdAt, since), inArray(reservationsTable.clientId, sellerClientIds))!;
    }

    const payments = await db.select().from(paymentsTable).where(paymentConditions);
    const reservations = await db.select().from(reservationsTable).where(reservationConditions);

    const numPoints = period === "12m" ? 12 : Math.min(daysBack, 12);

    for (let i = numPoints - 1; i >= 0; i--) {
      let label: string;
      let startDate: Date;
      let endDate: Date;

      if (period === "12m") {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        startDate = d;
        endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        label = d.toLocaleString("pt-BR", { month: "short" });
      } else {
        const dayAgo = Math.floor(i * daysBack / numPoints);
        startDate = new Date(now.getTime() - (dayAgo + Math.floor(daysBack / numPoints)) * 86400000);
        endDate = new Date(now.getTime() - dayAgo * 86400000);
        label = startDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      }

      const revenue = payments
        .filter(p => p.type === "receivable" && p.status === "paid" && p.paidAt && p.paidAt >= startDate && p.paidAt <= endDate)
        .reduce((a, p) => a + Number(p.amount), 0);

      const expenses = payments
        .filter(p => p.type === "payable" && p.status === "paid" && p.paidAt && p.paidAt >= startDate && p.paidAt <= endDate)
        .reduce((a, p) => a + Number(p.amount), 0);

      const res_count = reservations
        .filter(r => r.createdAt >= startDate && r.createdAt <= endDate).length;

      points.push({ label, revenue: Math.round(revenue), expenses: Math.round(expenses), reservations: res_count });
    }

    res.json(points);
  } catch (err) {
    req.log.error({ err }, "Error fetching revenue chart");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/charts", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (me.role === "cliente" || me.role === "vendedor") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const tenantId = me.tenantId;
    const now = new Date();

    // Period filter support (default 12m)
    const { period = "12m" } = req.query as Record<string, string>;
    const monthCount = period === "3m" ? 3 : period === "6m" ? 6 : 12;
    const since = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1);

    // Helper: build YYYY-MM key from a Date
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    // Helper: build label array for selected period
    const months12 = Array.from({ length: monthCount }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1 - i), 1);
      return { d, key: monthKey(d), label: d.toLocaleString("pt-BR", { month: "short" }) };
    });

    // 1. TOP DESTINATIONS — SQL JOIN + GROUP BY (confirmed only, top 10)
    const topDestinationsRaw = await db.select({
      name: sql<string>`COALESCE(${tripsTable.destinationCity}, ${tripsTable.destination})`,
      count: sql<number>`count(${reservationsTable.id})::int`,
    }).from(tripsTable)
      .innerJoin(reservationsTable, and(
        eq(reservationsTable.tripId, tripsTable.id),
        eq(reservationsTable.status, "confirmed"),
        eq(reservationsTable.tenantId, tenantId),
      ))
      .where(eq(tripsTable.tenantId, tenantId))
      .groupBy(sql`COALESCE(${tripsTable.destinationCity}, ${tripsTable.destination})`)
      .orderBy(desc(sql`count(${reservationsTable.id})`))
      .limit(10);
    const topDestinations = topDestinationsRaw.map(r => ({ name: r.name, count: Number(r.count) }));

    // 2. TRIPS BY MONTH — SQL GROUP BY
    const tripsByMonthRaw = await db.select({
      monthStart: sql<string>`date_trunc('month', ${tripsTable.createdAt})::text`,
      count: sql<number>`count(*)::int`,
    }).from(tripsTable)
      .where(and(eq(tripsTable.tenantId, tenantId), gte(tripsTable.createdAt, since)))
      .groupBy(sql`date_trunc('month', ${tripsTable.createdAt})`)
      .orderBy(sql`date_trunc('month', ${tripsTable.createdAt})`);
    const tripsByMonthMap = new Map(tripsByMonthRaw.map(r => [r.monthStart.substring(0, 7), Number(r.count)]));
    const tripsByMonth = months12.map(({ key, label }) => ({ label, count: tripsByMonthMap.get(key) ?? 0 }));

    // 3. RESERVATIONS BY MONTH — SQL GROUP BY
    const resByMonthRaw = await db.select({
      monthStart: sql<string>`date_trunc('month', ${reservationsTable.createdAt})::text`,
      count: sql<number>`count(*)::int`,
      cancelled: sql<number>`sum(case when ${reservationsTable.status} = 'cancelled' then 1 else 0 end)::int`,
    }).from(reservationsTable)
      .where(and(eq(reservationsTable.tenantId, tenantId), gte(reservationsTable.createdAt, since)))
      .groupBy(sql`date_trunc('month', ${reservationsTable.createdAt})`)
      .orderBy(sql`date_trunc('month', ${reservationsTable.createdAt})`);
    const resByMonthMap = new Map(resByMonthRaw.map(r => [
      r.monthStart.substring(0, 7), { count: Number(r.count), cancelled: Number(r.cancelled) },
    ]));
    const reservationsByMonth = months12.map(({ key, label }) => {
      const v = resByMonthMap.get(key) ?? { count: 0, cancelled: 0 };
      return { label, count: v.count, cancelled: v.cancelled };
    });

    // 4. RESERVATIONS BY STATUS — SQL GROUP BY
    const resByStatusRaw = await db.select({
      status: reservationsTable.status,
      count: sql<number>`count(*)::int`,
    }).from(reservationsTable)
      .where(eq(reservationsTable.tenantId, tenantId))
      .groupBy(reservationsTable.status);
    const reservationsByStatus = resByStatusRaw.map(r => ({ status: r.status, count: Number(r.count) }));

    // 5. CANCELLATION RATES (computed from SQL aggregates)
    const totalRes = reservationsByStatus.reduce((a, r) => a + r.count, 0);
    const cancelledRes = reservationsByStatus.find(r => r.status === "cancelled")?.count ?? 0;
    const cancellationRate = totalRes > 0 ? Math.round((cancelledRes / totalRes) * 1000) / 10 : 0;

    const tripsByStatusRaw = await db.select({
      status: tripsTable.status,
      count: sql<number>`count(*)::int`,
    }).from(tripsTable)
      .where(eq(tripsTable.tenantId, tenantId))
      .groupBy(tripsTable.status);
    const totalTripsAll = tripsByStatusRaw.reduce((a, r) => a + Number(r.count), 0);
    const cancelledTripsCount = Number(tripsByStatusRaw.find(r => r.status === "cancelled")?.count ?? 0);
    const tripCancellationRate = totalTripsAll > 0 ? Math.round((cancelledTripsCount / totalTripsAll) * 1000) / 10 : 0;

    // 6. AVG RESERVATIONS PER ACTIVE TRIP
    const [activeTripsCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), eq(tripsTable.status, "active")));
    const confirmedResCount = reservationsByStatus.find(r => r.status === "confirmed")?.count ?? 0;
    const activeCount = Number(activeTripsCount?.count ?? 0);
    const avgReservationsPerTrip = activeCount > 0 ? Math.round((confirmedResCount / activeCount) * 10) / 10 : 0;

    // 7. ORIGIN BREAKDOWN — SQL GROUP BY
    const originBreakdownRaw = await db.select({
      name: sql<string>`COALESCE(${clientsTable.origin}, 'Outros')`,
      count: sql<number>`count(*)::int`,
    }).from(clientsTable)
      .where(eq(clientsTable.tenantId, tenantId))
      .groupBy(sql`COALESCE(${clientsTable.origin}, 'Outros')`)
      .orderBy(desc(sql`count(*)`))
      .limit(8);
    const originBreakdown = originBreakdownRaw.map(r => ({ name: r.name, count: Number(r.count) }));

    // 8. REVENUE & EXPENSES BY MONTH — SQL GROUP BY
    const revenueExpRaw = await db.select({
      monthStart: sql<string>`date_trunc('month', ${paymentsTable.paidAt})::text`,
      revenue: sql<string>`sum(case when ${paymentsTable.type} = 'receivable' and ${paymentsTable.status} = 'paid' then cast(${paymentsTable.amount} as numeric) else 0 end)`,
      expenses: sql<string>`sum(case when ${paymentsTable.type} = 'payable' and ${paymentsTable.status} = 'paid' then cast(${paymentsTable.amount} as numeric) else 0 end)`,
    }).from(paymentsTable)
      .where(and(
        eq(paymentsTable.tenantId, tenantId),
        sql`${paymentsTable.paidAt} IS NOT NULL`,
        gte(paymentsTable.paidAt, since),
      ))
      .groupBy(sql`date_trunc('month', ${paymentsTable.paidAt})`)
      .orderBy(sql`date_trunc('month', ${paymentsTable.paidAt})`);
    const revenueExpMap = new Map(revenueExpRaw.map(r => [
      r.monthStart.substring(0, 7),
      { revenue: Math.round(Number(r.revenue ?? 0)), expenses: Math.round(Number(r.expenses ?? 0)) },
    ]));
    const revenueByMonth = months12.map(({ key, label }) => ({ label, value: revenueExpMap.get(key)?.revenue ?? 0 }));
    const expensesByMonth = months12.map(({ key, label }) => ({ label, value: revenueExpMap.get(key)?.expenses ?? 0 }));

    // 9. PASSENGERS BY MONTH — SQL GROUP BY
    const passByMonthRaw = await db.select({
      monthStart: sql<string>`date_trunc('month', ${passengersTable.checkedInAt})::text`,
      count: sql<number>`count(*)::int`,
    }).from(passengersTable)
      .innerJoin(reservationsTable, eq(passengersTable.reservationId, reservationsTable.id))
      .where(and(
        eq(reservationsTable.tenantId, tenantId),
        sql`${passengersTable.checkedInAt} IS NOT NULL`,
        gte(passengersTable.checkedInAt, since),
      ))
      .groupBy(sql`date_trunc('month', ${passengersTable.checkedInAt})`)
      .orderBy(sql`date_trunc('month', ${passengersTable.checkedInAt})`);
    const passByMonthMap = new Map(passByMonthRaw.map(r => [r.monthStart.substring(0, 7), Number(r.count)]));
    const passengersByMonth = months12.map(({ key, label }) => ({ label, count: passByMonthMap.get(key) ?? 0 }));

    // 10. TOP BOARDING POINTS — SQL GROUP BY + name resolution from JSON
    const boardingCountRaw = await db.execute(sql`
      SELECT p.boarding_location_id, count(*)::int as count
      FROM passengers p
      JOIN reservations r ON p.reservation_id = r.id
      WHERE r.tenant_id = ${tenantId} AND p.boarding_location_id IS NOT NULL
      GROUP BY p.boarding_location_id
      ORDER BY count DESC
      LIMIT 10
    `);
    const tripsWithBoarding = await db.select({ boardingPoints: tripsTable.boardingPoints })
      .from(tripsTable).where(eq(tripsTable.tenantId, tenantId));
    const boardingNameMap: Record<string, string> = {};
    for (const t of tripsWithBoarding) {
      for (const bp of (t.boardingPoints ?? [])) {
        if (bp.id && bp.name) boardingNameMap[bp.id] = bp.name;
      }
    }
    const topBoardingPoints = (boardingCountRaw.rows as Array<{ boarding_location_id: string; count: number }>)
      .map(r => ({ name: boardingNameMap[r.boarding_location_id] ?? r.boarding_location_id, count: Number(r.count) }));

    // 11. AVG TICKET BY MONTH — SQL GROUP BY
    const avgTicketRaw = await db.select({
      monthStart: sql<string>`date_trunc('month', ${reservationsTable.createdAt})::text`,
      value: sql<string>`avg(cast(${reservationsTable.totalValue} as numeric))`,
    }).from(reservationsTable)
      .where(and(
        eq(reservationsTable.tenantId, tenantId),
        eq(reservationsTable.status, "confirmed"),
        gte(reservationsTable.createdAt, since),
      ))
      .groupBy(sql`date_trunc('month', ${reservationsTable.createdAt})`)
      .orderBy(sql`date_trunc('month', ${reservationsTable.createdAt})`);
    const avgTicketMap = new Map(avgTicketRaw.map(r => [r.monthStart.substring(0, 7), Math.round(Number(r.value ?? 0))]));
    const avgTicketByMonth = months12.map(({ key, label }) => ({ label, value: avgTicketMap.get(key) ?? 0 }));

    res.json({
      topDestinations,
      tripsByMonth,
      reservationsByMonth,
      reservationsByStatus,
      cancellationRate,
      tripCancellationRate,
      avgReservationsPerTrip,
      passengersByMonth,
      topBoardingPoints,
      avgTicketByMonth,
      originBreakdown,
      revenueByMonth,
      expensesByMonth,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching dashboard charts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/funnel", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (me.role === "cliente" || me.role === "vendedor") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const tenantId = me.tenantId;

    const allClients = await db.select({ id: clientsTable.id, origin: clientsTable.origin })
      .from(clientsTable).where(eq(clientsTable.tenantId, tenantId));

    const allReservations = await db.select({ clientId: reservationsTable.clientId, status: reservationsTable.status })
      .from(reservationsTable).where(eq(reservationsTable.tenantId, tenantId));

    const clientPaidPayments = await db.select({ clientId: paymentsTable.clientId, amount: paymentsTable.amount })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.tenantId, tenantId), eq(paymentsTable.status, "paid"), eq(paymentsTable.type, "receivable")));

    const paidClientIds = new Set(clientPaidPayments.map(p => p.clientId).filter(Boolean) as string[]);
    const clientPaidAmount: Record<string, number> = {};
    for (const p of clientPaidPayments) {
      if (p.clientId) clientPaidAmount[p.clientId] = (clientPaidAmount[p.clientId] ?? 0) + Number(p.amount);
    }

    const clientsWithReservation = new Set(allReservations.map(r => r.clientId));
    const clientsWithConfirmed = new Set(allReservations.filter(r => r.status === "confirmed").map(r => r.clientId));

    const totalLeads = allClients.length;
    const withReservation = allClients.filter(c => clientsWithReservation.has(c.id)).length;
    const withConfirmed = allClients.filter(c => clientsWithConfirmed.has(c.id)).length;
    const withPayment = allClients.filter(c => paidClientIds.has(c.id)).length;
    const conversionRate = totalLeads > 0 ? Math.round((withPayment / totalLeads) * 1000) / 10 : 0;

    // By origin with conversion percentages and avg ticket
    const originMap: Record<string, { totalLeads: number; withReservation: number; withConfirmed: number; withPayment: number }> = {};
    for (const c of allClients) {
      const origin = c.origin ?? "Outros";
      if (!originMap[origin]) originMap[origin] = { totalLeads: 0, withReservation: 0, withConfirmed: 0, withPayment: 0 };
      originMap[origin].totalLeads++;
      if (clientsWithReservation.has(c.id)) originMap[origin].withReservation++;
      if (clientsWithConfirmed.has(c.id)) originMap[origin].withConfirmed++;
      if (paidClientIds.has(c.id)) originMap[origin].withPayment++;
    }

    const byOrigin = Object.entries(originMap)
      .sort((a, b) => b[1].totalLeads - a[1].totalLeads)
      .slice(0, 8)
      .map(([origin, data]) => {
        const originClients = allClients.filter(c => (c.origin ?? "Outros") === origin);
        const payersForOrigin = originClients.filter(c => paidClientIds.has(c.id));
        const totalPaid = payersForOrigin.reduce((a, c) => a + (clientPaidAmount[c.id] ?? 0), 0);
        const avgTicket = payersForOrigin.length > 0 ? Math.round((totalPaid / payersForOrigin.length) * 100) / 100 : 0;
        const conversionPct = data.totalLeads > 0 ? Math.round((data.withPayment / data.totalLeads) * 1000) / 10 : 0;
        return { origin, ...data, avgTicket, conversionPct };
      });

    res.json({ totalLeads, withReservation, withConfirmed, withPayment, conversionRate, byOrigin });
  } catch (err) {
    req.log.error({ err }, "Error fetching dashboard funnel");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/upcoming-trips", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const now = new Date();

    let trips;

    if (me.role === "cliente") {
      const [clientRecord] = await db.select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, me.tenantId), eq(clientsTable.userId, me.id)))
        .limit(1);

      if (!clientRecord) {
        res.json([]);
        return;
      }

      const reservations = await db.select({ tripId: reservationsTable.tripId })
        .from(reservationsTable)
        .where(and(
          eq(reservationsTable.tenantId, me.tenantId),
          eq(reservationsTable.clientId, clientRecord.id),
        ));

      const tripIds = reservations.map(r => r.tripId).filter(Boolean) as string[];
      if (tripIds.length === 0) {
        res.json([]);
        return;
      }

      trips = await db.select().from(tripsTable)
        .where(and(
          eq(tripsTable.tenantId, me.tenantId),
          gte(tripsTable.departureDate, now),
          inArray(tripsTable.id, tripIds),
        ))
        .orderBy(tripsTable.departureDate).limit(5);
    } else {
      trips = await db.select().from(tripsTable)
        .where(and(eq(tripsTable.tenantId, me.tenantId), gte(tripsTable.departureDate, now)))
        .orderBy(tripsTable.departureDate).limit(5);
    }

    res.json(trips.map(t => ({
      id: t.id, name: t.name, destination: t.destination,
      departureDate: t.departureDate.toISOString(),
      availableSeats: t.availableSeats, totalCapacity: t.totalCapacity,
      status: t.status, coverImage: t.coverImage,
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching upcoming trips");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (me.role === "cliente") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    let clientCondition = eq(clientsTable.tenantId, me.tenantId);
    let reservationCondition = eq(reservationsTable.tenantId, me.tenantId);

    if (me.role === "vendedor") {
      const sellerClients = await db.select({ id: clientsTable.id }).from(clientsTable)
        .where(and(eq(clientsTable.tenantId, me.tenantId), eq(clientsTable.createdById, me.id)));
      const sellerClientIds = sellerClients.map(c => c.id);
      if (sellerClientIds.length > 0) {
        clientCondition = and(eq(clientsTable.tenantId, me.tenantId), inArray(clientsTable.id, sellerClientIds))!;
        reservationCondition = and(eq(reservationsTable.tenantId, me.tenantId), inArray(reservationsTable.clientId, sellerClientIds))!;
      } else {
        res.json([]);
        return;
      }
    }

    const recentClients = await db.select().from(clientsTable)
      .where(clientCondition).orderBy(desc(clientsTable.createdAt)).limit(3);
    const recentReservations = await db.select().from(reservationsTable)
      .where(reservationCondition).orderBy(desc(reservationsTable.createdAt)).limit(3);
    const recentTrips = me.role === "vendedor" ? [] : await db.select().from(tripsTable)
      .where(eq(tripsTable.tenantId, me.tenantId)).orderBy(desc(tripsTable.createdAt)).limit(2);

    const activities = [
      ...recentClients.map(c => ({
        id: `client-${c.id}`, type: "client_created",
        description: `Novo cliente cadastrado: ${c.name}`,
        createdAt: c.createdAt.toISOString(), entityId: c.id, entityType: "client",
      })),
      ...recentReservations.map(r => ({
        id: `reservation-${r.id}`, type: "reservation_created",
        description: `Nova reserva criada (${r.voucherCode})`,
        createdAt: r.createdAt.toISOString(), entityId: r.id, entityType: "reservation",
      })),
      ...recentTrips.map(t => ({
        id: `trip-${t.id}`, type: "trip_created",
        description: `Viagem criada: ${t.name}`,
        createdAt: t.createdAt.toISOString(), entityId: t.id, entityType: "trip",
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);

    res.json(activities);
  } catch (err) {
    req.log.error({ err }, "Error fetching recent activity");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
