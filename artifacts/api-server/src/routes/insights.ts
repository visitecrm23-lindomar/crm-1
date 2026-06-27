import { Router, type NextFunction } from "express";
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
  tenantsTable,
  insightsChatHistoryTable,
} from "@workspace/db";
import { eq, and, gte, lte, lt, sql, isNotNull } from "drizzle-orm";
import { requireAuth } from "../lib/tenant";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";
import { z } from "zod/v4";
import { roundMoney } from "../lib/pricing";
import {
  ROLES,
  RESERVATION_STATUS,
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  DEAL_STATUS,
  TRIP_STATUS,
  REFERRAL_STATUS,
} from "@workspace/permissions";
import { getAIClientForTenant } from "../lib/ai-client";

const router = Router();

interface PeriodRange {
  start: Date; end: Date; prevStart: Date; prevEnd: Date;
  momCurrStart: Date; momCurrEnd: Date;
  momPrevStart: Date; momPrevEnd: Date;
  yoyPrevStart: Date; yoyPrevEnd: Date;
}

function getPeriodRange(period: string): PeriodRange {
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
    start = new Date(now.getFullYear(), 0, 1);
    end = now;
    prevStart = new Date(now.getFullYear() - 1, 0, 1);
    prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
  }

  const momCurrStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const momCurrEnd = now;
  const momPrevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const momPrevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const yoyPrevStart = new Date(now.getFullYear() - 1, 0, 1);
  const yoyPrevEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59, 999);

  return { start, end, prevStart, prevEnd, momCurrStart, momCurrEnd, momPrevStart, momPrevEnd, yoyPrevStart, yoyPrevEnd };
}

async function revenueInRange(tenantId: string, from: Date, to: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` })
    .from(paymentsTable)
    .where(and(
      eq(paymentsTable.tenantId, tenantId),
      eq(paymentsTable.type, PAYMENT_TYPE.RECEIVABLE),
      eq(paymentsTable.status, PAYMENT_STATUS.PAID),
      gte(paymentsTable.paidAt, from),
      lte(paymentsTable.paidAt, to),
    ));
  return Number(row?.total ?? 0);
}

async function expensesInRange(tenantId: string, from: Date, to: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)` })
    .from(expensesTable)
    .where(and(eq(expensesTable.tenantId, tenantId), gte(expensesTable.createdAt, from), lte(expensesTable.createdAt, to)));
  return Number(row?.total ?? 0);
}

