import { db, campaignsTable, campaignSendsTable, clientsTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { generateId } from "./id";
import { resolveSegment, type SegmentCriteria } from "./campaign-segment";
import { sendReminderHtmlEmail } from "@workspace/email";

const TRIGGER_TYPES = [
  "birthday",
  "post_trip",
  "reactivation",
  "repurchase",
  "cart_abandonment",
] as const;

type TriggerType = (typeof TRIGGER_TYPES)[number];

function buildCriteriaForTrigger(
  triggerType: TriggerType,
  config: Record<string, unknown>
): SegmentCriteria {
  switch (triggerType) {
    case "birthday": {
      const daysAhead = Number(config["daysAhead"] ?? 3);
      const now = new Date();
      const target = new Date(now.getTime() + daysAhead * 86400000);
      const month = target.getMonth() + 1;
      const day = target.getDate();
      return {
        status: "active",
        ...(config["criteria"] as SegmentCriteria | undefined),
        tag: `__birthday_${month}_${day}__`,
      };
    }
    case "post_trip": {
      const daysAfter = Number(config["daysAfter"] ?? 7);
      return {
        status: "active",
        ...(config["criteria"] as SegmentCriteria | undefined),
        inactiveDays: daysAfter,
      };
    }
    case "reactivation": {
      const inactiveDays = Number(config["inactiveDays"] ?? 120);
      return {
        status: "active",
        inactiveDays,
        ...(config["criteria"] as SegmentCriteria | undefined),
      };
    }
    case "repurchase": {
      const days = Number(config["days"] ?? 30);
      return {
        status: "active",
        inactiveDays: days,
        ...(config["criteria"] as SegmentCriteria | undefined),
      };
    }
    case "cart_abandonment": {
      const hours = Number(config["hours"] ?? 24);
      return {
        status: "active",
        inactiveDays: Math.ceil(hours / 24),
        ...(config["criteria"] as SegmentCriteria | undefined),
      };
    }
    default:
      return { status: "active" };
  }
}

async function sendCampaignEmail(
  to: string,
  toName: string,
  subject: string,
  htmlContent: string,
  fromName: string,
) {
  const personalised = htmlContent
    .replace(/\{nome\}/gi, toName)
    .replace(/\{name\}/gi, toName);
  const result = await sendReminderHtmlEmail({ to, subject, html: personalised, fromName });
  if (!result.success) {
    throw new Error(result.error ?? "Email send failed");
  }
}

async function getAlreadySentClientIds(
  campaignId: string
): Promise<Set<string>> {
  const rows = await db
    .select({ clientId: campaignSendsTable.clientId })
    .from(campaignSendsTable)
    .where(eq(campaignSendsTable.campaignId, campaignId));
  return new Set(rows.map((r) => r.clientId));
}

async function processTenantCampaign(
  campaign: typeof campaignsTable.$inferSelect,
  tenantName: string
) {
  const triggerType = campaign.triggerType as TriggerType;
  if (!TRIGGER_TYPES.includes(triggerType)) return;

  const config = (campaign.triggerConfig as Record<string, unknown>) ?? {};
  const criteria = buildCriteriaForTrigger(triggerType, config);
  const { clientIds } = await resolveSegment(campaign.tenantId, criteria);

  if (clientIds.length === 0) return;

  const alreadySent = await getAlreadySentClientIds(campaign.id);
  const eligibleIds = clientIds.filter((id) => !alreadySent.has(id));

  if (eligibleIds.length === 0) return;

  const clients = await db
    .select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email })
    .from(clientsTable)
    .where(eq(clientsTable.tenantId, campaign.tenantId));

  const clientMap = new Map(clients.map((c) => [c.id, c]));

  let successCount = 0;
  let errorCount = 0;

  for (const clientId of eligibleIds) {
    const client = clientMap.get(clientId);
    if (!client?.email) continue;

    const sendId = generateId();
    try {
      if (campaign.type === "email" && campaign.subject) {
        await sendCampaignEmail(
          client.email,
          client.name,
          campaign.subject,
          campaign.content,
          tenantName
        );
      }
      await db.insert(campaignSendsTable).values({
        id: sendId,
        campaignId: campaign.id,
        clientId,
        tenantId: campaign.tenantId,
        status: "sent",
      }).onConflictDoNothing();
      successCount++;
    } catch (err) {
      errorCount++;
      logger.error({ err, campaignId: campaign.id, clientId }, "Failed to send campaign email");
      try {
        await db.insert(campaignSendsTable).values({
          id: sendId,
          campaignId: campaign.id,
          clientId,
          tenantId: campaign.tenantId,
          status: "error",
          error: String(err),
        }).onConflictDoNothing();
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
  logger.info("[campaign-automation] Starting daily automation run");

  const autoCampaigns = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.autoEnabled, true));

  if (autoCampaigns.length === 0) {
    logger.info("[campaign-automation] No auto-enabled campaigns");
    return;
  }

  const tenants = await db.select().from(tenantsTable);
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  for (const campaign of autoCampaigns) {
    try {
      const tenant = tenantMap.get(campaign.tenantId);
      const fromName = tenant?.name ?? "VisiteCRM";
      await processTenantCampaign(campaign, fromName);
    } catch (err) {
      logger.error({ err, campaignId: campaign.id }, "[campaign-automation] Campaign failed");
    }
  }

  logger.info("[campaign-automation] Daily automation run complete");
}
