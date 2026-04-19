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

    if (me.role === "cliente") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const tenantId = me.tenantId;
    const now = new Date();

    // Top destinations (by CONFIRMED reservation count, top 10)
    const allTrips = await db.select({ id: tripsTable.id, destination: tripsTable.destination, destinationCity: tripsTable.destinationCity })
      .from(tripsTable).where(eq(tripsTable.tenantId, tenantId));

    const allReservations = await db.select({ tripId: reservationsTable.tripId, status: reservationsTable.status, totalValue: reservationsTable.totalValue, createdAt: reservationsTable.createdAt })
      .from(reservationsTable).where(eq(reservationsTable.tenantId, tenantId));

    const tripMap = new Map(allTrips.map(t => [t.id, t]));
    const destCount: Record<string, number> = {};
    for (const r of allReservations) {
      if (r.status !== "confirmed") continue; // only confirmed reservations
      const trip = tripMap.get(r.tripId);
      if (trip) {
        const key = trip.destinationCity || trip.destination;
        destCount[key] = (destCount[key] ?? 0) + 1;
      }
    }
    const topDestinations = Object.entries(destCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // Monthly trips created (last 12 months)
    const allTripsAll = await db.select({ createdAt: tripsTable.createdAt, status: tripsTable.status })
      .from(tripsTable).where(eq(tripsTable.tenantId, tenantId));

    const tripsByMonth: Array<{ label: string; count: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const label = d.toLocaleString("pt-BR", { month: "short" });
      const count = allTripsAll.filter(t => t.createdAt >= d && t.createdAt <= end).length;
      tripsByMonth.push({ label, count });
    }

    // Monthly reservations (last 12 months)
    const reservationsByMonth: Array<{ label: string; count: number; cancelled: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const label = d.toLocaleString("pt-BR", { month: "short" });
      const month = allReservations.filter(r => r.createdAt >= d && r.createdAt <= end);
      const count = month.length;
      const cancelled = month.filter(r => r.status === "cancelled").length;
      reservationsByMonth.push({ label, count, cancelled });
    }

    // Reservations by status
    const statusCount: Record<string, number> = {};
    for (const r of allReservations) {
      statusCount[r.status] = (statusCount[r.status] ?? 0) + 1;
    }
    const reservationsByStatus = Object.entries(statusCount).map(([status, count]) => ({ status, count }));

    // Reservation cancellation rate
    const total = allReservations.length;
    const cancelled = allReservations.filter(r => r.status === "cancelled").length;
    const cancellationRate = total > 0 ? Math.round((cancelled / total) * 1000) / 10 : 0;

    // Trip cancellation rate (trips cancelled vs total trips)
    const totalTripsCount = allTripsAll.length;
    const cancelledTripsCount = allTripsAll.filter(t => t.status === "cancelled").length;
    const tripCancellationRate = totalTripsCount > 0 ? Math.round((cancelledTripsCount / totalTripsCount) * 1000) / 10 : 0;

    // Avg confirmed reservations per active trip
    const [activeTripsCount] = await db.select({ count: sql<number>`count(*)` })
      .from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), eq(tripsTable.status, "active")));
    const confirmedCount = allReservations.filter(r => r.status === "confirmed").length;
    const activeCount = Number(activeTripsCount?.count ?? 0);
    const avgReservationsPerTrip = activeCount > 0 ? Math.round((confirmedCount / activeCount) * 10) / 10 : 0;

    // Origin breakdown (client count by acquisition channel)
    const allClientOrigins = await db.select({ origin: clientsTable.origin })
      .from(clientsTable).where(eq(clientsTable.tenantId, tenantId));
    const originCount: Record<string, number> = {};
    for (const c of allClientOrigins) {
      const key = c.origin ?? "Outros";
      originCount[key] = (originCount[key] ?? 0) + 1;
    }
    const originBreakdown = Object.entries(originCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    // Monthly revenue and expenses (last 12 months)
    const allPaymentsForChart = await db.select({ type: paymentsTable.type, status: paymentsTable.status, amount: paymentsTable.amount, paidAt: paymentsTable.paidAt })
      .from(paymentsTable).where(eq(paymentsTable.tenantId, tenantId));
    const revenueByMonth: Array<{ label: string; value: number }> = [];
    const expensesByMonth: Array<{ label: string; value: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const label = d.toLocaleString("pt-BR", { month: "short" });
      const rev = allPaymentsForChart.filter(p => p.type === "receivable" && p.status === "paid" && p.paidAt && p.paidAt >= d && p.paidAt <= end)
        .reduce((a, p) => a + Number(p.amount), 0);
      const exp = allPaymentsForChart.filter(p => p.type === "payable" && p.status === "paid" && p.paidAt && p.paidAt >= d && p.paidAt <= end)
        .reduce((a, p) => a + Number(p.amount), 0);
      revenueByMonth.push({ label, value: Math.round(rev) });
      expensesByMonth.push({ label, value: Math.round(exp) });
    }

    // Passengers checked in per month
    const allPassengers = await db.select({ checkedInAt: passengersTable.checkedInAt, boardingLocationId: passengersTable.boardingLocationId })
      .from(passengersTable)
      .innerJoin(reservationsTable, eq(passengersTable.reservationId, reservationsTable.id))
      .where(eq(reservationsTable.tenantId, tenantId));

    const passengersByMonth: Array<{ label: string; count: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const label = d.toLocaleString("pt-BR", { month: "short" });
      const count = allPassengers.filter(p => p.checkedInAt && p.checkedInAt >= d && p.checkedInAt <= end).length;
      passengersByMonth.push({ label, count });
    }

    // Top boarding points
    const boardingCount: Record<string, number> = {};
    for (const p of allPassengers) {
      if (p.boardingLocationId) {
        boardingCount[p.boardingLocationId] = (boardingCount[p.boardingLocationId] ?? 0) + 1;
      }
    }

    // Resolve boarding point names from trips
    const tripsWithBoarding = await db.select({ boardingPoints: tripsTable.boardingPoints })
      .from(tripsTable).where(eq(tripsTable.tenantId, tenantId));
    const boardingNameMap: Record<string, string> = {};
    for (const t of tripsWithBoarding) {
      for (const bp of (t.boardingPoints ?? [])) {
        if (bp.id && bp.name) boardingNameMap[bp.id] = bp.name;
      }
    }

    const topBoardingPoints = Object.entries(boardingCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, count]) => ({ name: boardingNameMap[id] ?? id, count }));

    // Average ticket by month (confirmed reservations)
    const confirmedReservations = allReservations.filter(r => r.status === "confirmed");
    const avgTicketByMonth: Array<{ label: string; value: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const label = d.toLocaleString("pt-BR", { month: "short" });
      const month = confirmedReservations.filter(r => r.createdAt >= d && r.createdAt <= end);
      const value = month.length > 0
        ? Math.round(month.reduce((a, r) => a + Number(r.totalValue), 0) / month.length)
        : 0;
      avgTicketByMonth.push({ label, value });
    }

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