async function buildInsightsSummary(tenantId: string, period: string) {
  const { start, end, prevStart, prevEnd, momCurrStart, momCurrEnd, momPrevStart, momPrevEnd, yoyPrevStart, yoyPrevEnd } = getPeriodRange(period);
  const now = new Date();

  const [totalRevenue, totalRevenuePrev, totalExpenses, totalExpensesPrev,
         momCurrRev, momPrevRev, yoyCurrRev, yoyPrevRev] = await Promise.all([
    revenueInRange(tenantId, start, end),
    revenueInRange(tenantId, prevStart, prevEnd),
    expensesInRange(tenantId, start, end),
    expensesInRange(tenantId, prevStart, prevEnd),
    revenueInRange(tenantId, momCurrStart, momCurrEnd),
    revenueInRange(tenantId, momPrevStart, momPrevEnd),
    revenueInRange(tenantId, new Date(now.getFullYear(), 0, 1), now),
    revenueInRange(tenantId, yoyPrevStart, yoyPrevEnd),
  ]);

  const momGrowth = momPrevRev > 0 ? ((momCurrRev - momPrevRev) / momPrevRev) * 100 : null;
  const yoyGrowth = yoyPrevRev > 0 ? ((yoyCurrRev - yoyPrevRev) / yoyPrevRev) * 100 : null;

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

  const [clientsNewCurr, clientsNewPrev, clientsTotal, activeClientsCurr, activeClientsPrev] = await Promise.all([
    db.select({ cnt: sql<number>`count(*)` }).from(clientsTable).where(and(eq(clientsTable.tenantId, tenantId), gte(clientsTable.createdAt, start), lte(clientsTable.createdAt, end))),
    db.select({ cnt: sql<number>`count(*)` }).from(clientsTable).where(and(eq(clientsTable.tenantId, tenantId), gte(clientsTable.createdAt, prevStart), lte(clientsTable.createdAt, prevEnd))),
    db.select({ cnt: sql<number>`count(*)` }).from(clientsTable).where(eq(clientsTable.tenantId, tenantId)),
    db.select({ cnt: sql<number>`count(distinct client_id)` }).from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), eq(reservationsTable.status, RESERVATION_STATUS.CONFIRMED), gte(reservationsTable.createdAt, start), lte(reservationsTable.createdAt, end))),
    db.select({ cnt: sql<number>`count(distinct client_id)` }).from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), eq(reservationsTable.status, RESERVATION_STATUS.CONFIRMED), gte(reservationsTable.createdAt, prevStart), lte(reservationsTable.createdAt, prevEnd))),
  ]);

  const newClients = Number(clientsNewCurr[0]?.cnt ?? 0);
  const newClientsPrev = Number(clientsNewPrev[0]?.cnt ?? 0);
  const totalClients = Number(clientsTotal[0]?.cnt ?? 0);
  const activeClients = Number(activeClientsCurr[0]?.cnt ?? 0);
  const activeClientsPrevCount = Number(activeClientsPrev[0]?.cnt ?? 0);

  const repeatSubqueryCurr = db.select({ clientId: reservationsTable.clientId }).from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), eq(reservationsTable.status, RESERVATION_STATUS.CONFIRMED), gte(reservationsTable.createdAt, start), lte(reservationsTable.createdAt, end))).groupBy(reservationsTable.clientId).having(sql`count(*) >= 2`).as("rsc");
  const repeatSubqueryPrev = db.select({ clientId: reservationsTable.clientId }).from(reservationsTable).where(and(eq(reservationsTable.tenantId, tenantId), eq(reservationsTable.status, RESERVATION_STATUS.CONFIRMED), gte(reservationsTable.createdAt, prevStart), lte(reservationsTable.createdAt, prevEnd))).groupBy(reservationsTable.clientId).having(sql`count(*) >= 2`).as("rsp");

  const [repeatCurr, repeatPrev] = await Promise.all([
    db.select({ cnt: sql<number>`count(*)` }).from(repeatSubqueryCurr),
    db.select({ cnt: sql<number>`count(*)` }).from(repeatSubqueryPrev),
  ]);
  const repeatClients = Number(repeatCurr[0]?.cnt ?? 0);
  const repeatClientsPrev = Number(repeatPrev[0]?.cnt ?? 0);

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

  const [activeTripsData, newTripsCurr, newTripsPrev] = await Promise.all([
    db.select({ totalCapacity: tripsTable.totalCapacity, availableSeats: tripsTable.availableSeats }).from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), eq(tripsTable.status, TRIP_STATUS.PUBLISHED))),
    db.select({ cnt: sql<number>`count(*)` }).from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), gte(tripsTable.createdAt, start), lte(tripsTable.createdAt, end))),
    db.select({ cnt: sql<number>`count(*)` }).from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), gte(tripsTable.createdAt, prevStart), lte(tripsTable.createdAt, prevEnd))),
  ]);

  let totalCap = 0; let totalOcc = 0; let totalAvailableSeats = 0;
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
  const revenuePerTripPrev = newTripsPrevCount > 0 ? totalRevenuePrev / newTripsPrevCount : 0;
  const avgReservationsPerTrip = activeTrips > 0 ? newReservations / activeTrips : 0;
  const avgReservationsPerTripPrev = newTripsPrevCount > 0 ? newReservationsPrev / newTripsPrevCount : 0;

  const [npsCurr, npsPrev, npsPromotersCurr, npsPromotersPrev] = await Promise.all([
    db.select({ avg: sql<number>`avg(score)`, cnt: sql<number>`count(*)` }).from(npsResponsesTable).where(and(eq(npsResponsesTable.tenantId, tenantId), gte(npsResponsesTable.createdAt, start), lte(npsResponsesTable.createdAt, end))),
    db.select({ avg: sql<number>`avg(score)` }).from(npsResponsesTable).where(and(eq(npsResponsesTable.tenantId, tenantId), gte(npsResponsesTable.createdAt, prevStart), lte(npsResponsesTable.createdAt, prevEnd))),
    db.select({ cnt: sql<number>`count(*)` }).from(npsResponsesTable).where(and(eq(npsResponsesTable.tenantId, tenantId), gte(npsResponsesTable.createdAt, start), lte(npsResponsesTable.createdAt, end), sql`score >= 9`)),
    db.select({ cnt: sql<number>`count(*)` }).from(npsResponsesTable).where(and(eq(npsResponsesTable.tenantId, tenantId), gte(npsResponsesTable.createdAt, prevStart), lte(npsResponsesTable.createdAt, prevEnd), sql`score >= 9`)),
  ]);

  const averageNps = Number(npsCurr[0]?.cnt ?? 0) > 0 ? Number(npsCurr[0]!.avg) : null;
  const averageNpsPrev = npsPrev[0]?.avg != null ? Number(npsPrev[0].avg) : null;
  const promoterClients = Number(npsPromotersCurr[0]?.cnt ?? 0);
  const promoterClientsPrev = Number(npsPromotersPrev[0]?.cnt ?? 0);

  const [loyaltyCurr, loyaltyPrev, loyaltyTotal, loyaltyActive] = await Promise.all([
    db.select({ cnt: sql<number>`count(*)` }).from(loyaltyMembersTable).where(and(eq(loyaltyMembersTable.tenantId, tenantId), gte(loyaltyMembersTable.joinedAt, start), lte(loyaltyMembersTable.joinedAt, end))),
    db.select({ cnt: sql<number>`count(*)` }).from(loyaltyMembersTable).where(and(eq(loyaltyMembersTable.tenantId, tenantId), gte(loyaltyMembersTable.joinedAt, prevStart), lte(loyaltyMembersTable.joinedAt, prevEnd))),
    db.select({ cnt: sql<number>`count(*)` }).from(loyaltyMembersTable).where(eq(loyaltyMembersTable.tenantId, tenantId)),
    db.select({ cnt: sql<number>`count(*)` }).from(loyaltyMembersTable).where(and(eq(loyaltyMembersTable.tenantId, tenantId), gte(loyaltyMembersTable.joinedAt, new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())))),
  ]);

  const loyaltyNewMembers = Number(loyaltyCurr[0]?.cnt ?? 0);
  const loyaltyNewMembersPrev = Number(loyaltyPrev[0]?.cnt ?? 0);
  const loyaltyMembers = Number(loyaltyTotal[0]?.cnt ?? 0);
  const loyaltyActiveMembers = Number(loyaltyActive[0]?.cnt ?? 0);
  const retentionRate = totalClients > 0 ? (repeatClients / totalClients) * 100 : 0;
  const retentionRatePrev = totalClients > 0 ? (repeatClientsPrev / totalClients) * 100 : 0;

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

  const [campaignsActiveCurr, campaignsSentCurr, campaignsAllCurr, campaignsPrev, campaignsByTypeCurr] = await Promise.all([
    db.select({ cnt: sql<number>`count(*)` }).from(campaignsTable).where(and(eq(campaignsTable.tenantId, tenantId), eq(campaignsTable.status, "active"))),
    db.select({ cnt: sql<number>`count(*)`, totalSent: sql<number>`coalesce(sum(sent_count), 0)`, totalDelivered: sql<number>`coalesce(sum(delivered_count), 0)`, totalOpened: sql<number>`coalesce(sum(opened_count), 0)`, totalClicked: sql<number>`coalesce(sum(clicked_count), 0)`, totalRecipients: sql<number>`coalesce(sum(recipients_count), 0)` }).from(campaignsTable).where(and(eq(campaignsTable.tenantId, tenantId), isNotNull(campaignsTable.sentAt), gte(campaignsTable.sentAt, start), lte(campaignsTable.sentAt, end))),
    db.select({ cnt: sql<number>`count(*)` }).from(campaignsTable).where(and(eq(campaignsTable.tenantId, tenantId), gte(campaignsTable.createdAt, start), lte(campaignsTable.createdAt, end))),
    db.select({ cnt: sql<number>`count(*)` }).from(campaignsTable).where(and(eq(campaignsTable.tenantId, tenantId), gte(campaignsTable.createdAt, prevStart), lte(campaignsTable.createdAt, prevEnd))),
    db.select({ type: campaignsTable.type, cnt: sql<number>`count(*)` }).from(campaignsTable).where(and(eq(campaignsTable.tenantId, tenantId), gte(campaignsTable.createdAt, start), lte(campaignsTable.createdAt, end))).groupBy(campaignsTable.type),
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
  const campaignRoi = sentCampaigns > 0 ? totalRevenue / sentCampaigns : 0;
  const campaignsByType = campaignsByTypeCurr.map((r) => ({ type: r.type, count: Number(r.cnt) }));

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

  const netProfit = totalRevenue - totalExpenses - commissions;
  const netProfitPrev = totalRevenuePrev - totalExpensesPrev - commissionsPrev;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const profitMarginPrev = totalRevenuePrev > 0 ? (netProfitPrev / totalRevenuePrev) * 100 : 0;

  const avgReservationsPerActiveClient = activeClients > 0 ? confirmedReservations / activeClients : 0;
  const ltv = avgTicket * avgReservationsPerActiveClient;
  const avgReservationsPerActiveClientPrev = activeClientsPrevCount > 0 ? confirmedReservationsPrev / activeClientsPrevCount : 0;
  const ltvPrev = avgTicketPrev * avgReservationsPerActiveClientPrev;
  const cac = newClients > 0 ? commissions / newClients : 0;
  const cacPrev = newClientsPrev > 0 ? commissionsPrev / newClientsPrev : 0;

  const [suppliersNewCurr, suppliersNewPrev, suppliersTotal] = await Promise.all([
    db.select({ cnt: sql<number>`count(*)` }).from(suppliersTable).where(and(eq(suppliersTable.tenantId, tenantId), gte(suppliersTable.createdAt, start), lte(suppliersTable.createdAt, end))),
    db.select({ cnt: sql<number>`count(*)` }).from(suppliersTable).where(and(eq(suppliersTable.tenantId, tenantId), gte(suppliersTable.createdAt, prevStart), lte(suppliersTable.createdAt, prevEnd))),
    db.select({ cnt: sql<number>`count(*)` }).from(suppliersTable).where(eq(suppliersTable.tenantId, tenantId)),
  ]);
  const newSuppliers = Number(suppliersNewCurr[0]?.cnt ?? 0);
  const newSuppliersPrev = Number(suppliersNewPrev[0]?.cnt ?? 0);
  const totalSuppliers = Number(suppliersTotal[0]?.cnt ?? 0);

  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);
  const [destTotal, destNew90d, destNewPrev90d, destTopRows, passengersCheckedIn, passengersCheckedInPrev] = await Promise.all([
    db.select({ cnt: sql<number>`count(*)` }).from(destinationsTable).where(eq(destinationsTable.tenantId, tenantId)),
    db.select({ destination: tripsTable.destination }).from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), gte(tripsTable.createdAt, ninetyDaysAgo))).groupBy(tripsTable.destination),
    db.select({ destination: tripsTable.destination }).from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), gte(tripsTable.createdAt, new Date(now.getTime() - 180 * 86400000)), lt(tripsTable.createdAt, ninetyDaysAgo))).groupBy(tripsTable.destination),
    db.select({ destination: tripsTable.destination, cnt: sql<number>`count(*)` }).from(tripsTable).where(and(eq(tripsTable.tenantId, tenantId), gte(tripsTable.createdAt, start), lte(tripsTable.createdAt, end))).groupBy(tripsTable.destination).orderBy(sql`count(*) desc`).limit(5),
    db.select({ cnt: sql<number>`count(*)` }).from(passengersTable).innerJoin(reservationsTable, eq(passengersTable.reservationId, reservationsTable.id)).where(and(eq(reservationsTable.tenantId, tenantId), isNotNull(passengersTable.checkedInAt), gte(passengersTable.checkedInAt, start), lte(passengersTable.checkedInAt, end))),
    db.select({ cnt: sql<number>`count(*)` }).from(passengersTable).innerJoin(reservationsTable, eq(passengersTable.reservationId, reservationsTable.id)).where(and(eq(reservationsTable.tenantId, tenantId), isNotNull(passengersTable.checkedInAt), gte(passengersTable.checkedInAt, prevStart), lte(passengersTable.checkedInAt, prevEnd))),
  ]);

  const totalDestinations = Number(destTotal[0]?.cnt ?? 0);
  const newDestinations90d = destNew90d.length;
  const newDestinationsPrev90d = destNewPrev90d.length;
  const topDestinations = destTopRows.map((r) => ({ name: r.destination, count: Number(r.cnt) }));
  const checkedInPassengers = Number(passengersCheckedIn[0]?.cnt ?? 0);
  const checkedInPassengersPrev = Number(passengersCheckedInPrev[0]?.cnt ?? 0);

  return {
    period,
    executive: {
      totalRevenue, totalRevenuePrev, netProfit, netProfitPrev, totalClients,
      newClients, newClientsPrev, confirmedReservations, confirmedReservationsPrev,
      occupancyRate: Math.round(occupancyRate * 10) / 10, conversionRate: Math.round(conversionRate * 10) / 10,
      conversionRatePrev: Math.round(conversionRatePrev * 10) / 10, averageNps, averageNpsPrev, activeTrips,
      profitMargin: Math.round(profitMargin * 10) / 10, profitMarginPrev: Math.round(profitMarginPrev * 10) / 10,
      momGrowth: momGrowth !== null ? Math.round(momGrowth * 10) / 10 : null,
      yoyGrowth: yoyGrowth !== null ? Math.round(yoyGrowth * 10) / 10 : null,
    },
    commercial: {
      openDeals, openDealsPrev: openDealsPrevCount, wonDeals, wonDealsPrev: wonDealsPrevCount,
      pipelineValue, pipelineValuePrev, avgTicket: roundMoney(avgTicket),
      avgTicketPrev: roundMoney(avgTicketPrev), newReservations, newReservationsPrev,
      cancellations, cancellationsPrev, conversionRate: Math.round(conversionRate * 10) / 10,
      conversionRatePrev: Math.round(conversionRatePrev * 10) / 10, totalLeads, totalLeadsPrev,
      repeatClients, repeatClientsPrev, activeClients, activeClientsPrev: activeClientsPrevCount,
      ltv: roundMoney(ltv), ltvPrev: roundMoney(ltvPrev),
      cac: roundMoney(cac), cacPrev: roundMoney(cacPrev),
    },
    marketing: {
      newClients, newClientsPrev, referrals, referralsPrev: referralsPrevCount,
      convertedReferrals, convertedReferralsPrev, totalLeads, totalLeadsPrev,
      conversionRate: Math.round(conversionRate * 10) / 10, conversionRatePrev: Math.round(conversionRatePrev * 10) / 10,
      activeCampaigns, newCampaigns, newCampaignsPrev, sentCampaigns, totalSentMessages,
      totalOpenedMessages, totalClickedMessages, totalRecipients,
      openRate: Math.round(openRate * 10) / 10, clickRate: Math.round(clickRate * 10) / 10,
      campaignRoi: roundMoney(campaignRoi), campaignsByType,
    },
    financial: {
      totalRevenue, totalRevenuePrev, totalExpenses, totalExpensesPrev, commissions, commissionsPrev,
      netProfit, netProfitPrev, profitMargin: Math.round(profitMargin * 10) / 10,
      profitMarginPrev: Math.round(profitMarginPrev * 10) / 10,
      receivable: Number(receivable[0]?.total ?? 0), payable: Number(payable[0]?.total ?? 0),
      overdue: Number(overdue[0]?.total ?? 0), avgTicket: roundMoney(avgTicket),
      avgTicketPrev: roundMoney(avgTicketPrev), expenseCategories,
    },
    operational: {
      activeTrips, newTrips, newTripsPrev: newTripsPrevCount,
      occupancyRate: Math.round(occupancyRate * 10) / 10, totalAvailableSeats,
      avgReservationsPerTrip: Math.round(avgReservationsPerTrip * 10) / 10,
      avgReservationsPerTripPrev: Math.round(avgReservationsPerTripPrev * 10) / 10,
      confirmedReservations, confirmedReservationsPrev, cancellations, cancellationsPrev,
      revenuePerTrip: roundMoney(revenuePerTrip), revenuePerTripPrev: roundMoney(revenuePerTripPrev),
      totalSuppliers, newSuppliers, newSuppliersPrev, checkedInPassengers, checkedInPassengersPrev,
      averageNps, averageNpsPrev,
    },
    retention: {
      loyaltyMembers, loyaltyActiveMembers, loyaltyNewMembers, loyaltyNewMembersPrev,
      averageNps, averageNpsPrev, promoterClients, promoterClientsPrev,
      retentionRate: Math.round(retentionRate * 10) / 10, retentionRatePrev: Math.round(retentionRatePrev * 10) / 10,
      referralRate: Math.round(referralRate * 10) / 10, referralRatePrev: Math.round(referralRatePrev * 10) / 10,
      newClients, newClientsPrev, repeatClients, repeatClientsPrev, totalClients,
      convertedReferrals, convertedReferralsPrev,
    },
    expansion: {
      newTrips, newTripsPrev: newTripsPrevCount, newDestinations90d, newDestinationsPrev90d,
      totalDestinations, newSuppliers, newSuppliersPrev, totalSuppliers,
      revenuePerTrip: roundMoney(revenuePerTrip), revenuePerTripPrev: roundMoney(revenuePerTripPrev),
      topDestinations, avgTicket: roundMoney(avgTicket), avgTicketPrev: roundMoney(avgTicketPrev),
      totalRevenue, totalRevenuePrev,
      momGrowth: momGrowth !== null ? Math.round(momGrowth * 10) / 10 : null,
      yoyGrowth: yoyGrowth !== null ? Math.round(yoyGrowth * 10) / 10 : null,
    },
  };
}

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

