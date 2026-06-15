import { Router } from "express";
import { db } from "@workspace/db";
import {
  clientsTable,
  tripsTable,
  reservationsTable,
  paymentsTable,
  dealsTable,
  npsResponsesTable,
  expensesTable,
  loyaltyMembersTable,
  commissionsTable,
  destinationsTable,
  suppliersTable,
} from "@workspace/db";
import { eq, and, gte, lte, lt, gt, sql, count, sum } from "drizzle-orm";
import { requireAuth } from "../lib/tenant";
import {
  ROLES,
  RESERVATION_STATUS,
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  DEAL_STATUS,
  TRIP_STATUS,
} from "@workspace/permissions";

const router = Router();

function getPeriodRange(period: string): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const now = new Date();
  let start: Date;
  let end: Date;
  let prevStart: Date;
  let prevEnd: Date;

  if (period === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (period === "quarter") {
    const qStartMonth = now.getMonth() - 2;
    start = new Date(now.getFullYear(), qStartMonth, 1);
    end = now;
    prevStart = new Date(now.getFullYear(), qStartMonth - 3, 1);
    prevEnd = new Date(now.getFullYear(), qStartMonth, 0, 23, 59, 59, 999);
  } else {
    // year
    start = new Date(now.getFullYear(), 0, 1);
    end = now;
    prevStart = new Date(now.getFullYear() - 1, 0, 1);
    prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
  }

  return { start, end, prevStart, prevEnd };
}

async function sumPayments(tenantId: string, type: string, status: string, from: Date, to: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.tenantId, tenantId),
        eq(paymentsTable.type, type),
        eq(paymentsTable.status, status),
        gte(paymentsTable.paidAt, from),
        lte(paymentsTable.paidAt, to),
      ),
    );
  return Number(row?.total ?? 0);
}

async function countTable(
  table: typeof clientsTable | typeof reservationsTable | typeof dealsTable | typeof loyaltyMembersTable | typeof suppliersTable,
  tenantId: string,
  from: Date,
  to: Date,
  extra?: Parameters<typeof and>[0],
): Promise<number> {
  const conditions: Parameters<typeof and> = [
    eq((table as typeof clientsTable).tenantId, tenantId),
    gte((table as typeof clientsTable).createdAt, from),
    lte((table as typeof clientsTable).createdAt, to),
  ];
  if (extra) conditions.push(extra);
  const [row] = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(table as typeof clientsTable)
    .where(and(...conditions));
  return Number(row?.cnt ?? 0);
}

