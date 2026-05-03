import { db, storesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encryptCredential, isEncrypted } from "./crypto";
import { logger } from "./logger";

// One-shot, idempotent migration: walks every store row and encrypts any
// stripeSecretKey / mpAccessToken / pixKey still in plaintext. Re-runs are
// safe — already-encrypted values are detected by their `enc:v1:` prefix
// and skipped. Called at server startup after drizzle migrations.
export async function backfillEncryptedCredentials(): Promise<void> {
  if (!process.env["CREDENTIAL_ENCRYPTION_KEY"]) return;

  const rows = await db
    .select({
      id: storesTable.id,
      stripeSecretKey: storesTable.stripeSecretKey,
      mpAccessToken: storesTable.mpAccessToken,
      pixKey: storesTable.pixKey,
    })
    .from(storesTable);

  let updated = 0;
  for (const r of rows) {
    const patch: Record<string, string> = {};
    if (r.stripeSecretKey && !isEncrypted(r.stripeSecretKey)) {
      patch["stripeSecretKey"] = encryptCredential(r.stripeSecretKey);
    }
    if (r.mpAccessToken && !isEncrypted(r.mpAccessToken)) {
      patch["mpAccessToken"] = encryptCredential(r.mpAccessToken);
    }
    if (r.pixKey && !isEncrypted(r.pixKey)) {
      patch["pixKey"] = encryptCredential(r.pixKey);
    }
    if (Object.keys(patch).length > 0) {
      await db.update(storesTable).set(patch).where(eq(storesTable.id, r.id));
      updated++;
    }
  }

  if (updated > 0) {
    logger.info({ updated }, "[credential-backfill] Encrypted plaintext gateway credentials");
  }
}