function buildSystemPrompt(agencyName: string, period: string, data: Awaited<ReturnType<typeof buildInsightsSummary>>): string {
  const periodLabel = period === "month" ? "este mês" : period === "quarter" ? "último trimestre" : "este ano";
  const ex = data.executive;
  const co = data.commercial;
  const mk = data.marketing;
  const fi = data.financial;
  const op = data.operational;
  const re = data.retention;
  const exp = data.expansion;

  return `Você é o Assistente de Inteligência Turística do VisiteCRM — um consultor de negócios virtual especializado em agências de turismo brasileiras. Você analisa dados reais da agência e fornece insights estratégicos, recomendações acionáveis e projeções fundamentadas.

INSTRUÇÕES:
- Responda sempre em português brasileiro
- Seja conciso mas estratégico — foque em insights que gerem ação
- Use os dados fornecidos como base factual; não invente números
- Quando identificar riscos ou oportunidades, aponte a causa raiz e uma ação concreta
- Formate respostas com markdown quando útil (negrito, listas, etc.)
- Limite respostas a no máximo 400 palavras, exceto quando solicitado explicitamente

CONTEXTO DA AGÊNCIA:
- Agência: ${agencyName}
- Período analisado: ${periodLabel}

📊 PILAR EXECUTIVO:
- Receita: ${fmtBRL(ex.totalRevenue)} (anterior: ${fmtBRL(ex.totalRevenuePrev)})
- Lucro Líquido: ${fmtBRL(ex.netProfit)} | Margem: ${ex.profitMargin}%
- Crescimento MoM: ${ex.momGrowth != null ? ex.momGrowth + "%" : "dados insuficientes"} | YoY: ${ex.yoyGrowth != null ? ex.yoyGrowth + "%" : "dados insuficientes"}
- NPS: ${ex.averageNps != null ? ex.averageNps.toFixed(1) : "sem dados"} | Ocupação média: ${ex.occupancyRate}%
- Viagens ativas: ${ex.activeTrips} | Taxa de conversão: ${ex.conversionRate}%

💼 PILAR COMERCIAL:
- Ticket médio: ${fmtBRL(co.avgTicket)} | LTV estimado: ${fmtBRL(co.ltv)} | CAC estimado: ${fmtBRL(co.cac)}
- Pipeline: ${fmtBRL(co.pipelineValue)} (${co.openDeals} negócios abertos, ${co.wonDeals} ganhos)
- Clientes ativos: ${co.activeClients} | Recorrentes: ${co.repeatClients} | Cancelamentos: ${co.cancellations}
- Reservas confirmadas: ${op.confirmedReservations} | Leads: ${co.totalLeads}

📣 PILAR MARKETING:
- Novos clientes: ${mk.newClients} | Indicações: ${mk.referrals} (convertidas: ${mk.convertedReferrals})
- Campanhas: ${mk.activeCampaigns} ativas | ${mk.sentCampaigns} disparadas | ${mk.totalSentMessages.toLocaleString("pt-BR")} mensagens
- Taxa de abertura: ${mk.openRate}% | Cliques: ${mk.clickRate}%
- ROI por campanha: ${fmtBRL(mk.campaignRoi)}
- Tipos: ${mk.campaignsByType.map((c) => `${c.type}(${c.count})`).join(", ") || "nenhuma"}

💰 PILAR FINANCEIRO:
- Despesas: ${fmtBRL(fi.totalExpenses)} | Comissões pagas: ${fmtBRL(fi.commissions)}
- A receber: ${fmtBRL(fi.receivable)} | A pagar: ${fmtBRL(fi.payable)} | Inadimplência: ${fmtBRL(fi.overdue)}
- Top categorias de despesa: ${fi.expenseCategories.slice(0, 3).map((c) => `${c.category}(${fmtBRL(c.total)})`).join(", ") || "nenhuma"}

🚌 PILAR OPERACIONAL:
- Viagens ativas: ${op.activeTrips} | Reservas/viagem: ${op.avgReservationsPerTrip} | Receita/viagem: ${fmtBRL(op.revenuePerTrip)}
- Vagas disponíveis: ${op.totalAvailableSeats} | Check-ins: ${op.checkedInPassengers}
- Fornecedores: ${op.totalSuppliers}

❤️ PILAR RETENÇÃO:
- Taxa de retenção: ${re.retentionRate}% | Taxa de indicação: ${re.referralRate}%
- Membros fidelidade: ${re.loyaltyMembers} (${re.loyaltyActiveMembers} ativos) | Promotores NPS: ${re.promoterClients}

🌍 PILAR EXPANSÃO:
- Novas viagens: ${exp.newTrips} | Novos destinos (90d): ${exp.newDestinations90d} | Fornecedores: ${exp.totalSuppliers}
- Top destinos: ${exp.topDestinations.slice(0, 3).map((d) => `${d.name}(${d.count})`).join(", ") || "nenhum"}`;
}

