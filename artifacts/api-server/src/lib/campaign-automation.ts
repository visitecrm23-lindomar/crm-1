import { db, campaignsTable, campaignSendsTable, clientsTable, tenantsTable, reservationsTable, tripsTable } from "@workspace/db";
import { eq, and, sql, isNotNull, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { generateId } from "./id";
import { sendReminderHtmlEmail } from "@workspace/email";
import { getCampaignEmailQueue } from "../queues/index";

const TRIGGER_TYPES = [
  "birthday",
  "post_trip",
  "reactivation",
  "repurchase",
  "cart_abandonment",
] as const;

type TriggerType = (typeof TRIGGER_TYPES)[number];

interface ClientRow {
  id: string;
  name: string;
  email: string | null;
}

async function resolveClientsByTrigger(
  tenantId: string,
  triggerType: TriggerType,
  config: Record<string, unknown>
): Promise<ClientRow[]> {
  switch (triggerType) {
    case "birthday": {
      const daysAhead = Number(config["daysAhead"] ?? 3);
      const target = new Date();
      target.setDate(target.getDate() + daysAhead);
      const targetMonth = target.getMonth() + 1;
      const targetDay = target.getDate();

      return db
        .select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email })
        .from(clientsTable)
        .where(
          and(
            eq(clientsTable.tenantId, tenantId),
            isNotNull(clientsTable.birthDate),
            sql`EXTRACT(MONTH FROM ${clientsTable.birthDate}) = ${targetMonth}`,
            sql`EXTRACT(DAY FROM ${clientsTable.birthDate}) = ${targetDay}`
          )
        );
    }

    case "post_trip": {
      const daysAfter = Number(config["daysAfter"] ?? 7);
      const rows = await db
        .selectDistinct({ clientId: reservationsTable.clientId })
        .from(reservationsTable)
        .innerJoin(tripsTable, eq(reservationsTable.tripId, tripsTable.id))
        .where(
          and(
            eq(reservationsTable.tenantId, tenantId),
            eq(reservationsTable.status, "confirmed"),
            isNotNull(tripsTable.returnDate),
            sql`DATE(${tripsTable.returnDate} AT TIME ZONE 'America/Sao_Paulo') = (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo') - (${daysAfter} * INTERVAL '1 day')`
          )
        );
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.clientId);
      return db
        .select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, tenantId), inArray(clientsTable.id, ids)));
    }

    case "repurchase": {
      const days = Number(config["days"] ?? 30);
      const rows = await db
        .selectDistinct({ clientId: reservationsTable.clientId })
        .from(reservationsTable)
        .innerJoin(tripsTable, eq(reservationsTable.tripId, tripsTable.id))
        .where(
          and(
            eq(reservationsTable.tenantId, tenantId),
            eq(reservationsTable.status, "confirmed"),
            isNotNull(tripsTable.returnDate),
            sql`DATE(${tripsTable.returnDate} AT TIME ZONE 'America/Sao_Paulo') = (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo') - (${days} * INTERVAL '1 day')`
          )
        );
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.clientId);
      return db
        .select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, tenantId), inArray(clientsTable.id, ids)));
    }

    case "reactivation": {
      const inactiveDays = Number(config["inactiveDays"] ?? 120);
      return db
        .select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email })
        .from(clientsTable)
        .where(
          and(
            eq(clientsTable.tenantId, tenantId),
            sql`NOT EXISTS (
              SELECT 1 FROM reservations r2
              WHERE r2.client_id = ${clientsTable.id}
                AND r2.tenant_id = ${clientsTable.tenantId}
                AND r2.status = 'confirmed'
                AND r2.created_at > NOW() - (${inactiveDays} * INTERVAL '1 day')
            )`
          )
        );
    }

    case "cart_abandonment": {
      const hours = Number(config["hours"] ?? 24);
      const rows = await db
        .selectDistinct({ clientId: reservationsTable.clientId })
        .from(reservationsTable)
        .where(
          and(
            eq(reservationsTable.tenantId, tenantId),
            inArray(reservationsTable.status, ["pending", "pending_payment"]),
            sql`${reservationsTable.createdAt} < NOW() - (${hours} * INTERVAL '1 hour')`,
            sql`${reservationsTable.createdAt} > NOW() - INTERVAL '30 days'`
          )
        );
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.clientId);
      return db
        .select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email })
        .from(clientsTable)
        .where(and(eq(clientsTable.tenantId, tenantId), inArray(clientsTable.id, ids)));
    }

    default:
      return [];
  }
}

