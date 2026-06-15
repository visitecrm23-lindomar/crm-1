import OpenAI from "openai";
import { lookup } from "node:dns/promises";
import { lookup as dnsLookupCb } from "node:dns";
import type { LookupAddress, LookupOptions } from "node:dns";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { db, aiIntegrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decryptCredential } from "./crypto";
import { openai as managedClient } from "@workspace/integrations-openai-ai-server";

export type AIProvider = "openai" | "anthropic" | "gemini" | "custom";

// ─── SSRF protection ──────────────────────────────────────────────────────────
// Tenant admins supply their own provider base URL. Without validation the
// server-side OpenAI SDK could be pointed at internal services or the cloud
// metadata endpoint (169.254.169.254). We require HTTPS, block private/reserved
// IP ranges (checked against the resolved address, not just the hostname), and
// refuse redirects that could bypass the check.

// Parses any textual IPv6 form to its 16 bytes, or null if invalid. Handles
// "::" zero-compression and a trailing embedded dotted-quad IPv4
// (e.g. ::ffff:127.0.0.1) by first folding it into two hex groups.
function ipv6ToBytes(input: string): number[] | null {
  let s = input.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone); // drop scope/zone id
  const lastColon = s.lastIndexOf(":");
  if (lastColon >= 0) {
    const tail = s.slice(lastColon + 1);
    if (tail.includes(".")) {
      if (!net.isIPv4(tail)) return null;
      const p = tail.split(".").map(Number) as [number, number, number, number];
      s =
        s.slice(0, lastColon + 1) +
        (((p[0] << 8) | p[1]) >>> 0).toString(16) +
        ":" +
        (((p[2] << 8) | p[3]) >>> 0).toString(16);
    }
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  let groups: string[];
  if (halves.length === 2) {
    const tailGroups = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - head.length - tailGroups.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tailGroups];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const v = parseInt(g, 16);
    bytes.push((v >> 8) & 0xff, v & 0xff);
  }
  return bytes;
}