const InsightsPeriodQuery = z.object({
  period: z.enum(["month", "quarter", "year"]).default("month"),
});

// ─── GET /insights/summary ────────────────────────────────────────────────────
router.get("/insights/summary", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === ROLES.SALES || me.role === ROLES.CLIENT) {
      next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE"));
      return;
    }
    const parsed = InsightsPeriodQuery.safeParse(req.query);
    if (!parsed.success) {
      next(new ValidationError("Parâmetro inválido: period deve ser 'month', 'quarter' ou 'year'", "VALIDATION_ERROR"));
      return;
    }
    const { period } = parsed.data;
    const data = await buildInsightsSummary(me.tenantId, period);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});
const InsightsChatBody = z.object({
  messages: z.array(ChatMessage).min(1),
  period: z.string().optional(),
});
const InsightsAskBody = z.object({
  messages: z.array(ChatMessage).min(1),
});
const SimulatorBody = z.object({
  leadsChangePct: z.coerce.number().optional(),
  priceChangePct: z.coerce.number().optional(),
  conversionChangePct: z.coerce.number().optional(),
});

// ─── POST /insights/chat ──────────────────────────────────────────────────────
router.post("/insights/chat", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === ROLES.SALES || me.role === ROLES.CLIENT) {
      next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE"));
      return;
    }

    const parsed = InsightsChatBody.safeParse(req.body);
    if (!parsed.success) {
      next(new ValidationError(parsed.error.issues[0]?.message ?? "messages is required", "VALIDATION_ERROR"));
      return;
    }
    const { messages, period = "month" } = parsed.data;

    // Fetch tenant name for context
    const [tenant] = await db
      .select({ name: tenantsTable.name })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, me.tenantId))
      .limit(1);
    const agencyName = tenant?.name ?? "Agência";

    // Fetch KPI snapshot for the selected period
    const summaryData = await buildInsightsSummary(me.tenantId, period);
    const systemPrompt = buildSystemPrompt(agencyName, period, summaryData);

    // Stream response via SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Resolve the AI client: per-tenant configured provider when enabled,
    // otherwise the platform-managed proxy.
    const { client, model, provider } = await getAIClientForTenant(me.tenantId);
    // OpenAI's newer models require max_completion_tokens; other OpenAI-compatible
    // providers (Anthropic/Gemini) expect max_tokens.
    const useCompletionTokens = provider === "openai";

    const stream = await client.chat.completions.create({
      model,
      ...(useCompletionTokens
        ? { max_completion_tokens: 8192 }
        : { max_tokens: 8192 }),
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log?.error({ err }, "[insights/chat] streaming error");
    if (!res.headersSent) {
      next(err);
    } else {
      res.write(`data: ${JSON.stringify({ error: "Erro interno. Tente novamente." })}\n\n`);
      res.end();
    }
  }
});

