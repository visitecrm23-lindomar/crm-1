import { Router } from "express";
import { db, aiIntegrationsTable, aiIntegrationLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, ADMIN_ROLES } from "../lib/tenant";
import type { AuthedUser } from "../lib/tenant";
import { generateId } from "../lib/id";
import { encryptCredential, decryptCredential } from "../lib/crypto";
import {
  AI_PROVIDER_DEFAULTS,
  normalizeProvider,
  buildClientFromConfig,
  assertSafeUrl,
  sanitizeProviderError,
} from "../lib/ai-client";

const router = Router();

// Sentinel the frontend echoes back when the user did not change the key.
const MASK = "••••••••";

function maskKey(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    const plain = decryptCredential(encrypted);
    if (plain.length <= 4) return MASK;
    return `${MASK}${plain.slice(-4)}`;
  } catch {
    return MASK;
  }
}

async function writeLog(
  me: AuthedUser,
  event: string,
  level: "info" | "warn" | "error",
  message: string,
): Promise<void> {
  try {
    await db.insert(aiIntegrationLogsTable).values({
      id: generateId(),
      tenantId: me.tenantId,
      event,
      level,
      message,
      actorId: me.id,
      actorName: me.name,
    });
  } catch (err) {
    console.error("[ai-integration] failed to write audit log", err);
  }
}

