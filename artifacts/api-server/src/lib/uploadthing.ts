import { UTApi } from "uploadthing/server";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * PATCHED VERSION: uploadthing@7.7.4 (pinned — do NOT remove the ^ pin in package.json)
 *
 * Work-around for two bugs in UploadThing SDK v7.x / Effect-Platform HTTP client
 * that cause PUT requests to UploadThing's ingest CDN to fail with
 * "Failed to verify URL: Invalid signature" in production.
 *
 * Root causes identified from production logs (confirmed on uploadthing@7.7.4):
 *
 * Bug 1 — Spurious `Range: bytes=0-` header
 *   Effect-Platform adds this header to all PUT requests. UploadThing's CDN HMAC
 *   verifies the exact set of signed headers; any extra unsigned header breaks the
 *   signature check.
 *
 * Bug 2 — Double-encoded query parameters
 *   Effect-Platform percent-encodes already-encoded sequences in the presigned URL:
 *   `image%2Fpng` → `image%252Fpng`, `Visite%20Cariri` → `Visite%2520Cariri`.
 *   The CDN decodes once, receiving `image%2Fpng` instead of `image/png`. Since the
 *   HMAC was computed over the decoded value, the check fails.
 *
 * WHY undici setGlobalDispatcher + compose (not globalThis.fetch patch):
 *   Effect-Platform's HttpClient uses undici directly — it does NOT go through
 *   globalThis.fetch. Patching globalThis.fetch has no effect on Effect's requests.
 *   undici's compose interceptor wraps the global agent and intercepts ALL undici
 *   traffic (including Effect Platform's) at the dispatch level, before bytes hit wire.
 *
 * BEFORE UPGRADING uploadthing:
 *   Check whether Effect-Platform's HTTP client still adds the Range header and
 *   double-encodes params on CDN PUT requests. If fixed upstream, remove this patch
 *   and the exact-version pin in package.json.
 *   Relevant upstream: https://github.com/pingdotgg/uploadthing/issues
 */
function patchUndiciForUploadThingCDN(): void {
  // Dynamically required to avoid TS lib conflicts — undici v8 types live at
  // ./types/index.d.ts and are re-exported from the package root; we use
  // runtime require + cast to avoid import-resolution fights with different
  // undici versions that may be present in the monorepo.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    Agent,
    setGlobalDispatcher,
  } = require("undici") as {
    Agent: new () => {
      compose: (interceptor: (dispatch: (opts: Record<string, unknown>, handler: unknown) => boolean) => (opts: Record<string, unknown>, handler: unknown) => boolean) => { dispatch: (opts: Record<string, unknown>, handler: unknown) => boolean };
    };
    setGlobalDispatcher: (d: unknown) => void;
  };

  const agent = new Agent();

  const wrapped = agent.compose(
    (dispatch) =>
      (opts, handler) => {
        const origin =
          typeof opts["origin"] === "string"
            ? opts["origin"]
            : opts["origin"] instanceof URL
            ? (opts["origin"] as URL).href
            : "";

        if (origin.includes(".ingest.uploadthing.com") && opts["method"] === "PUT") {
          // Fix 1: Un-double-encode query params in the path.
          // Effect-Platform encodes % → %25 so %2F becomes %252F.
          // One substitution pass restores %25XX → %XX.
          if (typeof opts["path"] === "string") {
            opts["path"] = (opts["path"] as string).replace(/%25([0-9A-Fa-f]{2})/g, "%$1");
          }

          // Fix 2: Strip the spurious `Range: bytes=0-` header.
          // Effect-Platform adds it unconditionally; UploadThing CDN rejects it.
          const headers = opts["headers"];
          if (Array.isArray(headers)) {
            const filtered: unknown[] = [];
            for (let i = 0; i < headers.length; i += 2) {
              const key = headers[i];
              if (typeof key !== "string" || key.toLowerCase() !== "range") {
                filtered.push(headers[i], headers[i + 1]);
              }
            }
            opts["headers"] = filtered;
          } else if (headers && typeof headers === "object") {
            const filtered: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
              if (k.toLowerCase() !== "range") filtered[k] = v;
            }
            opts["headers"] = filtered;
          }
        }

        return dispatch(opts, handler);
      },
  );

  setGlobalDispatcher(wrapped);
}

patchUndiciForUploadThingCDN();

export const utapi = new UTApi();

const UPLOADTHING_HOSTNAME_SUFFIXES = ["utfs.io", "ufs.io", "uploadthing.com"];
const UPLOADTHING_PATH_PREFIX = "/f/";

export function extractVerifiedUploadThingKey(url: string): string | null {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();
    const isKnownHost = UPLOADTHING_HOSTNAME_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
    );
    if (!isKnownHost) return null;
    if (!u.pathname.startsWith(UPLOADTHING_PATH_PREFIX)) return null;
    const key = u.pathname.slice(UPLOADTHING_PATH_PREFIX.length);
    return key || null;
  } catch {
    return null;
  }
}