// ─── BI Avançado: Previsões, Risco de Ocupação, Simulador, Assistente ─────────

interface RevenueHistoryPoint { month: string; revenue: number; }
interface ForecastPoint { month: string; base: number; optimistic: number; pessimistic: number; }
interface RevenueForecastResponse {
  history: RevenueHistoryPoint[];
  forecast: ForecastPoint[];
  narrative: string;
  source: "ai" | "computed";
  generatedAt: string;
}

interface OccupancyTrip {
  id: string; name: string; destination: string; departureDate: string;
  daysUntil: number; capacity: number; occupied: number; availableSeats: number;
  fillRate: number; risk: "red" | "yellow" | "green"; comment: string | null;
}
interface OccupancyRiskResponse {
  trips: OccupancyTrip[];
  summary: string;
  counts: { red: number; yellow: number; green: number };
  generatedAt: string;
}

interface SimulatorResponse {
  baselineRevenue: number;
  projectedRevenue: number;
  deltaRevenue: number;
  deltaPct: number;
  reasoning: string;
  source: "ai" | "computed";
  generatedAt: string;
}

// In-memory per-tenant TTL cache (forecasts are computed on demand, not persisted).
const ADVANCED_CACHE_TTL_MS = 5 * 60_000;
const forecastCache = new Map<string, { at: number; data: RevenueForecastResponse }>();
const occupancyCache = new Map<string, { at: number; data: OccupancyRiskResponse }>();

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function monthlyRevenueHistory(tenantId: string, months: number): Promise<RevenueHistoryPoint[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const rows = await db
    .select({
      ym: sql<string>`to_char(${paymentsTable.paidAt}, 'YYYY-MM')`,
      total: sql<number>`coalesce(sum(cast(amount as numeric)), 0)`,
    })
    .from(paymentsTable)
    .where(and(
      eq(paymentsTable.tenantId, tenantId),
      eq(paymentsTable.type, PAYMENT_TYPE.RECEIVABLE),
      eq(paymentsTable.status, PAYMENT_STATUS.PAID),
      gte(paymentsTable.paidAt, start),
      lte(paymentsTable.paidAt, now),
    ))
    .groupBy(sql`to_char(${paymentsTable.paidAt}, 'YYYY-MM')`);
  const map = new Map(rows.map((r) => [r.ym, Number(r.total)]));
  const result: RevenueHistoryPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    result.push({ month: key, revenue: Math.round(map.get(key) ?? 0) });
  }
  return result;
}

