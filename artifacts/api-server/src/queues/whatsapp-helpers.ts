import { db, referralSettingsTable, clientsTable, tenantsTable, referralsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { sendWhatsAppMessage, interpolateWhatsAppMessage } from "../lib/whatsapp";
import { getWhatsAppQueue } from "./index";
import { logger } from "../lib/logger";
import { REFERRAL_STATUS } from "@workspace/permissions";
import { areWorkersEnabled } from "../lib/redis";

const DEFAULT_CONVERTED_MESSAGE =
  "Boa notícia! {{nome}} usou seu código {{codigo}} e comprou com a {{agencia}}. Seu bônus de R$ {{valor}} está sendo processado.";

const DEFAULT_BONUS_PAID_MESSAGE =
  "Seu bônus de R$ {{valor}} foi pago! Obrigado por indicar clientes para a {{agencia}}.";

const DEFAULT_REVERSED_MESSAGE =
  "Olá! A reserva de {{nome}} foi cancelada e o bônus de R$ {{valor}} foi estornado do seu saldo na {{agencia}}. Seu saldo atual é R$ {{saldo}}.";

async function enqueueOrSend(phone: string, message: string, tenantId: string): Promise<void> {
  const queue = getWhatsAppQueue();
  if (queue) {
    await queue.add("whatsapp-notification", { phone, message, tenantId });
    logger.info({ phone }, "[whatsapp-queue] Job enqueued");
  } else {
    if (!areWorkersEnabled()) {
      logger.warn(
        { phone, tenantId, jobType: "whatsapp-notification" },
        "[workers-disabled] ENABLE_WORKERS=false — sending WhatsApp message directly instead of queuing. Set ENABLE_WORKERS=true to enable async processing.",
      );
    }
    const result = await sendWhatsAppMessage(phone, message);
    if (!result.success && result.error !== "credentials_not_configured") {
      logger.warn({ phone, error: result.error }, "[whatsapp-queue] Direct send failed");
    }
  }
}

export async function dispatchWhatsAppReferralConverted(opts: {
  referrerId: string;
  referredName: string;
  referralCode: string;
  tenantId: string;
}): Promise<void> {
  const { referrerId, referredName, referralCode, tenantId } = opts;

  const [settings] = await db
    .select({
      whatsappEnabled: referralSettingsTable.whatsappEnabled,
      whatsappConvertedMessage: referralSettingsTable.whatsappConvertedMessage,
    })
    .from(referralSettingsTable)
    .where(eq(referralSettingsTable.tenantId, tenantId))
    .limit(1);

  if (!settings?.whatsappEnabled) return;

  const [referrer] = await db
    .select({ whatsapp: clientsTable.whatsapp, phone: clientsTable.phone })
    .from(clientsTable)
    .where(eq(clientsTable.id, referrerId))
    .limit(1);

  const phone = referrer?.whatsapp || referrer?.phone;
  if (!phone) return;

  const [tenant] = await db
    .select({ name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  const [latestReferral] = await db
    .select({ bonusAmount: referralsTable.bonusAmount })
    .from(referralsTable)
    .where(and(
      eq(referralsTable.tenantId, tenantId),
      eq(referralsTable.referrerId, referrerId),
      eq(referralsTable.code, referralCode),
      eq(referralsTable.status, REFERRAL_STATUS.COMPLETED),
    ))
    .orderBy(desc(referralsTable.convertedAt))
    .limit(1);

  const bonusValue = parseFloat(String(latestReferral?.bonusAmount ?? "0")) || 0;

  const template = settings.whatsappConvertedMessage ?? DEFAULT_CONVERTED_MESSAGE;
  const message = interpolateWhatsAppMessage(template, {
    nome: referredName,
    codigo: referralCode,
    valor: bonusValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    agencia: tenant?.name ?? "",
  });

  await enqueueOrSend(phone, message, tenantId);
}

export async function dispatchWhatsAppReferralBonusPaid(opts: {
  referrerId: string;
  referrerPhone: string | null;
  referrerName: string | null;
  referralCode: string | null;
  bonusAmount: number;
  tenantId: string;
  tenantName: string;
}): Promise<void> {
  const { referrerId, referrerPhone, referrerName, referralCode, bonusAmount, tenantId, tenantName } = opts;

  const [settings] = await db
    .select({
      whatsappEnabled: referralSettingsTable.whatsappEnabled,
      whatsappBonusPaidMessage: referralSettingsTable.whatsappBonusPaidMessage,
    })
    .from(referralSettingsTable)
    .where(eq(referralSettingsTable.tenantId, tenantId))
    .limit(1);

  if (!settings?.whatsappEnabled) return;

  let phone = referrerPhone;
  if (!phone) {
    const [referrer] = await db
      .select({ whatsapp: clientsTable.whatsapp, phone: clientsTable.phone })
      .from(clientsTable)
      .where(eq(clientsTable.id, referrerId))
      .limit(1);
    phone = referrer?.whatsapp || referrer?.phone || null;
  }
  if (!phone) return;

  const template = settings.whatsappBonusPaidMessage ?? DEFAULT_BONUS_PAID_MESSAGE;
  const message = interpolateWhatsAppMessage(template, {
    nome: referrerName ?? "",
    codigo: referralCode ?? "",
    bonus: bonusAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    valor: bonusAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    agencia: tenantName,
  });

  await enqueueOrSend(phone, message, tenantId);
}

export async function dispatchWhatsAppReferralReversed(opts: {
  referrerId: string;
  referredName: string;
  bonusAmount: number;
  newPendingBalance: number;
  tenantId: string;
}): Promise<void> {
  const { referrerId, referredName, bonusAmount, newPendingBalance, tenantId } = opts;

  const [settings] = await db
    .select({ whatsappEnabled: referralSettingsTable.whatsappEnabled })
    .from(referralSettingsTable)
    .where(eq(referralSettingsTable.tenantId, tenantId))
    .limit(1);

  if (!settings?.whatsappEnabled) return;

  const [referrer] = await db
    .select({ whatsapp: clientsTable.whatsapp, phone: clientsTable.phone })
    .from(clientsTable)
    .where(eq(clientsTable.id, referrerId))
    .limit(1);

  const phone = referrer?.whatsapp || referrer?.phone;
  if (!phone) return;

  const [tenant] = await db
    .select({ name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  const message = interpolateWhatsAppMessage(DEFAULT_REVERSED_MESSAGE, {
    nome: referredName,
    valor: bonusAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    agencia: tenant?.name ?? "",
    saldo: newPendingBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  });

  await enqueueOrSend(phone, message, tenantId);
}
