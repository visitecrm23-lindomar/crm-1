import { db, clientsTable, couponsTable, birthdayMessagesTable, tenantsTable, systemConfigsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { generateId } from "./id";
import { sendBirthdayEmail } from "@workspace/email";

const ADMIN_EMAIL = "reservas@visitecrm.com.br";

interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}

interface BirthdaySettings {
  enabled: boolean;
  discountPercent: number;
  validDays: number;
  sendWhatsapp: boolean;
  sendEmail: boolean;
  whatsappMessage?: string;
  emailSubject?: string;
  emailMessage?: string;
  senderName?: string;
}

const DEFAULT_SETTINGS: BirthdaySettings = {
  enabled: true,
  discountPercent: 10,
  validDays: 30,
  sendWhatsapp: true,
  sendEmail: true,
};

async function getSystemConfig<T>(tenantId: string, key: string): Promise<T | null> {
  const [row] = await db
    .select()
    .from(systemConfigsTable)
    .where(and(eq(systemConfigsTable.tenantId, tenantId), eq(systemConfigsTable.key, key)))
    .limit(1);
  return row ? (row.value as T) : null;
}

export async function getBirthdaySettings(tenantId: string): Promise<BirthdaySettings> {
  const stored = await getSystemConfig<Partial<BirthdaySettings>>(tenantId, "birthday_settings");
  return { ...DEFAULT_SETTINGS, ...stored };
}

function formatBirthdayCouponCode(clientName: string, year: number): string {
  const slug = clientName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6);
  return `ANIVER-${slug}-${year}`;
}

export async function generateBirthdayCoupon(
  tenantId: string,
  clientId: string,
  clientName: string,
  year: number,
  discountPercent: number,
  validDays: number
): Promise<{ id: string; code: string }> {
  const baseCode = formatBirthdayCouponCode(clientName, year);
  let code = baseCode;
  let suffix = 0;

  while (true) {
    const existing = await db
      .select({ id: couponsTable.id })
      .from(couponsTable)
      .where(and(eq(couponsTable.tenantId, tenantId), eq(couponsTable.code, code)))
      .limit(1);
    if (existing.length === 0) break;
    suffix++;
    code = `${baseCode}-${suffix}`;
  }

  const validFrom = new Date();
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + validDays);

  const id = generateId();
  await db.insert(couponsTable).values({
    id,
    tenantId,
    code,
    type: "percentage",
    value: String(discountPercent),
    maxUses: 1,
    isActive: true,
    validFrom,
    validUntil,
    clientId,
    isBirthday: true,
  });

  return { id, code };
}

async function sendWhatsAppMessage(
  config: EvolutionConfig,
  phone: string,
  message: string
): Promise<void> {
  const cleanPhone = phone.replace(/\D/g, "");
  const number = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

  const url = `${config.apiUrl.replace(/\/$/, "")}/message/sendText/${config.instanceName}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ number, text: message }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Evolution API error ${response.status}: ${body}`);
  }
}

