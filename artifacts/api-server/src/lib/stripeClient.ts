import Stripe from "stripe";

async function getStripeSecretKey(): Promise<string> {
  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;

  if (hostname && xReplitToken) {
    try {
      const resp = await fetch(
        `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
        {
          headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
          signal: AbortSignal.timeout(5_000),
        }
      );
      if (resp.ok) {
        const data = await resp.json() as { items?: Array<{ settings?: { secret_key?: string } }> };
        const secretKey = data.items?.[0]?.settings?.secret_key;
        if (secretKey) return secretKey;
      }
    } catch {
      // Fall through to env var
    }
  }

  const envKey = process.env["STRIPE_SECRET_KEY"];
  if (envKey) return envKey;

  throw new Error(
    "Stripe não configurado. Conecte o Stripe via Integrações ou defina STRIPE_SECRET_KEY."
  );
}

export async function getStripeWebhookSecret(): Promise<string | undefined> {
  const envSecret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (envSecret) return envSecret;

  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;

  if (hostname && xReplitToken) {
    try {
      const resp = await fetch(
        `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
        {
          headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
          signal: AbortSignal.timeout(5_000),
        }
      );
      if (resp.ok) {
        const data = await resp.json() as { items?: Array<{ settings?: { webhook_secret?: string } }> };
        return data.items?.[0]?.settings?.webhook_secret;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = await getStripeSecretKey();
  return new Stripe(secretKey);
}
