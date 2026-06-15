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
  campaignsTable,
  referralsTable,
  passengersTable,
} from "@workspace/db";
import { eq, and, gte, lte, lt, sql, isNotNull } from "drizzle-orm";
import { requireAuth } from "../lib/tenant";
import {
  ROLES,
  RESERVATION_STATUS,
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  DEAL_STATUS,
  TRIP_STATUS,
  REFERRAL_STATUS,
} from "@workspace/permissions";

const router = Router();

function getPeriodRange(period: string): {
  start: Date; end: Date; prevStart: Date; prevEnd: Date;
  momStart: Date; momEnd: Date; yoyStart: Date; yoyEnd: Date;
} {
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

  // MoM: current month vs last month
  const momStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const momEnd = now;
  const momPrevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const momPrevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  // YoY: current year vs last year (same day range)
  const yoyStart = new Date(now.getFullYear(), 0, 1);
  const yoyEnd = now;
  const yoyPrevStart = new Date(now.getFullYear() - 1, 0, 1);
  const yoyPrevEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59, 999);

  return { start, end, prevStart, prevEnd, momStart: momPrevStart, momEnd: momPrevEnd, yoyStart: yoyPrevStart, yoyEnd: yoyPrevEnd };
}

async function revenueInRange(tenantId: string, from: Date, to: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.tenantId, tenantId),
        eq(paymentsTable.type, PAYMENT_TYPE.RECEIVABLE),
        eq(paymentsTable.status, PAYMENT_STATUS.PAID),
        gte(paymentsTable.paidAt, from),
        lte(paymentsTable.paidAt, to),
      ),
    );
  return Number(row?.total ?? 0);
}