function nextMonthKeys(count: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = 1; i <= count; i++) {
    keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() + i, 1)));
  }
  return keys;
}

// Deterministic projection used as an anchor for the LLM and as a graceful
// fallback when the AI step is unavailable or returns unusable output.
function computeBaselineForecast(history: RevenueHistoryPoint[]): ForecastPoint[] {
  const last6 = history.map((h) => h.revenue).slice(-6);
  const nonZero = last6.filter((v) => v > 0);
  const avg = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
  const half = Math.floor(last6.length / 2) || 1;
  const firstAvg = last6.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const secondAvg = last6.slice(-half).reduce((a, b) => a + b, 0) / half;
  const trend = (secondAvg - firstAvg) / half;
  return nextMonthKeys(3).map((key, idx) => {
    const base = Math.max(0, Math.round(avg + trend * (idx + 1)));
    return { month: key, base, optimistic: Math.round(base * 1.2), pessimistic: Math.round(base * 0.8) };
  });
}

function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function completeText(tenantId: string, systemPrompt: string, userPrompt: string, maxTokens = 2048): Promise<string> {
  const { client, model, provider } = await getAIClientForTenant(tenantId);
  const useCompletionTokens = provider === "openai";
  const resp = await client.chat.completions.create({
    model,
    ...(useCompletionTokens ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return resp.choices[0]?.message?.content ?? "";
}

async function tenantName(tenantId: string): Promise<string> {
  const [tenant] = await db.select({ name: tenantsTable.name }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
  return tenant?.name ?? "Agência";
}

// ─── GET /insights/revenue-forecast ───────────────────────────────────────────
router.get("/insights/revenue-forecast", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === ROLES.SALES || me.role === ROLES.CLIENT) {
      next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE"));
      return;
    }

    const cached = forecastCache.get(me.tenantId);
    if (cached && Date.now() - cached.at < ADVANCED_CACHE_TTL_MS) {
      res.json(cached.data);
      return;
    }

    const history = await monthlyRevenueHistory(me.tenantId, 24);
    const baseline = computeBaselineForecast(history);
    const futureKeys = nextMonthKeys(3);

    let forecast = baseline;
    let narrative = "";
    let source: "ai" | "computed" = "computed";

    try {
      const agencyName = await tenantName(me.tenantId);
      const historyStr = history.map((h) => `${h.month}: ${h.revenue}`).join("\n");
      const system = `Você é um analista financeiro sênior de uma agência de turismo brasileira (${agencyName}). Projete a receita confirmada (em reais, número inteiro) para os próximos 3 meses com base no histórico mensal dos últimos 24 meses. Considere sazonalidade e tendência. Responda APENAS com JSON válido, sem texto fora do JSON.`;
      const user = `Histórico de receita confirmada (mês: valor em R$):\n${historyStr}\n\nMeses a prever: ${futureKeys.join(", ")}.\n\nRetorne JSON no formato exato:\n{\n  "forecast": [{"month":"YYYY-MM","base":number,"optimistic":number,"pessimistic":number}],\n  "narrative": "2 a 4 frases em português explicando a projeção, sazonalidade e principais riscos/oportunidades"\n}\nRegras: exatamente 3 itens em forecast, na ordem dos meses solicitados; optimistic >= base >= pessimistic >= 0.`;
      const raw = await completeText(me.tenantId, system, user, 1500);
      const parsed = extractJson(raw);
      const arr = parsed?.forecast;
      if (Array.isArray(arr) && arr.length >= 3) {
        forecast = futureKeys.map((key, i) => {
          const item = (arr[i] ?? {}) as Record<string, unknown>;
          let base = Math.round(Number(item.base));
          if (!Number.isFinite(base) || base < 0) base = baseline[i].base;
          let optimistic = Math.round(Number(item.optimistic));
          if (!Number.isFinite(optimistic) || optimistic < base) optimistic = Math.round(base * 1.2);
          let pessimistic = Math.round(Number(item.pessimistic));
          if (!Number.isFinite(pessimistic) || pessimistic > base || pessimistic < 0) pessimistic = Math.round(base * 0.8);
          return { month: key, base, optimistic, pessimistic };
        });
        source = "ai";
      }
      if (typeof parsed?.narrative === "string" && parsed.narrative.trim()) {
        narrative = parsed.narrative.trim();
      }
    } catch (err) {
      req.log?.warn({ err }, "[insights/revenue-forecast] AI step failed, using computed baseline");
    }

    if (!narrative) {
      const total = forecast.reduce((a, f) => a + f.base, 0);
      narrative = `Projeção baseada na média e tendência recentes. Receita estimada (cenário base) de ${fmtBRL(total)} nos próximos 3 meses. Configure a IA da agência para análises mais detalhadas.`;
    }

    const data: RevenueForecastResponse = { history, forecast, narrative, source, generatedAt: new Date().toISOString() };
    forecastCache.set(me.tenantId, { at: Date.now(), data });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

async function futureTripsOccupancy(tenantId: string): Promise<OccupancyTrip[]> {
  const now = new Date();
  const rows = await db
    .select({
      id: tripsTable.id, name: tripsTable.name, destination: tripsTable.destination,
      departureDate: tripsTable.departureDate, totalCapacity: tripsTable.totalCapacity,
      availableSeats: tripsTable.availableSeats,
    })
    .from(tripsTable)
    .where(and(
      eq(tripsTable.tenantId, tenantId),
      eq(tripsTable.status, TRIP_STATUS.PUBLISHED),
      gte(tripsTable.departureDate, now),
    ))
    .orderBy(tripsTable.departureDate);

  return rows.map((t) => {
    const capacity = Number(t.totalCapacity ?? 0);
    const available = Number(t.availableSeats ?? 0);
    const occupied = Math.max(0, capacity - available);
    const fillRate = capacity > 0 ? Math.round((occupied / capacity) * 1000) / 10 : 0;
    const daysUntil = Math.max(0, Math.ceil((t.departureDate.getTime() - now.getTime()) / 86400000));
    const risk: "red" | "yellow" | "green" = fillRate >= 80 ? "green" : fillRate >= 60 ? "yellow" : "red";
    return {
      id: t.id, name: t.name, destination: t.destination,
      departureDate: t.departureDate.toISOString(), daysUntil,
      capacity, occupied, availableSeats: available, fillRate, risk, comment: null,
    };
  });
}

// ─── GET /insights/occupancy-risk ─────────────────────────────────────────────
router.get("/insights/occupancy-risk", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === ROLES.SALES || me.role === ROLES.CLIENT) {
      next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE"));
      return;
    }

    const cached = occupancyCache.get(me.tenantId);
    if (cached && Date.now() - cached.at < ADVANCED_CACHE_TTL_MS) {
      res.json(cached.data);
      return;
    }

    const trips = await futureTripsOccupancy(me.tenantId);
    const counts = { red: 0, yellow: 0, green: 0 };
    for (const t of trips) counts[t.risk]++;

    let summary = "";
    const atRisk = trips.filter((t) => t.risk !== "green").slice(0, 20);

    if (trips.length > 0) {
      try {
        const agencyName = await tenantName(me.tenantId);
        const listStr = atRisk
          .map((t) => `id=${t.id} | ${t.name} (${t.destination}) | ocupação ${t.fillRate}% | ${t.daysUntil} dias p/ partida | ${t.availableSeats} vagas livres`)
          .join("\n");
        const system = `Você é um consultor de operações de uma agência de turismo brasileira (${agencyName}). Para cada viagem em risco de não lotar, gere um comentário curto (1 frase, máx 18 palavras) com a ação mais relevante para vender as vagas restantes, considerando dias até a partida e taxa de ocupação. Responda APENAS JSON válido.`;
        const user = `Viagens em risco:\n${listStr || "(nenhuma em risco)"}\n\nTotais: ${counts.red} em risco alto (vermelho), ${counts.yellow} em atenção (amarelo), ${counts.green} saudáveis (verde).\n\nRetorne JSON:\n{\n  "comments": {"<id da viagem>": "comentário curto"},\n  "summary": "2 a 3 frases em português sobre o panorama de ocupação e prioridades"\n}`;
        const raw = await completeText(me.tenantId, system, user, 1500);
        const parsed = extractJson(raw);
        const comments = parsed?.comments;
        if (comments && typeof comments === "object") {
          const cmap = comments as Record<string, unknown>;
          for (const t of trips) {
            const c = cmap[t.id];
            if (typeof c === "string" && c.trim()) t.comment = c.trim();
          }
        }
        if (typeof parsed?.summary === "string" && parsed.summary.trim()) summary = parsed.summary.trim();
      } catch (err) {
        req.log?.warn({ err }, "[insights/occupancy-risk] AI step failed");
      }
    }

    if (!summary) {
      summary = trips.length === 0
        ? "Nenhuma viagem futura publicada no momento."
        : `${trips.length} viagens futuras: ${counts.red} em risco alto, ${counts.yellow} em atenção e ${counts.green} saudáveis.`;
    }

    const data: OccupancyRiskResponse = { trips, summary, counts, generatedAt: new Date().toISOString() };
    occupancyCache.set(me.tenantId, { at: Date.now(), data });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ─── POST /insights/simulator ─────────────────────────────────────────────────
router.post("/insights/simulator", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === ROLES.SALES || me.role === ROLES.CLIENT) {
      next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE"));
      return;
    }

    const parsedBody = SimulatorBody.safeParse(req.body);
    if (!parsedBody.success) {
      next(new ValidationError(parsedBody.error.issues[0]?.message ?? "Dados inválidos", "VALIDATION_ERROR"));
      return;
    }
    const body = parsedBody.data;
    const clamp = (v: unknown, min: number, max: number) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      return Math.max(min, Math.min(max, n));
    };
    const leadsChangePct = clamp(body.leadsChangePct, -100, 200);
    const priceChangePct = clamp(body.priceChangePct, -50, 50);
    const conversionChangePct = clamp(body.conversionChangePct, -100, 200);

    const summary = await buildInsightsSummary(me.tenantId, "month");
    const baselineRevenue = roundMoney(summary.executive.totalRevenue);
    const leads = summary.commercial.totalLeads;
    const conversion = summary.commercial.conversionRate;
    const avgTicket = summary.commercial.avgTicket;

    const naive = Math.max(0, Math.round(
      baselineRevenue * (1 + leadsChangePct / 100) * (1 + conversionChangePct / 100) * (1 + priceChangePct / 100),
    ));

    let projectedRevenue = naive;
    let reasoning = "";
    let source: "ai" | "computed" = "computed";

    try {
      const agencyName = await tenantName(me.tenantId);
      const system = `Você é um analista de receita de uma agência de turismo brasileira (${agencyName}). Estime o impacto na receita do PRÓXIMO MÊS a partir de variações nas variáveis do funil. Considere que aumentos de preço podem reduzir a conversão (elasticidade) e que mais leads sem capacidade operacional têm retorno decrescente. Responda APENAS JSON válido.`;
      const user = `Baseline mensal atual:\n- Receita: ${baselineRevenue}\n- Leads no período: ${leads}\n- Taxa de conversão: ${conversion}%\n- Ticket médio: ${avgTicket}\n\nVariações simuladas:\n- Leads: ${leadsChangePct > 0 ? "+" : ""}${leadsChangePct}%\n- Preço (ticket): ${priceChangePct > 0 ? "+" : ""}${priceChangePct}%\n- Conversão: ${conversionChangePct > 0 ? "+" : ""}${conversionChangePct}%\n\nRetorne JSON:\n{\n  "projectedRevenue": number (receita projetada do próximo mês em R$, inteiro),\n  "reasoning": "2 a 4 frases em português explicando o raciocínio, premissas de elasticidade e principais riscos"\n}`;
      const raw = await completeText(me.tenantId, system, user, 1200);
      const parsed = extractJson(raw);
      const p = Number(parsed?.projectedRevenue);
      if (Number.isFinite(p) && p >= 0) { projectedRevenue = Math.round(p); source = "ai"; }
      if (typeof parsed?.reasoning === "string" && parsed.reasoning.trim()) reasoning = parsed.reasoning.trim();
    } catch (err) {
      req.log?.warn({ err }, "[insights/simulator] AI step failed");
    }

    if (!reasoning) {
      reasoning = `Projeção determinística combinando as variações informadas sobre a receita base de ${fmtBRL(baselineRevenue)}. Configure a IA da agência para uma análise com elasticidade de preço.`;
    }

    const deltaRevenue = projectedRevenue - baselineRevenue;
    const deltaPct = baselineRevenue > 0 ? Math.round((deltaRevenue / baselineRevenue) * 1000) / 10 : 0;

    const data: SimulatorResponse = {
      baselineRevenue, projectedRevenue, deltaRevenue, deltaPct, reasoning, source,
      generatedAt: new Date().toISOString(),
    };
    res.json(data);
  } catch (err) {
    next(err);
  }
});