export async function processBirthdayForClient(
  tenantId: string,
  clientId: string,
  options?: { isManual?: boolean; sentById?: string }
): Promise<{ success: boolean; error?: string; couponCode?: string }> {
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.tenantId, tenantId)))
    .limit(1);

  if (!client) return { success: false, error: "Client not found" };
  if (!client.birthDate) return { success: false, error: "Client has no birth date" };

  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) return { success: false, error: "Tenant not found" };

  const settings = await getBirthdaySettings(tenantId);
  const year = new Date().getFullYear();

  const existing = await db
    .select()
    .from(birthdayMessagesTable)
    .where(
      and(
        eq(birthdayMessagesTable.tenantId, tenantId),
        eq(birthdayMessagesTable.clientId, clientId),
        eq(birthdayMessagesTable.birthdayYear, year)
      )
    )
    .limit(1);

  if (existing.length > 0 && !options?.isManual) {
    return { success: false, error: "Already sent this year" };
  }

  const { id: couponId, code: couponCode } = await generateBirthdayCoupon(
    tenantId,
    clientId,
    client.name,
    year,
    settings.discountPercent,
    settings.validDays
  );

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + settings.validDays);
  const validUntilStr = validUntil.toLocaleDateString("pt-BR");

  const messageId = generateId();
  const record = {
    id: messageId,
    tenantId,
    clientId,
    birthdayYear: year,
    couponId,
    couponCode,
    isManual: options?.isManual ?? false,
    sentById: options?.sentById,
    sentWhatsapp: false,
    sentEmail: false,
  };

  let sentWhatsapp = false;
  let sentEmail = false;
  let whatsappError: string | undefined;
  let emailError: string | undefined;

  const firstName = client.name.split(" ")[0];
  const agencyName = settings.senderName || tenant.name;

  function interpolateTemplate(template: string): string {
    return template
      .replace(/\{\{name\}\}/gi, firstName)
      .replace(/\{\{coupon_code\}\}/gi, couponCode)
      .replace(/\{\{discount\}\}/gi, String(settings.discountPercent))
      .replace(/\{\{valid_until\}\}/gi, validUntilStr)
      .replace(/\{\{agency_name\}\}/gi, agencyName);
  }

  if (settings.sendWhatsapp && client.whatsappOptIn !== false && client.whatsapp) {
    try {
      const evolutionConfig = await getSystemConfig<EvolutionConfig>(tenantId, "whatsapp_evolution");
      if (evolutionConfig?.apiUrl && evolutionConfig?.apiKey && evolutionConfig?.instanceName) {
        const defaultMsg = settings.whatsappMessage
          ? interpolateTemplate(settings.whatsappMessage)
          : `🎂 Feliz Aniversário, ${firstName}!\n\nA ${agencyName} tem um presente especial para você: *${settings.discountPercent}% de desconto* na sua próxima viagem!\n\nUse o cupom: *${couponCode}*\nVálido até ${validUntilStr}\n\nAproveitie para planejar a viagem dos seus sonhos! 🌍`;

        await sendWhatsAppMessage(evolutionConfig, client.whatsapp, defaultMsg);
        sentWhatsapp = true;
      }
    } catch (err) {
      whatsappError = err instanceof Error ? err.message : String(err);
      console.error("[birthday] WhatsApp send error:", whatsappError);
    }
  }

  if (settings.sendEmail && client.emailOptIn !== false && client.email) {
    try {
      const result = await sendBirthdayEmail({
        clientName: client.name,
        clientEmail: client.email,
        agencyName: agencyName,
        agencyEmail: tenant.email,
        agencyPhone: tenant.phone ?? "",
        couponCode,
        discountPercent: settings.discountPercent,
        validUntil: validUntilStr,
      }, {
        emailSubject: settings.emailSubject ?? null,
        senderName: settings.senderName ?? null,
        emailMessage: settings.emailMessage ? interpolateTemplate(settings.emailMessage) : null,
      });
      if (result.success) {
        sentEmail = true;
      } else {
        emailError = result.error;
      }
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error("[birthday] Email send error:", emailError);
    }
  }

  const now = new Date();
  await db.insert(birthdayMessagesTable).values({
    ...record,
    sentWhatsapp,
    sentEmail,
    whatsappSentAt: sentWhatsapp ? now : undefined,
    emailSentAt: sentEmail ? now : undefined,
    whatsappError: whatsappError ?? null,
    emailError: emailError ?? null,
  });

  return {
    success: sentWhatsapp || sentEmail,
    couponCode,
    error:
      !sentWhatsapp && !sentEmail
        ? [whatsappError, emailError].filter(Boolean).join("; ") || "No channel available"
        : undefined,
  };
}

export async function runBirthdayCronForTenant(tenantId: string): Promise<void> {
  const settings = await getBirthdaySettings(tenantId);
  if (!settings.enabled) return;

  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const year = today.getFullYear();

  const allClients = await db
    .select()
    .from(clientsTable)
    .where(and(eq(clientsTable.tenantId, tenantId), sql`birth_date IS NOT NULL`));

  const todayBirthday = allClients.filter((c) => {
    const bd = c.birthDate!;
    const bMonth = bd.getMonth() + 1;
    const bDay = bd.getDate();
    return bMonth === month && bDay === day;
  });

  if (todayBirthday.length === 0) return;

  const clientIds = todayBirthday.map((c) => c.id);
  const alreadySent = await db
    .select({ clientId: birthdayMessagesTable.clientId })
    .from(birthdayMessagesTable)
    .where(
      and(
        eq(birthdayMessagesTable.tenantId, tenantId),
        eq(birthdayMessagesTable.birthdayYear, year),
        inArray(birthdayMessagesTable.clientId, clientIds)
      )
    );

  const alreadySentIds = new Set(alreadySent.map((r) => r.clientId));

  for (const client of todayBirthday) {
    if (alreadySentIds.has(client.id)) continue;
    try {
      await processBirthdayForClient(tenantId, client.id);
    } catch (err) {
      console.error(`[birthday] Error processing client ${client.id}:`, err);
    }
  }
}

export async function runBirthdayCron(): Promise<void> {
  console.log("[birthday] Running daily birthday cron...");
  try {
    const tenants = await db
      .select({ id: tenantsTable.id, status: tenantsTable.status, settings: tenantsTable.settings })
      .from(tenantsTable);

    const activeTenants = tenants.filter((t) => {
      if (t.status === "suspended") return false;
      const settings = t.settings as Record<string, unknown> | null;
      if (settings && settings.birthdayMessagesEnabled === false) return false;
      return true;
    });

    for (const tenant of activeTenants) {
      try {
        await runBirthdayCronForTenant(tenant.id);
      } catch (err) {
        console.error(`[birthday] Error for tenant ${tenant.id}:`, err);
      }
    }
    console.log(`[birthday] Daily cron complete. Processed ${activeTenants.length} tenants.`);
  } catch (err) {
    console.error("[birthday] Cron failed:", err);
  }
}