router.get("/insights/summary", async (req, res): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (me.role === ROLES.SALES || me.role === ROLES.CLIENT) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const tenantId = me.tenantId;
    const period = (req.query.period as string) || "month";
    const { start, end, prevStart, prevEnd } = getPeriodRange(period);

    // ─── REVENUE helpers ───────────────────────────────────────────────
    const [revCurr] = await db
      .select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` })
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.tenantId, tenantId),
          eq(paymentsTable.type, PAYMENT_TYPE.RECEIVABLE),
          eq(paymentsTable.status, PAYMENT_STATUS.PAID),
          gte(paymentsTable.paidAt, start),
          lte(paymentsTable.paidAt, end),
        ),
      );
    const [revPrev] = await db
      .select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` })
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.tenantId, tenantId),
          eq(paymentsTable.type, PAYMENT_TYPE.RECEIVABLE),
          eq(paymentsTable.status, PAYMENT_STATUS.PAID),
          gte(paymentsTable.paidAt, prevStart),
          lte(paymentsTable.paidAt, prevEnd),
        ),
      );

    const totalRevenue = Number(revCurr?.total ?? 0);
    const totalRevenuePrev = Number(revPrev?.total ?? 0);

    // ─── EXPENSES helpers ──────────────────────────────────────────────
    const [expCurr] = await db
      .select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` })
      .from(expensesTable)
      .where(
        and(
          eq(expensesTable.tenantId, tenantId),
          gte(expensesTable.createdAt, start),
          lte(expensesTable.createdAt, end),
        ),
      );
    const [expPrev] = await db
      .select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` })
      .from(expensesTable)
      .where(
        and(
          eq(expensesTable.tenantId, tenantId),
          gte(expensesTable.createdAt, prevStart),
          lte(expensesTable.createdAt, prevEnd),
        ),
      );

    const totalExpenses = Number(expCurr?.total ?? 0);
    const totalExpensesPrev = Number(expPrev?.total ?? 0);
    const netProfit = totalRevenue - totalExpenses;
    const netProfitPrev = totalRevenuePrev - totalExpensesPrev;

    // ─── RESERVATIONS ──────────────────────────────────────────────────
    const [resCurr] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.tenantId, tenantId),
          gte(reservationsTable.createdAt, start),
          lte(reservationsTable.createdAt, end),
        ),
      );
    const [resPrev] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.tenantId, tenantId),
          gte(reservationsTable.createdAt, prevStart),
          lte(reservationsTable.createdAt, prevEnd),
        ),
      );
    const [resConfirmedCurr] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.tenantId, tenantId),
          eq(reservationsTable.status, RESERVATION_STATUS.CONFIRMED),
          gte(reservationsTable.createdAt, start),
          lte(reservationsTable.createdAt, end),
        ),
      );
    const [resConfirmedPrev] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.tenantId, tenantId),
          eq(reservationsTable.status, RESERVATION_STATUS.CONFIRMED),
          gte(reservationsTable.createdAt, prevStart),
          lte(reservationsTable.createdAt, prevEnd),
        ),
      );
    const [resCancelledCurr] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.tenantId, tenantId),
          eq(reservationsTable.status, RESERVATION_STATUS.CANCELLED),
          gte(reservationsTable.createdAt, start),
          lte(reservationsTable.createdAt, end),
        ),
      );
    const [resCancelledPrev] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.tenantId, tenantId),
          eq(reservationsTable.status, RESERVATION_STATUS.CANCELLED),
          gte(reservationsTable.createdAt, prevStart),
          lte(reservationsTable.createdAt, prevEnd),
        ),
      );

    const newReservations = Number(resCurr?.cnt ?? 0);
    const newReservationsPrev = Number(resPrev?.cnt ?? 0);
    const confirmedReservations = Number(resConfirmedCurr?.cnt ?? 0);
    const confirmedReservationsPrev = Number(resConfirmedPrev?.cnt ?? 0);
    const cancellations = Number(resCancelledCurr?.cnt ?? 0);
    const cancellationsPrev = Number(resCancelledPrev?.cnt ?? 0);

    // ─── CLIENTS ───────────────────────────────────────────────────────
    const [clientsCurr] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(clientsTable)
      .where(
        and(
          eq(clientsTable.tenantId, tenantId),
          gte(clientsTable.createdAt, start),
          lte(clientsTable.createdAt, end),
        ),
      );
    const [clientsPrev] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(clientsTable)
      .where(
        and(
          eq(clientsTable.tenantId, tenantId),
          gte(clientsTable.createdAt, prevStart),
          lte(clientsTable.createdAt, prevEnd),
        ),
      );
    const [clientsTotal] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(clientsTable)
      .where(eq(clientsTable.tenantId, tenantId));

    const newClients = Number(clientsCurr?.cnt ?? 0);
    const newClientsPrev = Number(clientsPrev?.cnt ?? 0);
    const totalClients = Number(clientsTotal?.cnt ?? 0);

    // Repeat clients: those who have more than 1 reservation in the period
    const [repeatCurr] = await db
      .select({ cnt: sql<number>`count(distinct client_id)` })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.tenantId, tenantId),
          gte(reservationsTable.createdAt, start),
          lte(reservationsTable.createdAt, end),
        ),
      );
    const [repeatPrev] = await db
      .select({ cnt: sql<number>`count(distinct client_id)` })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.tenantId, tenantId),
          gte(reservationsTable.createdAt, prevStart),
          lte(reservationsTable.createdAt, prevEnd),
        ),
      );

    // ─── DEALS ─────────────────────────────────────────────────────────
    const [openDealsCurr] = await db
      .select({ cnt: sql<number>`count(*)`, val: sql<number>`coalesce(sum(cast(value as numeric)), 0)` })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.tenantId, tenantId),
          eq(dealsTable.status, DEAL_STATUS.OPEN),
          gte(dealsTable.createdAt, start),
          lte(dealsTable.createdAt, end),
        ),
      );
    const [openDealsPrev] = await db
      .select({ cnt: sql<number>`count(*)`, val: sql<number>`coalesce(sum(cast(value as numeric)), 0)` })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.tenantId, tenantId),
          eq(dealsTable.status, DEAL_STATUS.OPEN),
          gte(dealsTable.createdAt, prevStart),
          lte(dealsTable.createdAt, prevEnd),
        ),
      );
    const [wonDealsCurr] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.tenantId, tenantId),
          eq(dealsTable.status, DEAL_STATUS.WON),
          gte(dealsTable.createdAt, start),
          lte(dealsTable.createdAt, end),
        ),
      );
    const [wonDealsPrev] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.tenantId, tenantId),
          eq(dealsTable.status, DEAL_STATUS.WON),
          gte(dealsTable.createdAt, prevStart),
          lte(dealsTable.createdAt, prevEnd),
        ),
      );

    const openDeals = Number(openDealsCurr?.cnt ?? 0);
    const openDealsPrevCount = Number(openDealsPrev?.cnt ?? 0);
    const wonDeals = Number(wonDealsCurr?.cnt ?? 0);
    const wonDealsPrevCount = Number(wonDealsPrev?.cnt ?? 0);
    const pipelineValue = Number(openDealsCurr?.val ?? 0);
    const pipelineValuePrev = Number(openDealsPrev?.val ?? 0);

    // Conversion: won / (open + won)
    const totalLeads = openDeals + wonDeals + newReservations;
    const totalLeadsPrev = openDealsPrevCount + wonDealsPrevCount + newReservationsPrev;
    const conversionRate = totalLeads > 0 ? (confirmedReservations / totalLeads) * 100 : 0;
    const conversionRatePrev = totalLeadsPrev > 0 ? (confirmedReservationsPrev / totalLeadsPrev) * 100 : 0;

    // Avg ticket
    const avgTicket = confirmedReservations > 0 ? totalRevenue / confirmedReservations : 0;
    const avgTicketPrev = confirmedReservationsPrev > 0 ? totalRevenuePrev / confirmedReservationsPrev : 0;

    // ─── TRIPS ─────────────────────────────────────────────────────────
    const [activeTripsCurr] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(tripsTable)
      .where(
        and(
          eq(tripsTable.tenantId, tenantId),
          eq(tripsTable.status, TRIP_STATUS.PUBLISHED),
        ),
      );
    const [newTripsCurr] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(tripsTable)
      .where(
        and(
          eq(tripsTable.tenantId, tenantId),
          gte(tripsTable.createdAt, start),
          lte(tripsTable.createdAt, end),
        ),
      );
    const [newTripsPrev] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(tripsTable)
      .where(
        and(
          eq(tripsTable.tenantId, tenantId),
          gte(tripsTable.createdAt, prevStart),
          lte(tripsTable.createdAt, prevEnd),
        ),
      );

    // Occupancy rate from active trips
    const activeTripsData = await db
      .select({
        totalCapacity: tripsTable.totalCapacity,
        availableSeats: tripsTable.availableSeats,
      })
      .from(tripsTable)
      .where(
        and(
          eq(tripsTable.tenantId, tenantId),
          eq(tripsTable.status, TRIP_STATUS.PUBLISHED),
        ),
      );

    let totalCap = 0;
    let totalOcc = 0;
    for (const t of activeTripsData) {
      totalCap += Number(t.totalCapacity ?? 0);
      totalOcc += Number(t.totalCapacity ?? 0) - Number(t.availableSeats ?? 0);
    }
    const occupancyRate = totalCap > 0 ? (totalOcc / totalCap) * 100 : 0;

    const activeTrips = Number(activeTripsCurr?.cnt ?? 0);
    const newTrips = Number(newTripsCurr?.cnt ?? 0);
    const newTripsPrevCount = Number(newTripsPrev?.cnt ?? 0);
    const revenuePerTrip = activeTrips > 0 ? totalRevenue / activeTrips : 0;
    const revenuePerTripPrev = newTripsPrevCount > 0 ? totalRevenuePrev / (Number(activeTripsCurr?.cnt ?? 1)) : 0;
    const avgReservationsPerTrip = activeTrips > 0 ? newReservations / activeTrips : 0;
    const avgReservationsPerTripPrev = newTripsPrevCount > 0 ? newReservationsPrev / newTripsPrevCount : 0;

    // ─── NPS ───────────────────────────────────────────────────────────
    const [npsCurr] = await db
      .select({ avg: sql<number>`avg(score)`, cnt: sql<number>`count(*)` })
      .from(npsResponsesTable)
      .where(
        and(
          eq(npsResponsesTable.tenantId, tenantId),
          gte(npsResponsesTable.createdAt, start),
          lte(npsResponsesTable.createdAt, end),
        ),
      );
    const [npsPrev] = await db
      .select({ avg: sql<number>`avg(score)` })
      .from(npsResponsesTable)
      .where(
        and(
          eq(npsResponsesTable.tenantId, tenantId),
          gte(npsResponsesTable.createdAt, prevStart),
          lte(npsResponsesTable.createdAt, prevEnd),
        ),
      );

    const averageNps = npsCurr?.cnt && Number(npsCurr.cnt) > 0 ? Number(npsCurr.avg) : null;
    const averageNpsPrev = npsPrev?.avg != null ? Number(npsPrev.avg) : null;

    // ─── LOYALTY ───────────────────────────────────────────────────────
    const [loyaltyCurr] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(loyaltyMembersTable)
      .where(
        and(
          eq(loyaltyMembersTable.tenantId, tenantId),
          gte(loyaltyMembersTable.joinedAt, start),
          lte(loyaltyMembersTable.joinedAt, end),
        ),
      );
    const [loyaltyPrev] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(loyaltyMembersTable)
      .where(
        and(
          eq(loyaltyMembersTable.tenantId, tenantId),
          gte(loyaltyMembersTable.joinedAt, prevStart),
          lte(loyaltyMembersTable.joinedAt, prevEnd),
        ),
      );
    const [loyaltyTotal] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(loyaltyMembersTable)
      .where(eq(loyaltyMembersTable.tenantId, tenantId));

    const loyaltyNewMembers = Number(loyaltyCurr?.cnt ?? 0);
    const loyaltyNewMembersPrev = Number(loyaltyPrev?.cnt ?? 0);
    const loyaltyMembers = Number(loyaltyTotal?.cnt ?? 0);

    // Retention rate: clients with >1 reservation out of total clients who reserved
    const retentionRate = totalClients > 0 ? ((Number(repeatCurr?.cnt ?? 0)) / Math.max(totalClients, 1)) * 100 : 0;
    const retentionRatePrev = totalClients > 0 ? ((Number(repeatPrev?.cnt ?? 0)) / Math.max(totalClients, 1)) * 100 : 0;

    // ─── SUPPLIERS ─────────────────────────────────────────────────────
    const [suppliersCurr] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(suppliersTable)
      .where(
        and(
          eq(suppliersTable.tenantId, tenantId),
          gte(suppliersTable.createdAt, start),
          lte(suppliersTable.createdAt, end),
        ),
      );
    const [suppliersPrev] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(suppliersTable)
      .where(
        and(
          eq(suppliersTable.tenantId, tenantId),
          gte(suppliersTable.createdAt, prevStart),
          lte(suppliersTable.createdAt, prevEnd),
        ),
      );
    const [suppliersTotal] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(suppliersTable)
      .where(eq(suppliersTable.tenantId, tenantId));

    const newSuppliers = Number(suppliersCurr?.cnt ?? 0);
    const newSuppliersPrev = Number(suppliersPrev?.cnt ?? 0);
    const totalSuppliers = Number(suppliersTotal?.cnt ?? 0);

    // Top destinations (from trips created in period)
    const destRows = await db
      .select({
        destination: tripsTable.destination,
        cnt: sql<number>`count(*)`,
      })
      .from(tripsTable)
      .where(
        and(
          eq(tripsTable.tenantId, tenantId),
          gte(tripsTable.createdAt, start),
          lte(tripsTable.createdAt, end),
        ),
      )
      .groupBy(tripsTable.destination)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    const topDestinations = destRows.map((r) => ({ name: r.destination, count: Number(r.cnt) }));

    // ─── CAMPAIGNS ─────────────────────────────────────────────────────
    // We count based on what's available: referrals for marketing
    const [referralsCurr] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(commissionsTable)
      .where(
        and(
          eq(commissionsTable.tenantId, tenantId),
          gte(commissionsTable.createdAt, start),
          lte(commissionsTable.createdAt, end),
        ),
      );
    const [referralsPrev] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(commissionsTable)
      .where(
        and(
          eq(commissionsTable.tenantId, tenantId),
          gte(commissionsTable.createdAt, prevStart),
          lte(commissionsTable.createdAt, prevEnd),
        ),
      );

    // Profit margin
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const profitMarginPrev = totalRevenuePrev > 0 ? (netProfitPrev / totalRevenuePrev) * 100 : 0;

    // Receivable / payable (current state, not period-scoped)
    const [receivable] = await db
      .select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` })
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.tenantId, tenantId),
          eq(paymentsTable.type, PAYMENT_TYPE.RECEIVABLE),
          eq(paymentsTable.status, PAYMENT_STATUS.PENDING),
        ),
      );
    const [payable] = await db
      .select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` })
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.tenantId, tenantId),
          eq(paymentsTable.type, PAYMENT_TYPE.PAYABLE),
          eq(paymentsTable.status, PAYMENT_STATUS.PENDING),
        ),
      );
    const now = new Date();
    const [overdue] = await db
      .select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` })
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.tenantId, tenantId),
          eq(paymentsTable.type, PAYMENT_TYPE.RECEIVABLE),
          eq(paymentsTable.status, PAYMENT_STATUS.PENDING),
          lt(paymentsTable.dueDate, now),
        ),
      );

    res.json({
      period,
      executive: {
        totalRevenue,
        totalRevenuePrev,
        netProfit,
        netProfitPrev,
        totalClients,
        newClients,
        newClientsPrev,
        confirmedReservations,
        confirmedReservationsPrev,
        occupancyRate: Math.round(occupancyRate * 10) / 10,
        occupancyRatePrev: 0,
        conversionRate: Math.round(conversionRate * 10) / 10,
        conversionRatePrev: Math.round(conversionRatePrev * 10) / 10,
        averageNps,
        averageNpsPrev,
        activeTrips,
        profitMargin: Math.round(profitMargin * 10) / 10,
        profitMarginPrev: Math.round(profitMarginPrev * 10) / 10,
      },
      commercial: {
        openDeals,
        openDealsPrev: openDealsPrevCount,
        wonDeals,
        wonDealsPrev: wonDealsPrevCount,
        pipelineValue,
        pipelineValuePrev,
        avgTicket: Math.round(avgTicket * 100) / 100,
        avgTicketPrev: Math.round(avgTicketPrev * 100) / 100,
        newReservations,
        newReservationsPrev,
        cancellations,
        cancellationsPrev,
        conversionRate: Math.round(conversionRate * 10) / 10,
        conversionRatePrev: Math.round(conversionRatePrev * 10) / 10,
        totalLeads,
        totalLeadsPrev,
      },
      marketing: {
        newClients,
        newClientsPrev,
        referrals: Number(referralsCurr?.cnt ?? 0),
        referralsPrev: Number(referralsPrev?.cnt ?? 0),
        totalLeads,
        totalLeadsPrev,
        conversionRate: Math.round(conversionRate * 10) / 10,
        conversionRatePrev: Math.round(conversionRatePrev * 10) / 10,
      },
      financial: {
        totalRevenue,
        totalRevenuePrev,
        totalExpenses,
        totalExpensesPrev,
        netProfit,
        netProfitPrev,
        profitMargin: Math.round(profitMargin * 10) / 10,
        profitMarginPrev: Math.round(profitMarginPrev * 10) / 10,
        receivable: Number(receivable?.total ?? 0),
        payable: Number(payable?.total ?? 0),
        overdue: Number(overdue?.total ?? 0),
        avgTicket: Math.round(avgTicket * 100) / 100,
        avgTicketPrev: Math.round(avgTicketPrev * 100) / 100,
      },
      operational: {
        activeTrips,
        newTrips,
        newTripsPrev: newTripsPrevCount,
        occupancyRate: Math.round(occupancyRate * 10) / 10,
        avgReservationsPerTrip: Math.round(avgReservationsPerTrip * 10) / 10,
        avgReservationsPerTripPrev: Math.round(avgReservationsPerTripPrev * 10) / 10,
        confirmedReservations,
        confirmedReservationsPrev,
        cancellations,
        cancellationsPrev,
        revenuePerTrip: Math.round(revenuePerTrip * 100) / 100,
        revenuePerTripPrev: Math.round(revenuePerTripPrev * 100) / 100,
        totalSuppliers,
        newSuppliers,
        newSuppliersPrev,
      },
      retention: {
        loyaltyMembers,
        loyaltyNewMembers,
        loyaltyNewMembersPrev,
        averageNps,
        averageNpsPrev,
        retentionRate: Math.round(retentionRate * 10) / 10,
        retentionRatePrev: Math.round(retentionRatePrev * 10) / 10,
        newClients,
        newClientsPrev,
        repeatClients: Number(repeatCurr?.cnt ?? 0),
        repeatClientsPrev: Number(repeatPrev?.cnt ?? 0),
        totalClients,
      },
      expansion: {
        newTrips,
        newTripsPrev: newTripsPrevCount,
        newSuppliers,
        newSuppliersPrev,
        totalSuppliers,
        revenuePerTrip: Math.round(revenuePerTrip * 100) / 100,
        revenuePerTripPrev: Math.round(revenuePerTripPrev * 100) / 100,
        topDestinations,
        avgTicket: Math.round(avgTicket * 100) / 100,
        avgTicketPrev: Math.round(avgTicketPrev * 100) / 100,
        totalRevenue,
        totalRevenuePrev,
      },
    });
  } catch (err) {
    console.error("[insights/summary]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