function buildExecutiveAssistantPrompt(agencyName: string, data: Awaited<ReturnType<typeof buildInsightsSummary>>): string {
  const ex = data.executive; const co = data.commercial; const fi = data.financial;
  const op = data.operational; const re = data.retention; const exp = data.expansion;
  return `Você é o Assistente Executivo do VisiteCRM — atua como um CFO/COO virtual para a agência de turismo ${agencyName}. Responde perguntas estratégicas e financeiras do gestor com precisão, em português brasileiro.

INSTRUÇÕES:
- Use exclusivamente os dados fornecidos (snapshot dos últimos ~90 dias) como base factual; nunca invente números.
- Quando não houver dado suficiente, diga claramente e sugira o que medir.
- Seja direto e quantitativo: cite valores, margens e tendências. Aponte causa e ação.
- Formate com markdown quando útil. Limite a ~350 palavras salvo pedido explícito.

SNAPSHOT (últimos ~90 dias):
- Receita confirmada: ${fmtBRL(ex.totalRevenue)} | Lucro líquido: ${fmtBRL(ex.netProfit)} | Margem: ${ex.profitMargin}%
- Despesas: ${fmtBRL(fi.totalExpenses)} | Comissões: ${fmtBRL(fi.commissions)} | A receber: ${fmtBRL(fi.receivable)} | Inadimplência: ${fmtBRL(fi.overdue)}
- Ticket médio: ${fmtBRL(co.avgTicket)} | Reservas confirmadas: ${op.confirmedReservations} | Cancelamentos (churn): ${co.cancellations}
- NPS médio: ${ex.averageNps != null ? ex.averageNps.toFixed(1) : "sem dados"} | Taxa de retenção: ${re.retentionRate}% | Promotores: ${re.promoterClients}
- Indicações convertidas: ${re.convertedReferrals} | Viagens ativas: ${op.activeTrips} | Ocupação média: ${ex.occupancyRate}%
- Top destinos: ${exp.topDestinations.slice(0, 5).map((d) => `${d.name}(${d.count})`).join(", ") || "sem dados"}
- Receita/viagem: ${fmtBRL(op.revenuePerTrip)} | Crescimento MoM: ${ex.momGrowth != null ? ex.momGrowth + "%" : "n/d"} | YoY: ${ex.yoyGrowth != null ? ex.yoyGrowth + "%" : "n/d"}`;
}

