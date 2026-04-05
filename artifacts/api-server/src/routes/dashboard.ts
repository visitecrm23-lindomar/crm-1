import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable, tripsTable, reservationsTable, paymentsTable, dealsTable, npsResponsesTable, usersTable } from "@workspace/db";
import { eq, and, gte, desc, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/tenant";

const router = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    const tenantId = me.tenantId;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

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

      let totalRevenue = 0, revenueThisMonth = 0, pendingAmount = 0;
      if (myClientIds.length > 0) {
        const payments = await db.select().from(paymentsTable)
          .where(and(eq(paymentsTable.tenantId, tenantId), inArray(paymentsTable.clientId, myClientIds)));
        for (const p of payments) {
          if (p.type === "receivable" && p.status === "paid") {
            totalRevenue += Number(p.amount);
            if (p.paidAt && p.paidAt >= startOfMonth) revenueThisMonth += Number(p.amount);
          }
          if (p.status === "pending") pendingAmount += Number(p.amount);
        }
      }

      let totalReservations = 0, confirmedReservations = 0;
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
      });
      return;
    }

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

    const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.tenantId, tenantId));
    let totalRevenue = 0, revenueThisMonth = 0, pendingPayments = 0;
    for (const p of payments) {
      if (p.type === "receivable" && p.status === "paid") {
        totalRevenue += Number(p.amount);
        if (p.paidAt && p.paidAt >= startOfMonth) revenueThisMonth += Number(p.amount);
      }
      if (p.status === "pending") pendingPayments += Number(p.amount);
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
      pendingPayments: Math.round(pendingPayments * 100) / 100,
      totalReservations: Number(reservationCount?.count ?? 0),
      confirmedReservations: Number(confirmedReservationCount?.count ?? 0),
      occupancyRate: Math.round(occupancyRate * 10) / 10,
      averageNps: averageNps !== null ? Math.round(averageNps * 10) / 10 : null,
      openDeals: Number(dealCount?.count ?? 0),
      dealsPipelineValue: Number(dealValue?.total ?? 0),
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

    const recentClients = await db.select().from(clientsTable)
      .where(eq(clientsTable.tenantId, me.tenantId)).orderBy(desc(clientsTable.createdAt)).limit(3);
    const recentReservations = await db.select().from(reservationsTable)
      .where(eq(reservationsTable.tenantId, me.tenantId)).orderBy(desc(reservationsTable.createdAt)).limit(3);
    const recentTrips = await db.select().from(tripsTable)
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