/**
 * Returns true if the given file key is currently referenced by a record
 * belonging to a different tenant. When true the file must NOT be deleted —
 * doing so would destroy another tenant's asset (cross-tenant integrity attack).
 *
 * Checks scalar UploadThing URL columns and image-array columns across all
 * tenant-scoped tables that participate in deleteOrphanedFile / deleteOrphanedImages
 * deletion flows. Gallery / image-array columns are checked via unnest(). The
 * documents table is checked both by the indexed file_key column and by the url
 * column. store_products has no direct tenantId so it is resolved via a JOIN to
 * stores.
 */
async function isFileKeyReferencedByOtherTenant(key: string, callerTenantId: string): Promise<boolean> {
  const like = `%/f/${key}`;
  const result = await db.execute(sql`
    SELECT EXISTS(
      SELECT 1 FROM tenants
        WHERE logo_url LIKE ${like} AND id != ${callerTenantId}
      UNION ALL
      SELECT 1 FROM stores
        WHERE (logo LIKE ${like} OR logo_dark LIKE ${like} OR favicon LIKE ${like}
               OR banner_home LIKE ${like} OR banner_mobile LIKE ${like})
          AND tenant_id != ${callerTenantId}
      UNION ALL
      SELECT 1 FROM trips
        WHERE (cover_image LIKE ${like}
               OR EXISTS (SELECT 1 FROM unnest(gallery) g WHERE g LIKE ${like}))
          AND tenant_id != ${callerTenantId}
      UNION ALL
      SELECT 1 FROM accommodations
        WHERE (cover_image LIKE ${like}
               OR EXISTS (SELECT 1 FROM unnest(gallery) g WHERE g LIKE ${like}))
          AND tenant_id != ${callerTenantId}
      UNION ALL
      SELECT 1 FROM destinations
        WHERE (cover_image LIKE ${like}
               OR EXISTS (SELECT 1 FROM unnest(gallery) g WHERE g LIKE ${like}))
          AND tenant_id != ${callerTenantId}
      UNION ALL
      SELECT 1 FROM vehicles
        WHERE photo_url LIKE ${like} AND tenant_id != ${callerTenantId}
      UNION ALL
      SELECT 1 FROM clients
        WHERE photo_url LIKE ${like} AND tenant_id != ${callerTenantId}
      UNION ALL
      SELECT 1 FROM users
        WHERE avatar_url LIKE ${like} AND tenant_id != ${callerTenantId}
      UNION ALL
      SELECT 1 FROM documents
        WHERE (file_key = ${key} OR url LIKE ${like})
          AND tenant_id != ${callerTenantId}
      UNION ALL
      SELECT 1 FROM store_products sp
        JOIN stores s ON s.id = sp.store_id
        WHERE (sp.thumbnail LIKE ${like}
               OR EXISTS (SELECT 1 FROM unnest(sp.images) img WHERE img LIKE ${like})
               OR EXISTS (SELECT 1 FROM unnest(sp.gallery) g WHERE g LIKE ${like}))
          AND s.tenant_id != ${callerTenantId}
    ) AS referenced
  `);
  // db.execute returns { rows: [...] } — read the first row from .rows
  const rows = (result as unknown as { rows: Array<{ referenced: boolean }> }).rows;
  return rows?.[0]?.referenced === true;
}

type Logger = { warn: (obj: object, msg: string) => void };

export async function deleteOrphanedFile(
  oldUrl: string | null | undefined,
  newUrl: string | null | undefined,
  log: Logger,
  callerTenantId?: string
): Promise<void> {
  if (!oldUrl || oldUrl === newUrl) return;
  const key = extractVerifiedUploadThingKey(oldUrl);
  if (!key) {
    log.warn({ oldUrl }, "Skipped orphaned file deletion: URL did not match known UploadThing hosts");
    return;
  }
  if (callerTenantId) {
    try {
      const crossTenantRisk = await isFileKeyReferencedByOtherTenant(key, callerTenantId);
      if (crossTenantRisk) {
        log.warn({ fileKey: key, callerTenantId }, "Skipped file deletion: key is referenced by another tenant");
        return;
      }
    } catch (checkErr) {
      log.warn({ err: checkErr, fileKey: key }, "Cross-tenant ownership check failed; skipping file deletion as a precaution");
      return;
    }
  }
  try {
    await utapi.deleteFiles(key);
  } catch (err) {
    log.warn({ err, fileKey: key }, "Failed to delete orphaned file from UploadThing");
  }
}

export async function deleteOrphanedImages(
  oldImages: string[] | null | undefined,
  newImages: string[] | null | undefined,
  log: Logger,
  callerTenantId?: string
): Promise<void> {
  if (!oldImages || oldImages.length === 0) return;
  const newSet = new Set(newImages ?? []);
  const toDelete = oldImages.filter((url) => !newSet.has(url));
  for (const url of toDelete) {
    await deleteOrphanedFile(url, null, log, callerTenantId);
  }
}
