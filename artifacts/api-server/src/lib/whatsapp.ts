import { logger } from "./logger";

/**
 * Normalises a Brazilian phone number to E.164 format (no "+").
 * Accepts numbers with or without the country code (55).
 */
function toE164Brazil(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

export interface WhatsAppSendResult {
  success: boolean;
  error?: string;
}

/**
 * Sends a text message via Z-API.
 *
 * Returns gracefully (success: false) when credentials are absent so the
 * caller can decide whether to log or silently skip.
 */
export async function sendWhatsAppMessage(
  phone: string,
  message: string,
): Promise<WhatsAppSendResult> {
  const instanceId = process.env["ZAPI_INSTANCE_ID"];
  const token = process.env["ZAPI_TOKEN"];

  if (!instanceId || !token) {
    logger.debug("[whatsapp] Credentials not configured — skipping send");
    return { success: false, error: "credentials_not_configured" };
  }

  const e164 = toE164Brazil(phone);
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: e164, message }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      logger.warn({ phone: e164, status: resp.status, body }, "[whatsapp] Z-API error");
      return { success: false, error: `zapi_${resp.status}` };
    }

    logger.info({ phone: e164 }, "[whatsapp] Message sent");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ phone: e164, err: msg }, "[whatsapp] Network error");
    return { success: false, error: msg };
  }
}

/**
 * Replaces template variables in a message string.
 * Supported variables: {{nome}}, {{codigo}}, {{valor}}, {{agencia}}
 */
export function interpolateWhatsAppMessage(
  template: string,
  vars: { nome?: string; codigo?: string; valor?: string; agencia?: string },
): string {
  return template
    .replace(/\{\{nome\}\}/g, vars.nome ?? "")
    .replace(/\{\{codigo\}\}/g, vars.codigo ?? "")
    .replace(/\{\{valor\}\}/g, vars.valor ?? "")
    .replace(/\{\{agencia\}\}/g, vars.agencia ?? "");
}