async function getAlreadySentClientIds(
  campaignId: string,
  sinceDate?: Date
): Promise<Set<string>> {
  const conditions = [eq(campaignSendsTable.campaignId, campaignId)];
  if (sinceDate) {
    conditions.push(sql`${campaignSendsTable.sentAt} >= ${sinceDate.toISOString()}`);
  }
  const rows = await db
    .select({ clientId: campaignSendsTable.clientId })
    .from(campaignSendsTable)
    .where(and(...conditions));
  return new Set(rows.map((r) => r.clientId));
}

async function enqueueCampaignEmail(
  to: string,
  toName: string,
  subject: string,
  htmlContent: string,
  fromName: string,
  campaignId: string,
  clientId: string,
  tenantId: string
): Promise<void> {
  const personalised = htmlContent
    .replace(/\{nome\}/gi, toName)
    .replace(/\{name\}/gi, toName);

  const queue = getCampaignEmailQueue();
  if (queue) {
    await queue.add("campaign-email", {
      to,
      toName,
      subject,
      htmlContent: personalised,
      fromName,
      campaignId,
      clientId,
      tenantId,
    });
  } else {
    const result = await sendReminderHtmlEmail({ to, subject, html: personalised, fromName });
    if (!result.success) {
      throw new Error(result.error ?? "Email send failed");
    }
  }
}

function getSinceDate(triggerType: TriggerType): Date | undefined {
  if (triggerType === "birthday") {
    const startOfYear = new Date();
    startOfYear.setMonth(0, 1);
    startOfYear.setHours(0, 0, 0, 0);
    return startOfYear;
  }
  return undefined;
}

async function processTenantCampaign(
  campaign: typeof campaignsTable.$inferSelect,
  tenantName: string
) {
  const triggerType = campaign.triggerType as TriggerType;
  if (!TRIGGER_TYPES.includes(triggerType)) return;

  const config = (campaign.triggerConfig as Record<string, unknown>) ?? {};

  const clients = await resolveClientsByTrigger(campaign.tenantId, triggerType, config);
  if (clients.length === 0) return;

  const sinceDate = getSinceDate(triggerType);
  const alreadySent = await getAlreadySentClientIds(campaign.id, sinceDate);
  const eligible = clients.filter((c) => !alreadySent.has(c.id) && c.email);

  if (eligible.length === 0) return;

  let successCount = 0;
  let errorCount = 0;

  for (const client of eligible) {
    if (!client.email) continue;
    const sendId = generateId();
    try {
      if (campaign.type === "email" && campaign.subject) {
        await enqueueCampaignEmail(
          client.email,
          client.name,
          campaign.subject,
          campaign.content,
          tenantName,
          campaign.id,
          client.id,
          campaign.tenantId
        );
      }
      await db
        .insert(campaignSendsTable)
        .values({
          id: sendId,
          campaignId: campaign.id,
          clientId: client.id,
          tenantId: campaign.tenantId,
          status: "sent",
        })
        .onConflictDoNothing();
      successCount++;
    } catch (err) {
      errorCount++;
      logger.error({ err, campaignId: campaign.id, clientId: client.id }, "Failed to enqueue campaign email");
      try {
        await db
          .insert(campaignSendsTable)
          .values({
            id: sendId,
            campaignId: campaign.id,
            clientId: client.id,
            tenantId: campaign.tenantId,
            status: "error",
            error: String(err),
          })
          .onConflictDoNothing();
      } catch (_) {}
    }
  }

  if (successCount > 0) {
    await db
      .update(campaignsTable)
      .set({
        sentCount: campaign.sentCount + successCount,
        recipientsCount: campaign.recipientsCount + successCount + errorCount,
      })
      .where(eq(campaignsTable.id, campaign.id));
  }

  logger.info(
    { campaignId: campaign.id, trigger: triggerType, successCount, errorCount },
    "[campaign-automation] Processed campaign"
  );
}

export async function runCampaignAutomationCron() {
  const nowSP = new Date().toLocaleString("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
  });
  const currentHour = Number(nowSP);

  logger.info({ currentHour }, "[campaign-automation] Hourly automation check");

  const autoCampaigns = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.autoEnabled, true));

  if (autoCampaigns.length === 0) return;

  const tenants = await db.select().from(tenantsTable);
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  for (const campaign of autoCampaigns) {
    try {
      const config = (campaign.triggerConfig as Record<string, unknown>) ?? {};
      const sendHour = Number(config["sendHour"] ?? 8);
      if (currentHour !== sendHour) continue;

      const tenant = tenantMap.get(campaign.tenantId);
      const fromName = tenant?.name ?? "VisiteCRM";
      await processTenantCampaign(campaign, fromName);
    } catch (err) {
      logger.error({ err, campaignId: campaign.id }, "[campaign-automation] Campaign failed");
    }
  }

  logger.info("[campaign-automation] Hourly automation check complete");
}