// True when an IP literal is loopback/private/link-local/reserved and therefore
// must not be reachable from a server-side request. Handles IPv4, IPv6, and
// EVERY textual encoding of IPv4-in-IPv6 — mapped (::ffff:0:0/96), compatible
// (::/96, incl. ::1 and ::), and NAT64 (64:ff9b::/96) — so a hex form such as
// ::ffff:7f00:1 cannot smuggle 127.0.0.1 past the check. Surrounding brackets
// (from a URL host) are tolerated.
export function isPrivateIp(ipRaw: string): boolean {
  const ip = ipRaw.replace(/^\[|\]$/g, "");
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const bytes = ipv6ToBytes(ip);
    if (!bytes) return true; // unparseable → unsafe
    const allZero = (from: number, to: number): boolean =>
      bytes.slice(from, to).every((x) => x === 0);
    const embeddedV4 = `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
    // IPv4-mapped ::ffff:0:0/96
    if (allZero(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return isPrivateIp(embeddedV4);
    // IPv4-compatible ::/96 (covers ::1 loopback and :: unspecified too)
    if (allZero(0, 12)) return isPrivateIp(embeddedV4);
    // NAT64 64:ff9b::/96
    if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && allZero(4, 12))
      return isPrivateIp(embeddedV4);
    if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true; // link-local fe80::/10
    if ((bytes[0] & 0xfe) === 0xfc) return true; // unique-local fc00::/7
    return false;
  }
  return true; // not a recognizable IP → treat as unsafe
}

// Validates a provider URL is HTTPS and resolves only to public addresses.
// Throws a user-safe (Portuguese) message when the URL is not allowed.
export async function assertSafeUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL do provedor inválida.");
  }
  if (url.protocol !== "https:") {
    throw new Error("A URL do provedor deve usar HTTPS.");
  }
  // url.hostname keeps the brackets for IPv6 literals ("[::1]"); strip them so
  // net.isIP recognizes the literal and we classify it instead of (incorrectly)
  // sending a bracketed string to DNS resolution.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    const results = await lookup(host, { all: true }).catch(() => []);
    addresses = results.map((r) => r.address);
  }
  if (addresses.length === 0) {
    throw new Error("Não foi possível resolver o host do provedor.");
  }
  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error("Endpoint do provedor não permitido.");
    }
  }
}

// Connection-time SSRF guard. assertSafeUrl validates the URL up front, but a
// hostname can rebind to a private address between validation and the actual
// socket connect (DNS rebinding / TOCTOU). This custom lookup is invoked by
// undici at connect time and rejects any hostname whose resolved address is
// private/reserved, binding the check to the real connection rather than a
// throwaway pre-flight resolution. (Literal private IPs in the URL are still
// caught earlier by assertSafeUrl, since undici skips lookup for literal IPs.)
function ssrfLookup(
  hostname: string,
  options: LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void {
  dnsLookupCb(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    for (const a of addresses) {
      if (isPrivateIp(a.address)) {
        return callback(new Error("Endpoint do provedor não permitido."), "");
      }
    }
    if (options.all) {
      callback(null, addresses);
    } else {
      const first = addresses[0]!;
      callback(null, first.address, first.family);
    }
  });
}

const ssrfDispatcher = new Agent({ connect: { lookup: ssrfLookup as never } });

// Passed to the OpenAI SDK as its `fetch`. We pre-validate the URL (HTTPS +
// no literal private IPs), refuse redirects, and route the request through the
// SSRF-aware undici dispatcher. undici's own fetch is used (not Node's global
// fetch) so the dispatcher and fetch come from the same undici instance.
const ssrfSafeFetch = (async (input: unknown, init?: unknown) => {
  const urlStr =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as { url: string }).url;
  await assertSafeUrl(urlStr);
  return undiciFetch(input as never, {
    ...(init as object),
    redirect: "error",
    dispatcher: ssrfDispatcher,
  });
}) as unknown as typeof fetch;

// Maps provider/network errors to short, non-sensitive messages. Avoids echoing
// raw response bodies from arbitrary endpoints back to the client or audit log.
export function sanitizeProviderError(err: unknown): string {
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === "number") {
    if (status === 401 || status === 403)
      return `Credenciais inválidas ou sem permissão (HTTP ${status}).`;
    if (status === 404) return "Endpoint ou modelo não encontrado (HTTP 404).";
    if (status === 429) return "Limite de requisições excedido (HTTP 429).";
    if (status >= 500) return `O provedor retornou um erro (HTTP ${status}).`;
    return `Falha na requisição ao provedor (HTTP ${status}).`;
  }
  const name = (err as { name?: string } | null)?.name;
  if (name === "APIConnectionTimeoutError") return "Tempo de conexão esgotado.";
  if (name === "APIConnectionError")
    return "Não foi possível conectar ao provedor.";
  // Our own validation/SSRF messages are safe and short — surface them as-is.
  if (
    err instanceof Error &&
    err.message.length < 120 &&
    /(HTTPS|host|URL|permitido|resolver)/i.test(err.message)
  ) {
    return err.message;
  }
  return "Falha ao conectar ao provedor de IA.";
}

// Default OpenAI-compatible endpoint + a sensible default model per provider.
// Anthropic and Gemini both expose OpenAI-compatible REST endpoints, so a single
// OpenAI SDK code path serves every provider.
export const AI_PROVIDER_DEFAULTS: Record<
  AIProvider,
  { baseUrl: string; model: string; label: string }
> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o", label: "OpenAI" },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-3-5-sonnet-latest",
    label: "Anthropic",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
    label: "Google Gemini",
  },
  custom: { baseUrl: "", model: "", label: "Compatível (OpenAI API)" },
};

// Model used by the platform-managed proxy fallback.
const MANAGED_MODEL = "gpt-5.4";

export interface ResolvedAIClient {
  client: OpenAI;
  model: string;
  source: "tenant" | "managed";
  provider: AIProvider;
}

export function normalizeProvider(p: string | null | undefined): AIProvider {
  if (p === "openai" || p === "anthropic" || p === "gemini" || p === "custom") return p;
  return "openai";
}

export function resolveBaseUrl(
  provider: AIProvider,
  baseUrl: string | null | undefined,
): string | undefined {
  const trimmed = (baseUrl ?? "").trim();
  if (trimmed) return trimmed;
  const def = AI_PROVIDER_DEFAULTS[provider].baseUrl;
  return def || undefined;
}

export function resolveModel(provider: AIProvider, model: string | null | undefined): string {
  const trimmed = (model ?? "").trim();
  if (trimmed) return trimmed;
  return AI_PROVIDER_DEFAULTS[provider].model || "gpt-4o";
}

export interface BuildClientOpts {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string | null;
  model?: string | null;
  timeout?: number;
  maxRetries?: number;
}

// Builds an OpenAI-compatible client from explicit config. Used both by the
// per-tenant resolver and the Test Connection flow (which tests credentials
// before they are persisted).
export function buildClientFromConfig(opts: BuildClientOpts): ResolvedAIClient {
  const baseURL = resolveBaseUrl(opts.provider, opts.baseUrl);
  // Central guard for every call site (test endpoint included): a compatible
  // ("custom") provider has no default endpoint. Without a base URL the OpenAI
  // SDK silently targets OpenAI's API and would send the tenant's key to the
  // wrong provider, so refuse to build the client.
  if (opts.provider === "custom" && !baseURL) {
    throw new Error("Informe a Base URL para um provedor compatível (OpenAI API).");
  }
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL,
    fetch: ssrfSafeFetch,
    ...(opts.timeout !== undefined ? { timeout: opts.timeout } : {}),
    ...(opts.maxRetries !== undefined ? { maxRetries: opts.maxRetries } : {}),
  });
  return {
    client,
    model: resolveModel(opts.provider, opts.model),
    source: "tenant",
    provider: opts.provider,
  };
}

// Resolves the AI client for a tenant: the per-tenant configured provider when
// it is enabled and has a stored key, otherwise the platform-managed proxy.
export async function getAIClientForTenant(tenantId: string): Promise<ResolvedAIClient> {
  if (tenantId) {
    const [cfg] = await db
      .select()
      .from(aiIntegrationsTable)
      .where(eq(aiIntegrationsTable.tenantId, tenantId))
      .limit(1);
    if (cfg && cfg.enabled && cfg.apiKeyEncrypted) {
      try {
        const apiKey = decryptCredential(cfg.apiKeyEncrypted);
        const provider = normalizeProvider(cfg.provider);
        // A custom provider with no base URL would let the SDK default to
        // OpenAI's endpoint and send the tenant's key to the wrong provider —
        // fall through to the managed proxy instead of leaking the key.
        if (provider !== "custom" || resolveBaseUrl(provider, cfg.baseUrl)) {
          return buildClientFromConfig({
            provider,
            apiKey,
            baseUrl: cfg.baseUrl,
            model: cfg.defaultModel,
          });
        }
      } catch {
        // Decryption failed (e.g. rotated key) — fall back to managed proxy.
      }
    }
  }
  return { client: managedClient, model: MANAGED_MODEL, source: "managed", provider: "openai" };
}