async function expensesInRange(tenantId: string, from: Date, to: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` })
    .from(expensesTable)
    .where(
      and(
        eq(expensesTable.tenantId, tenantId),
        gte(expensesTable.createdAt, from),
        lte(expensesTable.createdAt, to),
      ),
    );
  return Number(row?.total ?? 0);
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
    const { start, end, prevStart, prevEnd, momStart, momEnd, yoyStart, yoyEnd } = getPeriodRange(period);
    const now = new Date();

    // ─── PARALLEL BLOCK 1: Revenue, Expenses ──────────────────────────
    const [totalRevenue, totalRevenuePrev, totalExpenses, totalExpensesPrev, momRevPrev, yoyRevPrev] = await Promise.all([
      revenueInRange(tenantId, start, end),
      revenueInRange(tenantId, prevStart, prevEnd),
      expensesInRange(tenantId, start, end),
      expensesInRange(tenantId, prevStart, prevEnd),
      revenueInRange(tenantId, momStart, momEnd),
      revenueInRange(tenantId, yoyStart, yoyEnd),
    ]);

    const netProfit = totalRevenue - totalExpenses;
    const netProfitPrev = totalRevenuePrev - totalExpensesPrev;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const profitMarginPrev = totalRevenuePrev > 0 ? (netProfitPrev / totalRevenuePrev) * 100 : 0;

    // MoM/YoY growth (revenue)
    const momGrowth = momRevPrev > 0 ? ((totalRevenue - momRevPrev) / momRevPrev) * 100 : null;
    const yoyGrowth = yoyRevPrev > 0 ? ((totalRevenue - yoyRevPrev) / yoyRevPrev) * 100 : null;

    // ─── PARALLEL BLOCK 2: Reservations ───────────────────────────────
    const [resAllCurr, resAllPrev, resConfCurr, resConfPrev, resCancCurr, resCancPrev] = await Promise.all([
      db.select({ cnt: sql<number>`count(*)` }).from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), gte(reservationsTable.createdAt, start), lte(reservationsTable.createdAt, end))),
      db.select({ cnt: sql<number>`count(*)` }).from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), gte(reservationsTable.createdAt, prevStart), lte(reservationsTable.createdAt, prevEnd))),
      db.select({ cnt: sql<number>`count(*)` }).from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), eq(reservationsTable.status, RESERVATION_STATUS.CONFIRMED), gte(reservationsTable.createdAt, start), lte(reservationsTable.createdAt, end))),
      db.select({ cnt: sql<number>`count(*)` }).from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), eq(reservationsTable.status, RESERVATION_STATUS.CONFIRMED), gte(reservationsTable.createdAt, prevStart), lte(reservationsTable.createdAt, prevEnd))),
      db.select({ cnt: sql<number>`count(*)` }).from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), eq(reservationsTable.status, RESERVATION_STATUS.CANCELLED), gte(reservationsTable.createdAt, start), lte(reservationsTable.createdAt, end))),
      db.select({ cnt: sql<number>`count(*)` }).from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), eq(reservationsTable.status, RESERVATION_STATUS.CANCELLED), gte(reservationsTable.createdAt, prevStart), lte(reservationsTable.createdAt, prevEnd))),
    ]);

    const newReservations = Number(resAllCurr[0]?.cnt ?? 0);
    const newReservationsPrev = Number(resAllPrev[0]?.cnt ?? 0);
    const confirmedReservations = Number(resConfCurr[0]?.cnt ?? 0);
    const confirmedReservationsPrev = Number(resConfPrev[0]?.cnt ?? 0);
    const cancellations = Number(resCancCurr[0]?.cnt ?? 0);
    const cancellationsPrev = Number(resCancPrev[0]?.cnt ?? 0);

    // ─── PARALLEL BLOCK 3: Clients ────────────────────────────────────
    const [clientsNewCurr, clientsNewPrev, clientsTotal] = await Promise.all([
      db.select({ cnt: sql<number>`count(*)` }).from(clientsTable).where(and(eq(clientsTable.tenantId, tenantId), gte(clientsTable.createdAt, start), lte(clientsTable.createdAt, end))),
      db.select({ cnt: sql<number>`count(*)` }).from(clientsTable).where(and(eq(clientsTable.tenantId, tenantId), gte(clientsTable.createdAt, prevStart), lte(clientsTable.createdAt, prevEnd))),
      db.select({ cnt: sql<number>`count(*)` }).from(clientsTable).where(eq(clientsTable.tenantId, tenantId)),
    ]);

    const newClients = Number(clientsNewCurr[0]?.cnt ?? 0);
    const newClientsPrev = Number(clientsNewPrev[0]?.cnt ?? 0);
    const totalClients = Number(clientsTotal[0]?.cnt ?? 0);

    // Repeat clients: clients with >= 2 reservations in the period
    const repeatSubqueryCurr = db
      .select({ clientId: reservationsTable.clientId })
      .from(reservationsTable)
      .where(and(eq(reservationsTable.tenantId, tenantId), gte(reservationsTable.createdAt, start), lte(reservationsTable.createdAt, end)))
      .groupBy(reservationsTable.clientId)
      .having(sql`count(*) >= 2`)
      .as("repeat_subq_curr");

    const repeatSubqueryPrev = db
      .select({ clientId: reservationsTable.clientId })
      .from(reservationsTable)
      .where(and(eq(reservationsTable.tenantId, tenantId), gte(reservationsTable.createdAt, prevStart), lte(reservationsTable.createdAt, prevEnd)))
      .groupBy(reservationsTable.clientId)
      .having(sql`count(*) >= 2`)
      .as("repeat_subq_prev");

    const [repeatCurr, repeatPrev] = await Promise.all([
      db.select({ cnt: sql<number>`count(*)` }).from(repeatSubqueryCurr),
      db.select({ cnt: sql<number>`count(*)` }).from(repeatSubqueryPrev),
    ]);
    const repeatClients = Number(repeatCurr[0]?.cnt ?? 0);
    const repeatClientsPrev = Number(repeatPrev[0]?.cnt ?? 0);

    // ─── PARALLEL BLOCK 4: Deals ──────────────────────────────────────
    const [openDealsCurr, openDealsPrev, wonDealsCurr, wonDealsPrev] = await Promise.all([
      db.select({ cnt: sql<number>`count(*)`, val: sql<number>`coalesce(sum(cast(value as numeric)), 0)` }).from(dealsTable).where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.status, DEAL_STATUS.OPEN), gte(dealsTable.createdAt, start), lte(dealsTable.createdAt, end))),
      db.select({ cnt: sql<number>`count(*)`, val: sql<number>`coalesce(sum(cast(value as numeric)), 0)` }).from(dealsTable).where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.status, DEAL_STATUS.OPEN), gte(dealsTable.createdAt, prevStart), lte(dealsTable.createdAt, prevEnd))),
      db.select({ cnt: sql<number>`count(*)` }).from(dealsTable).where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.status, DEAL_STATUS.WON), gte(dealsTable.createdAt, start), lte(dealsTable.createdAt, end))),
      db.select({ cnt: sql<number>`count(*)` }).from(dealsTable).where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.status, DEAL_STATUS.WON), gte(dealsTable.createdAt, prevStart), lte(dealsTable.createdAt, prevEnd))),
    ]);

    const openDeals = Number(openDealsCurr[0]?.cnt ?? 0);
    const openDealsPrevCount = Number(openDealsPrev[0]?.cnt ?? 0);
    const wonDeals = Number(wonDealsCurr[0]?.cnt ?? 0);
    const wonDealsPrevCount = Number(wonDealsPrev[0]?.cnt ?? 0);
    const pipelineValue = Number(openDealsCurr[0]?.val ?? 0);
    const pipelineValuePrev = Number(openDealsPrev[0]?.val ?? 0);

    const totalLeads = openDeals + wonDeals + newReservations;
    const totalLeadsPrev = openDealsPrevCount + wonDealsPrevCount + newReservationsPrev;
    const conversionRate = totalLeads > 0 ? (confirmedReservations / totalLeads) * 100 : 0;
    const conversionRatePrev = totalLeadsPrev > 0 ? (confirmedReservationsPrev / totalLeadsPrev) * 100 : 0;
    const avgTicket = confirmedReservations > 0 ? totalRevenue / confirmedReservations : 0;
    const avgTicketPrev = confirmedReservationsPrev > 0 ? totalRevenuePrev / confirmedReservationsPrev : 0;

    // ─── PARALLEL BLOCK 5: Trips ──────────────────────────────────────
    const [activeTripsData, newTripsCurr, newTripsPrev] = await Promise.all([
      db.select({ totalCapacity: tripsTable.totalCapacity, availableSeats: tripsTable.availableSeats }).from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), eq(tripsTable.status, TRIP_STATUS.PUBLISHED))),
      db.select({ cnt: sql<number>`count(*)` }).from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), gte(tripsTable.createdAt, start), lte(tripsTable.createdAt, end))),
      db.select({ cnt: sql<number>`count(*)` }).from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), gte(tripsTable.createdAt, prevStart), lte(tripsTable.createdAt, prevEnd))),
    ]);

    let totalCap = 0;
    let totalOcc = 0;
    let totalAvailableSeats = 0;
    for (const t of activeTripsData) {
      totalCap += Number(t.totalCapacity ?? 0);
      totalAvailableSeats += Number(t.availableSeats ?? 0);
      totalOcc += Number(t.totalCapacity ?? 0) - Number(t.availableSeats ?? 0);
    }
    const activeTrips = activeTripsData.length;
    const occupancyRate = totalCap > 0 ? (totalOcc / totalCap) * 100 : 0;
    const newTrips = Number(newTripsCurr[0]?.cnt ?? 0);
    const newTripsPrevCount = Number(newTripsPrev[0]?.cnt ?? 0);
    const revenuePerTrip = activeTrips > 0 ? totalRevenue / activeTrips : 0;
    const avgReservationsPerTrip = activeTrips > 0 ? newReservations / activeTrips : 0;
    const avgReservationsPerTripPrev = newTripsPrevCount > 0 ? newReservationsPrev / newTripsPrevCount : 0;

    // ─── PARALLEL BLOCK 6: NPS ────────────────────────────────────────
    const [npsCurr, npsPrev, npsPromotersCurr, npsPromotersPrev] = await Promise.all([
      db.select({ avg: sql<number>`avg(score)`, cnt: sql<number>`count(*)` }).from(npsResponsesTable).where(and(eq(npsResponsesTable.tenantId, tenantId), gte(npsResponsesTable.createdAt, start), lte(npsResponsesTable.createdAt, end))),
      db.select({ avg: sql<number>`avg(score)` }).from(npsResponsesTable).where(and(eq(npsResponsesTable.tenantId, tenantId), gte(npsResponsesTable.createdAt, prevStart), lte(npsResponsesTable.createdAt, prevEnd))),
      // Promoters = NPS score >= 9
      db.select({ cnt: sql<number>`count(*)` }).from(npsResponsesTable).where(and(eq(npsResponsesTable.tenantId, tenantId), gte(npsResponsesTable.createdAt, start), lte(npsResponsesTable.createdAt, end), sql`score >= 9`)),
      db.select({ cnt: sql<number>`count(*)` }).from(npsResponsesTable).where(and(eq(npsResponsesTable.tenantId, tenantId), gte(npsResponsesTable.createdAt, prevStart), lte(npsResponsesTable.createdAt, prevEnd), sql`score >= 9`)),
    ]);

    const averageNps = npsCurr[0]?.cnt && Number(npsCurr[0].cnt) > 0 ? Number(npsCurr[0].avg) : null;
    const averageNpsPrev = npsPrev[0]?.avg != null ? Number(npsPrev[0].avg) : null;
    const promoterClients = Number(npsPromotersCurr[0]?.cnt ?? 0);
    const promoterClientsPrev = Number(npsPromotersPrev[0]?.cnt ?? 0);

    // ─── PARALLEL BLOCK 7: Loyalty ────────────────────────────────────
    const [loyaltyCurr, loyaltyPrev, loyaltyTotal, loyaltyActive] = await Promise.all([
      db.select({ cnt: sql<number>`count(*)` }).from(loyaltyMembersTable).where(and(eq(loyaltyMembersTable.tenantId, tenantId), gte(loyaltyMembersTable.joinedAt, start), lte(loyaltyMembersTable.joinedAt, end))),
      db.select({ cnt: sql<number>`count(*)` }).from(loyaltyMembersTable).where(and(eq(loyaltyMembersTable.tenantId, tenantId), gte(loyaltyMembersTable.joinedAt, prevStart), lte(loyaltyMembersTable.joinedAt, prevEnd))),
      db.select({ cnt: sql<number>`count(*)` }).from(loyaltyMembersTable).where(eq(loyaltyMembersTable.tenantId, tenantId)),
      // Active = joined and has made reservation since joining (approximate: joined in last year)
      db.select({ cnt: sql<number>`count(*)` }).from(loyaltyMembersTable).where(and(eq(loyaltyMembersTable.tenantId, tenantId), gte(loyaltyMembersTable.joinedAt, new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())))),
    ]);

    const loyaltyNewMembers = Number(loyaltyCurr[0]?.cnt ?? 0);
    const loyaltyNewMembersPrev = Number(loyaltyPrev[0]?.cnt ?? 0);
    const loyaltyMembers = Number(loyaltyTotal[0]?.cnt ?? 0);
    const loyaltyActiveMembers = Number(loyaltyActive[0]?.cnt ?? 0);

    const retentionRate = totalClients > 0 ? (repeatClients / totalClients) * 100 : 0;
    const retentionRatePrev = totalClients > 0 ? (repeatClientsPrev / totalClients) * 100 : 0;

    // ─── PARALLEL BLOCK 8: Referrals ──────────────────────────────────
    const [referralsCurr, referralsPrev, referralsConverted, referralsConvertedPrev] = await Promise.all([
      db.select({ cnt: sql<number>`count(*)` }).from(referralsTable).where(and(eq(referralsTable.tenantId, tenantId), gte(referralsTable.createdAt, start), lte(referralsTable.createdAt, end))),
      db.select({ cnt: sql<number>`count(*)` }).from(referralsTable).where(and(eq(referralsTable.tenantId, tenantId), gte(referralsTable.createdAt, prevStart), lte(referralsTable.createdAt, prevEnd))),
      db.select({ cnt: sql<number>`count(*)` }).from(referralsTable).where(and(eq(referralsTable.tenantId, tenantId), eq(referralsTable.status, REFERRAL_STATUS.CONVERTED), gte(referralsTable.createdAt, start), lte(referralsTable.createdAt, end))),
      db.select({ cnt: sql<number>`count(*)` }).from(referralsTable).where(and(eq(referralsTable.tenantId, tenantId), eq(referralsTable.status, REFERRAL_STATUS.CONVERTED), gte(referralsTable.createdAt, prevStart), lte(referralsTable.createdAt, prevEnd))),
    ]);

    const referrals = Number(referralsCurr[0]?.cnt ?? 0);
    const referralsPrevCount = Number(referralsPrev[0]?.cnt ?? 0);
    const convertedReferrals = Number(referralsConverted[0]?.cnt ?? 0);
    const convertedReferralsPrev = Number(referralsConvertedPrev[0]?.cnt ?? 0);
    const referralRate = totalClients > 0 ? (referrals / totalClients) * 100 : 0;
    const referralRatePrev = totalClients > 0 ? (referralsPrevCount / totalClients) * 100 : 0;

    // ─── PARALLEL BLOCK 9: Campaigns (Marketing) ─────────────────────
    const [campaignsActiveCurr, campaignsSentCurr, campaignsAllCurr, campaignsPrev] = await Promise.all([
      db.select({ cnt: sql<number>`count(*)` }).from(campaignsTable).where(and(eq(campaignsTable.tenantId, tenantId), eq(campaignsTable.status, "active"))),
      db.select({
        cnt: sql<number>`count(*)`,
        totalSent: sql<number>`coalesce(sum(sent_count), 0)`,
        totalDelivered: sql<number>`coalesce(sum(delivered_count), 0)`,
        totalOpened: sql<number>`coalesce(sum(opened_count), 0)`,
        totalClicked: sql<number>`coalesce(sum(clicked_count), 0)`,
        totalRecipients: sql<number>`coalesce(sum(recipients_count), 0)`,
      }).from(campaignsTable).where(and(eq(campaignsTable.tenantId, tenantId), isNotNull(campaignsTable.sentAt), gte(campaignsTable.sentAt, start), lte(campaignsTable.sentAt, end))),
      db.select({ cnt: sql<number>`count(*)` }).from(campaignsTable).where(and(eq(campaignsTable.tenantId, tenantId), gte(campaignsTable.createdAt, start), lte(campaignsTable.createdAt, end))),
      db.select({ cnt: sql<number>`count(*)` }).from(campaignsTable).where(and(eq(campaignsTable.tenantId, tenantId), gte(campaignsTable.createdAt, prevStart), lte(campaignsTable.createdAt, prevEnd))),
    ]);

    const activeCampaigns = Number(campaignsActiveCurr[0]?.cnt ?? 0);
    const sentCampaigns = Number(campaignsSentCurr[0]?.cnt ?? 0);
    const totalSentMessages = Number(campaignsSentCurr[0]?.totalSent ?? 0);
    const totalOpenedMessages = Number(campaignsSentCurr[0]?.totalOpened ?? 0);
    const totalClickedMessages = Number(campaignsSentCurr[0]?.totalClicked ?? 0);
    const totalRecipients = Number(campaignsSentCurr[0]?.totalRecipients ?? 0);
    const openRate = totalSentMessages > 0 ? (totalOpenedMessages / totalSentMessages) * 100 : 0;
    const clickRate = totalSentMessages > 0 ? (totalClickedMessages / totalSentMessages) * 100 : 0;
    const newCampaigns = Number(campaignsAllCurr[0]?.cnt ?? 0);
    const newCampaignsPrev = Number(campaignsPrev[0]?.cnt ?? 0);

    // ─── PARALLEL BLOCK 10: Financial — commissions + expense categories ──
    const [commCurr, commPrev, expCategoriesCurr, receivable, payable, overdue] = await Promise.all([
      db.select({ total: sql<number>`coalesce(sum(cast(commission_amount as numeric)), 0)` }).from(commissionsTable).where(and(eq(commissionsTable.tenantId, tenantId), gte(commissionsTable.createdAt, start), lte(commissionsTable.createdAt, end))),
      db.select({ total: sql<number>`coalesce(sum(cast(commission_amount as numeric)), 0)` }).from(commissionsTable).where(and(eq(commissionsTable.tenantId, tenantId), gte(commissionsTable.createdAt, prevStart), lte(commissionsTable.createdAt, prevEnd))),
      db.select({ category: expensesTable.category, total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` }).from(expensesTable).where(and(eq(expensesTable.tenantId, tenantId), gte(expensesTable.createdAt, start), lte(expensesTable.createdAt, end))).groupBy(expensesTable.category).orderBy(sql`sum(cast(amount as numeric)) desc`),
      db.select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` }).from(paymentsTable).where(and(eq(paymentsTable.tenantId, tenantId), eq(paymentsTable.type, PAYMENT_TYPE.RECEIVABLE), eq(paymentsTable.status, PAYMENT_STATUS.PENDING))),
      db.select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` }).from(paymentsTable).where(and(eq(paymentsTable.tenantId, tenantId), eq(paymentsTable.type, PAYMENT_TYPE.PAYABLE), eq(paymentsTable.status, PAYMENT_STATUS.PENDING))),
      db.select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` }).from(paymentsTable).where(and(eq(paymentsTable.tenantId, tenantId), eq(paymentsTable.type, PAYMENT_TYPE.RECEIVABLE), eq(paymentsTable.status, PAYMENT_STATUS.PENDING), lt(paymentsTable.dueDate, now))),
    ]);

    const commissions = Number(commCurr[0]?.total ?? 0);
    const commissionsPrev = Number(commPrev[0]?.total ?? 0);
    const expenseCategories = expCategoriesCurr.map((r) => ({ category: r.category, total: Number(r.total) }));

    // ─── PARALLEL BLOCK 11: Suppliers ─────────────────────────────────
    const [suppliersNewCurr, suppliersNewPrev, suppliersTotal] = await Promise.all([
      db.select({ cnt: sql<number>`count(*)` }).from(suppliersTable).where(and(eq(suppliersTable.tenantId, tenantId), gte(suppliersTable.createdAt, start), lte(suppliersTable.createdAt, end))),
      db.select({ cnt: sql<number>`count(*)` }).from(suppliersTable).where(and(eq(suppliersTable.tenantId, tenantId), gte(suppliersTable.createdAt, prevStart), lte(suppliersTable.createdAt, prevEnd))),
      db.select({ cnt: sql<number>`count(*)` }).from(suppliersTable).where(eq(suppliersTable.tenantId, tenantId)),
    ]);

    const newSuppliers = Number(suppliersNewCurr[0]?.cnt ?? 0);
    const newSuppliersPrev = Number(suppliersNewPrev[0]?.cnt ?? 0);
    const totalSuppliers = Number(suppliersTotal[0]?.cnt ?? 0);

    // ─── PARALLEL BLOCK 12: Destinations + Passengers ─────────────────
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);
    const [destTotal, destNew90d, destNewPrev90d, destTopRows, passengersCheckedIn, passengersCheckedInPrev] = await Promise.all([
      // Total distinct registered destinations
      db.select({ cnt: sql<number>`count(*)` }).from(destinationsTable).where(eq(destinationsTable.tenantId, tenantId)),
      // New unique trip destinations in last 90 days
      db.select({ destination: tripsTable.destination }).from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), gte(tripsTable.createdAt, ninetyDaysAgo))).groupBy(tripsTable.destination),
      // New unique trip destinations in prev 90-180 days
      db.select({ destination: tripsTable.destination }).from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), gte(tripsTable.createdAt, new Date(now.getTime() - 180 * 86400000)), lt(tripsTable.createdAt, ninetyDaysAgo))).groupBy(tripsTable.destination),
      // Top destinations in period
      db.select({ destination: tripsTable.destination, cnt: sql<number>`count(*)` }).from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), gte(tripsTable.createdAt, start), lte(tripsTable.createdAt, end))).groupBy(tripsTable.destination).orderBy(sql`count(*) desc`).limit(5),
      // Checked-in passengers in period (operational: boarding checklist)
      db.select({ cnt: sql<number>`count(*)` }).from(passengersTable).innerJoin(reservationsTable, eq(passengersTable.reservationId, reservationsTable.id)).where(and(eq(reservationsTable.tenantId, tenantId), isNotNull(passengersTable.checkedInAt), gte(passengersTable.checkedInAt, start), lte(passengersTable.checkedInAt, end))),
      db.select({ cnt: sql<number>`count(*)` }).from(passengersTable).innerJoin(reservationsTable, eq(passengersTable.reservationId, reservationsTable.id)).where(and(eq(reservationsTable.tenantId, tenantId), isNotNull(passengersTable.checkedInAt), gte(passengersTable.checkedInAt, prevStart), lte(passengersTable.checkedInAt, prevEnd))),
    ]);

    const totalDestinations = Number(destTotal[0]?.cnt ?? 0);
    const newDestinations90d = destNew90d.length;
    const newDestinationsPrev90d = destNewPrev90d.length;
    const topDestinations = destTopRows.map((r) => ({ name: r.destination, count: Number(r.cnt) }));
    const checkedInPassengers = Number(passengersCheckedIn[0]?.cnt ?? 0);
    const checkedInPassengersPrev = Number(passengersCheckedInPrev[0]?.cnt ?? 0);

    // ─── RESPONSE ──────────────────────────────────────────────────────
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
        conversionRate: Math.round(conversionRate * 10) / 10,
        conversionRatePrev: Math.round(conversionRatePrev * 10) / 10,
        averageNps,
        averageNpsPrev,
        activeTrips,
        profitMargin: Math.round(profitMargin * 10) / 10,
        profitMarginPrev: Math.round(profitMarginPrev * 10) / 10,
        momGrowth: momGrowth !== null ? Math.round(momGrowth * 10) / 10 : null,
        yoyGrowth: yoyGrowth !== null ? Math.round(yoyGrowth * 10) / 10 : null,
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
        repeatClients,
        repeatClientsPrev,
      },
      marketing: {
        newClients,
        newClientsPrev,
        referrals,
        referralsPrev: referralsPrevCount,
        convertedReferrals,
        convertedReferralsPrev,
        totalLeads,
        totalLeadsPrev,
        conversionRate: Math.round(conversionRate * 10) / 10,
        conversionRatePrev: Math.round(conversionRatePrev * 10) / 10,
        activeCampaigns,
        newCampaigns,
        newCampaignsPrev,
        sentCampaigns,
        totalSentMessages,
        totalOpenedMessages,
        totalClickedMessages,
        totalRecipients,
        openRate: Math.round(openRate * 10) / 10,
        clickRate: Math.round(clickRate * 10) / 10,
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
        commissions,
        commissionsPrev,
        receivable: Number(receivable[0]?.total ?? 0),
        payable: Number(payable[0]?.total ?? 0),
        overdue: Number(overdue[0]?.total ?? 0),
        avgTicket: Math.round(avgTicket * 100) / 100,
        avgTicketPrev: Math.round(avgTicketPrev * 100) / 100,
        expenseCategories,
      },
      operational: {
        activeTrips,
        newTrips,
        newTripsPrev: newTripsPrevCount,
        occupancyRate: Math.round(occupancyRate * 10) / 10,
        totalAvailableSeats,
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
        checkedInPassengers,
        checkedInPassengersPrev,
        averageNps,
        averageNpsPrev,
      },
      retention: {
        loyaltyMembers,
        loyaltyActiveMembers,
        loyaltyNewMembers,
        loyaltyNewMembersPrev,
        averageNps,
        averageNpsPrev,
        promoterClients,
        promoterClientsPrev,
        retentionRate: Math.round(retentionRate * 10) / 10,
        retentionRatePrev: Math.round(retentionRatePrev * 10) / 10,
        referralRate: Math.round(referralRate * 10) / 10,
        referralRatePrev: Math.round(referralRatePrev * 10) / 10,
        newClients,
        newClientsPrev,
        repeatClients,
        repeatClientsPrev,
        totalClients,
        convertedReferrals,
        convertedReferralsPrev,
      },
      expansion: {
        newTrips,
        newTripsPrev: newTripsPrevCount,
        newDestinations90d,
        newDestinationsPrev90d,
        totalDestinations,
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
        momGrowth: momGrowth !== null ? Math.round(momGrowth * 10) / 10 : null,
        yoyGrowth: yoyGrowth !== null ? Math.round(yoyGrowth * 10) / 10 : null,
      },
    });
  } catch (err) {
    console.error("[insights/summary]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