// ─── POST /insights/ask (streaming) ───────────────────────────────────────────
router.post("/insights/ask", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    if (me.role === ROLES.SALES || me.role === ROLES.CLIENT) {
      next(new ForbiddenError("Forbidden", "FORBIDDEN_ROLE"));
      return;
    }

    const parsed = InsightsAskBody.safeParse(req.body);
    if (!parsed.success) {
      next(new ValidationError(parsed.error.issues[0]?.message ?? "messages is required", "VALIDATION_ERROR"));
      return;
    }
    const { messages } = parsed.data;

    const agencyName = await tenantName(me.tenantId);
    const summaryData = await buildInsightsSummary(me.tenantId, "quarter");
    const systemPrompt = buildExecutiveAssistantPrompt(agencyName, summaryData);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const { client, model, provider } = await getAIClientForTenant(me.tenantId);
    const useCompletionTokens = provider === "openai";

    const stream = await client.chat.completions.create({
      model,
      ...(useCompletionTokens ? { max_completion_tokens: 8192 } : { max_tokens: 8192 }),
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log?.error({ err }, "[insights/ask] streaming error");
    if (!res.headersSent) {
      next(err);
    } else {
      res.write(`data: ${JSON.stringify({ error: "Erro interno. Tente novamente." })}\n\n`);
      res.end();
    }
  }
});

// GET /insights/history/:chatType — carrega histórico do usuário atual
router.get("/insights/history/:chatType", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const { chatType } = req.params;
    if (chatType !== "executive" && chatType !== "tourism") {
      next(new ValidationError("chatType inválido", "VALIDATION_ERROR"));
      return;
    }
    const [row] = await db
      .select({ messages: insightsChatHistoryTable.messages })
      .from(insightsChatHistoryTable)
      .where(
        and(
          eq(insightsChatHistoryTable.tenantId, me.tenantId),
          eq(insightsChatHistoryTable.userId, me.id),
          eq(insightsChatHistoryTable.chatType, chatType),
        ),
      )
      .limit(1);
    res.json({ messages: row?.messages ?? [] });
  } catch (err) {
    next(err);
  }
});

// PUT /insights/history/:chatType — salva/substitui histórico
router.put("/insights/history/:chatType", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const { chatType } = req.params;
    if (chatType !== "executive" && chatType !== "tourism") {
      next(new ValidationError("chatType inválido", "VALIDATION_ERROR"));
      return;
    }
    const { messages } = z
      .object({
        messages: z.array(
          z.object({ role: z.enum(["user", "assistant"]), content: z.string() }),
        ),
      })
      .parse(req.body);
    await db
      .insert(insightsChatHistoryTable)
      .values({
        id: crypto.randomUUID(),
        tenantId: me.tenantId,
        userId: me.id,
        chatType,
        messages,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          insightsChatHistoryTable.tenantId,
          insightsChatHistoryTable.userId,
          insightsChatHistoryTable.chatType,
        ],
        set: { messages, updatedAt: new Date() },
      });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /insights/history/:chatType — apaga histórico
router.delete("/insights/history/:chatType", async (req, res, next: NextFunction): Promise<void> => {
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const { chatType } = req.params;
    if (chatType !== "executive" && chatType !== "tourism") {
      next(new ValidationError("chatType inválido", "VALIDATION_ERROR"));
      return;
    }
    await db
      .delete(insightsChatHistoryTable)
      .where(
        and(
          eq(insightsChatHistoryTable.tenantId, me.tenantId),
          eq(insightsChatHistoryTable.userId, me.id),
          eq(insightsChatHistoryTable.chatType, chatType),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