// Admin/owner only, and must belong to a tenant (superadmins have no tenant).
async function requireAiAdmin(req: import("express").Request, res: import("express").Response): Promise<AuthedUser | null> {
  const me = await requireAuth(req, res);
  if (!me) return null;
  if (!ADMIN_ROLES.includes(me.role) || !me.tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return me;
}

// ─── GET /ai-integration ──────────────────────────────────────────────────────
router.get("/ai-integration", async (req, res): Promise<void> => {
  try {
    const me = await requireAiAdmin(req, res);
    if (!me) return;

    const [cfg] = await db
      .select()
      .from(aiIntegrationsTable)
      .where(eq(aiIntegrationsTable.tenantId, me.tenantId))
      .limit(1);

    res.json({
      provider: cfg?.provider ?? "openai",
      baseUrl: cfg?.baseUrl ?? "",
      defaultModel: cfg?.defaultModel ?? "",
      enabled: cfg?.enabled ?? false,
      status: cfg?.status ?? "disconnected",
      lastError: cfg?.lastError ?? null,
      lastSyncAt: cfg?.lastSyncAt ? cfg.lastSyncAt.toISOString() : null,
      hasApiKey: !!cfg?.apiKeyEncrypted,
      maskedApiKey: maskKey(cfg?.apiKeyEncrypted ?? null),
      providerDefaults: AI_PROVIDER_DEFAULTS,
    });
  } catch (err) {
    req.log.error({ err }, "Error loading AI integration");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /ai-integration/logs ─────────────────────────────────────────────────
router.get("/ai-integration/logs", async (req, res): Promise<void> => {
  try {
    const me = await requireAiAdmin(req, res);
    if (!me) return;

    const rows = await db
      .select()
      .from(aiIntegrationLogsTable)
      .where(eq(aiIntegrationLogsTable.tenantId, me.tenantId))
      .orderBy(desc(aiIntegrationLogsTable.createdAt))
      .limit(50);

    res.json(
      rows.map((r) => ({
        id: r.id,
        event: r.event,
        level: r.level,
        message: r.message,
        actorName: r.actorName,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Error loading AI integration logs");
    res.status(500).json({ error: "Internal server error" });
  }
});

const putSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "custom"]),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  defaultModel: z.string().optional(),
  enabled: z.boolean().optional(),
});

// ─── PUT /ai-integration ──────────────────────────────────────────────────────
router.put("/ai-integration", async (req, res): Promise<void> => {
  try {
    const me = await requireAiAdmin(req, res);
    if (!me) return;

    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      return;
    }
    const body = parsed.data;
    const provider = normalizeProvider(body.provider);

    const [existing] = await db
      .select()
      .from(aiIntegrationsTable)
      .where(eq(aiIntegrationsTable.tenantId, me.tenantId))
      .limit(1);

    // Decide the key to store: a freshly typed key, or the existing one.
    const incomingKey = (body.apiKey ?? "").trim();
    const keyChanged = incomingKey.length > 0 && !incomingKey.startsWith(MASK);
    const apiKeyEncrypted = keyChanged
      ? encryptCredential(incomingKey)
      : (existing?.apiKeyEncrypted ?? null);

    const enabled = body.enabled ?? existing?.enabled ?? false;

    // Cannot enable a per-tenant provider with no key to use.
    if (enabled && !apiKeyEncrypted) {
      res.status(400).json({
        error: "Informe uma chave de API para ativar a configuração de IA.",
      });
      return;
    }

    const baseUrl = (body.baseUrl ?? "").trim() || null;
    const defaultModel = (body.defaultModel ?? "").trim() || null;

    // A compatible ("custom") provider has no default endpoint — without a base
    // URL the SDK would silently target OpenAI and send the key to the wrong
    // provider, so require it explicitly.
    if (provider === "custom" && !baseUrl) {
      res.status(400).json({
        error: "Informe a Base URL para um provedor compatível (OpenAI API).",
      });
      return;
    }

    // Reject SSRF-prone base URLs (non-HTTPS or private/reserved hosts) early so
    // the admin gets a clear error instead of a failed connection later.
    if (baseUrl) {
      try {
        await assertSafeUrl(baseUrl);
      } catch (urlErr) {
        res.status(400).json({
          error: urlErr instanceof Error ? urlErr.message : "URL do provedor inválida.",
        });
        return;
      }
    }

    // Re-testing is required after any credential/endpoint change.
    const resetStatus =
      keyChanged ||
      !existing ||
      existing.provider !== provider ||
      (existing.baseUrl ?? null) !== baseUrl;
    const status = resetStatus ? "disconnected" : existing.status;

    if (existing) {
      await db
        .update(aiIntegrationsTable)
        .set({
          provider,
          apiKeyEncrypted,
          baseUrl,
          defaultModel,
          enabled,
          status,
          ...(resetStatus ? { lastError: null } : {}),
        })
        .where(eq(aiIntegrationsTable.tenantId, me.tenantId));
    } else {
      await db.insert(aiIntegrationsTable).values({
        id: generateId(),
        tenantId: me.tenantId,
        provider,
        apiKeyEncrypted,
        baseUrl,
        defaultModel,
        enabled,
        status,
      });
    }

    await writeLog(
      me,
      "save",
      "info",
      `Configuração salva (provedor: ${provider}, ativo: ${enabled ? "sim" : "não"}${keyChanged ? ", chave atualizada" : ""}).`,
    );

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error saving AI integration");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /ai-integration/test ────────────────────────────────────────────────
// Tests connectivity using the *saved* configuration and persists the resulting
// status, so the displayed connection state always reflects what is stored.
// The admin must save before testing (so we never test unsaved, arbitrary keys
// or endpoints, and status can never diverge from the persisted config).
router.post("/ai-integration/test", async (req, res): Promise<void> => {
  try {
    const me = await requireAiAdmin(req, res);
    if (!me) return;

    const [existing] = await db
      .select()
      .from(aiIntegrationsTable)
      .where(eq(aiIntegrationsTable.tenantId, me.tenantId))
      .limit(1);

    if (!existing?.apiKeyEncrypted) {
      res.status(400).json({
        ok: false,
        status: "error",
        message: "Salve uma chave de API antes de testar a conexão.",
      });
      return;
    }

    const provider = normalizeProvider(existing.provider);
    let apiKey: string;
    try {
      apiKey = decryptCredential(existing.apiKeyEncrypted);
    } catch {
      await db
        .update(aiIntegrationsTable)
        .set({ status: "error", lastError: "Não foi possível ler a chave salva." })
        .where(eq(aiIntegrationsTable.tenantId, me.tenantId));
      res.status(400).json({
        ok: false,
        status: "error",
        message: "Não foi possível ler a chave salva. Salve a chave novamente.",
      });
      return;
    }

    try {
      // buildClientFromConfig is inside the try so a misconfigured custom
      // provider (no Base URL) throws here and is recorded as an error status
      // instead of ever constructing a client that targets OpenAI by default.
      const { client } = buildClientFromConfig({
        provider,
        apiKey,
        baseUrl: existing.baseUrl,
        model: existing.defaultModel,
        timeout: 15000,
        maxRetries: 0,
      });
      // models.list() is a cheap, provider-agnostic connectivity probe across
      // all OpenAI-compatible endpoints (OpenAI, Anthropic, Gemini).
      await client.models.list();

      const now = new Date();
      await db
        .update(aiIntegrationsTable)
        .set({ status: "connected", lastSyncAt: now, lastError: null })
        .where(eq(aiIntegrationsTable.tenantId, me.tenantId));
      await writeLog(me, "test", "info", `Conexão testada com sucesso (provedor: ${provider}).`);

      res.json({
        ok: true,
        status: "connected",
        message: "Conexão estabelecida com sucesso.",
        lastSyncAt: now.toISOString(),
      });
    } catch (apiErr) {
      const message = sanitizeProviderError(apiErr);
      await db
        .update(aiIntegrationsTable)
        .set({ status: "error", lastError: message })
        .where(eq(aiIntegrationsTable.tenantId, me.tenantId));
      await writeLog(me, "test", "error", `Falha no teste de conexão (provedor: ${provider}): ${message}`);

      res.json({ ok: false, status: "error", message });
    }
  } catch (err) {
    req.log.error({ err }, "Error testing AI integration");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
